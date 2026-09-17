const { createService } = require('../../src/providers/epic/service');
const n = require('../../src/providers/epic/normalize');
const f = require('./fixtures');

class MemoryStore {
  constructor() {
    this.connection = { status: 'not-configured', generation: 0, version: 0, sealed: null, accountId: null,
      displayName: null, rotationPending: false, retryAt: 0 };
    this.rows = new Map(); this.catalog = new Map(); this.saved = null;
  }
  state() { return structuredClone(this.connection); }
  mutate(fn) { fn(this.connection); }
  connect(session) { this.connection = { ...this.connection, status: 'connected', generation: 1, version: 1,
    sealed: {}, accountId: session.accountId, displayName: session.displayName }; this.saved = session; this.rows.clear(); }
  session() { return this.saved; }
  beginRotation(generation, version) { if (generation !== this.connection.generation || version !== this.connection.version) throw new Error(); this.connection.rotationPending = true; }
  saveRotated(session) { this.connection.version++; this.connection.rotationPending = false; this.saved = session; }
  get(resource) { return this.rows.get(resource) || null; }
  publish(resource, payload, generation, now, nextDue) { this.rows.set(resource, { payload, payloadJson: JSON.stringify(payload), generation, success: now, attempted: now, status: 'ready', next_due: nextDue, failures: 0 }); }
  fail(resource, generation, status, now, nextDue) { const old = this.get(resource); this.rows.set(resource, { ...old, generation, attempted: now, status, next_due: nextDue, failures: (old?.failures || 0) + 1 }); }
  getCatalog(keys) { return new Map(keys.filter(key => this.catalog.has(key)).map(key => [key, this.catalog.get(key)])); }
  putCatalog(entries, now) { for (const entry of entries) this.catalog.set(entry.key, { payload: entry, refreshed: now }); }
  catalogCount() { return this.catalog.size; }
  async withLock(fn) { return fn(); }
  disconnect() { this.connection.status = 'disabled'; this.connection.sealed = null; this.rows.clear(); }
}

let time, store, client, service, settings;
beforeEach(() => {
  time = f.now;
  store = new MemoryStore();
  client = {
    context: jest.fn(() => ({ signal: new AbortController().signal, remaining: 150 })),
    connect: jest.fn(async () => ({ accessToken: 'access', refreshToken: 'refresh', accountId: f.accountId,
      displayName: 'Spider31415', accessExpiresAt: time + 40 * 86400000, refreshExpiresAt: time + 40 * 86400000 })),
    verify: jest.fn(async saved => saved), renew: jest.fn(), library: jest.fn(async () => f.records),
    playtime: jest.fn(async () => f.playtime), catalog: jest.fn(async items => new Map(items.map(item => [item.key, f.rawCatalog.get(item.key)]))),
    revoke: jest.fn(async () => null),
  };
  settings = { expectedDisplayName: 'Spider31415', refreshMs: 900000, catalogMs: 86400000, maxStaleMs: 86400000, jobMs: 120000 };
  service = createService({ store, client, config: settings, now: () => time });
});

test('connects only the expected owner and publishes a complete library snapshot', async () => {
  expect(await service.connect('code')).toEqual({ connected: true, displayName: 'Spider31415' });
  expect(await service.run()).toEqual({ ok: true, kind: 'library' });
  expect(service.read()).toMatchObject({ status: 'ready', totals: { gameCount: 3, playedGameCount: 1 } });
  const id = service.read().games[0].providerGameId;
  expect(service.game(id)).toMatchObject({ httpStatus: 200, body: { status: 'ready', game: { name: 'Hogwarts Legacy' } } });
  expect(service.game(n.providerGameId('missing', 'game')).httpStatus).toBe(404);
});

test('rejects an unexpected Epic display name before persisting the connection', async () => {
  client.connect.mockResolvedValue({ ...(await client.connect()), displayName: 'DifferentOwner' });
  await expect(service.connect('code')).rejects.toThrow('unexpected-display-name');
  expect(store.state().status).toBe('not-configured');
});

test('publishes inventory with unavailable playtime only when no older snapshot exists', async () => {
  await service.connect('code');
  client.playtime.mockRejectedValue(new Error('outage'));
  expect(await service.run()).toEqual({ ok: true, kind: 'library' });
  expect(service.read()).toMatchObject({ status: 'ready', coverage: { playtimeStatus: 'unavailable' }, totals: { knownPlaytimeGameCount: 0 } });
  time += settings.refreshMs;
  expect(await service.run()).toMatchObject({ ok: false, error: 'internal-error' });
  expect(service.read().status).toBe('stale');
});

test('withholds snapshots beyond the maximum stale window', async () => {
  await service.connect('code');
  await service.run();
  time += settings.maxStaleMs + 1;
  expect(service.read()).toMatchObject({ status: 'unavailable', lastSuccessAt: expect.any(String) });
  expect(service.read()).not.toHaveProperty('games');
});

test('uses stale catalog metadata when refresh fails but never publishes an incomplete first catalog', async () => {
  await service.connect('code');
  await service.run();
  time += settings.catalogMs;
  client.catalog.mockRejectedValue(new Error('catalog outage'));
  expect(await service.run()).toEqual({ ok: true, kind: 'library' });
  expect(service.read().coverage.catalogStale).toBe(true);
});

test('refreshes legacy catalog cache entries once to populate full artwork metadata', async () => {
  await service.connect('code');
  const source = n.inventory(f.records);
  for (const item of source.items) {
    store.catalog.set(item.key, { payload: { ...n.catalogEntry(item, f.rawCatalog.get(item.key)), schemaVersion: undefined }, refreshed: time });
  }
  await service.run();
  expect(client.catalog).toHaveBeenCalledTimes(1);
  expect(service.read().games[0].artwork.images[0]).toMatchObject({ width: 2560, height: 1440 });
});

test('renews once after an early access-token rejection and keeps the account bound', async () => {
  await service.connect('code');
  const { ProviderError } = require('../../src/shared/providerError');
  client.library.mockRejectedValueOnce(new ProviderError('reconnect-required', 'library')).mockResolvedValue(f.records);
  client.renew.mockImplementation(async saved => ({ ...saved, accessToken: 'replacement', accessExpiresAt: time + 3600000 }));
  expect(await service.run()).toEqual({ ok: true, kind: 'library' });
  expect(client.renew).toHaveBeenCalledTimes(1);
});

test('disconnect revokes remotely before clearing local state', async () => {
  await service.connect('code');
  expect(await service.disconnect()).toEqual({ disconnected: true, remoteRevoked: true });
  expect(client.revoke).toHaveBeenCalledTimes(1);
  expect(store.state().status).toBe('disabled');
});

test('disconnect retries revocation for a stored session that already requires reconnect', async () => {
  await service.connect('code');
  store.connection.status = 'reconnect-required';
  expect(await service.disconnect()).toEqual({ disconnected: true, remoteRevoked: true });
  expect(client.revoke).toHaveBeenCalledWith(store.saved, expect.any(Object));
});

test('disconnect without a stored session does not report remote revocation', async () => {
  expect(await service.disconnect()).toEqual({ disconnected: true, remoteRevoked: false });
  expect(client.revoke).not.toHaveBeenCalled();
});
