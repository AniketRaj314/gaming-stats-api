const crypto = require('node:crypto');
const { buildRegistry } = require('./identities');
const { selectArtwork } = require('./artwork');
const { buildProgress } = require('./progress');

const READY = new Set(['ready', 'stale']);
const ACTIVE = new Set(['ready']);

function normalizedTitle(value) {
  return String(value || '').replace(/[™®©℠]/g, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function playniteSourceProvider(game) {
  const source = normalizedTitle(game?.source?.name);
  if (['epic', 'epic games', 'epic games store'].includes(source)) return 'epic';
  if (source === 'steam') return 'steam';
  return null;
}

function secondsFromMinutes(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 60) : null;
}

function valorantSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value * 3600);
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  return match ? Math.round(Number(match[1]) * 3600) : null;
}

function psnPlatform(game) {
  if (game.platform) return game.platform.toLowerCase();
  if (/^CUSA/i.test(game.providerGameId)) return 'ps4';
  if (/^PPSA/i.test(game.providerGameId)) return 'ps5';
  return 'unknown';
}

function sourceSummary(value, fallbackStatus = 'disabled') {
  if (!value) return { status: fallbackStatus, stale: false, lastSuccessAt: null };
  return { status: value.status || 'unavailable', stale: value.stale === true, lastSuccessAt: value.lastSuccessAt || null };
}

function safeRead(service, method, resource, fallbackStatus) {
  if (!service || typeof service[method] !== 'function') return { status: fallbackStatus || 'disabled' };
  try { return resource === undefined ? service[method]() : service[method](resource); }
  catch { return { status: 'unavailable' }; }
}

