const n = require('../../src/providers/playnite/normalize');
const f = require('./fixtures');

test('normalizes a complete Playnite game without exposing local launch data', () => {
  const result = n.library(f.library);
  expect(result).toMatchObject({
    deviceId: f.deviceId,
    totals: { gameCount: 1, installedGameCount: 1, playedGameCount: 1, totalPlaytimeSeconds: 7325 },
    games: [{ playniteId: f.playniteId, name: 'Fixture Game', playtimeSeconds: 7325, playtimeMinutes: 122,
      source: { name: 'Epic' }, artwork: { icon: { assetId: f.assetId, path: `/playnite/assets/${f.assetId}` } } }],
  });
  expect(result.games[0]).not.toHaveProperty('installDirectory');
  expect(result.games[0]).not.toHaveProperty('gameActions');
  expect(result.games[0]).not.toHaveProperty('notes');
});

test('normalizes playing presence with stable source identifiers', () => {
  expect(n.presence(f.presence)).toMatchObject({ state: 'playing', currentGame: {
    playniteId: f.playniteId, name: 'Fixture Game', source: { name: 'Epic' },
  } });
});

test('rejects duplicate IDs, unsafe values, and malformed presence', () => {
  expect(() => n.library({ ...f.library, games: [f.game, f.game] })).toThrow('duplicate-game');
  expect(() => n.library({ ...f.library, games: [{ ...f.game, playtimeSeconds: -1 }] })).toThrow('invalid-game');
  expect(n.library({ ...f.library, games: [{ ...f.game, links: [{ name: 'Bad', url: 'file:///secret' }] }] }).games[0].links).toEqual([]);
  expect(() => n.presence({ ...f.presence, state: 'playing', currentGame: null })).toThrow('invalid-presence');
});
