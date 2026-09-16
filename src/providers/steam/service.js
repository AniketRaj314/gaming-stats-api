const { ProviderError, safeError } = require('../../shared/providerError');
const normalize = require('./normalize');

function createService({ store, client, config, now = Date.now, report = () => {} }) {
  let stopped = false;
  let running = false;
  const iso = value => value == null ? null : new Date(value).toISOString();

  function read(resource) {
    const row = store.get(resource);
    const base = { schemaVersion: 1, provider: 'steam', accountRef: 'owner' };
    if (!row) return { ...base, status: 'unavailable', stale: false, lastSuccessAt: null, lastAttemptAt: null, nextRefreshAt: null };
    const metadata = {
      ...base,
      status: row.status,
      stale: false,
      lastSuccessAt: iso(row.success),
      lastAttemptAt: iso(row.attempted),
      nextRefreshAt: iso(row.nextDue),
    };
    if (!row.payload || row.success == null || now() - row.success > config.maxStaleMs) return metadata;
    const stale = row.status !== 'ready' || now() >= row.nextDue;
    return { ...metadata, status: stale ? 'stale' : 'ready', stale, ...row.payload };
  }

  function fail(error, resource) {
    report(safeError(error));
    const controlled = error instanceof ProviderError;
    const code = controlled ? error.code : 'internal-error';
    const old = store.get(resource);
    const failures = old?.failures || 0;
    const backoff = Math.min(3600000, 60000 * 2 ** Math.min(failures, 6));
    const delay = Math.max(backoff, controlled ? error.retryAfterMs : 0);
    const privacy = ['private-or-invalid-response', 'profile-unavailable'].includes(code);
    store.fail(resource, privacy ? 'private' : 'unavailable', now(), now() + delay, privacy);
  }

  function due(resource) {
    try { return store.get(resource)?.nextDue || 0; }
    catch (error) {
      if (!(error instanceof ProviderError && error.code === 'snapshot-corrupt')) throw error;
      report(safeError(error));
      return 0;
    }
  }

  async function detailPayload(id, ctx) {
    const calls = {
      schema: client.schema(id, config.language, ctx),
      achievements: client.achievements(config.steamId, id, config.language, ctx),
      stats: client.stats(config.steamId, id, ctx),
      global: client.globalAchievements(id, ctx),
    };
    const names = Object.keys(calls);
    const settled = await Promise.allSettled(Object.values(calls));
    const values = {};
    const failures = {};
    settled.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'fulfilled') values[name] = result.value;
      else failures[name] = safeError(result.reason);
    });
    const fatal = settled.find(result => result.status === 'rejected'
      && !(result.reason instanceof ProviderError && ['not-supported', 'forbidden'].includes(result.reason.code)));
    if (fatal && !values.schema && !values.achievements && !values.stats && !values.global) throw fatal.reason;
    return normalize.details({
      schemaRaw: values.schema,
      achievementsRaw: values.achievements,
      statsRaw: values.stats,
      globalRaw: values.global,
      failures,
    });
  }

  async function run(kind, requestedAppId) {
    if (running) throw new ProviderError('busy', 'worker');
    running = true;
    let resource;
    try {
      const ctx = client.context(config.jobMs);
      let payload;
      if (kind === 'profile') {
        resource = 'profile';
        const [profileResult, levelResult] = await Promise.allSettled([
          client.profile(config.steamId, ctx), client.level(config.steamId, ctx),
        ]);
        if (profileResult.status === 'rejected') throw profileResult.reason;
        payload = normalize.profile(profileResult.value, levelResult.status === 'fulfilled' ? levelResult.value : null, config.steamId);
      } else if (kind === 'library') {
        resource = 'library';
        payload = normalize.library(await client.library(config.steamId, ctx));
      } else if (kind === 'recent') {
        resource = 'recent';
        payload = normalize.recent(await client.recent(config.steamId, ctx));
      } else if (kind === 'details') {
        const id = normalize.appId(requestedAppId);
        resource = `game:${id}`;
        const library = read('library');
        const owned = library.games?.find(item => item.appId === id);
        if (!owned) throw new ProviderError('game-not-in-library', 'details');
        if (!owned.hasCommunityVisibleStats) {
          payload = normalize.details({ failures: { schema: 'game-schema:not-supported', achievements: 'game-achievements:not-supported', stats: 'game-stats:not-supported' } });
        } else payload = await detailPayload(id, ctx);
      } else throw new ProviderError('unknown-job', 'worker');
      const finished = now();
      const interval = kind === 'details' ? config.detailsMs : config.refreshMs;
      store.publish(resource, payload, finished, finished + interval);
      return { ok: true, kind };
    } catch (error) {
      if (resource) fail(error, resource);
      return { ok: false, kind, error: safeError(error) };
    } finally { running = false; }
  }

  async function refresh() {
    const results = [];
    for (const kind of ['profile', 'library', 'recent']) results.push(await run(kind));
    return results;
  }

  function game(requestedAppId) {
    const id = normalize.appId(requestedAppId);
    const library = read('library');
    if (!library.games) return { httpStatus: 503, body: library };
    const owned = library.games.find(item => item.appId === id);
    if (!owned) return { httpStatus: 404, body: { error: 'Game not in the cached Steam library' } };
    const resource = `game:${id}`;
    const row = store.get(resource);
    if (!owned.hasCommunityVisibleStats && !row) {
      return { httpStatus: 200, body: {
        schemaVersion: 1, provider: 'steam', accountRef: 'owner', status: 'ready', stale: false,
        lastSuccessAt: library.lastSuccessAt, lastAttemptAt: library.lastAttemptAt, nextRefreshAt: null,
        game: owned, achievementStatus: 'not-supported', achievementCoverage: { defined: 0, playerRows: 0, unlocked: 0, unlockedWithKnownGlobalPercent: 0 },
        achievements: [], rarestUnlock: null, rarityComparison: 'unlocked-achievements-with-known-global-percent',
        statsStatus: 'not-supported', stats: [],
      } };
    }
    const detail = read(resource);
    if (!row) {
      return { httpStatus: 200, body: { ...detail, status: 'pending', game: owned,
        achievementStatus: 'pending', achievements: [], rarestUnlock: null,
        rarityComparison: 'unlocked-achievements-with-known-global-percent', statsStatus: 'pending', stats: [] } };
    }
    const achievementStatus = detail.achievementStatus || (detail.status === 'private' ? 'private' : 'unavailable');
    const statsStatus = detail.statsStatus || (detail.status === 'private' ? 'private' : 'unavailable');
    return { httpStatus: 200, body: { ...detail, game: owned, achievementStatus, statsStatus,
      achievements: detail.achievements || [], stats: detail.stats || [], rarestUnlock: detail.rarestUnlock || null } };
  }

  async function tick() {
    if (stopped || running) return;
    for (const resource of ['profile', 'library', 'recent']) {
      if (due(resource) <= now()) return run(resource);
    }
    const library = read('library');
    const candidates = (library.games || []).filter(item => item.hasCommunityVisibleStats)
      .map(item => ({ id: item.appId, due: due(`game:${item.appId}`) }))
      .sort((a, b) => a.due - b.due || a.id - b.id);
    if (candidates[0]?.due <= now()) return run('details', candidates[0].id);
  }

  function start() {
    const poll = async () => {
      try { await tick(); }
      catch (error) { if (!(error instanceof ProviderError && error.code === 'busy')) report(safeError(error)); }
    };
    const timer = setInterval(poll, 30000);
    timer.unref();
    void poll();
    return () => { stopped = true; clearInterval(timer); };
  }

  return { read, game, run, refresh, tick, start };
}

module.exports = { createService };
