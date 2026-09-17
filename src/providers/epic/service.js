const { ProviderError, safeError } = require('../../shared/providerError');
const normalize = require('./normalize');

function createService({ store, client, config, now = Date.now, report = () => {} }) {
  let stopped = false;
  const iso = value => value == null ? null : new Date(value).toISOString();

  function current(resource) {
    const row = store.get(resource);
    return row?.generation === store.state().generation ? row : null;
  }

  function read(resource = 'library') {
    const state = store.state();
    const base = { schemaVersion: 1, provider: 'epic', accountRef: 'owner' };
    if (state.status !== 'connected' || state.rotationPending) {
      return { ...base, status: state.rotationPending && state.status === 'connected' ? 'unavailable' : state.status,
        stale: false, lastSuccessAt: null, lastAttemptAt: null, nextRefreshAt: null };
    }
    const row = current(resource);
    const metadata = {
      ...base,
      status: row?.status || 'unavailable',
      stale: false,
      lastSuccessAt: iso(row?.success),
      lastAttemptAt: iso(row?.attempted),
      nextRefreshAt: iso(Math.max(row?.next_due || now(), state.retryAt || 0)),
    };
    if (!row?.payload || now() - row.success > config.maxStaleMs) {
      return { ...metadata, status: 'unavailable' };
    }
    const stale = row.status !== 'ready' || now() >= row.next_due;
    return { ...metadata, status: stale ? 'stale' : 'ready', stale, ...row.payload };
  }

  async function renew(saved, ctx) {
    const state = store.state();
    store.beginRotation(state.generation, state.version);
    let next;
    try { next = await client.renew(saved, ctx); }
    catch (error) {
      if (error instanceof ProviderError && ['rate-limited', 'forbidden', 'reconnect-required'].includes(error.code)) {
        store.mutate(value => {
          if (value.generation === state.generation && value.version === state.version) value.rotationPending = false;
        });
      }
      throw error;
    }
    store.saveRotated(next, state.generation, state.version);
    return client.verify(next, ctx, saved.accountId);
  }

  async function session(ctx, force = false) {
    const state = store.state();
    if (state.status !== 'connected') throw new ProviderError('not-connected', 'authentication');
    if (state.rotationPending) {
      store.mutate(value => { value.status = 'reconnect-required'; });
      throw new ProviderError('rotation-interrupted-reconnect', 'authentication');
    }
    const saved = store.session();
    if (!saved || saved.refreshExpiresAt <= now()) throw new ProviderError('reconnect-required', 'authentication');
    if (force || saved.accessExpiresAt - now() < 120000) return renew(saved, ctx);
    return saved;
  }

  async function connect(code) {
    return store.withLock(async () => {
      if (store.state().sealed) throw new ProviderError('disconnect-before-reconnecting', 'connection');
      const ctx = client.context(config.jobMs);
      const issued = await client.connect(code, ctx);
      const verified = await client.verify(issued, ctx, issued.accountId);
      if (config.expectedDisplayName && verified.displayName.toLowerCase() !== config.expectedDisplayName.toLowerCase()) {
        throw new ProviderError('unexpected-display-name', 'identity');
      }
      store.connect(verified);
      return { connected: true, displayName: verified.displayName };
    });
  }

  async function catalogFor(source, saved, ctx) {
    const keys = source.items.map(item => item.key);
    const cached = store.getCatalog(keys);
    const due = source.items.filter(item => !cached.has(item.key) || cached.get(item.key).payload.schemaVersion !== 2 ||
      now() - cached.get(item.key).refreshed >= config.catalogMs);
    let stale = false;
    if (due.length) {
      try {
        const raw = await client.catalog(due, saved, ctx);
        const entries = due.map(item => normalize.catalogEntry(item, raw.get(item.key)));
        store.putCatalog(entries, now());
        for (const entry of entries) cached.set(entry.key, { payload: entry, refreshed: now() });
      } catch (error) {
        if (due.every(item => cached.has(item.key))) stale = true;
        else throw error;
      }
    }
    return { values: new Map([...cached].map(([key, row]) => [key, row.payload])), stale };
  }

  async function fetchLibrary(saved, ctx) {
    const source = normalize.inventory(await client.library(saved, ctx));
    const catalog = await catalogFor(source, saved, ctx);
    let playtimeRaw;
    let playtimeUnavailable = false;
    try { playtimeRaw = await client.playtime(saved, ctx); }
    catch (error) {
      if (current('library')?.payload) throw error;
      playtimeRaw = [];
      playtimeUnavailable = true;
    }
    return normalize.library({ inventory: source, catalog: catalog.values, playtimeRaw,
      accountId: saved.accountId, catalogStale: catalog.stale, playtimeUnavailable });
  }

  function failure(error, generation) {
    report(safeError(error));
    const controlled = error instanceof ProviderError;
    const code = controlled ? error.code : 'internal-error';
    if (['reconnect-required', 'account-mismatch', 'rotation-interrupted-reconnect', 'credential-integrity-failed'].includes(code) || store.state().rotationPending) {
      store.mutate(state => { if (state.generation === generation && state.status === 'connected') state.status = 'reconnect-required'; });
      return;
    }
    const failures = current('library')?.failures || 0;
    const backoff = Math.min(3600000, 60000 * 2 ** Math.min(failures, 6));
    const delay = Math.max(backoff, controlled ? error.retryAfterMs : 0);
    if (code === 'rate-limited') store.mutate(state => { state.retryAt = now() + delay; });
    store.fail('library', generation, 'unavailable', now(), now() + delay);
  }

  async function run() {
    return store.withLock(async () => {
      const state = store.state();
      if (state.status !== 'connected') return { skipped: state.status };
      if (state.retryAt > now()) return { skipped: 'backoff' };
      const ctx = client.context(config.jobMs);
      try {
        let saved = await session(ctx);
        let payload;
        try { payload = await fetchLibrary(saved, ctx); }
        catch (error) {
          if (!(error instanceof ProviderError && error.code === 'reconnect-required')) throw error;
          saved = await session(ctx, true);
          payload = await fetchLibrary(saved, ctx);
        }
        const finished = now();
        store.publish('library', payload, state.generation, finished, finished + config.refreshMs);
        return { ok: true, kind: 'library' };
      } catch (error) {
        failure(error, state.generation);
        return { ok: false, kind: 'library', error: safeError(error) };
      }
    });
  }

  function game(requestedId) {
    const id = normalize.publicId(requestedId);
    const library = read();
    if (!library.games) return { httpStatus: 503, body: library };
    const found = library.games.find(item => item.providerGameId === id);
    if (!found) return { httpStatus: 404, body: { error: 'Game not in the cached Epic library' } };
    return { httpStatus: 200, body: {
      schemaVersion: library.schemaVersion, provider: 'epic', accountRef: 'owner', status: library.status,
      stale: library.stale, lastSuccessAt: library.lastSuccessAt, lastAttemptAt: library.lastAttemptAt,
      nextRefreshAt: library.nextRefreshAt, game: found,
    } };
  }

  async function disconnect({ localOnly = false } = {}) {
    return store.withLock(async () => {
      const state = store.state();
      const hadSession = Boolean(state.sealed);
      if (!localOnly && hadSession) {
        const ctx = client.context(config.jobMs);
        const saved = store.session();
        await client.revoke(saved, ctx);
      }
      store.disconnect();
      return { disconnected: true, remoteRevoked: !localOnly && hadSession };
    });
  }

  async function tick() {
    if (stopped) return;
    const state = store.state();
    if (state.status !== 'connected' || state.retryAt > now()) return;
    if ((current('library')?.next_due || 0) <= now()) return run();
  }

  function start() {
    let busy = false;
    const poll = async () => {
      if (busy || stopped) return;
      busy = true;
      try { await tick(); }
      catch (error) { if (!(error instanceof ProviderError && error.code === 'busy')) report(safeError(error)); }
      finally { busy = false; }
    };
    const timer = setInterval(poll, 30000);
    timer.unref();
    void poll();
    return () => { stopped = true; clearInterval(timer); };
  }

  return { read, game, connect, run, tick, start, disconnect };
}

module.exports = { createService };
