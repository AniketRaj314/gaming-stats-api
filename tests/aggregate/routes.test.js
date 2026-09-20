const request = require('supertest');
const { createApp } = require('../../src/app');

const key = 'test-read-key';
const aggregateService = {
  library: jest.fn(() => ({ schemaVersion: 1, provider: 'aggregate', status: 'partial', games: [] })),
  nowPlaying: jest.fn(() => ({ schemaVersion: 1, provider: 'aggregate', state: 'playing', sessionCount: 2, sessions: [] })),
  game: jest.fn(id => id === 'known' ? { httpStatus: 200, body: { game: { id } } }
    : { httpStatus: 404, body: { error: 'Canonical game not found' } }),
};

test('aggregate routes use the shared read key and never trigger provider refreshes', async () => {
  const app = createApp({ validKeys: [key], aggregateService });
  expect((await request(app).get('/aggregate/library')).status).toBe(401);
  expect((await request(app).get('/aggregate/now-playing')).status).toBe(401);

  const library = await request(app).get('/aggregate/library').set('X-API-Key', key);
  expect(library.status).toBe(200);
  expect(library.body.status).toBe('partial');
  expect(library.headers['cache-control']).toBe('private, no-store');

  const playing = await request(app).get('/aggregate/now-playing').set('X-API-Key', key);
  expect(playing.status).toBe(200);
  expect(playing.body.sessionCount).toBe(2);

  expect((await request(app).get('/aggregate/games/known').set('X-API-Key', key)).status).toBe(200);
  expect((await request(app).get('/aggregate/games/missing').set('X-API-Key', key)).status).toBe(404);
});

test('aggregate routes report unavailable or unknown snapshots with HTTP 503', async () => {
  const app = createApp({ validKeys: [key], aggregateService: {
    library: () => ({ status: 'unavailable' }), nowPlaying: () => ({ state: 'unknown' }),
    game: () => ({ httpStatus: 404, body: {} }),
  } });
  expect((await request(app).get('/aggregate/library').set('X-API-Key', key)).status).toBe(503);
  expect((await request(app).get('/aggregate/now-playing').set('X-API-Key', key)).status).toBe(503);
});
