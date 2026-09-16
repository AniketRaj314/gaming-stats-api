const path = require('node:path');
const { config } = require('../../src/providers/steam/config');
const f = require('./fixtures');

const valid = { STEAM_ID: f.steamId, STEAM_WEB_API_KEY: 'a'.repeat(32) };

test('parses safe defaults and an opt-in flag', () => {
  expect(config({ ...valid, ENABLE_STEAM: 'true' })).toMatchObject({
    enabled: true, steamId: f.steamId, language: 'english',
    refreshMs: 15 * 60000, detailsMs: 720 * 60000, maxStaleMs: 24 * 3600000,
    directory: path.resolve('cache/gaming/steam'),
  });
});

test.each([
  [{ ...valid, STEAM_ID: '123' }, 'configure-steam-id'],
  [{ ...valid, STEAM_WEB_API_KEY: 'secret' }, 'configure-steam-web-api-key'],
  [{ ...valid, STEAM_REFRESH_MINUTES: '1' }, 'invalid-steam_refresh_minutes'],
  [{ ...valid, STEAM_LANGUAGE: '../x' }, 'invalid-steam-language'],
])('rejects invalid configuration', (env, error) => expect(() => config(env)).toThrow(error));
