const crypto = require('node:crypto');
const { ProviderError } = require('../../shared/providerError');

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\r\n]/.test(value) ? value : null;

function identifier(value, stage = 'schema') {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9._-]+$/.test(value) || value === '.' || value === '..') {
    throw new ProviderError('invalid-identifier', stage);
  }
  return value;
}

function providerGameId(namespace, catalogItemId) {
  return crypto.createHash('sha256').update(namespace).update('\0').update(catalogItemId).digest('base64url');
}

function publicId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new ProviderError('invalid-identifier', 'schema');
  return value;
}

function inventory(raw) {
  if (!Array.isArray(raw)) throw new ProviderError('invalid-library', 'library');
  const byIdentity = new Map();
  let privateRecords = 0;
  let engineNamespaceRecords = 0;
  let noAppArtifactRecords = 0;
  for (const row of raw) {
    if (!object(row)) throw new ProviderError('invalid-library-record', 'library');
    const namespace = identifier(row.namespace, 'library');
    const catalogItemId = identifier(row.catalogItemId, 'library');
    if (row.sandboxType === 'PRIVATE') { privateRecords++; continue; }
    if (namespace.toLowerCase() === 'ue') { engineNamespaceRecords++; continue; }
    if (row.appName === undefined || row.appName === null || row.appName === '') { noAppArtifactRecords++; continue; }
    const alias = identifier(row.appName, 'library');
    const key = `${namespace}\0${catalogItemId}`;
    const current = byIdentity.get(key) || { key, namespace, catalogItemId, aliases: new Set() };
    current.aliases.add(alias);
    byIdentity.set(key, current);
  }
  return {
    items: [...byIdentity.values()].map(item => ({ ...item, aliases: [...item.aliases].sort() })),
    inputRecordCount: raw.length,
    privateRecords,
    engineNamespaceRecords,
    noAppArtifactRecords,
  };
}

