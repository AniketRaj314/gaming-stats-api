const express = require('express');
const request = require('supertest');
const { requireApiKey } = require('../../src/shared/auth');
const { createSteamRouter } = require('../../src/providers/steam/routes');

const routes = ['/profile', '/library', '/recent', '/badges', '/games/570'];
function app(service) {
  const value = express();
  value.use('/steam', requireApiKey(['fixture-read-key']), createSteamRouter({ service }));
  return value;
}

test.each(routes)('read key is required on %s', async route => {
  expect((await request(app()).get('/steam' + route)).status).toBe(401);
  expect((await request(app()).get('/steam' + route).set('X-API-Key', 'wrong')).status).toBe(401);
});

test.each(routes)('disabled provider is explicit on %s', async route => {
  const response = await request(app()).get('/steam' + route).set('X-API-Key', 'fixture-read-key');
  expect(response.status).toBe(503);
  expect(response.body).toMatchObject({ provider: 'steam', status: 'disabled' });
  expect(response.headers['cache-control']).toBe('private, no-store');
});

test.each(['/connect', '/disconnect', '/credentials', '/refresh'])('read key cannot administer %s', async route => {
  expect((await request(app()).post('/steam' + route).set('X-API-Key', 'fixture-read-key')).status).toBe(404);
});

test('serves cached resources and sanitizes invalid identifiers', async () => {
  const service = {
    read: resource => ({ schemaVersion: 1, provider: 'steam', status: 'ready', resource }),
    game: id => ({ httpStatus: 200, body: { provider: 'steam', status: 'ready', appId: Number(id) } }),
  };
  expect((await request(app(service)).get('/steam/library').set('X-API-Key', 'fixture-read-key')).body.resource).toBe('library');
  expect((await request(app(service)).get('/steam/games/570').set('X-API-Key', 'fixture-read-key')).body.appId).toBe(570);
  const throwing = { game: () => { const { ProviderError } = require('../../src/shared/providerError'); throw new ProviderError('invalid-identifier'); } };
  expect((await request(app(throwing)).get('/steam/games/not-an-id').set('X-API-Key', 'fixture-read-key')).status).toBe(400);
});
