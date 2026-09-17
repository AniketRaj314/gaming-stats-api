const { createClient } = require('../../src/providers/steam/client');
const f = require('./fixtures');

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
let fetchImpl, client;
beforeEach(() => {
  fetchImpl = jest.fn();
  client = createClient({ apiKey: 'a'.repeat(32), fetchImpl, now: () => 1000 });
});

test('sends the API key only in a header and refuses redirects', async () => {
  fetchImpl.mockResolvedValueOnce(json(f.library)).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://evil.test' } }));
  await client.library(f.steamId, client.context());
  expect(fetchImpl.mock.calls[0][0]).not.toContain('a'.repeat(32));
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual', headers: { 'x-webapi-key': 'a'.repeat(32) } });
  await expect(client.profile(f.steamId, client.context())).rejects.toThrow('upstream-302');
});

test('uses current official endpoint versions and bounded query values', async () => {
  fetchImpl.mockImplementation(async () => json({}));
  await client.profile(f.steamId, client.context());
  await client.library(f.steamId, client.context());
  await client.schema(570, 'english', client.context());
  expect(fetchImpl.mock.calls[0][0]).toContain('/ISteamUser/GetPlayerSummaries/v2/');
  expect(fetchImpl.mock.calls[0][0]).toContain(`steamids=${f.steamId}`);
  expect(fetchImpl.mock.calls[1][0]).toContain('/IPlayerService/GetOwnedGames/v1/');
  expect(decodeURIComponent(fetchImpl.mock.calls[1][0])).toContain(`"steamid":"${f.steamId}"`);
  expect(fetchImpl.mock.calls[2][0]).toContain('/ISteamUserStats/GetSchemaForGame/v2/');
  expect(fetchImpl.mock.calls[2][0]).toContain('appid=570');
});

test('batches full cover-art metadata through Steam StoreBrowse', async () => {
  fetchImpl.mockResolvedValueOnce(json(f.assets));
  const result = await client.assets([570, 730], 'english', client.context());
  expect(result.response.store_items).toHaveLength(2);
  const url = new URL(fetchImpl.mock.calls[0][0]);
  expect(url.pathname).toBe('/IStoreBrowseService/GetItems/v1/');
  const input = JSON.parse(url.searchParams.get('input_json'));
  expect(input).toMatchObject({ ids: [{ appid: 570 }, { appid: 730 }],
    context: { language: 'english', country_code: 'US', steam_realm: 1 }, data_request: { include_assets: true } });
});

test('maps optional unsupported data, rate limits, and network failures without leaking bodies', async () => {
  fetchImpl.mockResolvedValueOnce(json({ secret: 'hidden' }, 400))
    .mockResolvedValueOnce(json({}, 429, { 'retry-after': '120' }))
    .mockRejectedValueOnce(new Error('key-is-secret'));
  await expect(client.schema(570, 'english', client.context())).rejects.toThrow('not-supported');
  await expect(client.library(f.steamId, client.context())).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 120000 });
  await expect(client.profile(f.steamId, client.context())).rejects.toThrow('network-error');
});

test('enforces response limits and request budgets', async () => {
  const small = createClient({ apiKey: 'a'.repeat(32), fetchImpl, maxBytes: 8 });
  fetchImpl.mockResolvedValueOnce(json({ long: 'response' })).mockResolvedValueOnce(json({}, 200, { 'content-length': '99' }));
  await expect(small.profile(f.steamId, small.context())).rejects.toThrow('response-too-large');
  await expect(small.profile(f.steamId, small.context())).rejects.toThrow('response-too-large');
  await expect(client.profile(f.steamId, { signal: new AbortController().signal, remaining: 0 })).rejects.toThrow('request-budget');
});