function createAggregateService({ steamService, steamStatus = 'disabled', psnService, psnStatus = 'disabled',
  epicService, epicStatus = 'disabled', playniteService, playniteStatus = 'disabled',
  trackedUsernames = [], readValorantSnapshot = () => null, now = Date.now, registryEntries } = {}) {
  const registry = buildRegistry(registryEntries);

  function snapshots() {
    const steamLibrary = safeRead(steamService, 'read', 'library', steamStatus);
    const steamProfile = safeRead(steamService, 'read', 'profile', steamStatus);
    const psnLibrary = safeRead(psnService, 'read', 'library', psnStatus);
    const psnPresence = safeRead(psnService, 'read', 'presence', psnStatus);
    const epicLibrary = safeRead(epicService, 'read', undefined, epicStatus);
    const playniteLibrary = safeRead(playniteService, 'library', undefined, playniteStatus);
    const playnitePresence = safeRead(playniteService, 'presence', undefined, playniteStatus);
    const valorant = trackedUsernames.map(username => {
      try { return { username, snapshot: readValorantSnapshot(username) }; }
      catch { return { username, snapshot: null }; }
    }).filter(item => item.snapshot);
    return { steamLibrary, steamProfile, psnLibrary, psnPresence, epicLibrary, playniteLibrary, playnitePresence, valorant };
  }

  function identity(provider, id, game) {
    const curated = registry.references.get(`${provider}:${id}`);
    if (curated) return curated;
    if (provider === 'psn' && game.conceptId) {
      const platform = psnPlatform(game);
      return { workId: `psn-concept-${game.conceptId}`, workName: game.name,
        editionId: 'standard', editionName: 'Standard', copy: `psn-${platform}` };
    }
    return { workId: `${provider}-${String(id).toLowerCase()}`, workName: game.name,
      editionId: 'standard', editionName: 'Standard', copy: provider === 'playnite' ? 'playnite-windows' : provider };
  }

  function observation(provider, id, game, role = 'authoritative') {
    const helperFor = provider === 'playnite' ? playniteSourceProvider(game) : null;
    return { provider, providerGameId: String(id), role, name: game.name,
      ...(helperFor ? { helperFor } : {}), data: game };
  }

  function ensureCopy(works, resolved, provider, game) {
    let work = works.get(resolved.workId);
    if (!work) {
      work = { id: resolved.workId, name: resolved.workName || game.name, editions: new Map() };
      works.set(work.id, work);
    }
    let edition = work.editions.get(resolved.editionId);
    if (!edition) {
      edition = { id: resolved.editionId, name: resolved.editionName, copies: new Map() };
      work.editions.set(edition.id, edition);
    }
    const copyId = `${resolved.workId}:${resolved.editionId}:${resolved.copy}`;
    let copy = edition.copies.get(copyId);
    if (!copy) {
      copy = { id: copyId, platform: provider === 'psn' ? psnPlatform(game)
        : provider === 'epic' || provider === 'playnite' ? 'windows' : provider === 'steam' ? 'multi-platform' : 'unknown', observations: [] };
      edition.copies.set(copyId, copy);
    }
    return { work, edition, copy };
  }

  function selectPlaytime(copy) {
    const observations = copy.observations;
    const by = provider => observations.filter(item => item.provider === provider);
    const valorantObservations = by('valorant');
    const valorant = valorantObservations.map(item => ({ item, seconds: valorantSeconds(item.data.totalPlaytime) }))
      .find(value => value.seconds !== null);
    if (valorant) return { status: 'known', seconds: valorant.seconds, precision: 'hour-display',
      selectedFrom: 'valorant', rule: 'authoritative-lifetime', excluded: by('playnite').map(item => ({ provider: item.provider,
        providerGameId: item.providerGameId, reason: 'subset-of-valorant-lifetime' })) };
    if (valorantObservations.length) return { status: 'unknown', seconds: null, precision: null,
      selectedFrom: null, rule: 'valorant-lifetime-unavailable', excluded: by('playnite').map(item => ({
        provider: item.provider, providerGameId: item.providerGameId, reason: 'subset-of-unknown-valorant-lifetime',
      })) };

    const steam = by('steam')[0];
    if (steam) {
      const game = steam.data;
      const seconds = secondsFromMinutes(game.playtimeMinutes);
      return { status: seconds === null ? 'unknown' : 'known', seconds, precision: 'minute', selectedFrom: 'steam',
        rule: 'steam-lifetime-is-authoritative', components: {
          windowsSeconds: secondsFromMinutes(game.playtimeWindowsMinutes), macSeconds: secondsFromMinutes(game.playtimeMacMinutes),
          linuxSeconds: secondsFromMinutes(game.playtimeLinuxMinutes), deckSeconds: secondsFromMinutes(game.playtimeDeckMinutes),
          disconnectedSeconds: secondsFromMinutes(game.playtimeDisconnectedMinutes),
          additive: ['windowsSeconds', 'macSeconds', 'linuxSeconds'], overlapping: ['deckSeconds', 'disconnectedSeconds'],
        }, excluded: by('playnite').map(item => ({ provider: item.provider, providerGameId: item.providerGameId,
          reason: 'helper-mirror-of-steam-lifetime' })) };
    }

    const epic = by('epic')[0];
    if (epic) {
      const direct = epic.data.playtimeStatus === 'known' ? secondsFromMinutes(epic.data.playtimeMinutes) : null;
      const helper = by('playnite').map(item => ({ item, seconds: item.data.playtimeSeconds }))
        .find(value => Number.isSafeInteger(value.seconds) && value.seconds > 0);
      if (direct !== null) return { status: 'known', seconds: direct, precision: 'second', selectedFrom: 'epic',
        rule: 'epic-official-with-playnite-mirror-excluded', excluded: by('playnite').map(item => ({ provider: item.provider,
          providerGameId: item.providerGameId, reason: 'helper-mirror-of-epic-playtime' })) };
      if (helper) return { status: 'known', seconds: helper.seconds, precision: 'second', selectedFrom: 'playnite',
        rule: 'playnite-fallback-when-epic-playtime-is-unknown', excluded: [{ provider: 'epic',
          providerGameId: epic.providerGameId, reason: `epic-playtime-${epic.data.playtimeStatus || 'unknown'}` }] };
      return { status: epic.data.playtimeStatus || 'unknown', seconds: null, precision: null, selectedFrom: null,
        rule: 'zero-playnite-mirror-does-not-resolve-unknown-epic-playtime', excluded: by('playnite').map(item => ({ provider: item.provider,
          providerGameId: item.providerGameId, reason: 'zero-helper-value-cannot-resolve-unknown' })) };
    }

    const psn = by('psn').map(item => ({ item, seconds: secondsFromMinutes(item.data.playtimeMinutes) }));
    if (psn.length) {
      const known = psn.filter(value => value.seconds !== null).sort((a, b) => b.seconds - a.seconds);
      return { status: known.length ? (known.length === psn.length ? 'known' : 'partial') : 'unknown',
        seconds: known[0]?.seconds ?? null, precision: 'second', selectedFrom: known.length ? 'psn' : null,
        rule: psn.length > 1 ? 'maximum-across-regional-title-records' : 'single-psn-record',
        excluded: known.slice(1).map(value => ({ provider: 'psn', providerGameId: value.item.providerGameId,
          reason: 'regional-record-overlap' })) };
    }

    const playnite = by('playnite')[0];
    if (playnite) {
      const helperFor = playnite.helperFor || playniteSourceProvider(playnite.data);
      return { status: 'known', seconds: playnite.data.playtimeSeconds, precision: 'second',
        selectedFrom: 'playnite', rule: helperFor
          ? `playnite-${helperFor}-helper-without-direct-${helperFor}-record`
          : 'playnite-local-game', excluded: [] };
    }
    return { status: 'unknown', seconds: null, precision: null, selectedFrom: null, rule: 'no-playtime-observation', excluded: [] };
  }

  function totalFor(items) {
    const playtimes = items.map(item => item.playtime);
    const known = playtimes.filter(value => value.seconds !== null);
    const unknownCopyCount = playtimes.reduce((sum, value) => sum + (Number.isSafeInteger(value.unknownCopyCount)
      ? value.unknownCopyCount : value.seconds === null ? 1 : 0), 0);
    const incomplete = unknownCopyCount > 0 || playtimes.some(value => !['known'].includes(value.status));
    const status = known.length ? (incomplete ? 'partial' : 'known')
      : playtimes.some(value => value.status === 'ambiguous') ? 'ambiguous' : 'unknown';
    return { status, knownSeconds: known.reduce((sum, value) => sum + value.seconds, 0), unknownCopyCount };
  }

  function buildLibrary(input = snapshots()) {
    const works = new Map();
    const epicByTitle = new Map();
    const steamById = new Map();
    const steamByTitle = new Map();
    const add = (provider, id, game, resolved = identity(provider, id, game), role = 'authoritative') => {
      const target = ensureCopy(works, resolved, provider, game);
      target.copy.observations.push(observation(provider, id, game, role));
      return { ...target, resolved };
    };

    for (const game of input.steamLibrary.games || []) {
      const id = String(game.providerGameId || game.appId);
      const added = add('steam', id, game);
      steamById.set(id, added.resolved);
      const title = normalizedTitle(game.name);
      if (!steamByTitle.has(title)) steamByTitle.set(title, []);
      steamByTitle.get(title).push(added.resolved);
    }
    for (const game of input.psnLibrary.games || []) add('psn', game.providerGameId, game);
    for (const game of input.epicLibrary.games || []) {
      const added = add('epic', game.providerGameId, game);
      const title = normalizedTitle(game.name);
      if (!epicByTitle.has(title)) epicByTitle.set(title, []);
      epicByTitle.get(title).push(added.resolved);
    }
    for (const game of input.playniteLibrary.games || []) {
      let resolved = registry.references.get(`playnite:${game.playniteId}`);
      let role = resolved?.workId === 'valorant' ? 'presence-helper' : 'authoritative';
      const helperFor = playniteSourceProvider(game);
      if (!resolved && helperFor === 'epic') {
        const matches = epicByTitle.get(normalizedTitle(game.name)) || [];
        if (matches.length === 1) { resolved = matches[0]; role = 'helper-mirror'; }
      } else if (!resolved && helperFor === 'steam') {
        const direct = game.providerGameId ? steamById.get(String(game.providerGameId)) : null;
        const matches = direct ? [direct] : steamByTitle.get(normalizedTitle(game.name)) || [];
        if (matches.length === 1) { resolved = matches[0]; role = 'helper-mirror'; }
      }
      if (!resolved && helperFor) {
        resolved = { ...identity('playnite', game.playniteId, game), copy: `${helperFor}-windows` };
        role = 'helper-mirror';
      }
      add('playnite', game.playniteId, game, resolved || identity('playnite', game.playniteId, game), role);
    }
    for (const entry of input.valorant) {
      const totalPlaytime = entry.snapshot?.data?.shared?.totalPlaytime?.total;
      const base = identity('valorant', 'valorant', { name: 'VALORANT' });
      const resolved = input.valorant.length > 1 ? { ...base,
        copy: `riot-account-${crypto.createHash('sha256').update(entry.username).digest('hex').slice(0, 12)}` } : base;
      add('valorant', 'valorant', { name: 'VALORANT', accountRef: entry.username, totalPlaytime,
        cachedAt: entry.snapshot.lastRefreshedAt, status: entry.snapshot.status }, resolved, 'stats');
    }

    const output = [...works.values()].map(work => {
      const editions = [...work.editions.values()].map(edition => {
        const copies = [...edition.copies.values()].map(copy => ({ ...copy,
          name: copy.observations[0]?.name || work.name, artwork: selectArtwork(copy.observations), playtime: selectPlaytime(copy) }));
        return { id: edition.id, name: edition.name, playtime: totalFor(copies), copies };
      });
      return { id: work.id, name: work.name, artwork: selectArtwork(editions.flatMap(edition => edition.copies)
        .flatMap(copy => copy.observations)), playtime: totalFor(editions.map(edition => ({ playtime: {
          status: edition.playtime.status,
          seconds: edition.playtime.status === 'unknown' || edition.playtime.status === 'ambiguous' ? null : edition.playtime.knownSeconds,
          unknownCopyCount: edition.playtime.unknownCopyCount,
        } }))), editions };
    }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    const matches = new Map();
    for (const work of output) {
      const key = normalizedTitle(work.name);
      if (!matches.has(key)) matches.set(key, []);
      matches.get(key).push(work);
    }
    const possibleMatches = [...matches.entries()].filter(([, values]) => values.length > 1).map(([title, values]) => ({
      normalizedTitle: title, workIds: values.map(value => value.id), reason: 'exact-normalized-title', status: 'unconfirmed',
    }));
    const sources = {
      steam: sourceSummary(input.steamLibrary, steamStatus), psn: sourceSummary(input.psnLibrary, psnStatus),
      epic: sourceSummary(input.epicLibrary, epicStatus), playnite: sourceSummary(input.playniteLibrary, playniteStatus),
      valorant: { status: input.valorant.length
        ? (input.valorant.every(value => value.snapshot.status === 'stale') ? 'stale' : 'ready')
        : (trackedUsernames.length ? 'unavailable' : 'disabled'),
        stale: input.valorant.some(value => value.snapshot.status === 'stale'),
        lastSuccessAt: input.valorant.map(value => value.snapshot.lastRefreshedAt).filter(Boolean).sort().at(-1) || null },
    };
    const available = Object.values(sources).filter(value => READY.has(value.status)).length;
    const expected = Object.values(sources).filter(value => value.status !== 'disabled').length;
    return { schemaVersion: 1, provider: 'aggregate', accountRef: 'owner',
      status: available === 0 ? 'unavailable' : available < expected ? 'partial' : 'ready', generatedAt: new Date(now()).toISOString(),
      sources, totals: { workCount: output.length, editionCount: output.reduce((sum, work) => sum + work.editions.length, 0),
        copyCount: output.reduce((sum, work) => sum + work.editions.reduce((count, edition) => count + edition.copies.length, 0), 0),
        possibleMatchCount: possibleMatches.length }, possibleMatches, games: output };
  }

  function resolveCurrent(library, provider, id, name) {
    for (const work of library.games) for (const edition of work.editions) for (const copy of edition.copies) {
      if (copy.observations.some(item => item.provider === provider && item.providerGameId === String(id))) {
        return { id: work.id, name: work.name, edition: { id: edition.id, name: edition.name }, artwork: work.artwork };
      }
    }
    const curated = registry.references.get(`${provider}:${id}`);
    return { id: curated?.workId || `${provider}-${String(id).toLowerCase()}`, name: curated?.workName || name,
      edition: curated ? { id: curated.editionId, name: curated.editionName } : { id: 'standard', name: 'Standard' },
      artwork: { portraitUrl: null, landscapeUrl: null, squareUrl: null, iconUrl: null, all: [] } };
  }

  function nowPlaying(input = snapshots()) {
    const library = buildLibrary(input);
    const observations = [];
    if (ACTIVE.has(input.steamProfile.status) && input.steamProfile.currentGame) {
      const game = input.steamProfile.currentGame;
      observations.push({ source: 'steam', providerGameId: String(game.providerGameId || game.appId),
        observedAt: input.steamProfile.lastSuccessAt, startedAt: null, platform: 'unknown', device: null,
        game: resolveCurrent(library, 'steam', game.providerGameId || game.appId, game.name) });
    }
    if (ACTIVE.has(input.psnPresence.status) && input.psnPresence.activity === 'playing') {
      for (const game of input.psnPresence.games || []) observations.push({ source: 'psn', providerGameId: game.providerGameId,
        observedAt: input.psnPresence.lastSuccessAt, startedAt: null, platform: (game.platform || input.psnPresence.platform || 'unknown').toLowerCase(),
        device: input.psnPresence.platform ? { id: null, name: input.psnPresence.platform } : null,
        game: resolveCurrent(library, 'psn', game.providerGameId, game.name) });
    }
    if (ACTIVE.has(input.playnitePresence.status) && input.playnitePresence.state === 'playing' && input.playnitePresence.currentGame) {
      const game = input.playnitePresence.currentGame;
      observations.push({ source: 'playnite', providerGameId: game.playniteId, observedAt: input.playnitePresence.lastSuccessAt,
        startedAt: game.startedAt, platform: 'windows', device: { id: input.playnitePresence.deviceId, name: input.playnitePresence.deviceName },
        helperFor: normalizedTitle(game.source?.name) || null,
        game: resolveCurrent(library, 'playnite', game.playniteId, game.name) });
    }

    const groups = [];
    for (const item of observations) {
      const helper = item.source === 'playnite' && ['steam', 'epic'].includes(item.helperFor);
      const existing = helper ? groups.find(group => group.some(other => other.source === item.helperFor && other.game.id === item.game.id)) : null;
      if (existing) existing.push(item); else groups.push([item]);
    }
    const priority = { steam: 4, psn: 3, epic: 2, playnite: 1 };
    const sessions = groups.map(group => {
      const ordered = [...group].sort((a, b) => (priority[b.source] || 0) - (priority[a.source] || 0));
      const primary = ordered[0];
      return { id: `${primary.source}:${primary.providerGameId}`, game: primary.game,
        platform: ordered.find(value => value.platform && value.platform !== 'unknown')?.platform || primary.platform,
        device: ordered.find(value => value.device)?.device || null,
        startedAt: group.map(value => value.startedAt).filter(Boolean).sort()[0] || null,
        observedAt: group.map(value => value.observedAt).filter(Boolean).sort().at(-1) || null,
        primarySource: primary.source, detectedBy: ordered.map(({ helperFor, game, ...value }) => value),
        confidence: ordered.length > 1 ? 'confirmed' : 'single-source' };
    }).sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || '') || a.id.localeCompare(b.id));

    const presenceSources = {
      steam: sourceSummary(input.steamProfile, steamStatus), psn: sourceSummary(input.psnPresence, psnStatus),
      playnite: sourceSummary(input.playnitePresence, playniteStatus),
    };
    const anyFresh = Object.values(presenceSources).some(value => ACTIVE.has(value.status));
    return { schemaVersion: 1, provider: 'aggregate', accountRef: 'owner', generatedAt: new Date(now()).toISOString(),
      state: sessions.length ? 'playing' : anyFresh ? 'offline' : 'unknown',
      sessionCount: sessions.length, sessions, sources: presenceSources };
  }

  function game(id) {
    const input = snapshots();
    const library = buildLibrary(input);
    const found = library.games.find(item => item.id === id);
    if (!found) return { httpStatus: 404, body: { error: 'Canonical game not found' } };
    const presence = nowPlaying(input);
    const sessions = presence.sessions.filter(item => item.game.id === found.id);
    const activity = {
      state: sessions.length ? 'playing' : presence.state === 'unknown' ? 'unknown' : 'offline',
      sessionCount: sessions.length,
      sessions,
      sources: presence.sources,
    };
    const expectedWork = registry.works.get(found.id);
    const progress = buildProgress(found, { steamService, psnService, expectedWork, providerStatuses: library.sources });
    const incompleteProgress = ['partial', 'pending', 'unavailable'].includes(progress.status);
    const relatedProviders = new Set(found.editions.flatMap(edition => edition.copies)
      .flatMap(copy => copy.observations).map(item => item.provider));
    for (const edition of expectedWork?.editions || []) for (const reference of edition.references || []) {
      relatedProviders.add(reference.provider);
    }
    const incompleteSource = [...relatedProviders].some(provider => !READY.has(library.sources[provider]?.status));
    const status = !incompleteProgress && !incompleteSource && activity.state !== 'unknown' ? 'ready' : 'partial';
    return { httpStatus: 200, body: { schemaVersion: library.schemaVersion, provider: library.provider,
      accountRef: library.accountRef, status, generatedAt: library.generatedAt, sources: library.sources,
      game: found, activity, progress } };
  }

  return { library: () => buildLibrary(), nowPlaying, game, _buildLibrary: buildLibrary };
}

module.exports = { createAggregateService, normalizedTitle, playniteSourceProvider, valorantSeconds };
