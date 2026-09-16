const { ProviderError } = require('../../shared/providerError');

// Public Epic launcher OAuth client used by community launcher implementations.
// These constants identify the launcher client; they are not owner credentials.
const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const BASIC = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
const ACCOUNT = 'https://account-public-service-prod03.ol.epicgames.com';
const LIBRARY = 'https://library-service.live.use1a.on.epicgames.com';
const CATALOG = 'https://catalog-public-service-prod06.ol.epicgames.com';

function createClient({ fetchImpl = global.fetch, now = Date.now, requestMs = 10000, maxBytes = 4 * 1024 * 1024 } = {}) {
  const context = (jobMs = 120000) => ({ signal: AbortSignal.timeout(jobMs), remaining: 150 });

  async function request(origin, pathname, { method = 'GET', query, headers = {}, body, empty = false } = {}, ctx, stage) {
    if (--ctx.remaining < 0) throw new ProviderError('request-budget-exhausted', stage);
    const url = new URL(pathname, origin);
    if (query) {
      for (const [name, value] of query) url.searchParams.append(name, value);
    }
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(requestMs)]);
    try {
      const response = await fetchImpl(url.toString(), { method, headers, body, redirect: 'manual', signal });
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        await response.body?.cancel();
        if (response.status === 429) {
          const parsed = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now();
          throw new ProviderError('rate-limited', stage, Number.isFinite(parsed) ? Math.max(60000, Math.min(parsed, 86400000)) : 300000);
        }
        if (response.status === 401 || (stage === 'authentication' && response.status === 400)) {
          throw new ProviderError('reconnect-required', stage);
        }
        if (response.status === 403) throw new ProviderError('forbidden', stage);
        if (response.status === 404) throw new ProviderError('not-found', stage);
        throw new ProviderError(`upstream-${response.status}`, stage);
      }
      if (empty) {
        await response.body?.cancel();
        return null;
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new ProviderError('response-too-large', stage);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError('invalid-response', stage);
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new ProviderError('response-too-large', stage);
          }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new ProviderError('invalid-json', stage); }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(signal.aborted ? 'timeout' : 'network-error', stage);
    }
  }

  function expiry(raw, absoluteName, relativeName, stage) {
    const absolute = Date.parse(raw?.[absoluteName]);
    if (Number.isFinite(absolute) && absolute > now() && absolute <= now() + 366 * 86400000) return absolute;
    const seconds = raw?.[relativeName];
    if (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 366 * 86400) return now() + seconds * 1000;
    throw new ProviderError('invalid-token-expiry', stage);
  }

  function session(raw) {
    const token = value => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\r\n]/.test(value);
    if (!raw || typeof raw !== 'object' || !token(raw.access_token) || !token(raw.refresh_token) ||
      typeof raw.account_id !== 'string' || !/^[a-f\d]{32}$/i.test(raw.account_id) ||
      typeof raw.displayName !== 'string' || raw.displayName.length < 1 || raw.displayName.length > 64 || /[\r\n]/.test(raw.displayName)) {
      throw new ProviderError('invalid-token-response', 'authentication');
    }
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      accessExpiresAt: expiry(raw, 'expires_at', 'expires_in', 'authentication'),
      refreshExpiresAt: expiry(raw, 'refresh_expires_at', 'refresh_expires', 'authentication'),
      accountId: raw.account_id.toLowerCase(),
      displayName: raw.displayName,
    };
  }

  async function token(form, ctx) {
    const raw = await request(ACCOUNT, '/account/api/oauth/token', {
      method: 'POST',
      headers: { Authorization: BASIC, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }, ctx, 'authentication');
    return session(raw);
  }

  function loginUrl() {
    const redirect = new URL('https://www.epicgames.com/id/api/redirect');
    redirect.searchParams.set('clientId', CLIENT_ID);
    redirect.searchParams.set('responseType', 'code');
    const login = new URL('https://www.epicgames.com/id/login');
    login.searchParams.set('redirectUrl', redirect.toString());
    return login.toString();
  }

  async function connect(code, ctx) {
    if (typeof code !== 'string' || !/^[A-Za-z0-9._~-]{1,2048}$/.test(code)) {
      throw new ProviderError('invalid-authorization-code', 'authentication');
    }
    return token({ grant_type: 'authorization_code', code, token_type: 'eg1' }, ctx);
  }

  async function renew(saved, ctx) {
    const next = await token({ grant_type: 'refresh_token', refresh_token: saved.refreshToken, token_type: 'eg1' }, ctx);
    if (next.accountId !== saved.accountId) throw new ProviderError('account-mismatch', 'identity');
    return next;
  }

  async function verify(saved, ctx, expectedAccountId) {
    const raw = await request(ACCOUNT, '/account/api/oauth/verify', {
      headers: { Authorization: `Bearer ${saved.accessToken}`, Accept: 'application/json' },
    }, ctx, 'identity');
    if (!raw || typeof raw !== 'object' || typeof raw.account_id !== 'string' ||
      raw.account_id.toLowerCase() !== (expectedAccountId || saved.accountId) ||
      typeof raw.displayName !== 'string' || raw.displayName.length > 64 || /[\r\n]/.test(raw.displayName)) {
      throw new ProviderError('account-mismatch', 'identity');
    }
    return { ...saved, accountId: raw.account_id.toLowerCase(), displayName: raw.displayName };
  }

  const authHeaders = saved => ({ Authorization: `Bearer ${saved.accessToken}`, Accept: 'application/json' });

  async function library(saved, ctx) {
    const records = [];
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 100; page++) {
      const query = [['includeMetadata', 'true']];
      if (cursor) query.push(['cursor', cursor]);
      const raw = await request(LIBRARY, '/library/api/public/items', { headers: authHeaders(saved), query }, ctx, 'library');
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.records) || records.length + raw.records.length > 10000) {
        throw new ProviderError('invalid-library-page', 'library');
      }
      records.push(...raw.records);
      const next = raw.responseMetadata?.nextCursor;
      if (next == null || next === '') return records;
      if (typeof next !== 'string' || next.length > 2048 || cursors.has(next)) throw new ProviderError('invalid-library-cursor', 'library');
      cursors.add(next);
      cursor = next;
    }
    throw new ProviderError('page-budget-exhausted', 'library');
  }

  const playtime = (saved, ctx) => request(LIBRARY,
    `/library/api/public/playtime/account/${encodeURIComponent(saved.accountId)}/all`,
    { headers: authHeaders(saved) }, ctx, 'playtime');

  async function catalog(items, saved, ctx) {
    const output = new Map();
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.namespace)) groups.set(item.namespace, []);
      groups.get(item.namespace).push(item.catalogItemId);
    }
    for (const [namespace, ids] of groups) {
      for (let offset = 0; offset < ids.length; offset += 50) {
        const batch = ids.slice(offset, offset + 50);
        const query = batch.map(id => ['id', id]);
        query.push(['includeMainGameDetails', 'true'], ['country', 'US'], ['locale', 'en-US']);
        const raw = await request(CATALOG, `/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items`,
          { headers: authHeaders(saved), query }, ctx, 'catalog');
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProviderError('invalid-catalog-response', 'catalog');
        for (const id of batch) {
          if (raw[id] && typeof raw[id] === 'object' && !Array.isArray(raw[id])) output.set(`${namespace}\0${id}`, raw[id]);
        }
      }
    }
    return output;
  }

  const revoke = (saved, ctx) => request(ACCOUNT,
    `/account/api/oauth/sessions/kill/${encodeURIComponent(saved.accessToken)}`,
    { method: 'DELETE', headers: authHeaders(saved), empty: true }, ctx, 'revocation');

  return { context, loginUrl, connect, renew, verify, library, playtime, catalog, revoke };
}

module.exports = { createClient };
