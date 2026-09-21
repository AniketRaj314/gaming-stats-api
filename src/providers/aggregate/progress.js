const PROVIDERS_WITH_UNLOCKS = new Set(['steam', 'psn']);
const USABLE = new Set(['available', 'stale']);
const STATUS_RANK = { available: 7, stale: 6, pending: 5, private: 4, unsupported: 3, unavailable: 2, error: 1 };

function completion(unlocks) {
  const available = unlocks.length;
  const known = unlocks.filter(item => typeof item.unlocked === 'boolean').length;
  const earned = unlocks.filter(item => item.unlocked === true).length;
  const completionPercent = available > 0 && known === available
    ? Math.round((earned / available) * 10000) / 100 : null;
  return { earned, available, known, completionPercent };
}

function capabilityStatus(value, detail) {
  if (value === 'available') return detail?.stale === true || detail?.status === 'stale' ? 'stale' : 'available';
  if (value === 'pending') return 'pending';
  if (value === 'private') return 'private';
  if (value === 'not-supported' || value === 'no-synced-set' || value === 'no-visible-synced-set') return 'unsupported';
  return 'unavailable';
}

function detail(service, providerGameId) {
  if (!service || typeof service.game !== 'function') return { status: 'unavailable', reason: 'provider-disabled', body: null };
  try {
    const result = service.game(providerGameId);
    if (!result || result.httpStatus !== 200 || !result.body) {
      return { status: 'unavailable', reason: `provider-detail-http-${result?.httpStatus || 500}`, body: result?.body || null };
    }
    return { status: null, reason: null, body: result.body };
  } catch {
    return { status: 'error', reason: 'provider-detail-read-failed', body: null };
  }
}

function steamUnlock(row, appId, setId) {
  return {
    id: `steam:${appId}:achievement:${encodeURIComponent(row.apiName)}`,
    setId,
    providerUnlockId: row.apiName,
    name: row.name || 'Unnamed achievement',
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    unlocked: typeof row.achieved === 'boolean' ? row.achieved : null,
    unlockedAt: row.unlockedAt ?? null,
    rarityPercent: row.globalPercent ?? null,
    kind: 'achievement',
    grade: null,
    source: 'steam',
    hidden: row.hidden === true,
  };
}

function psnUnlock(row, rawSet, setId) {
  return {
    id: `psn:${rawSet.service}:${rawSet.id}:trophy:${row.id}`,
    setId,
    providerUnlockId: String(row.id),
    name: row.name || 'Unnamed trophy',
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    unlocked: typeof row.earned === 'boolean' ? row.earned : null,
    unlockedAt: row.earnedAt ?? null,
    rarityPercent: row.earnedRate ?? null,
    kind: 'trophy',
    grade: row.grade ?? null,
    source: 'psn',
    hidden: row.hidden === true,
  };
}

function rarest(unlocks) {
  return unlocks.filter(item => item.unlocked === true && typeof item.rarityPercent === 'number'
    && Number.isFinite(item.rarityPercent))
    .sort((a, b) => a.rarityPercent - b.rarityPercent || a.id.localeCompare(b.id))[0] || null;
}

function sourceRecord(context, source, status, reason, body) {
  return {
    source,
    providerGameIds: [context.observation.providerGameId],
    editionId: context.edition.id,
    copyId: context.copy.id,
    status,
    reason: USABLE.has(status) ? null : reason || null,
    lastSuccessAt: body?.lastSuccessAt || null,
  };
}

