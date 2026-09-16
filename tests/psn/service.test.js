const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PsnStore, keyFromHex } = require('../../src/storage/psnStore');
const { createService } = require('../../src/providers/psn/service');
const { ProviderError } = require('../../src/shared/providerError');
const f = require('./fixtures');

let dir, store, client, service, time, settings;
const key = keyFromHex('ab'.repeat(32));
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psn-fixture-'));
  time = 1800000000000;
  store = new PsnStore(dir, key, 'owner123');
  settings = { onlineId: 'owner123', libraryMs: 900000, presenceMs: 60000, detailsMs: 3600000, maxStaleMs: 86400000, jobMs: 45000 };
  client = { context: jest.fn(() => ({})), connect: jest.fn().mockResolvedValue(f.session), renew: jest.fn().mockResolvedValue(f.session),
    verify: jest.fn().mockImplementation(async s => ({ ...s, accountId: f.summary.accountId })), library: jest.fn().mockResolvedValue(f.games),
    lists: jest.fn().mockResolvedValue(f.lists), summary: jest.fn().mockResolvedValue(f.summary), presence: jest.fn().mockResolvedValue(f.playing),
    mapping: jest.fn().mockResolvedValue({ titles: [{ npTitleId: f.games[0].titleId, trophyTitles: [{ npCommunicationId: f.lists[0].npCommunicationId }] }] }),
    trophies: jest.fn().mockImplementation(async (set, earned) => earned ? [{ trophyId: 1, earned: true, trophyEarnedRate: '2.5' }] : f.definitions) };
  service = createService({ store, client, config: settings, now: () => time });
});
afterEach(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const connect = () => service.connect('X'.repeat(64));

test('credentials are encrypted with account binding and restrictive permissions', async () => {
  await connect();
  expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  expect(fs.statSync(path.join(dir, 'credentials.sqlite')).mode & 0o777).toBe(0o600);
  expect(fs.readFileSync(path.join(dir, 'credentials.sqlite')).includes(Buffer.from(f.session.refreshToken))).toBe(false);
  expect(fs.readFileSync(path.join(dir, 'snapshots.sqlite')).includes(Buffer.from(f.session.accessToken))).toBe(false);
  const other = new PsnStore(dir, key, 'another-account');
  try { expect(() => other.session()).toThrow('credential-integrity-failed'); } finally { other.close(); }
});
test('tampering with ciphertext fails closed', async () => {
  await connect(); store.mutate(s => { s.sealed.tag = Buffer.alloc(16).toString('base64'); });
  expect(() => store.session()).toThrow('credential-integrity-failed');
});
test('connection failure does not overwrite a session or publish profile details', async () => {
  client.verify.mockRejectedValue(new ProviderError('account-mismatch', 'identity'));
  await expect(connect()).rejects.toThrow('account-mismatch');
  expect(store.session()).toBeNull();
  expect(service.read('library').status).toBe('not-configured');
});
test('successful refresh publishes only safe fields and complete library', async () => {
  await connect(); expect((await service.run('library')).ok).toBe(true);
  const result = service.read('library');
  expect(result.status).toBe('ready'); expect(result.games).toHaveLength(1);
  expect(JSON.stringify([result, service.read('summary')])).not.toMatch(/accountId|accessToken|refreshToken|synthetic-/);
});
test('partial refresh retains last-good inventory, with bounded stale age', async () => {
  await connect(); await service.run('library'); time += 1000;
  client.lists.mockRejectedValue(new ProviderError('network-error', 'trophy-lists'));
  expect((await service.run('library')).ok).toBe(false);
  expect(service.read('library')).toMatchObject({ status: 'stale', lastSuccessAt: new Date(time - 1000).toISOString() });
  time += settings.maxStaleMs;
  expect(service.read('library').status).toBe('unavailable');
  expect(service.read('library').games).toBeUndefined();
});
test('presence failure never returns a stale playing payload', async () => {
  await connect(); await service.run('presence');
  client.presence.mockRejectedValue(new ProviderError('network-error', 'presence'));time += 1000;
  await service.run('presence');
  expect(service.read('presence')).toMatchObject({ status: 'unavailable', activity: 'unavailable', games: [], lastSuccessAt: new Date(time - 1000).toISOString() });
});
test('presence expires even when a worker stops', async () => {
  await connect(); await service.run('presence'); time += 121000;
  expect(service.read('presence')).toMatchObject({ activity: 'unavailable', games: [] });
});
test('rejected credentials suppress all cached data and stop automatic attempts', async () => {
  await connect(); await service.run('library');
  client.presence.mockRejectedValue(new ProviderError('reconnect-required', 'presence'));
  await service.run('presence'); await service.tick();
  expect(service.read('library').status).toBe('reconnect-required');
  expect(service.read('library').games).toBeUndefined();
  expect(client.presence).toHaveBeenCalledTimes(1);
});
test('private library results suppress prior snapshots', async () => {
  await connect(); await service.run('library');
  client.library.mockRejectedValue(new ProviderError('private', 'library'));
  await service.run('library');
  expect(service.read('library').status).toBe('private');
  expect(service.read('library').games).toBeUndefined();
});
test('rate-limit backoff is persistent and prevents immediate requests', async () => {
  await connect(); client.presence.mockRejectedValue(new ProviderError('rate-limited', 'presence', 180000));
  await service.run('presence');
  expect(store.state().retryAt).toBe(time + 180000);
  expect(await service.run('library')).toMatchObject({ skipped: 'backoff' });
  expect(client.library).not.toHaveBeenCalled();
});
test('rotation saves replacement credentials before verification and data requests', async () => {
  client.connect.mockResolvedValue({ ...f.session, accessExpiresAt: time + 1000 });
  await connect();
  client.renew.mockResolvedValue({ ...f.session, accessToken: 'replacement-access', refreshToken: 'replacement-refresh' });
  client.verify.mockImplementation(async s => { expect(store.session().refreshToken).toBe('replacement-refresh'); return s; });
  await service.run('presence');
  expect(store.state().rotationPending).toBe(false);
  expect(client.presence.mock.calls[0][0].accessToken).toBe('replacement-access');
});
test('failed persistence after rotation blocks reuse of the previous token', async () => {
  client.connect.mockResolvedValue({ ...f.session, accessExpiresAt: time });await connect();
  jest.spyOn(store, 'saveRotated').mockImplementation(() => { throw new Error('disk full'); });
  await service.run('presence');
  expect(store.state().status).toBe('reconnect-required');
  expect(client.presence).not.toHaveBeenCalled();
  await service.run('presence'); expect(client.renew).toHaveBeenCalledTimes(1);
});
test('restart after an interrupted rotation requires reconnect without upstream retry', async () => {
  await connect();const s = store.state();store.beginRotation(s.generation, s.version);
  store.close();store = new PsnStore(dir, key, 'owner123');
  service = createService({ store, client, config: settings, now: () => time });
  await service.run('presence');
  expect(store.state().status).toBe('reconnect-required'); expect(client.renew).not.toHaveBeenCalled();
});
test('two independent stores cannot run simultaneous refresh writers', async () => {
  const other = new PsnStore(dir, key, 'owner123');
  try {
    await store.withLock(async () => {
      await expect(other.withLock(async () => {})).rejects.toThrow('busy');
      await expect(store.withLock(async () => {})).rejects.toThrow('busy');
    });
    await expect(other.withLock(async () => 1)).resolves.toBe(1);
  } finally { other.close(); }
});
test('disconnect invalidates a running job before it can republish data', async () => {
  await connect();client.presence.mockImplementation(async () => { service.disconnect(); return f.playing; });
  await service.run('presence');
  expect(service.read('presence').status).toBe('disabled');expect(store.session()).toBeNull();expect(store.get('presence')).toBeNull();
});
test('trophy details use owned title IDs and recheck privacy on reads', async () => {
  await connect();await service.run('library');
  await service.run('details', f.games[0].titleId);
  expect(service.game(f.games[0].titleId).body.trophySets[0].trophies[0].name).toBe('A Secret');
  store.publishMany([{ resource: 'lists', payload: { sets: [] }, nextDue: time + 900000 }], store.state().generation, time);
  expect(service.game(f.games[0].titleId).body.trophySets).toEqual([]);
  expect(service.game('PPSA99999_00').httpStatus).toBe(404);
  client.mapping.mockClear();await service.run('details', 'PPSA99999_00');expect(client.mapping).not.toHaveBeenCalled();
});
test('snapshot reads never call the provider', async () => {
  await connect();await service.run('library');
  for (const mock of Object.values(client)) mock.mockClear();
  service.read('library');service.read('summary');service.read('presence');service.game(f.games[0].titleId);
  for (const mock of Object.values(client)) expect(mock).not.toHaveBeenCalled();
});
test('scheduler prioritizes presence, then library, then missing detail records', async () => {
  await connect();await service.tick();await service.tick();await service.tick();
  expect(client.presence).toHaveBeenCalledTimes(1);expect(client.library).toHaveBeenCalledTimes(1);expect(client.mapping).toHaveBeenCalledTimes(1);
});
