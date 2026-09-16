const path = require('node:path');
const { config } = require('../../src/providers/epic/config');

const valid = { GAMING_ENCRYPTION_KEY: 'a'.repeat(64), EPIC_EXPECTED_DISPLAY_NAME: 'Spider31415' };

test('parses bounded Epic configuration', () => {
  expect(config({ ...valid, ENABLE_EPIC: 'true' })).toMatchObject({
    enabled: true, expectedDisplayName: 'Spider31415', directory: path.resolve('cache/gaming/epic'),
    refreshMs: 900000, catalogMs: 86400000, maxStaleMs: 86400000,
  });
});

test.each([
  [{ ...valid, EPIC_REFRESH_MINUTES: '1' }, 'invalid-epic_refresh_minutes'],
  [{ ...valid, EPIC_CATALOG_HOURS: '0' }, 'invalid-epic_catalog_hours'],
  [{ ...valid, EPIC_EXPECTED_DISPLAY_NAME: '../bad' }, 'invalid-epic-expected-display-name'],
])('rejects invalid settings', (env, message) => expect(() => config(env)).toThrow(message));
