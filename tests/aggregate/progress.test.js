const { buildProgress, completion } = require('../../src/providers/aggregate/progress');

const observation = (provider, providerGameId) => ({ provider, providerGameId, role: 'authoritative', data: {} });
const copy = (id, platform, observations) => ({ id, platform, observations });
const game = copies => ({ id: 'canonical-game', name: 'Canonical Game', editions: [
  { id: 'standard', name: 'Standard', copies },
] });
const service = values => ({ game: id => values[id] || { httpStatus: 404, body: { error: 'missing' } } });

const steamDetail = (status = 'available') => ({ httpStatus: 200, body: {
  status: 'ready', stale: false, lastSuccessAt: '2026-09-21T00:00:00.000Z', achievementStatus: status,
  achievements: status === 'available' ? [
    { apiName: 'FIRST', name: 'First', description: 'Do the first thing', achieved: true,
      unlockedAt: '2026-01-01T00:00:00.000Z', iconUrl: 'https://cdn.example/first.jpg', globalPercent: 12.5 },
    { apiName: 'SECOND', name: 'Second', description: null, achieved: false,
      unlockedAt: null, iconUrl: 'https://cdn.example/second.jpg', globalPercent: 40.6 },
  ] : [],
} });

const psnDetail = (providerGameId, rarity = 2.5) => ({ httpStatus: 200, body: {
  status: 'ready', stale: false, lastSuccessAt: '2026-09-21T00:00:00.000Z', trophyStatus: 'available',
  game: { providerGameId },
  trophySets: [{ id: 'NPWR12345_00', service: 'trophy2', name: 'Canonical Trophies', platform: 'PS5', trophies: [
    { id: 1, name: 'Bronze One', description: 'Earn it', imageUrl: 'https://image.api.playstation.com/trophy.png',
      earned: true, earnedAt: '2026-02-01T00:00:00.000Z', earnedRate: rarity, grade: 'bronze', hidden: false },
    { id: 2, name: 'Gold Two', description: null, imageUrl: null, earned: false,
      earnedAt: null, earnedRate: 20, grade: 'gold', hidden: true },
  ] }],
} });

test('returns a complete Steam-only achievement set', () => {
  const progress = buildProgress(game([copy('steam-copy', 'multi-platform', [observation('steam', '570')])]), {
    steamService: service({ 570: steamDetail() }),
  });
  expect(progress).toMatchObject({ status: 'available', setCount: 1, unlockCount: 2,
    rarestUnlock: { id: 'steam:570:achievement:FIRST', source: 'steam', rarityPercent: 12.5 } });
  expect(progress.sets[0]).toMatchObject({ source: 'steam', kind: 'achievement',
    summary: { earned: 1, available: 2, known: 2, completionPercent: 50 } });
});

test('does not turn an unknown unlock state into a locked unlock', () => {
  expect(completion([{ unlocked: true }, { unlocked: null }])).toEqual({
    earned: 1, available: 2, known: 1, completionPercent: null,
  });
});

test('keeps PSN trophies separate and deduplicates regional title records by trophy set', () => {
  const progress = buildProgress(game([copy('psn-copy', 'ps4', [
    observation('psn', 'CUSA00001_00'), observation('psn', 'CUSA00002_00'),
  ])]), { psnService: service({ CUSA00001_00: psnDetail('CUSA00001_00'), CUSA00002_00: psnDetail('CUSA00002_00') }) });
  expect(progress).toMatchObject({ status: 'available', setCount: 1, unlockCount: 2 });
  expect(progress.sets[0]).toMatchObject({ id: 'psn:trophy2:NPWR12345_00', source: 'psn', kind: 'trophy',
    providerGameIds: ['CUSA00001_00', 'CUSA00002_00'], summary: { earned: 1, available: 2, completionPercent: 50 } });
  expect(progress.sets[0].sourceRefs).toHaveLength(2);
  expect(progress.sources).toMatchObject([{ source: 'psn', status: 'available',
    providerGameIds: ['CUSA00001_00', 'CUSA00002_00'] }]);
});

test('keeps matched Steam and PSN progress as separate sets and selects one cross-source rarest unlock', () => {
  const progress = buildProgress(game([
    copy('steam-copy', 'multi-platform', [observation('steam', '570')]),
    copy('psn-copy', 'ps5', [observation('psn', 'PPSA12345_00')]),
  ]), { steamService: service({ 570: steamDetail() }), psnService: service({ PPSA12345_00: psnDetail('PPSA12345_00', 2.5) }) });
  expect(progress.sets.map(set => [set.source, set.kind])).toEqual([
    ['psn', 'trophy'], ['steam', 'achievement'],
  ]);
  expect(progress).not.toHaveProperty('summary');
  expect(progress.rarestUnlock).toMatchObject({ source: 'psn', kind: 'trophy', rarityPercent: 2.5 });
});

test('returns partial progress when one matched provider detail is unavailable', () => {
  const progress = buildProgress(game([
    copy('steam-copy', 'multi-platform', [observation('steam', '570')]),
    copy('psn-copy', 'ps5', [observation('psn', 'PPSA12345_00')]),
  ]), { steamService: service({ 570: steamDetail() }), psnService: service({
    PPSA12345_00: { httpStatus: 503, body: { status: 'unavailable' } },
  }) });
  expect(progress).toMatchObject({ status: 'partial', setCount: 1 });
  expect(progress.sources.find(item => item.source === 'psn')).toMatchObject({ status: 'unavailable' });
});

test('reports a configured matched source when its library snapshot is unavailable', () => {
  const progress = buildProgress(game([copy('steam-copy', 'multi-platform', [observation('steam', '570')])]), {
    steamService: service({ 570: steamDetail() }),
    expectedWork: { editions: [{ id: 'standard', references: [
      { provider: 'steam', id: '570', copy: 'steam' },
      { provider: 'psn', id: 'PPSA12345_00', copy: 'psn-ps5' },
    ] }] },
    providerStatuses: { psn: { status: 'unavailable' } },
  });
  expect(progress).toMatchObject({ status: 'partial', setCount: 1 });
  expect(progress.sources.find(item => item.source === 'psn')).toMatchObject({
    providerGameIds: ['PPSA12345_00'], status: 'unavailable', reason: 'provider-library-unavailable',
  });
});

test('reports unsupported without inventing unlocks for a game with no unlock provider', () => {
  const progress = buildProgress(game([copy('epic-copy', 'windows', [observation('epic', 'epic-id')])]), {});
  expect(progress).toMatchObject({ status: 'unsupported', setCount: 0, unlockCount: 0,
    rarestUnlock: null, sets: [], sources: [{ source: 'epic', status: 'unsupported' }] });
});
