const { createClient } = require('../../src/providers/epic/client');
const f = require('./fixtures');

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
let fetchImpl, client;
beforeEach(() => {
  fetchImpl = jest.fn();
  client = createClient({ fetchImpl, now: () => f.now });
});

test('uses only the official Epic login host and launcher redirect', () => {
  const login = new URL(client.loginUrl());
  expect(login.origin).toBe('https://www.epicgames.com');
  expect(login.pathname).toBe('/id/login');
  const redirect = new URL(login.searchParams.get('redirectUrl'));
  expect(redirect.origin).toBe('https://www.epicgames.com');
  expect(redirect.pathname).toBe('/id/api/redirect');
  expect(redirect.searchParams.get('responseType')).toBe('code');
});

test('exchanges a one-time code in the body and parses bounded session metadata', async () => {
  fetchImpl.mockResolvedValueOnce(json(f.token));
  const session = await client.connect('one-time-code', client.context());
  expect(session).toMatchObject({ accountId: f.accountId, displayName: 'Spider31415', accessToken: 'access-token-fixture' });
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toContain('/account/api/oauth/token');
  expect(url).not.toContain('one-time-code');
  expect(options.body).toContain('code=one-time-code');
  expect(options.headers.Authorization).toMatch(/^Basic /);
  expect(options.redirect).toBe('manual');
});

test('paginates the library and URL-encodes cursors', async () => {
  fetchImpl.mockResolvedValueOnce(json({ records: [f.records[0]], responseMetadata: { nextCursor: 'next/cursor' } }))
    .mockResolvedValueOnce(json({ records: [f.records[1]], responseMetadata: {} }));
  const result = await client.library({ accessToken: 'token' }, client.context());
  expect(result).toHaveLength(2);
  expect(fetchImpl.mock.calls[1][0]).toContain('cursor=next%2Fcursor');
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
});

test('rejects repeated pagination cursors and foreign renewal accounts', async () => {
  fetchImpl.mockResolvedValueOnce(json({ records: [], responseMetadata: { nextCursor: 'same' } }))
    .mockResolvedValueOnce(json({ records: [], responseMetadata: { nextCursor: 'same' } }));
  await expect(client.library({ accessToken: 'token' }, client.context())).rejects.toThrow('invalid-library-cursor');
  fetchImpl.mockResolvedValueOnce(json({ ...f.token, account_id: 'f'.repeat(32) }));
  await expect(client.renew({ refreshToken: 'refresh', accountId: f.accountId }, client.context())).rejects.toThrow('account-mismatch');
});

test('preserves the token display name when Epic verification returns only the account ID', async () => {
  fetchImpl.mockResolvedValueOnce(json({ account_id: f.accountId }));
  const saved = { accountId: f.accountId, accessToken: 'token', displayName: 'Spider31415' };
  await expect(client.verify(saved, client.context(), f.accountId)).resolves.toEqual(saved);
});

test('fetches playtime and batches catalog IDs without putting bearer tokens in URLs', async () => {
  fetchImpl.mockResolvedValueOnce(json(f.playtime)).mockResolvedValueOnce(json({
    'game-one': f.rawCatalog.get('alpha\0game-one'), 'addon-one': f.rawCatalog.get('alpha\0addon-one'),
  }));
  const saved = { accountId: f.accountId, accessToken: 'private-bearer' };
  await client.playtime(saved, client.context());
  const result = await client.catalog([
    { namespace: 'alpha', catalogItemId: 'game-one' }, { namespace: 'alpha', catalogItemId: 'addon-one' },
  ], saved, client.context());
  expect(result.size).toBe(2);
  expect(fetchImpl.mock.calls.every(call => !call[0].includes('private-bearer'))).toBe(true);
  expect(fetchImpl.mock.calls[1][0]).toContain('id=game-one');
  expect(fetchImpl.mock.calls[1][0]).toContain('id=addon-one');
});

test('revokes through the fixed Epic account host without returning upstream content', async () => {
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 204 }));
  const saved = { accessToken: 'private-bearer' };
  await expect(client.revoke(saved, client.context())).resolves.toBeNull();
  const [url, options] = fetchImpl.mock.calls[0];
  expect(new URL(url).origin).toBe('https://account-public-service-prod03.ol.epicgames.com');
  expect(url).toContain('/account/api/oauth/sessions/kill/private-bearer');
  expect(options).toMatchObject({ method: 'DELETE', redirect: 'manual' });
});

test('maps rate limits and response limits to safe provider errors', async () => {
  fetchImpl.mockResolvedValueOnce(json({}, 429, { 'retry-after': '120' }));
  await expect(client.playtime({ accountId: f.accountId, accessToken: 'token' }, client.context()))
    .rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 120000 });
  const small = createClient({ fetchImpl, maxBytes: 8 });
  fetchImpl.mockResolvedValueOnce(json({ long: 'response' }));
  await expect(small.verify({ accountId: f.accountId, accessToken: 'token' }, small.context(), f.accountId)).rejects.toThrow('response-too-large');
});
