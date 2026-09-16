const { createClient } = require('../../src/providers/psn/client');
const f = require('./fixtures');
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
let fetchImpl, client;
beforeEach(() => { fetchImpl = jest.fn(); client = createClient({ fetchImpl, now: () => 1000 }); });

test('auth uses a cookie and form body; verifies numeric account and top-level isMe', async () => {
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'com.scee.psxandroid.scecompcall://redirect/?code=fixture-code' } }))
    .mockResolvedValueOnce(json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 100, refresh_token_expires_in: 1000 }))
    .mockResolvedValueOnce(json(f.summary)).mockResolvedValueOnce(json({ onlineId: 'owner123', isMe: true }));
  const session = await client.connect('X'.repeat(64), client.context());
  expect(session).toMatchObject({ accessExpiresAt: 101000, refreshExpiresAt: 1001000 });
  const verified = await client.verify(session, 'Owner123', client.context());
  expect(verified.accountId).toBe(f.summary.accountId);
  expect(fetchImpl.mock.calls[0][0]).not.toContain('X'.repeat(64));
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual', headers: { Cookie: 'npsso=' + 'X'.repeat(64) } });
  expect(fetchImpl.mock.calls[1][1].body).toContain('code=fixture-code');
  expect(fetchImpl.mock.calls[3][0]).toContain('/users/' + f.summary.accountId + '/profiles');
});
test.each(['https://evil.test/?code=x', 'com.scee.psxandroid.scecompcall://evil/?code=x', 'com.scee.psxandroid.scecompcall://redirect/bad?code=x', 'com.scee.psxandroid.scecompcall://redirect/?code=x&code=y'])('rejects unexpected callback %s', async location => {
  fetchImpl.mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
  await expect(client.connect('X'.repeat(64), client.context())).rejects.toThrow('invalid-auth-callback');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test('rejects a different account and wrong isMe', async () => {
  fetchImpl.mockResolvedValueOnce(json(f.summary)).mockResolvedValueOnce(json({ onlineId: 'owner123', isMe: false }));
  await expect(client.verify(f.session, 'owner123', client.context())).rejects.toThrow('account-mismatch');
});
test('complete pagination accepts terminal null offset', async () => {
  fetchImpl.mockResolvedValueOnce(json({ titles: f.games, totalItemCount: 2, nextOffset: 1 }))
    .mockResolvedValueOnce(json({ titles: [{ ...f.games[0], titleId: 'CUSA12345_00' }], totalItemCount: 2, nextOffset: null }));
  expect(await client.library(f.session, client.context())).toHaveLength(2);
  expect(fetchImpl.mock.calls[1][0]).toContain('offset=1');
});
test.each([
  { titles: f.games, totalItemCount: 2, nextOffset: null },
  { titles: f.games, totalItemCount: 2, nextOffset: 0 },
  { titles: [], totalItemCount: 2, nextOffset: 1 },
])('rejects incomplete/nonadvancing pagination', async response => {
  fetchImpl.mockResolvedValue(json(response));
  await expect(client.library(f.session, client.context())).rejects.toThrow();
});
test('middle page failure never returns partial inventory', async () => {
  fetchImpl.mockResolvedValueOnce(json({ titles: f.games, totalItemCount: 2, nextOffset: 1 })).mockResolvedValueOnce(json({}, 500));
  await expect(client.library(f.session, client.context())).rejects.toThrow('upstream-500');
});
test('provider redirects are not followed with Bearer credentials', async () => {
  fetchImpl.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.test' } }));
  await expect(client.summary(f.session, client.context())).rejects.toThrow('upstream-302');
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
});
test('request budget and body size limits are enforced', async () => {
  await expect(client.summary(f.session, { signal: new AbortController().signal, remaining: 0 })).rejects.toThrow('request-budget');
  expect(fetchImpl).not.toHaveBeenCalled();
  const small = createClient({ fetchImpl, maxBytes: 8 });
  fetchImpl.mockResolvedValueOnce(json({ long: 'response' })).mockResolvedValueOnce(json({}, 200, { 'content-length': '100' }));
  await expect(small.summary(f.session, small.context())).rejects.toThrow('response-too-large');
  await expect(small.summary(f.session, small.context())).rejects.toThrow('response-too-large');
});
test('rate limits and errors never expose raw responses or network messages', async () => {
  fetchImpl.mockResolvedValueOnce(json({ secret: 'do-not-print' }, 429, { 'retry-after': '120' })).mockRejectedValueOnce(new Error('secret-token-in-url'));
  await expect(client.summary(f.session, client.context())).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 120000 });
  await expect(client.summary(f.session, client.context())).rejects.toThrow('network-error');
});
test('a deadline abort produces a sanitized timeout', async () => {
  fetchImpl.mockImplementation((url, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) reject(new Error('sensitive'));
    else options.signal.addEventListener('abort', () => reject(new Error('sensitive')), { once: true });
  }));
  const abort = new AbortController(); abort.abort();
  await expect(client.summary(f.session, { remaining: 2, signal: abort.signal })).rejects.toThrow('timeout');
});
