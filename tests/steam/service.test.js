const { createService } = require('../../src/providers/steam/service');
const f = require('./fixtures');

class MemoryStore {
  constructor() { this.rows = new Map(); }
  get(resource) { return this.rows.get(resource) || null; }
  publish(resource, payload, now, nextDue) { this.rows.set(resource, { payload, success: now, attempted: now, status: 'ready', nextDue, failures: 0 }); }
  fail(resource, status, now, nextDue, suppress) {
    const old = this.get(resource);
    this.rows.set(resource, { payload: suppress ? null : old?.payload || null, success: suppress ? null : old?.success || null,
      attempted: now, status, nextDue, failures: (old?.failures || 0) + 1 });
  }
}

let time, store, client, service, settings;
beforeEach(() => {
  time = 1000000;
  store = new MemoryStore();
  client = {
    context: jest.fn(() => ({ signal: new AbortController().signal, remaining: 20 })),
    profile: jest.fn(async () => f.profile), level: jest.fn(async () => f.level),
    library: jest.fn(async () => f.library), recent: jest.fn(async () => f.recent),
    assets: jest.fn(async ids => ids.length === 1 ? f.recentAssets : f.assets),
    schema: jest.fn(async () => f.schema), achievements: jest.fn(async () => f.achievements),
    stats: jest.fn(async () => f.stats), globalAchievements: jest.fn(async () => f.globalAchievements),
  };
  settings = { steamId: f.steamId, language: 'english', refreshMs: 900000, detailsMs: 3600000, maxStaleMs: 86400000, jobMs: 45000 };
  service = createService({ store, client, config: settings, now: () => time });
});

test('refresh publishes profile, library, and recent snapshots independently', async () => {
  expect(await service.refresh()).toEqual([
    { ok: true, kind: 'profile' }, { ok: true, kind: 'library' }, { ok: true, kind: 'recent' },
  ]);
  expect(service.read('profile')).toMatchObject({ status: 'ready', personaName: 'Fixture Player', steamLevel: 42 });
  expect(service.read('library')).toMatchObject({ status: 'ready', totals: { gameCount: 2, totalPlaytimeMinutes: 720 } });
  expect(service.read('library').games[0].coverUrl).toContain('/library_600x900_2x.jpg');
  expect(service.read('recent')).toMatchObject({ status: 'ready', totals: { gameCount: 1, playtimeMinutes: 30 } });
});

test('profile remains available when Steam level is private or unsupported', async () => {
  client.level.mockRejectedValue(new Error('not visible'));
  expect(await service.run('profile')).toEqual({ ok: true, kind: 'profile' });
  expect(service.read('profile')).toMatchObject({ status: 'ready', personaName: 'Fixture Player', steamLevel: null });
});

test('known game details are pending, then combine achievements, rarity, and stats', async () => {
  await service.run('library');
  expect(service.game('570').body).toMatchObject({ status: 'pending', game: { appId: 570 }, achievementStatus: 'pending' });
  expect(await service.run('details', 570)).toEqual({ ok: true, kind: 'details' });
  expect(service.game('570').body).toMatchObject({ status: 'ready', achievementStatus: 'available', statsStatus: 'available', rarestUnlock: { apiName: 'FIRST' } });
  expect(service.game('730').body).toMatchObject({ status: 'ready', achievementStatus: 'not-supported', statsStatus: 'not-supported' });
  expect(service.game('999').httpStatus).toBe(404);
});

test('bounded stale data survives transient errors and expires after the maximum age', async () => {
  await service.run('library');
  client.library.mockRejectedValue(new Error('secret network detail'));
  time += settings.refreshMs;
  expect(await service.run('library')).toMatchObject({ ok: false, error: 'internal-error' });
  expect(service.read('library').status).toBe('stale');
  time += settings.maxStaleMs + 1;
  const expired = service.read('library');
  expect(expired.status).toBe('unavailable');
  expect(expired).not.toHaveProperty('games');
});

test('scheduler refreshes due core resources before per-game enrichment', async () => {
  await service.tick();
  expect(client.profile).toHaveBeenCalledTimes(1);
  await service.tick();
  expect(client.library).toHaveBeenCalledTimes(1);
  await service.tick();
  expect(client.recent).toHaveBeenCalledTimes(1);
  await service.tick();
  expect(client.schema).toHaveBeenCalledWith(570, 'english', expect.any(Object));
});
