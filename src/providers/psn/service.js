const { ProviderError, safeError } = require('../../shared/providerError');
const normalize = require('./normalize');

function createService({ store, client, config, now = Date.now, report = () => {} }) {
  let stopped = false;
  const iso = (t) => t == null ? null : new Date(t).toISOString();

  function current(resource) {
    const row = store.get(resource);
    return row?.generation === store.state().generation ? row : null;
  }

  function read(resource) {
    const state = store.state();
    const base = { schemaVersion: 1, provider: 'psn', accountRef: 'owner' };
    if (state.status !== 'connected' || state.rotationPending) {
      return { ...base, status: state.rotationPending && state.status === 'connected' ? 'unavailable' : state.status, stale: false, lastSuccessAt: null, lastAttemptAt: null, nextRefreshAt: null };
    }
    const row = current(resource);
    const lastSuccessAt = iso(row?.success);
    const meta = { ...base, lastAttemptAt: iso(row?.attempted), lastSuccessAt, nextRefreshAt: iso(Math.max(row?.next_due || now(), state.retryAt || 0)) };
    const presence = resource === 'presence';
    const maxAge = presence ? Math.max(90000, config.presenceMs * 2) : config.maxStaleMs;
    if (!row?.payload || now() - row.success > maxAge || (presence && row.status !== 'ready')) {
      return { ...meta, status: row?.status === 'private' ? 'private' : 'unavailable', stale: false,
        ...(presence ? { activity: 'unavailable', online: null, platform: null, games: [] } : {}) };
    }
    const stale = row.status !== 'ready' || now() >= row.next_due;
    return { ...meta, status: stale ? 'stale' : 'ready', stale, ...row.payload };
  }

  async function session(ctx) {
    const state = store.state();
    if (state.status !== 'connected') throw new ProviderError('not-connected', 'authentication');
    if (state.rotationPending) {
      store.mutate(s => { s.status = 'reconnect-required'; });
      throw new ProviderError('rotation-interrupted-reconnect', 'authentication');
    }
    let saved = store.session();
    if (!saved || saved.refreshExpiresAt <= now()) throw new ProviderError('reconnect-required', 'authentication');
    if (saved.accessExpiresAt - now() < 120000) {
      store.beginRotation(state.generation, state.version);
      // Persist before verification/data requests. If the process or disk fails in
      // this interval, the durable marker forbids retrying an old rotating token.
      let next;
      try { next = await client.renew(saved, ctx); }
      catch (error) {
        // A definite HTTP rejection cannot have issued a replacement token.
        if (error instanceof ProviderError && ['rate-limited', 'private', 'reconnect-required'].includes(error.code)) {
          store.mutate(s => { if (s.generation === state.generation && s.version === state.version) s.rotationPending = false; });
        }
        throw error;
      }
      saved = { ...next, accountId: saved.accountId };
      store.saveRotated(saved, state.generation, state.version);
      await client.verify(saved, config.onlineId, ctx, saved.accountId);
    }
    return saved;
  }

  async function connect(npsso) {
    return store.withLock(async () => {
      if (store.state().sealed) throw new ProviderError('disconnect-before-reconnecting', 'connection');
      const ctx = client.context(config.jobMs);
      const issued = await client.connect(npsso, ctx);
      const verified = await client.verify(issued, config.onlineId, ctx);
      store.connect(verified);
      return { connected: true, onlineId: config.onlineId };
    });
  }

  function failure(error, resources, generation) {
    report(safeError(error));
    const controlled = error instanceof ProviderError;
    const code = controlled ? error.code : 'internal-error';
    if (['reconnect-required', 'account-mismatch', 'rotation-interrupted-reconnect', 'credential-integrity-failed'].includes(code) || store.state().rotationPending) {
      store.mutate(s => { if (s.generation === generation && s.status === 'connected') s.status = 'reconnect-required'; });
      return;
    }
    const failures = Math.max(0, ...resources.map(r => current(r)?.failures || 0));
    const backoff = Math.min(3600000, 60000 * 2 ** Math.min(failures, 6));
    const delay = Math.max(backoff, controlled ? error.retryAfterMs : 0);
    if (code === 'rate-limited') store.mutate(s => { s.retryAt = now() + delay; });
    for (const resource of resources) store.fail(resource, generation, code === 'private' ? 'private' : 'unavailable', now(), now() + delay, code === 'private' || resource === 'presence');
  }

  async function run(kind, titleId) {
    return store.withLock(async () => {
      const state = store.state();
      if (state.status !== 'connected') return { skipped: state.status };
      if (state.retryAt > now()) return { skipped: 'backoff' };
      const resources = kind === 'library' ? ['library', 'summary', 'lists'] : [kind === 'details' ? `game:${titleId}` : 'presence'];
      const ctx = client.context(config.jobMs);
      try {
        const saved = await session(ctx);
        const entries = [];
        if (kind === 'library') {
          const games = normalize.library(await client.library(saved, ctx));
          const lists = normalize.trophyLists(await client.lists(saved, ctx));
          const rawSummary = await client.summary(saved, ctx);
          if (normalize.accountId(rawSummary?.accountId) !== saved.accountId) throw new ProviderError('account-mismatch', 'identity');
          entries.push({ resource: 'library', payload: games }, { resource: 'lists', payload: { sets: lists } }, { resource: 'summary', payload: normalize.summary(rawSummary, lists) });
        } else if (kind === 'presence') {
          entries.push({ resource: 'presence', payload: normalize.presence(await client.presence(saved, ctx)) });
        } else if (kind === 'details') {
          normalize.identifier(titleId);
          const lib = read('library'); const lists = read('lists');
          if (!lib.games?.some(g => g.providerGameId === titleId) || !lists.sets) throw new ProviderError('title-not-available', 'details');
          const sets = normalize.mappedSets(await client.mapping(titleId, saved, ctx), titleId, lists.sets);
          if (sets.length > 10) throw new ProviderError('too-many-trophy-sets', 'details');
          const detailed = [];
          for (const set of sets) {
            const definitions = await client.trophies(set, false, saved, ctx);
            const earned = await client.trophies(set, true, saved, ctx);
            detailed.push({ ...set, ...normalize.trophies(definitions, earned) });
          }
          entries.push({ resource: `game:${titleId}`, payload: { trophyStatus: sets.length ? 'available' : 'no-synced-set', trophySets: detailed } });
        } else throw new ProviderError('unknown-job', 'worker');
        const finished = now();
        const interval = kind === 'library' ? config.libraryMs : kind === 'presence' ? config.presenceMs : config.detailsMs;
        store.publishMany(entries.map(e => ({ ...e, nextDue: finished + interval })), state.generation, finished);
        return { ok: true, kind };
      } catch (error) {
        failure(error, resources, state.generation);
        return { ok: false, kind, error: safeError(error) };
      }
    });
  }

  function game(titleId) {
    normalize.identifier(titleId);
    const lib = read('library');
    if (!lib.games) return { httpStatus: 503, body: lib };
    const found = lib.games.find(g => g.providerGameId === titleId);
    if (!found) return { httpStatus: 404, body: { error: 'Game not in the cached PSN played history' } };
    const lists = read('lists');
    const details = read(`game:${titleId}`);
    // Recheck visibility at read time: old details cannot reveal a newly hidden set.
    const visible = new Set((lists.sets || []).map(s => s.service + ':' + s.id));
    const sets = details.trophySets?.filter(s => visible.has(s.service + ':' + s.id));
    const trophyStatus = !lists.sets ? (lists.status === 'private' ? 'private' : 'unavailable')
      : sets ? (sets.length ? 'available' : 'no-visible-synced-set')
        : current(`game:${titleId}`) ? (details.status === 'private' ? 'private' : 'unavailable') : 'pending';
    const earnedWithRarity = (sets || []).flatMap(set => set.trophies.filter(t => t.earned === true && t.earnedRate !== null)
      .map(t => ({ ...t, trophySetId: set.id, service: set.service }))).sort((a, b) => a.earnedRate - b.earnedRate);
    const relatedEditions = found.conceptId ? lib.games.filter(g => g.conceptId === found.conceptId).map(g => ({ providerGameId: g.providerGameId, name: g.name, platform: g.platform })) : [];
    return { httpStatus: 200, body: { ...details, game: found, relatedEditions,
      trophyStatus, rarestUnlock: lists.sets ? earnedWithRarity[0] || null : null,
      rarityComparison: 'earned-trophies-with-known-rarity-in-visible-cached-sets',
      trophySets: lists.sets && sets ? sets : [] } };
  }

  async function tick() {
    if (stopped) return;
    const state = store.state();
    if (state.status !== 'connected' || state.retryAt > now()) return;
    if ((current('presence')?.next_due || 0) <= now()) return run('presence');
    if ((current('library')?.next_due || 0) <= now()) return run('library');
    const lib = read('library');
    const candidates = (lib.games || []).map(g => ({ id: g.providerGameId, due: current(`game:${g.providerGameId}`)?.next_due || 0 }));
    candidates.sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
    if (candidates[0]?.due <= now()) return run('details', candidates[0].id);
  }

  function start() {
    let busy = false;
    const poll = async () => {
      if (busy || stopped) return;
      busy = true;
      try { await tick(); } catch (e) { if (!(e instanceof ProviderError && e.code === 'busy')) report(safeError(e)); }
      finally { busy = false; }
    };
    // Fixed small tick; due times and backoff persist in SQLite across restarts.
    const timer = setInterval(poll, 5000);
    timer.unref();
    void poll();
    return () => { stopped = true; clearInterval(timer); };
  }

  return { read, game, connect, run, tick, start, disconnect: () => store.disconnect() };
}

module.exports = { createService };
