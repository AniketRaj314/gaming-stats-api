const { ProviderError } = require('../../shared/providerError');

const imageHosts = new Set(['image.api.playstation.com', 'image.api.np.km.playstation.net', 'psnobj.prod.dl.playstation.net']);
const grades = ['bronze', 'silver', 'gold', 'platinum'];
const text = (v, max = 500) => typeof v === 'string' && v.length <= max ? v : null;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const integer = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
function identifier(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{3,64}$/.test(v)) throw new ProviderError('invalid-identifier', 'schema');
  return v;
}
function accountId(v) {
  if (typeof v !== 'string' || !/^\d{1,20}$/.test(v)) throw new ProviderError('invalid-account-id', 'identity');
  return v;
}
function date(v) { return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null; }
function artwork(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && imageHosts.has(u.hostname) && !u.username && !u.password && !u.port && !u.search && !u.hash ? u.href : null;
  } catch { return null; }
}
function mediaImages(...values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (!object(value) || !Array.isArray(value.images)) continue;
    for (const row of value.images) {
      if (!object(row)) continue;
      const type = text(row.type, 128);
      const format = text(row.format, 128);
      const url = artwork(row.url);
      if (!type || !url) continue;
      const key = `${type}\0${format || ''}\0${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ type, format, url });
    }
  }
  return output;
}
function durationMinutes(v) {
  if (typeof v !== 'string') return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v);
  if (!m || !m.slice(1).some(x => x !== undefined) || v.endsWith('T')) return null;
  const seconds = Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
  return Number.isFinite(seconds) && seconds <= Number.MAX_SAFE_INTEGER ? seconds / 60 : null;
}
function counts(v) { return Object.fromEntries(grades.map(g => [g, integer(v?.[g])])); }

function library(records) {
  const seen = new Set();
  const games = records.map((r) => {
    const id = identifier(r.titleId);
    if (seen.has(id) || !text(r.name) || !['ps4_game', 'ps5_native_game', 'unknown'].includes(r.category)) throw new ProviderError('invalid-game-record', 'library');
    seen.add(id);
    const conceptId = typeof r.concept?.id === 'string' || Number.isSafeInteger(r.concept?.id) ? String(r.concept.id) : null;
    return {
      providerGameId: id, conceptId: conceptId && /^\d+$/.test(conceptId) ? conceptId : null,
      canonicalGameId: null, name: r.name, platform: r.category === 'ps4_game' ? 'PS4' : r.category === 'ps5_native_game' ? 'PS5' : null,
      playtimeMinutes: durationMinutes(r.playDuration), playCount: integer(r.playCount),
      firstPlayedAt: date(r.firstPlayedDateTime), lastPlayedAt: date(r.lastPlayedDateTime),
      activityStatus: 'played-history', artwork: {
        url: artwork(r.imageUrl), localizedUrl: artwork(r.localizedImageUrl), width: null, height: null,
        images: mediaImages(r.media, r.concept?.media),
      },
    };
  });
  games.sort((a, b) => (b.playtimeMinutes ?? -1) - (a.playtimeMinutes ?? -1) || a.providerGameId.localeCompare(b.providerGameId));
  return {
    coverage: { kind: 'played-history', platforms: ['PS4', 'PS5'], complete: true, purchaseLibrary: false },
    totals: {
      recordCount: games.length, conceptCount: new Set(games.map(g => g.conceptId).filter(Boolean)).size,
      knownRecordPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeMinutes ?? 0), 0),
      knownPlaytimeRecords: games.filter(g => g.playtimeMinutes !== null).length,
      unknownPlaytimeRecords: games.filter(g => g.playtimeMinutes === null).length,
      unknownPlatformRecords: games.filter(g => g.platform === null).length,
    }, games,
  };
}

function trophyLists(records) {
  const seen = new Set();
  return records.filter(r => r.hiddenFlag !== true).map((r) => {
    // Fail closed if the visibility marker itself is malformed.
    if (r.hiddenFlag !== false || !['trophy', 'trophy2'].includes(r.npServiceName)) throw new ProviderError('invalid-trophy-list', 'schema');
    const id = identifier(r.npCommunicationId);
    const key = r.npServiceName + ':' + id;
    if (seen.has(key)) throw new ProviderError('duplicate-trophy-set', 'schema');
    seen.add(key);
    return { id, service: r.npServiceName, name: text(r.trophyTitleName), platform: text(r.trophyTitlePlatform, 100),
      imageUrl: artwork(r.trophyTitleIconUrl), progress: percentage(r.progress), defined: counts(r.definedTrophies), earned: counts(r.earnedTrophies) };
  });
}
function percentage(v) {
  if (typeof v === 'string' && !/^\d+(?:\.\d+)?$/.test(v)) return null;
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
function summary(r, visible) {
  if (!object(r)) throw new ProviderError('invalid-summary', 'schema');
  const level = typeof r.trophyLevel === 'string' && /^\d+$/.test(r.trophyLevel) ? Number(r.trophyLevel) : r.trophyLevel;
  return { trophyLevel: integer(level), earnedTrophies: counts(r.earnedTrophies), visibleTrophySets: visible.length, totalsMayIncludeHiddenTitles: true };
}
function presence(r) {
  const p = r?.basicPresence;
  if (!object(p)) throw new ProviderError('invalid-presence', 'schema');
  const online = p.primaryPlatformInfo?.onlineStatus ?? p.onlineStatus;
  const platform = text(p.primaryPlatformInfo?.platform, 32);
  if (online === 'offline') return { activity: 'idle', online: false, platform, games: [] };
  if (online !== 'online') return { activity: 'unavailable', online: null, platform: null, games: [] };
  if (p.gameTitleInfoList !== undefined && !Array.isArray(p.gameTitleInfoList)) throw new ProviderError('invalid-presence-games', 'schema');
  const games = (p.gameTitleInfoList || []).slice(0, 10).map(g => ({ providerGameId: identifier(g.npTitleId), name: text(g.titleName), platform: text(g.format, 32), imageUrl: artwork(g.npTitleIconUrl || g.conceptIconUrl) }));
  return { activity: games.length ? 'playing' : 'idle', online: true, platform, games };
}
function mappedSets(response, titleId, visible) {
  if (!Array.isArray(response?.titles)) throw new ProviderError('invalid-title-mapping', 'schema');
  const matches = response.titles.filter(t => t.npTitleId === titleId);
  if (matches.length > 1) throw new ProviderError('ambiguous-title-mapping', 'schema');
  if (!matches.length) return [];
  if (!Array.isArray(matches[0].trophyTitles)) throw new ProviderError('invalid-title-mapping', 'schema');
  const ids = new Set(matches[0].trophyTitles.map(t => identifier(t.npCommunicationId)));
  return visible.filter(s => ids.has(s.id));
}
function trophies(definitions, player) {
  const rows = new Map();
  for (const r of player) {
    if (integer(r.trophyId) === null || rows.has(r.trophyId)) throw new ProviderError('invalid-player-trophy-id', 'schema');
    rows.set(r.trophyId, r);
  }
  const seen = new Set();
  const result = definitions.map(d => {
    if (integer(d.trophyId) === null || seen.has(d.trophyId) || !grades.includes(d.trophyType) || typeof d.trophyHidden !== 'boolean') throw new ProviderError('invalid-trophy-definition', 'schema');
    seen.add(d.trophyId);
    const p = rows.get(d.trophyId);
    const earned = typeof p?.earned === 'boolean' ? p.earned : null;
    const concealed = d.trophyHidden && earned !== true;
    return { id: d.trophyId, grade: d.trophyType, hidden: d.trophyHidden, earned,
      name: concealed ? 'Hidden trophy' : text(d.trophyName), description: concealed ? null : text(d.trophyDetail, 2000),
      imageUrl: concealed ? null : artwork(d.trophyIconUrl), earnedAt: earned === true ? date(p.earnedDateTime) : null,
      earnedRate: percentage(p?.trophyEarnedRate) };
  });
  const knownRarity = result.filter(t => t.earned === true && t.earnedRate !== null).sort((a, b) => a.earnedRate - b.earnedRate);
  return { complete: result.every(t => t.earned !== null), trophies: result, rarestUnlock: knownRarity[0] || null,
    rarityCoverage: { earned: result.filter(t => t.earned === true).length, earnedWithKnownRarity: knownRarity.length } };
}

module.exports = { object, text, nonnegative, integer, identifier, accountId, date, artwork, mediaImages, durationMinutes, library, trophyLists, summary, presence, mappedSets, trophies };