function safeImage(value) {
  try {
    const url = new URL(value);
    const hosts = new Set(['cdn1.epicgames.com', 'cdn2.unrealengine.com', 'cdn1.unrealengine.com']);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !hosts.has(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function catalogEntry(item, raw) {
  if (!object(raw)) throw new ProviderError('missing-catalog-item', 'catalog');
  const title = text(raw.title, 512);
  if (!title) throw new ProviderError('invalid-catalog-title', 'catalog');
  const categories = Array.isArray(raw.categories) ? raw.categories.map(value => text(value?.path, 256)).filter(Boolean) : [];
  const images = Array.isArray(raw.keyImages) ? raw.keyImages.map(value => ({ type: text(value?.type, 128), url: safeImage(value?.url) }))
    .filter(value => value.type && value.url) : [];
  return { key: item.key, title, categories, hasMainGameItem: object(raw.mainGameItem), images };
}

function classification(metadata) {
  const paths = metadata.categories.map(value => value.toLowerCase());
  if (metadata.hasMainGameItem || paths.some(value => /(^|\/)(addons?|dlc|mods?)(\/|$)/.test(value))) return 'addon';
  if (paths.some(value => value.startsWith('asset-format/') || value.includes('game-engine/unreal-engine') || value === 'type/format-item')) return 'engine-asset';
  if (paths.some(value => value === 'games' || value.startsWith('games/edition/base'))) return 'game';
  return 'unknown';
}

function image(metadata) {
  const preference = ['DieselGameBoxWide', 'OfferImageWide', 'Featured', 'Thumbnail', 'DieselGameBox', 'OfferImageTall'];
  for (const type of preference) {
    const found = metadata.images.find(candidate => candidate.type === type);
    if (found) return found.url;
  }
  return metadata.images[0]?.url || null;
}

function playtimes(raw, expectedAccountId) {
  if (!Array.isArray(raw)) throw new ProviderError('invalid-playtime-response', 'playtime');
  const values = new Map();
  for (const row of raw) {
    if (!object(row) || typeof row.accountId !== 'string' || row.accountId.toLowerCase() !== expectedAccountId ||
      !Number.isSafeInteger(row.totalTime) || row.totalTime < 0) throw new ProviderError('invalid-playtime-record', 'playtime');
    const artifact = identifier(row.artifactId, 'playtime');
    if (!values.has(artifact)) values.set(artifact, new Set());
    values.get(artifact).add(row.totalTime);
  }
  return values;
}

function library({ inventory: source, catalog, playtimeRaw, accountId, catalogStale = false, playtimeUnavailable = false }) {
  const times = playtimeUnavailable ? new Map() : playtimes(playtimeRaw, accountId);
  const matchedArtifacts = new Set();
  const excluded = { addons: 0, engineAssets: source.engineNamespaceRecords, unknownClassification: 0,
    privateRecords: source.privateRecords, noAppArtifactRecords: source.noAppArtifactRecords };
  const candidates = [];
  for (const item of source.items) {
    const metadata = catalog.get(item.key);
    if (!metadata) throw new ProviderError('incomplete-catalog', 'catalog');
    const kind = classification(metadata);
    if (kind !== 'game') {
      if (kind === 'addon') excluded.addons++;
      else if (kind === 'engine-asset') excluded.engineAssets++;
      else excluded.unknownClassification++;
      continue;
    }
    candidates.push({ item, metadata });
  }
  const aliasOwners = new Map();
  for (const { item } of candidates) {
    for (const alias of item.aliases) {
      if (!aliasOwners.has(alias)) aliasOwners.set(alias, new Set());
      aliasOwners.get(alias).add(item.key);
    }
  }
  const games = [];
  for (const { item, metadata } of candidates) {
    const observed = new Set();
    let sharedArtifact = false;
    for (const alias of item.aliases) {
      const values = times.get(alias);
      if (values) {
        matchedArtifacts.add(alias);
        if (aliasOwners.get(alias)?.size > 1) sharedArtifact = true;
        for (const value of values) observed.add(value);
      }
    }
    const status = playtimeUnavailable ? 'unavailable' : observed.size === 0 ? 'unknown' :
      observed.size === 1 && !sharedArtifact ? 'known' : 'ambiguous';
    const seconds = status === 'known' ? [...observed][0] : null;
    games.push({
      providerGameId: providerGameId(item.namespace, item.catalogItemId),
      name: metadata.title,
      imageUrl: image(metadata),
      playtimeMinutes: seconds === null ? null : seconds / 60,
      playtimeStatus: status,
      lastPlayedAt: null,
    });
  }
  games.sort((a, b) => {
    const aKnown = a.playtimeStatus === 'known'; const bKnown = b.playtimeStatus === 'known';
    return Number(bKnown) - Number(aKnown) || (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0) || a.name.localeCompare(b.name);
  });
  const known = games.filter(game => game.playtimeStatus === 'known');
  return {
    coverage: {
      kind: 'owned-pc-base-games', inventoryComplete: true, catalogComplete: true, catalogStale,
      playtimeStatus: playtimeUnavailable ? 'unavailable' : 'available',
      missingPlaytimeMeans: 'unknown',
      unmatchedPlaytimeRecords: playtimeUnavailable ? null : [...times.keys()].filter(key => !matchedArtifacts.has(key)).length,
      excluded,
    },
    totals: {
      gameCount: games.length,
      playedGameCount: known.filter(game => game.playtimeMinutes > 0).length,
      knownPlaytimeGameCount: known.length,
      unknownPlaytimeGameCount: games.filter(game => game.playtimeStatus === 'unknown').length,
      ambiguousPlaytimeGameCount: games.filter(game => game.playtimeStatus === 'ambiguous').length,
      totalPlaytimeMinutes: known.reduce((total, game) => total + game.playtimeMinutes, 0),
    },
    games,
  };
}

module.exports = { identifier, publicId, providerGameId, inventory, catalogEntry, playtimes, library };
