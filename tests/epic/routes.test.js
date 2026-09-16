const express = require('express');
const request = require('supertest');
const { requireApiKey } = require('../../src/shared/auth');
const { createEpicRouter } = require('../../src/providers/epic/routes');

function app(service) {
  const value = express();
  value.use('/epic', requireApiKey(['fixture-key']), createEpicRouter({ service }));
  return value;
}

test.each(['/library', '/games/' + 'a'.repeat(43)])('requires the shared read key on %s', async route => {
  expect((await request(app()).get('/epic' + route)).status).toBe(401);
});

test('disabled provider is explicit and cannot be administered over HTTP', async () => {
  const response = await request(app()).get('/epic/library').set('X-API-Key', 'fixture-key');
  expect(response.status).toBe(503);
  expect(response.body).toMatchObject({ provider: 'epic', status: 'disabled' });
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect((await request(app()).post('/epic/connect').set('X-API-Key', 'fixture-key')).status).toBe(404);
});

test('serves cached data and rejects malformed game IDs', async () => {
  const service = { read: () => ({ provider: 'epic', status: 'ready', games: [] }),
    game: id => ({ httpStatus: 200, body: { provider: 'epic', status: 'ready', id } }) };
  expect((await request(app(service)).get('/epic/library').set('X-API-Key', 'fixture-key')).status).toBe(200);
  expect((await request(app(service)).get('/epic/games/' + 'a'.repeat(43)).set('X-API-Key', 'fixture-key')).status).toBe(200);
  const { ProviderError } = require('../../src/shared/providerError');
  const throwing = { game: () => { throw new ProviderError('invalid-identifier'); } };
  expect((await request(app(throwing)).get('/epic/games/bad').set('X-API-Key', 'fixture-key')).status).toBe(400);
});
