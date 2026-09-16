const n = require('../../src/providers/psn/normalize');
const f = require('./fixtures');

test.each([['PT0S', 0], ['PT2H3M4.5S', 123.075], ['P1DT1H', 1500], ['P2D', 2880], [undefined, null], ['', null], ['P', null], ['PT', null], ['PT-1H', null], ['P1M', null], ['P1DT', null]])('duration %s preserves zero and unknown', (v, expected) => expect(n.durationMinutes(v)).toBe(expected));
test('library exposes known record totals and coverage, without treating unknown time as zero', () => {
  const result = n.library([...f.games, { ...f.games[0], titleId: 'CUSA12345_00', playDuration: undefined }]);
  expect(result.games[1].playtimeMinutes).toBeNull();
  expect(result.coverage.purchaseLibrary).toBe(false);
  expect(result.totals).toMatchObject({ conceptCount: 1, recordCount: 2, knownPlaytimeRecords: 1, unknownPlaytimeRecords: 1 });
  expect(JSON.stringify(result)).not.toContain('accountId');
});
test('duplicate game IDs fail instead of multiplying totals', () => expect(() => n.library([...f.games, ...f.games])).toThrow('invalid-game-record'));
test.each(['http://image.api.playstation.com/a', 'https://evil.test/a', 'https://user:pass@image.api.playstation.com/a', 'https://image.api.playstation.com:8443/a', 'https://image.api.playstation.com/a?token=x'])('rejects unsafe artwork %s', url => expect(n.artwork(url)).toBeNull());
test('presence prefers nested status and discards stale titles when offline', () => {
  expect(n.presence(f.playing).activity).toBe('playing');
  expect(n.presence({ basicPresence: { ...f.playing.basicPresence, primaryPlatformInfo: { onlineStatus: 'offline' } } })).toMatchObject({ activity: 'idle', games: [] });
  expect(n.presence({ basicPresence: {} }).activity).toBe('unavailable');
  expect(n.presence({ basicPresence: { onlineStatus: 'online' } }).activity).toBe('idle');
});
test('mapping uses exact title IDs and only visible trophy sets', () => {
  const visible = n.trophyLists([...f.lists, { ...f.lists[0], npCommunicationId: 'NPWR54321_00', hiddenFlag: true }]);
  const mapping = { titles: [{ npTitleId: f.games[0].titleId, trophyTitles: [{ npCommunicationId: 'NPWR12345_00' }, { npCommunicationId: 'NPWR54321_00' }] }] };
  expect(n.mappedSets(mapping, f.games[0].titleId, visible)).toHaveLength(1);
  expect(n.mappedSets(mapping, 'PPSA99999_00', visible)).toEqual([]);
});
test('locked and unknown secret trophies hide spoilers, missing player rows stay unknown', () => {
  for (const player of [[], [{ trophyId: 1, earned: false }]]) {
    const result = n.trophies(f.definitions, player);
    expect(result.trophies[0]).toMatchObject({ name: 'Hidden trophy', description: null, imageUrl: null });
    expect(result.rarestUnlock).toBeNull();
  }
  expect(n.trophies(f.definitions, []).complete).toBe(false);
  expect(n.trophies(f.definitions, []).trophies[0].earned).toBeNull();
});
test('zero rarity is known and only earned trophies qualify', () => {
  const defs = [...f.definitions, { ...f.definitions[0], trophyId: 2 }];
  const result = n.trophies(defs, [{ trophyId: 1, earned: true, trophyEarnedRate: '0' }, { trophyId: 2, earned: true }]);
  expect(result.rarestUnlock).toMatchObject({ id: 1, earnedRate: 0, name: 'A Secret' });
  expect(result.rarityCoverage).toEqual({ earned: 2, earnedWithKnownRarity: 1 });
});
test('numeric account ID remains an exact string', () => {
  expect(n.accountId(f.summary.accountId)).toBe('12345678901234567890');
  expect(() => n.accountId(Number(f.summary.accountId))).toThrow();
});
