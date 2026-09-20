const { ProviderError } = require('../../shared/providerError');
const normalize = require('./normalize');

function createService({ store, config, now = Date.now }) {
  const iso = value => new Date(value).toISOString();

  function envelope(resource, staleAfter) {
    const row = store.read(resource);
    const base = { schemaVersion: 1, provider: 'playnite', accountRef: 'owner' };
    if (!row) return { ...base, status: 'pending', stale: false, lastSuccessAt: null, lastAttemptAt: null, nextRefreshAt: null };
    const stale = now() - row.receivedAt > staleAfter;
    return { ...base, status: stale ? 'stale' : 'ready', stale, lastSuccessAt: iso(row.receivedAt),
      lastAttemptAt: iso(row.receivedAt), nextRefreshAt: null, ...row.payload };
  }

  function ingestLibrary(input) {
    const payload = normalize.library(input);
    store.write('library', payload, now());
    return { accepted: true, kind: 'library', sequence: payload.sequence, gameCount: payload.games.length };
  }

  function ingestPresence(input) {
    const payload = normalize.presence(input);
    store.write('presence', payload, now());
    return { accepted: true, kind: 'presence', sequence: payload.sequence, state: payload.state };
  }

  function library() { return envelope('library', config.libraryStaleMs); }

  function presence() {
    const body = envelope('presence', config.presenceTtlMs);
    if (body.status === 'pending') return body;
    if (body.stale) return { ...body, state: 'offline', currentGame: null };
    return body;
  }

  function game(requestedId) {
    const id = normalize.publicId(requestedId);
    const current = library();
    if (!current.games) return { httpStatus: 503, body: current };
    const found = current.games.find(item => item.playniteId === id);
    if (!found) return { httpStatus: 404, body: { error: 'Game not in the cached Playnite library' } };
    const { games, totals, coverage, deviceId, deviceName, generatedAt, playniteVersion, extensionVersion, sequence, ...metadata } = current;
    return { httpStatus: 200, body: { ...metadata, deviceId, deviceName, generatedAt, playniteVersion, extensionVersion, sequence, game: found } };
  }

  function writeAsset(requestedHash, contentType, body) {
    const hash = normalize.sha256(requestedHash);
    if (!hash) throw new ProviderError('invalid-asset', 'schema');
    const asset = store.writeAsset(hash, contentType, body);
    return { accepted: true, assetId: hash, path: `/playnite/assets/${hash}`, contentType: asset.contentType, size: asset.size };
  }

  function asset(requestedHash) {
    const hash = normalize.sha256(requestedHash);
    if (!hash) throw new ProviderError('invalid-asset', 'schema');
    return store.findAsset(hash);
  }

  return { ingestLibrary, ingestPresence, library, presence, game, writeAsset, asset };
}

module.exports = { createService };
