const deviceId = '11111111-1111-4111-8111-111111111111';
const playniteId = '22222222-2222-4222-8222-222222222222';
const libraryPluginId = '33333333-3333-4333-8333-333333333333';
const sourceId = '44444444-4444-4444-8444-444444444444';
const assetId = 'a'.repeat(64);

const game = {
  playniteId,
  providerGameId: 'fixture-game',
  libraryPluginId,
  source: { id: sourceId, name: 'Epic' },
  name: 'Fixture Game',
  sortingName: 'Fixture Game',
  playtimeSeconds: 7325,
  playCount: 4,
  lastActivityAt: '2026-09-20T10:00:00.000Z',
  addedAt: '2026-09-01T10:00:00.000Z',
  modifiedAt: '2026-09-20T10:01:00.000Z',
  isInstalled: true,
  isRunning: true,
  hidden: false,
  favorite: true,
  isCustomGame: false,
  installSizeBytes: 123456789,
  releaseDate: { year: 2026, month: 9, day: 1 },
  completionStatus: 'Playing',
  platforms: ['PC (Windows)'],
  genres: ['Adventure'],
  categories: ['Now playing'],
  tags: ['Co-op'],
  features: ['Single Player'],
  ageRatings: ['Teen'],
  regions: ['Global'],
  series: ['Fixture Series'],
  developers: ['Fixture Studio'],
  publishers: ['Fixture Publisher'],
  scores: { user: 90, critic: 81, community: 88 },
  links: [{ name: 'Store', url: 'https://store.epicgames.com/example' }],
  artwork: {
    icon: { assetId, contentType: 'image/png', width: 256, height: 256 },
    cover: null,
    background: null,
  },
};

const identity = { schemaVersion: 1, deviceId, deviceName: 'Gaming PC', sequence: 10,
  generatedAt: '2026-09-20T10:02:00.000Z', playniteVersion: '10.56', extensionVersion: '1.0.0' };
const library = { ...identity, games: [game] };
const presence = { ...identity, sequence: 11, state: 'playing', currentGame: {
  playniteId, providerGameId: game.providerGameId, source: game.source, name: game.name,
  startedAt: '2026-09-20T10:01:00.000Z',
} };

module.exports = { deviceId, playniteId, assetId, game, library, presence };
