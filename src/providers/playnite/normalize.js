const { ProviderError } = require('../../shared/providerError');

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
const nullableText = (value, max = 512) => value == null ? null : text(value, max);
const bool = value => typeof value === 'boolean' ? value : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const guid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value) ? value.toLowerCase() : null;
const sha256 = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value) ? value.toLowerCase() : null;

function timestamp(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function names(value, max = 100) {
  if (!Array.isArray(value) || value.length > max) return [];
  const seen = new Set();
  return value.map(item => text(item, 256)).filter(item => item && !seen.has(item) && seen.add(item));
}

function score(value) {
  return value == null ? null : integer(value, 0, 100);
}

function releaseDate(value) {
  if (!object(value)) return null;
  const year = integer(value.year, 1, 9999);
  const month = value.month == null ? null : integer(value.month, 1, 12);
  const day = value.day == null ? null : integer(value.day, 1, 31);
  if (year === null || (day !== null && month === null)) return null;
  return { year, month, day };
}

function artwork(value) {
  if (value == null) return null;
  if (!object(value)) throw new ProviderError('invalid-artwork', 'schema');
  const assetId = sha256(value.assetId);
  const contentType = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(value.contentType) ? value.contentType : null;
  if (!assetId || !contentType) throw new ProviderError('invalid-artwork', 'schema');
  return {
    assetId,
    path: `/playnite/assets/${assetId}`,
    contentType,
    width: value.width == null ? null : integer(value.width, 1, 32768),
    height: value.height == null ? null : integer(value.height, 1, 32768),
  };
}

function source(value) {
  if (!object(value)) return { id: null, name: null };
  return { id: value.id == null ? null : guid(value.id), name: nullableText(value.name, 256) };
}

function links(value) {
  if (!Array.isArray(value) || value.length > 50) return [];
  return value.filter(object).map(item => {
    const name = text(item.name, 128);
    try {
      const url = new URL(item.url);
      if (!name || url.protocol !== 'https:' || url.username || url.password || url.port || url.toString().length > 2048) return null;
      return { name, url: url.toString() };
    } catch { return null; }
  }).filter(Boolean);
}

function game(value) {
  if (!object(value)) throw new ProviderError('invalid-game', 'schema');
  const playniteId = guid(value.playniteId);
  const name = text(value.name, 512);
  const playtimeSeconds = integer(value.playtimeSeconds);
  const playCount = integer(value.playCount);
  if (!playniteId || !name || playtimeSeconds === null || playCount === null) {
    throw new ProviderError('invalid-game', 'schema');
  }
  return {
    playniteId,
    providerGameId: nullableText(value.providerGameId, 512),
    libraryPluginId: value.libraryPluginId == null ? null : guid(value.libraryPluginId),
    source: source(value.source),
    name,
    sortingName: nullableText(value.sortingName, 512),
    playtimeSeconds,
    playtimeMinutes: Math.floor(playtimeSeconds / 60),
    playCount,
    lastActivityAt: timestamp(value.lastActivityAt),
    addedAt: timestamp(value.addedAt),
    modifiedAt: timestamp(value.modifiedAt),
    isInstalled: bool(value.isInstalled),
    isRunning: bool(value.isRunning),
    hidden: bool(value.hidden),
    favorite: bool(value.favorite),
    isCustomGame: bool(value.isCustomGame),
    installSizeBytes: value.installSizeBytes == null ? null : integer(value.installSizeBytes),
    releaseDate: releaseDate(value.releaseDate),
    completionStatus: nullableText(value.completionStatus, 256),
    platforms: names(value.platforms),
    genres: names(value.genres),
    categories: names(value.categories),
    tags: names(value.tags, 500),
    features: names(value.features),
    ageRatings: names(value.ageRatings),
    regions: names(value.regions),
    series: names(value.series),
    developers: names(value.developers),
    publishers: names(value.publishers),
    scores: {
      user: score(value.scores?.user),
      critic: score(value.scores?.critic),
      community: score(value.scores?.community),
    },
    links: links(value.links),
    artwork: {
      icon: artwork(value.artwork?.icon),
      cover: artwork(value.artwork?.cover),
      background: artwork(value.artwork?.background),
    },
  };
}

function identity(value) {
  if (!object(value)) throw new ProviderError('invalid-device', 'schema');
  const deviceId = guid(value.deviceId);
  const deviceName = text(value.deviceName, 128);
  const sequence = integer(value.sequence, 0);
  const generatedAt = timestamp(value.generatedAt);
  const playniteVersion = nullableText(value.playniteVersion, 64);
  const extensionVersion = nullableText(value.extensionVersion, 64);
  if (!deviceId || !deviceName || sequence === null || !generatedAt) throw new ProviderError('invalid-device', 'schema');
  return { deviceId, deviceName, sequence, generatedAt, playniteVersion, extensionVersion };
}

function library(value) {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.games) || value.games.length > 10000) {
    throw new ProviderError('invalid-library', 'schema');
  }
  const device = identity(value);
  const seen = new Set();
  const games = value.games.map(game).map(item => {
    if (seen.has(item.playniteId)) throw new ProviderError('duplicate-game', 'schema');
    seen.add(item.playniteId);
    return item;
  }).sort((a, b) => a.name.localeCompare(b.name) || a.playniteId.localeCompare(b.playniteId));
  const totalPlaytimeSeconds = games.reduce((sum, item) => {
    const next = sum + item.playtimeSeconds;
    if (!Number.isSafeInteger(next)) throw new ProviderError('invalid-library-total', 'schema');
    return next;
  }, 0);
  return {
    ...device,
    coverage: { kind: 'complete-playnite-library', gameCount: games.length, artworkUploaded: true },
    totals: {
      gameCount: games.length,
      installedGameCount: games.filter(item => item.isInstalled === true).length,
      playedGameCount: games.filter(item => item.playtimeSeconds > 0).length,
      totalPlaytimeSeconds,
    },
    games,
  };
}

function presence(value) {
  if (!object(value) || value.schemaVersion !== 1 || !['online', 'playing', 'offline'].includes(value.state)) {
    throw new ProviderError('invalid-presence', 'schema');
  }
  const device = identity(value);
  let currentGame = null;
  if (value.state === 'playing') {
    if (!object(value.currentGame)) throw new ProviderError('invalid-presence', 'schema');
    const playniteId = guid(value.currentGame.playniteId);
    const name = text(value.currentGame.name, 512);
    const startedAt = timestamp(value.currentGame.startedAt);
    if (!playniteId || !name || !startedAt) throw new ProviderError('invalid-presence', 'schema');
    currentGame = { playniteId, name, providerGameId: nullableText(value.currentGame.providerGameId, 512),
      source: source(value.currentGame.source), startedAt };
  }
  return { ...device, state: value.state, currentGame };
}

function publicId(value) {
  const parsed = guid(value);
  if (!parsed) throw new ProviderError('invalid-identifier', 'schema');
  return parsed;
}

module.exports = { library, presence, publicId, sha256 };
