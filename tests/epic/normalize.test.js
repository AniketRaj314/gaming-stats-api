const n = require('../../src/providers/epic/normalize');
const f = require('./fixtures');

function normalizedCatalog(source) {
  return new Map(source.items.map(item => [item.key, n.catalogEntry(item, f.rawCatalog.get(item.key))]));
}

test('imports base games, filters add-ons/assets/private records, and preserves playtime meaning', () => {
  const source = n.inventory(f.records);
  const result = n.library({ inventory: source, catalog: normalizedCatalog(source), playtimeRaw: f.playtime, accountId: f.accountId });
  expect(result.games.map(game => game.name)).toEqual(['Hogwarts Legacy', 'Grand Theft Auto V', 'Unknown Time']);
  expect(result.games[0]).toMatchObject({ playtimeStatus: 'known', playtimeMinutes: 240212 / 60 });
  expect(result.games[0].artwork).toEqual({
    url: 'https://cdn1.epicgames.com/offer/hogwarts-wide.jpg',
    images: [
      { type: 'DieselGameBoxWide', url: 'https://cdn1.epicgames.com/offer/hogwarts-wide.jpg', alt: 'Hogwarts landscape',
        width: 2560, height: 1440, sizeBytes: 123456, uploadedAt: '2026-09-01T12:00:00.000Z', checksumMd5: 'a'.repeat(32) },
      { type: 'DieselGameBoxTall', url: 'https://cdn1.epicgames.com/offer/hogwarts-tall.jpg', alt: 'Hogwarts portrait',
        width: 1200, height: 1600, sizeBytes: 654321, uploadedAt: '2026-09-02T12:00:00.000Z', checksumMd5: 'b'.repeat(32) },
    ],
  });
  expect(result.games[1]).toMatchObject({ playtimeStatus: 'known', playtimeMinutes: 0 });
  expect(result.games[2]).toMatchObject({ playtimeStatus: 'unknown', playtimeMinutes: null });
  expect(result.totals).toMatchObject({ gameCount: 3, playedGameCount: 1, knownPlaytimeGameCount: 2, unknownPlaytimeGameCount: 1 });
  expect(result.coverage.excluded).toMatchObject({ addons: 1, engineAssets: 1, privateRecords: 1, noAppArtifactRecords: 1 });
});

test('keeps conflicting alias playtimes ambiguous instead of summing them', () => {
  const records = [f.records[0], { ...f.records[0], appName: 'Second.Alias' }];
  const source = n.inventory(records);
  const catalog = normalizedCatalog(source);
  const result = n.library({ inventory: source, catalog, accountId: f.accountId, playtimeRaw: [
    { accountId: f.accountId, artifactId: 'Hogwarts.Legacy', totalTime: 60 },
    { accountId: f.accountId, artifactId: 'Second.Alias', totalTime: 120 },
  ] });
  expect(result.games[0]).toMatchObject({ playtimeStatus: 'ambiguous', playtimeMinutes: null });
});

test('keeps a playtime artifact shared by multiple games ambiguous', () => {
  const records = [
    { appName: 'shared-artifact', namespace: 'one', catalogItemId: 'game-one', sandboxType: 'PUBLIC' },
    { appName: 'shared-artifact', namespace: 'two', catalogItemId: 'game-two', sandboxType: 'PUBLIC' },
  ];
  const source = n.inventory(records);
  const catalog = new Map(source.items.map(item => [item.key, {
    key: item.key, title: item.catalogItemId, categories: ['games'], hasMainGameItem: false, images: [],
  }]));
  const result = n.library({ inventory: source, catalog, accountId: f.accountId,
    playtimeRaw: [{ accountId: f.accountId, artifactId: 'shared-artifact', totalTime: 600 }] });
  expect(result.games.map(game => game.playtimeStatus)).toEqual(['ambiguous', 'ambiguous']);
  expect(result.totals).toMatchObject({ knownPlaytimeGameCount: 0, ambiguousPlaytimeGameCount: 2, totalPlaytimeMinutes: 0 });
});

test('allows dotted identifiers, rejects path identifiers, foreign accounts, and unsafe artwork', () => {
  expect(n.identifier('valid.dotted-id')).toBe('valid.dotted-id');
  expect(() => n.identifier('..')).toThrow('invalid-identifier');
  expect(() => n.playtimes([{ accountId: 'f'.repeat(32), artifactId: 'Game', totalTime: 1 }], f.accountId)).toThrow('invalid-playtime-record');
  const source = n.inventory([f.records[0]]);
  const raw = structuredClone(f.rawCatalog.get('alpha\0game-one'));
  raw.keyImages[0].url = 'https://evil.test/private.jpg?token=secret';
  const catalog = new Map([[source.items[0].key, n.catalogEntry(source.items[0], raw)]]);
  const game = n.library({ inventory: source, catalog, playtimeRaw: [], accountId: f.accountId }).games[0];
  expect(game.imageUrl).toBe('https://cdn1.epicgames.com/offer/hogwarts-tall.jpg');
  expect(game.artwork.images).toHaveLength(1);
  expect(JSON.stringify(game)).not.toContain('evil.test');
});

test('marks all playtime unavailable without converting missing values to zero', () => {
  const source = n.inventory([f.records[0]]);
  const result = n.library({ inventory: source, catalog: normalizedCatalog(source), playtimeRaw: [], accountId: f.accountId, playtimeUnavailable: true });
  expect(result).toMatchObject({ coverage: { playtimeStatus: 'unavailable' }, totals: { knownPlaytimeGameCount: 0 } });
  expect(result.games[0]).toMatchObject({ playtimeStatus: 'unavailable', playtimeMinutes: null });
});
