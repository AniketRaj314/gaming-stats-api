const accountId = '0123456789abcdef0123456789abcdef';
const now = Date.parse('2026-09-17T00:00:00Z');
const token = {
  access_token: 'access-token-fixture', refresh_token: 'refresh-token-fixture', account_id: accountId,
  displayName: 'Spider31415', expires_at: new Date(now + 3600000).toISOString(),
  refresh_expires_at: new Date(now + 30 * 86400000).toISOString(),
};
const records = [
  { namespace: 'alpha', catalogItemId: 'game-one', appName: 'Hogwarts.Legacy', sandboxType: 'PUBLIC' },
  { namespace: 'beta', catalogItemId: 'game-two', appName: 'GTA5', sandboxType: 'PUBLIC' },
  { namespace: 'gamma', catalogItemId: 'game-three', appName: 'Unknown.Time', sandboxType: 'PUBLIC' },
  { namespace: 'alpha', catalogItemId: 'addon-one', appName: 'Game.Addon', sandboxType: 'PUBLIC' },
  { namespace: 'assets', catalogItemId: 'engine-one', appName: 'Animation.Asset', sandboxType: 'PUBLIC' },
  { namespace: 'private', catalogItemId: 'private-one', appName: 'Private.Game', sandboxType: 'PRIVATE' },
  { namespace: 'other', catalogItemId: 'no-app' },
];
const rawCatalog = new Map([
  ['alpha\0game-one', { title: 'Hogwarts Legacy', categories: [{ path: 'games' }], keyImages: [
    { type: 'DieselGameBoxWide', url: 'https://cdn1.epicgames.com/offer/hogwarts-wide.jpg' },
  ] }],
  ['beta\0game-two', { title: 'Grand Theft Auto V', categories: [{ path: 'games/edition/base' }], keyImages: [] }],
  ['gamma\0game-three', { title: 'Unknown Time', categories: [{ path: 'games' }], keyImages: [] }],
  ['alpha\0addon-one', { title: 'Expansion', categories: [{ path: 'addons' }], mainGameItem: { id: 'game-one' }, keyImages: [] }],
  ['assets\0engine-one', { title: 'Animation Starter Pack', categories: [
    { path: 'asset-format/game-engine/unreal-engine' }, { path: 'type/format-item' },
  ], keyImages: [] }],
]);
const playtime = [
  { accountId, artifactId: 'Hogwarts.Legacy', totalTime: 240212 },
  { accountId, artifactId: 'GTA5', totalTime: 0 },
];

module.exports = { accountId, now, token, records, rawCatalog, playtime };
