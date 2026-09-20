const { config } = require('../../src/providers/playnite/config');

test('requires a long independent upload key', () => {
  expect(() => config({ ENABLE_PLAYNITE: 'true', PLAYNITE_UPLOAD_KEYS: 'short' })).toThrow('configure-playnite-upload-keys');
  expect(config({ PLAYNITE_UPLOAD_KEYS: 'x'.repeat(32) })).toMatchObject({ enabled: false, uploadKeys: ['x'.repeat(32)] });
});
