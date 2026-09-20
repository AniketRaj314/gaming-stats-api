const { createAggregateService, normalizedTitle, valorantSeconds } = require('../../src/providers/aggregate/service');

const NOW = Date.parse('2026-09-20T12:30:00.000Z');
const ready = body => ({ status: 'ready', stale: false, lastSuccessAt: '2026-09-20T12:29:30.000Z', ...body });

function service({ steamLibrary = ready({ games: [] }), steamProfile = ready({ personaState: 'online', currentGame: null }),
  psnLibrary = ready({ games: [] }), psnPresence = ready({ activity: 'idle', online: false, games: [] }),
  epicLibrary = ready({ games: [] }), playniteLibrary = ready({ games: [] }),
  playnitePresence = ready({ state: 'online', currentGame: null }), snapshot = null } = {}) {
  return createAggregateService({
    now: () => NOW,
    steamService: { read: resource => resource === 'profile' ? steamProfile : steamLibrary },
    psnService: { read: resource => resource === 'presence' ? psnPresence : psnLibrary },
    epicService: { read: () => epicLibrary },
    playniteService: { library: () => playniteLibrary, presence: () => playnitePresence },
    trackedUsernames: snapshot ? ['Spider31415#6921'] : [],
    readValorantSnapshot: () => snapshot,
  });
}

test('normalizes titles conservatively and parses displayed Valorant hours', () => {
  expect(normalizedTitle('Rocket League®')).toBe('rocket league');
  expect(valorantSeconds('2,018 hrs')).toBe(7_264_800);
  expect(valorantSeconds('unknown')).toBeNull();
});

test('keeps simultaneous Steam and Playnite games as separate current sessions', () => {
  const aggregate = service({
    steamLibrary: ready({ games: [{ appId: 3628960, providerGameId: '3628960', name: 'Miscrits: World of Creatures',
      playtimeMinutes: 43071, playtimeWindowsMinutes: 2903, playtimeMacMinutes: 40168,
      playtimeLinuxMinutes: 0, playtimeDeckMinutes: 0, playtimeDisconnectedMinutes: 1779 }] }),
    steamProfile: ready({ personaState: 'online', currentGame: { appId: 3628960, providerGameId: '3628960', name: 'Miscrits: World of Creatures' } }),
    playniteLibrary: ready({ games: [{ playniteId: 'e14e27a4-50fe-4d86-9c44-03a57e9c4f65',
      providerGameId: '50486cb709db18d5476e55e28bf5d671', source: { id: null, name: null }, name: 'VALORANT',
      playtimeSeconds: 4, artwork: {} }] }),
    playnitePresence: ready({ state: 'playing', deviceId: 'pc-id', deviceName: 'Gaming PC', currentGame: {
      playniteId: 'e14e27a4-50fe-4d86-9c44-03a57e9c4f65', providerGameId: '50486cb709db18d5476e55e28bf5d671',
      source: { id: null, name: null }, name: 'VALORANT', startedAt: '2026-09-20T11:36:28.168Z' } }),
  });

  const result = aggregate.nowPlaying();
  expect(result.state).toBe('playing');
  expect(result.sessionCount).toBe(2);
  expect(result.sessions.map(item => [item.game.name, item.primarySource])).toEqual(expect.arrayContaining([
    ['Miscrits: World of Creatures', 'steam'], ['VALORANT', 'playnite'],
  ]));
  expect(result.sessions.find(item => item.game.id === 'valorant').device.name).toBe('Gaming PC');
});

test('merges a Playnite Steam helper observation into the direct Steam session', () => {
  const steamGame = { appId: 730, providerGameId: '730', name: 'Counter-Strike 2', playtimeMinutes: 100,
    playtimeWindowsMinutes: 100, playtimeMacMinutes: 0, playtimeLinuxMinutes: 0 };
  const playniteGame = { playniteId: '22222222-2222-4222-8222-222222222222', providerGameId: '730',
    source: { name: 'Steam' }, name: 'Counter-Strike 2', playtimeSeconds: 6000, artwork: {} };
  const aggregate = service({
    steamLibrary: ready({ games: [steamGame] }),
    steamProfile: ready({ personaState: 'online', currentGame: steamGame }),
    playniteLibrary: ready({ games: [playniteGame] }),
    playnitePresence: ready({ state: 'playing', deviceId: 'pc', deviceName: 'Gaming PC', currentGame: {
      ...playniteGame, startedAt: '2026-09-20T12:20:00.000Z' } }),
  });
  const result = aggregate.nowPlaying();
  expect(result.sessionCount).toBe(1);
  expect(result.sessions[0].primarySource).toBe('steam');
  expect(result.sessions[0].confidence).toBe('confirmed');
  expect(result.sessions[0].platform).toBe('windows');
  expect(result.sessions[0].device.name).toBe('Gaming PC');
  expect(result.sessions[0].detectedBy.map(item => item.source)).toEqual(['steam', 'playnite']);
});

