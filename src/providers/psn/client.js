const { ProviderError } = require('../../shared/providerError');
const { object, identifier, accountId } = require('./normalize');

// Protocol constants documented by achievements-app/psn-api (MIT). These are
// public mobile-client identifiers, not owner credentials. See docs/psn.md.
const AUTH = 'https://ca.account.sony.com/api/authz/v3/oauth';
const API = 'https://m.np.playstation.com/api';
const CALLBACK = 'com.scee.psxandroid.scecompcall://redirect';
const CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891';
const BASIC = 'Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const SCOPES = 'psn:mobile.v2.core psn:clientapp';

function createClient({ fetchImpl = global.fetch, now = Date.now, requestMs = 10000, maxBytes = 4 * 1024 * 1024 } = {}) {
  const context = (jobMs = 45000) => ({ signal: AbortSignal.timeout(jobMs), remaining: 60 });

  async function request(url, options, ctx, stage, redirect = false) {
    if (--ctx.remaining < 0) throw new ProviderError('request-budget-exhausted', stage);
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(requestMs)]);
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'manual', signal });
      if (redirect && [301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        return location;
      }
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        await response.body?.cancel();
        if (response.status === 429) {
          const delay = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now();
          throw new ProviderError('rate-limited', stage, Number.isFinite(delay) ? Math.max(60000, Math.min(delay, 86400000)) : 300000);
        }
        const code = response.status === 401 || (stage === 'authentication' && response.status === 400) ? 'reconnect-required'
          : response.status === 403 ? 'private' : response.status === 404 ? 'not-found' : `upstream-${response.status}`;
        throw new ProviderError(code, stage);
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel(); throw new ProviderError('response-too-large', stage);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError('invalid-response', stage);
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); throw new ProviderError('response-too-large', stage); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new ProviderError('invalid-json', stage); }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(signal.aborted ? 'timeout' : 'network-error', stage);
    }
  }

  function session(raw) {
    if (!object(raw) || ![raw.access_token, raw.refresh_token].every(t => typeof t === 'string' && t.length > 0 && t.length < 16384 && !/[\r\n]/.test(t)) ||
      ![raw.expires_in, raw.refresh_token_expires_in].every(n => Number.isSafeInteger(n) && n > 0 && n < 366 * 86400)) {
      throw new ProviderError('invalid-token-response', 'authentication');
    }
    return { accessToken: raw.access_token, refreshToken: raw.refresh_token, accessExpiresAt: now() + raw.expires_in * 1000, refreshExpiresAt: now() + raw.refresh_token_expires_in * 1000 };
  }
  async function token(form, ctx) {
    return session(await request(AUTH + '/token', { method: 'POST', headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }, ctx, 'authentication'));
  }
  async function connect(npsso, ctx) {
    if (!/^[A-Za-z0-9_-]{64}$/.test(npsso)) throw new ProviderError('invalid-npsso-format', 'authentication');
    const query = new URLSearchParams({ access_type: 'offline', client_id: CLIENT_ID, redirect_uri: CALLBACK, response_type: 'code', scope: SCOPES });
    const location = await request(AUTH + '/authorize?' + query, { headers: { Cookie: `npsso=${npsso}` } }, ctx, 'authentication', true);
    let code;
    try {
      const url = new URL(location);
      if (url.protocol !== 'com.scee.psxandroid.scecompcall:' || url.hostname !== 'redirect' || !['', '/'].includes(url.pathname) || url.username || url.password || url.port || url.hash) throw new Error();
      code = url.searchParams.get('code');
      if (url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1 || !/^[A-Za-z0-9._-]{1,2048}$/.test(code || '')) throw new Error();
    } catch { throw new ProviderError('invalid-auth-callback', 'authentication'); }
    return token({ code, redirect_uri: CALLBACK, grant_type: 'authorization_code', token_format: 'jwt' }, ctx);
  }
  const renew = (saved, ctx) => token({ refresh_token: saved.refreshToken, grant_type: 'refresh_token', token_format: 'jwt', scope: SCOPES }, ctx);

  const get = (path, query, saved, ctx, stage) => request(API + path + (query ? '?' + new URLSearchParams(query) : ''), {
    headers: { Authorization: `Bearer ${saved.accessToken}`, Accept: 'application/json', 'Accept-Language': 'en-US' },
  }, ctx, stage);

  async function paginate(path, query, field, saved, ctx, stage, limit = 100) {
    const records = []; let offset = 0; let total;
    for (let page = 0; page < 100; page++) {
      const response = await get(path, { ...query, limit: String(limit), offset: String(offset) }, saved, ctx, stage);
      if (!object(response) || !Array.isArray(response[field]) || !Number.isSafeInteger(response.totalItemCount) || response.totalItemCount < 0 || response.totalItemCount > 10000) throw new ProviderError('invalid-page', stage);
      if (total !== undefined && total !== response.totalItemCount) throw new ProviderError('inventory-changed-during-pagination', stage);
      total = response.totalItemCount;
      records.push(...response[field]);
      if (records.length > total) throw new ProviderError('invalid-page-count', stage);
      const next = response.nextOffset;
      if (next == null) {
        if (records.length !== total) throw new ProviderError('incomplete-pagination', stage);
        return records;
      }
      if (!response[field].length || !Number.isSafeInteger(next) || next <= offset || next !== offset + response[field].length || records.length >= total) throw new ProviderError('nonadvancing-pagination', stage);
      offset = next;
    }
    throw new ProviderError('page-budget-exhausted', stage);
  }

  const summary = (saved, ctx) => get('/trophy/v1/users/me/trophySummary', null, saved, ctx, 'summary');
  async function verify(saved, expectedOnlineId, ctx, expectedAccountId) {
    const s = await summary(saved, ctx);
    const id = accountId(s?.accountId);
    if (expectedAccountId && id !== expectedAccountId) throw new ProviderError('account-mismatch', 'identity');
    const profile = await get(`/userProfile/v1/internal/users/${id}/profiles`, null, saved, ctx, 'identity');
    if (profile?.isMe !== true || typeof profile.onlineId !== 'string' || profile.onlineId.toLowerCase() !== expectedOnlineId.toLowerCase()) throw new ProviderError('account-mismatch', 'identity');
    return { ...saved, accountId: id };
  }
  return {
    context, connect, renew, verify, summary,
    library: (s, c) => paginate('/gamelist/v2/users/me/titles', { categories: 'ps4_game,ps5_native_game' }, 'titles', s, c, 'library'),
    lists: (s, c) => paginate('/trophy/v1/users/me/trophyTitles', {}, 'trophyTitles', s, c, 'trophy-lists'),
    presence: (s, c) => get(`/userProfile/v1/internal/users/${accountId(s.accountId)}/basicPresences`, { type: 'primary' }, s, c, 'presence'),
    mapping: (id, s, c) => get('/trophy/v1/users/me/titles/trophyTitles', { npTitleIds: identifier(id) }, s, c, 'title-mapping'),
    trophies: (set, earned, s, c) => {
      if (!['trophy', 'trophy2'].includes(set.service)) throw new ProviderError('invalid-trophy-service', 'schema');
      return paginate(`/trophy/v1/${earned ? 'users/me/' : ''}npCommunicationIds/${identifier(set.id)}/trophyGroups/all/trophies`, { npServiceName: set.service }, 'trophies', s, c, 'trophies');
    },
  };
}

module.exports = { createClient };
