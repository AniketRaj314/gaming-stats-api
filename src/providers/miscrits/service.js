const normalize = require('./normalize');
const { ProviderError, safeError } = require('../../shared/providerError');
const fail = code => { throw new ProviderError(code, 'miscrits'); };
const sameUsername = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
function expiry(token) {
  try { const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp;
    return Number.isSafeInteger(value) ? value * 1000 : 0;
  } catch { return 0; }
}
function createService({ store, client, settings, now = Date.now }) {
  function acceptsAccount(accountId) {
    return typeof accountId === 'string' && Boolean(accountId) && (!settings.accountId || accountId === settings.accountId);
  }
  function verify(raw, credentials, accountId) {
    if (!acceptsAccount(raw.user_id) || (accountId && raw.user_id !== accountId)
      || !sameUsername(raw.username, credentials.username)) fail('account-mismatch');
  }
  function checkBinding(session) {
    if (!acceptsAccount(session.accountId)) fail('account-mismatch');
  }
  function pair(value, credentials, accountId) {
    if (typeof value?.token !== 'string' || typeof value?.refresh_token !== 'string'
      || expiry(value.token) <= now() || expiry(value.refresh_token) <= now()) fail('invalid-session');
    return { credentials, token: value.token, refreshToken: value.refresh_token, accountId, displayName: null };
  }
  async function rotate(session) {
    const state = store.state();
    checkBinding(session);
    let tokens;
    if (expiry(session.refreshToken) > now() + 60000) {
      try { tokens = await client.refresh(session.credentials, session.refreshToken); }
      catch (error) {
        if (error.code !== 'http-401') throw error;
      }
    }
    if (!tokens) tokens = await client.login(session.credentials);
    const next = pair(tokens, session.credentials, session.accountId);
    store.saveRotated(next, state.generation, state.version);
    return next;
  }
  async function getPlayer(session) {
    const rotated = expiry(session.token) <= now() + 60000;
    if (rotated) session = await rotate(session);
    let raw;
    try { raw = await client.player(session.token); }
    catch (error) {
      if (error.code !== 'http-401' || rotated) throw error;
      session = await rotate(session);
      raw = await client.player(session.token);
    }
    verify(raw, session.credentials, session.accountId);
    return raw;
  }
  async function connectUnlocked(credentials) {
    if (store.state().sealed) fail('disconnect-before-reconnecting');
    if (!credentials || ['username','password','applicationCredential'].some(k => typeof credentials[k] !== 'string' || !credentials[k])
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(credentials.applicationCredential)) fail('invalid-credentials');
    const session = pair(await client.login(credentials), credentials, null);
    const raw = await client.player(session.token);
    verify(raw, credentials);
    session.accountId = raw.user_id;
    store.connect(session);
    return raw;
  }
  async function connect(credentials, { refresh = false } = {}) {
    return store.withLock(async () => {
      const raw = await connectUnlocked(credentials);
      if (!refresh) return { connected: true };
      const state = store.state();
      try { return { connected: true, refreshed: true, ...await publish(raw, state) }; }
      catch (error) {
        store.fail('core', state.generation, 'refresh-failed', now(), 0);
        return { connected: true, refreshed: false, error: safeError(error) };
      }
    });
  }
  async function publish(raw, state) {
    let cached = store.getCatalog(['species']).get('species')?.payload;
    if (!cached || now() - cached.checkedAt >= settings.catalogMs) {
      cached = { ...await client.catalog(cached), key: 'species' };
    }
    let species = normalize.catalog(cached.rows);
    if (Array.isArray(raw.miscrits) && raw.miscrits.some(row => !species.some(s => s.id === row.m))) {
      cached = { ...await client.catalog(cached, true), key: 'species' };
      species = normalize.catalog(cached.rows);
    }
    const data = normalize.player(raw, species);
    const fetchedAt = new Date(now()).toISOString();
    const payload = { ...data, species, families: normalize.families(species, data.miscrits),
      fetchedAt, interpretationVersion: 1,
      catalog: { hash: cached.hash, version: cached.version, fetchedAt: cached.fetchedAt } };
    store.putCatalog([cached], now());
    store.publish('core', payload, state.generation, now(), 0);
    return { ok: true, fetchedAt, playerMiscritCount: data.miscrits.length };
  }
  async function run() {
    return store.withLock(async () => {
      const state = store.state();
      try {
        const session = store.session();
        if (!session) fail('run-miscrits-connect-first');
        checkBinding(session);
        return await publish(await getPlayer(session), state);
      } catch (error) {
        store.fail('core', state.generation, 'refresh-failed', now(), 0);
        throw error;
      }
    });
  }
  function read() {
    const state = store.state(), snapshot = store.get('core');
    const base = { schemaVersion: 1, provider: 'miscrits', accountRef: 'owner', canonicalGameId: 'steam-3628960',
      status: 'pending', fetchedAt: null, lastAttemptAt: snapshot ? new Date(snapshot.attempted).toISOString() : null,
      nextRefreshAt: null, refreshMode: 'startup-and-manual' };
    if (state.status !== 'connected' || !acceptsAccount(state.accountId)) return { ...base, status: 'unavailable' };
    if (!snapshot?.payload || snapshot.generation !== state.generation) {
      return { ...base, status: snapshot?.generation === state.generation && snapshot.failures ? 'unavailable' : 'pending' };
    }
    return { ...base, status: snapshot.status !== 'ready' || now() - snapshot.success >= settings.staleMs ? 'stale' : 'ready',
      fetchedAt: snapshot.payload.fetchedAt, catalog: snapshot.payload.catalog,
      interpretationVersion: snapshot.payload.interpretationVersion, data: snapshot.payload };
  }
  return { connect, run, read,
    disconnect: () => store.withLock(async () => { store.disconnect(); return { disconnected: true, remoteRevoked: false }; }) };
}
module.exports = { createService, expiry };
