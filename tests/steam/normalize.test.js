const n = require('../../src/providers/steam/normalize');
const f = require('./fixtures');

test('normalizes owned games and exact aggregate playtime without cross-store merging', () => {
  const result = n.library(f.library, f.assets);
  expect(result.games.map(game => game.appId)).toEqual([570, 730]);
  expect(result.games[0]).toMatchObject({
    providerGameId: '570', playtimeMinutes: 600, playtimeTwoWeeksMinutes: 30,
    iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/570/${'a'.repeat(40)}.jpg`,
    coverUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/0000000000000000000000000000000000000570/library_600x900_2x.jpg?t=1700000000',
  });
  expect(result.totals).toMatchObject({ gameCount: 2, playedGameCount: 2, totalPlaytimeMinutes: 720, gamesWithCommunityStats: 1 });
  expect(result.coverage).toMatchObject({ kind: 'owned-games', includePlayedFreeGames: true, privacyDependent: true });
});

test('returns null instead of an unsafe or unavailable cover URL', () => {
  const unsafe = { response: { store_items: [{ appid: 570, success: 1, assets: {
    asset_url_format: 'https://evil.test/${FILENAME}', library_capsule_2x: '../secret.jpg',
  } }] } };
  expect(n.library({ response: { game_count: 1, games: [f.games[0]] } }, unsafe).games[0].coverUrl).toBeNull();
  expect(() => n.assetUrls({ response: { store_items: [f.asset(570), f.asset(570)] } }, [570]))
    .toThrow('invalid-asset-record');
});

test('rejects private/malformed libraries and duplicate app IDs', () => {
  expect(() => n.library({ response: {} })).toThrow('private-or-invalid-response');
  expect(() => n.library({ response: { game_count: 2, games: [f.games[0], f.games[0]] } })).toThrow('duplicate-game-record');
});

test('normalizes public profile, presence, level, and safe URLs', () => {
  expect(n.profile(f.profile, f.level, f.steamId)).toMatchObject({
    steamId: f.steamId, personaName: 'Fixture Player', communityVisibility: 'public', personaState: 'online', steamLevel: 42,
    currentGame: { appId: 570, name: 'Dota 2' },
  });
  const unsafe = structuredClone(f.profile);
  unsafe.response.players[0].avatarfull = 'https://evil.test/avatar';
  expect(n.profile(unsafe, f.level, f.steamId).avatarUrl).toBeNull();
});

test('joins achievements, schema, global rarity and game stats while hiding locked secrets', () => {
  const result = n.details({ schemaRaw: f.schema, achievementsRaw: f.achievements, statsRaw: f.stats, globalRaw: f.globalAchievements });
  expect(result).toMatchObject({ achievementStatus: 'available', statsStatus: 'available',
    achievementCoverage: { defined: 2, unlocked: 1, unlockedWithKnownGlobalPercent: 1 },
    rarestUnlock: { apiName: 'FIRST', globalPercent: 12.5 }, stats: [{ name: 'kills', displayName: 'Kills', value: 99 }] });
  expect(result.achievements[1]).toMatchObject({ apiName: 'SECRET', name: 'Hidden achievement', description: null, iconUrl: null, achieved: false, globalPercent: 0 });
});

test('reports unsupported and private achievement data explicitly', () => {
  expect(n.details({ failures: { schema: 'game-schema:not-supported' } })).toMatchObject({ achievementStatus: 'not-supported', statsStatus: 'not-supported' });
  expect(n.details({ schemaRaw: f.schema, achievementsRaw: { playerstats: { success: false } }, failures: { stats: 'game-stats:forbidden' } }))
    .toMatchObject({ achievementStatus: 'private', statsStatus: 'private', achievements: [], stats: [] });
});

test('treats an explicitly empty player stats array as available data', () => {
  expect(n.details({ schemaRaw: f.schema, statsRaw: { playerstats: { stats: [] } } }))
    .toMatchObject({ statsStatus: 'available', stats: [] });
});
