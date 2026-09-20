const express = require('express');
const request = require('supertest');
const crypto = require('node:crypto');
const { requireApiKey, requireHeaderKey } = require('../../src/shared/auth');
const { createPlayniteRouter } = require('../../src/providers/playnite/routes');
const f = require('./fixtures');

function app(service) {
  const value = express();
  value.use(express.json({ limit: '4mb' }));
  value.use('/playnite', createPlayniteRouter({ service, readAuth: requireApiKey(['read-key']),
    uploadAuth: requireHeaderKey(['u'.repeat(32)], 'x-playnite-key') }));
  return value;
}

test('separates frontend read authentication from extension upload authentication', async () => {
  const service = { library: jest.fn(() => ({ status: 'ready' })), ingestLibrary: jest.fn(() => ({ accepted: true })) };
  expect((await request(app(service)).get('/playnite/library')).status).toBe(401);
  expect((await request(app(service)).get('/playnite/library').set('X-Playnite-Key', 'u'.repeat(32))).status).toBe(401);
  expect((await request(app(service)).post('/playnite/sync/library').send(f.library)).status).toBe(401);
  expect((await request(app(service)).post('/playnite/sync/library').set('X-API-Key', 'read-key').send(f.library)).status).toBe(401);
  expect((await request(app(service)).post('/playnite/sync/library').set('X-Playnite-Key', 'u'.repeat(32)).send(f.library)).status).toBe(202);
});

test('serves cached library, game, presence, and artwork', async () => {
  const body = Buffer.from('fixture-image');
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const service = {
    library: () => ({ status: 'ready', games: [] }), presence: () => ({ status: 'ready', state: 'online' }),
    game: () => ({ httpStatus: 200, body: { status: 'ready', game: f.game } }),
    asset: () => ({ file: __filename, contentType: 'image/png', size: require('node:fs').statSync(__filename).size }),
  };
  for (const route of ['/library', '/presence', `/games/${f.playniteId}`]) {
    expect((await request(app(service)).get('/playnite' + route).set('X-API-Key', 'read-key')).status).toBe(200);
  }
  const asset = await request(app(service)).get(`/playnite/assets/${hash}`).set('X-API-Key', 'read-key');
  expect(asset.status).toBe(200);
  expect(asset.headers['x-content-type-options']).toBe('nosniff');
});

test('uploads artwork with content hash validation', async () => {
  const body = Buffer.from('fixture-image');
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const service = { writeAsset: jest.fn(() => ({ accepted: true, assetId: hash })) };
  const response = await request(app(service)).put(`/playnite/sync/assets/${hash}`)
    .set('X-Playnite-Key', 'u'.repeat(32)).set('Content-Type', 'image/png').send(body);
  expect(response.status).toBe(201);
  expect(service.writeAsset).toHaveBeenCalledWith(hash, 'image/png', expect.any(Buffer));
});