test('models Spider-Man as one work with original and remastered editions', () => {
  const aggregate = service({
    psnLibrary: ready({ games: [
      { providerGameId: 'CUSA02299_00', conceptId: '10000762', name: "Marvel's Spider-Man", platform: 'PS4', playtimeMinutes: 2329.633333333333 },
      { providerGameId: 'CUSA11995_00', conceptId: '10000762', name: "Marvel's Spider-Man", platform: null, playtimeMinutes: 2062.716666666667 },
      { providerGameId: 'PPSA01468_00', conceptId: '10000762', name: "Marvel's Spider-Man", platform: 'PS5', playtimeMinutes: 165.65 },
    ] }),
    playniteLibrary: ready({ games: [{ playniteId: 'ac04e6ec-3df3-4f10-bee3-5b7d7d5d238c',
      providerGameId: 'local-spider-man', source: { name: null }, name: "Marvel's Spider-Man Remastered",
      playtimeSeconds: 2_284_736, artwork: {} }] }),
  });
  const game = aggregate.library().games.find(item => item.id === 'marvels-spider-man');
  expect(game.editions.map(item => item.id)).toEqual(['original', 'remastered']);
  const original = game.editions.find(item => item.id === 'original');
  expect(original.copies).toHaveLength(1);
  expect(original.copies[0].observations).toHaveLength(2);
  expect(original.copies[0].playtime.rule).toBe('maximum-across-regional-title-records');
  expect(original.copies[0].playtime.seconds).toBe(Math.round(2329.633333333333 * 60));
  expect(game.editions.find(item => item.id === 'remastered').copies).toHaveLength(2);
});

test('deduplicates an Epic game mirrored through Playnite and preserves unknown zero semantics', () => {
  const epicId = 'ZzSOWkVW0Y_hVyb-DTiDqaDNqf9FtihpwcEw0XqzYEE';
  const aggregate = service({
    epicLibrary: ready({ games: [{ providerGameId: epicId, name: 'Aimlabs', playtimeMinutes: null, playtimeStatus: 'unknown', artwork: {} }] }),
    playniteLibrary: ready({ games: [{ playniteId: '3b97ec5b-2aa3-4863-b1d0-22b1cde6aaa2', providerGameId: 'playnite-epic-id',
      source: { name: 'Epic' }, name: 'Aimlabs', playtimeSeconds: 0, artwork: {} }] }),
  });
  const game = aggregate.library().games.find(item => item.id === 'aimlabs');
  const epicCopy = game.editions[0].copies.find(item => item.observations.some(value => value.provider === 'epic'));
  expect(epicCopy.observations.map(item => item.provider)).toEqual(['epic', 'playnite']);
  expect(epicCopy.playtime.status).toBe('unknown');
  expect(epicCopy.playtime.seconds).toBeNull();
  expect(epicCopy.playtime.rule).toContain('zero-playnite');
  expect(game.playtime).toMatchObject({ status: 'unknown', unknownCopyCount: 1 });
});

test('does not turn an entirely unknown game into a known zero work total', () => {
  const aggregate = service({ epicLibrary: ready({ games: [{ providerGameId: 'unmapped-epic-id',
    name: 'Unknown Playtime Game', playtimeMinutes: null, playtimeStatus: 'unknown', artwork: {} }] }) });
  const game = aggregate.library().games.find(item => item.name === 'Unknown Playtime Game');
  expect(game.playtime).toEqual({ status: 'unknown', knownSeconds: 0, unknownCopyCount: 1 });
});

test('uses the custom Valorant lifetime and excludes the Playnite subset', () => {
  const aggregate = service({
    playniteLibrary: ready({ games: [{ playniteId: 'e14e27a4-50fe-4d86-9c44-03a57e9c4f65',
      providerGameId: 'local', source: { name: null }, name: 'VALORANT', playtimeSeconds: 3600, artwork: {} }] }),
    snapshot: { status: 'ok', lastRefreshedAt: '2026-09-20T00:00:00.000Z', data: { shared: { totalPlaytime: { total: '2,018 hrs' } } } },
  });
  const copy = aggregate.library().games.find(item => item.id === 'valorant').editions[0].copies[0];
  expect(copy.playtime.seconds).toBe(7_264_800);
  expect(copy.playtime.selectedFrom).toBe('valorant');
  expect(copy.playtime.excluded[0].reason).toBe('subset-of-valorant-lifetime');
  expect(copy.observations.find(item => item.provider === 'playnite').role).toBe('presence-helper');
});

test('suggests an exact title match without silently merging unconfirmed providers', () => {
  const aggregate = service({
    steamLibrary: ready({ games: [{ appId: 480490, providerGameId: '480490', name: 'Prey', playtimeMinutes: 10 }] }),
    psnLibrary: ready({ games: [{ providerGameId: 'CUSA99999_00', conceptId: '99999', name: 'Prey',
      platform: 'PS4', playtimeMinutes: 20 }] }),
  });
  const result = aggregate.library();
  expect(result.games.filter(item => item.name === 'Prey')).toHaveLength(2);
  const suggestion = result.possibleMatches.find(item => item.normalizedTitle === 'prey');
  expect(suggestion).toMatchObject({ reason: 'exact-normalized-title', status: 'unconfirmed' });
  expect(new Set(suggestion.workIds)).toEqual(new Set(['steam-480490', 'psn-concept-99999']));
});

test('ignores stale presence when resolving current sessions', () => {
  const aggregate = service({ steamProfile: { ...ready({ personaState: 'online', currentGame: {
    providerGameId: '730', name: 'Counter-Strike 2' } }), status: 'stale', stale: true } });
  expect(aggregate.nowPlaying()).toMatchObject({ state: 'offline', sessionCount: 0 });
});

test('does not treat provider or Playnite availability as owner activity', () => {
  const aggregate = service({
    steamProfile: ready({ personaState: 'online', currentGame: null }),
    psnPresence: ready({ activity: 'idle', online: true, games: [] }),
    playnitePresence: ready({ state: 'online', currentGame: null }),
  });
  expect(aggregate.nowPlaying()).toMatchObject({ state: 'offline', sessionCount: 0, sessions: [] });
});