function consolidateSources(values) {
  const groups = new Map();
  for (const value of values) {
    const key = `${value.source}\0${value.editionId}\0${value.copyId}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, value);
      continue;
    }
    const better = (STATUS_RANK[value.status] || 0) > (STATUS_RANK[existing.status] || 0) ? value : existing;
    groups.set(key, {
      ...better,
      providerGameIds: [...new Set([...existing.providerGameIds, ...value.providerGameIds])].sort(),
      lastSuccessAt: [existing.lastSuccessAt, value.lastSuccessAt].filter(Boolean).sort().at(-1) || null,
    });
  }
  return [...groups.values()];
}

function progressStatus(sources, sets) {
  const capable = sources.filter(item => PROVIDERS_WITH_UNLOCKS.has(item.source));
  const usable = capable.filter(item => USABLE.has(item.status));
  const incomplete = capable.filter(item => !USABLE.has(item.status) && item.status !== 'unsupported');
  if (sets.length && usable.length && incomplete.length) return 'partial';
  if (sets.length && usable.some(item => item.status === 'stale')) return 'partial';
  if (sets.length) return 'available';
  if (!capable.length || capable.every(item => item.status === 'unsupported')) return 'unsupported';
  if (capable.some(item => item.status === 'pending')) return 'pending';
  return 'unavailable';
}

function buildProgress(game, { steamService, psnService, expectedWork, providerStatuses = {} } = {}) {
  const contexts = [];
  for (const edition of game.editions || []) for (const copy of edition.copies || []) {
    for (const observation of copy.observations || []) contexts.push({ edition, copy, observation });
  }

  const sources = [];
  const sets = [];
  const psnSets = new Map();

  for (const context of contexts) {
    const { observation, edition, copy } = context;
    const id = observation.providerGameId;
    if (observation.provider === 'steam') {
      const result = detail(steamService, id);
      if (!result.body) {
        sources.push(sourceRecord(context, 'steam', result.status, result.reason, null));
        continue;
      }
      const status = capabilityStatus(result.body.achievementStatus, result.body);
      sources.push(sourceRecord(context, 'steam', status, result.body.achievementStatus, result.body));
      if (!USABLE.has(status)) continue;
      const setId = `steam:${id}:achievements`;
      const unlocks = (result.body.achievements || []).map(row => steamUnlock(row, id, setId));
      sets.push({
        id: setId,
        source: 'steam',
        kind: 'achievement',
        name: 'Steam achievements',
        editionId: edition.id,
        copyId: copy.id,
        platform: copy.platform,
        providerGameIds: [id],
        sourceRefs: [{ providerGameId: id, editionId: edition.id, copyId: copy.id }],
        status,
        summary: completion(unlocks),
        rarestUnlock: rarest(unlocks),
        unlocks,
      });
      continue;
    }

    if (observation.provider === 'psn') {
      const result = detail(psnService, id);
      if (!result.body) {
        sources.push(sourceRecord(context, 'psn', result.status, result.reason, null));
        continue;
      }
      const status = capabilityStatus(result.body.trophyStatus, result.body);
      sources.push(sourceRecord(context, 'psn', status, result.body.trophyStatus, result.body));
      if (!USABLE.has(status)) continue;
      for (const rawSet of result.body.trophySets || []) {
        const setId = `psn:${rawSet.service}:${rawSet.id}`;
        const unlocks = (rawSet.trophies || []).map(row => psnUnlock(row, rawSet, setId));
        const candidate = {
          id: setId,
          source: 'psn',
          kind: 'trophy',
          name: rawSet.name || 'PlayStation trophies',
          editionId: edition.id,
          copyId: copy.id,
          platform: rawSet.platform || copy.platform,
          providerGameIds: [id],
          sourceRefs: [{ providerGameId: id, editionId: edition.id, copyId: copy.id }],
          status,
          summary: completion(unlocks),
          rarestUnlock: rarest(unlocks),
          unlocks,
        };
        const existing = psnSets.get(setId);
        if (!existing) psnSets.set(setId, candidate);
        else {
          const providerGameIds = [...new Set([...existing.providerGameIds, id])].sort();
          const sourceRefs = [...existing.sourceRefs];
          if (!sourceRefs.some(item => item.providerGameId === id && item.copyId === copy.id)) {
            sourceRefs.push({ providerGameId: id, editionId: edition.id, copyId: copy.id });
          }
          const better = Number(status === 'available') * 100000 + unlocks.length
            > Number(existing.status === 'available') * 100000 + existing.unlocks.length ? candidate : existing;
          psnSets.set(setId, { ...better, providerGameIds, sourceRefs });
        }
      }
      continue;
    }

    sources.push(sourceRecord(context, observation.provider, 'unsupported', 'provider-does-not-expose-unlocks', null));
  }

  const observed = new Set(contexts.map(context => `${context.observation.provider}:${context.observation.providerGameId}`));
  for (const edition of expectedWork?.editions || []) for (const reference of edition.references || []) {
    if (!PROVIDERS_WITH_UNLOCKS.has(reference.provider) || observed.has(`${reference.provider}:${reference.id}`)) continue;
    const context = {
      edition,
      copy: { id: `${game.id}:${edition.id}:${reference.copy}` },
      observation: { providerGameId: reference.id },
    };
    const providerStatus = providerStatuses[reference.provider]?.status || 'unavailable';
    sources.push(sourceRecord(context, reference.provider, 'unavailable', `provider-library-${providerStatus}`, null));
  }

  sets.push(...psnSets.values());
  const consolidatedSources = consolidateSources(sources);
  sets.sort((a, b) => a.editionId.localeCompare(b.editionId) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  consolidatedSources.sort((a, b) => a.editionId.localeCompare(b.editionId) || a.source.localeCompare(b.source)
    || a.providerGameIds[0].localeCompare(b.providerGameIds[0]));
  const unlocks = sets.flatMap(set => set.unlocks);
  return {
    status: progressStatus(consolidatedSources, sets),
    completionCalculation: 'reported-per-progress-set-no-cross-source-merge',
    setCount: sets.length,
    unlockCount: unlocks.length,
    rarestUnlock: rarest(unlocks),
    sets,
    sources: consolidatedSources,
  };
}

module.exports = { buildProgress, capabilityStatus, completion, consolidateSources, progressStatus, rarest };
