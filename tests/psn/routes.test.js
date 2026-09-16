const express = require('express');
const request = require('supertest');
const { requireApiKey } = require('../../src/shared/auth');
const { createPsnRouter } = require('../../src/providers/psn/routes');
const routes = ['/library', '/summary', '/presence', '/games/PPSA12345_00'];
function app(service) {
  const a = express();a.use('/psn', requireApiKey(['fixture-read-key']), createPsnRouter({ service }));return a;
}
test.each(routes)('read key is required on %s', async route => {
  expect((await request(app()).get('/psn' + route)).status).toBe(401);
  expect((await request(app()).get('/psn' + route).set('X-API-Key','wrong')).status).toBe(401);
});
test.each(routes)('disabled provider is explicit on %s', async route => {
  const res = await request(app()).get('/psn' + route).set('X-API-Key', 'fixture-read-key');
  expect(res.status).toBe(503);expect(res.body.status).toBe('disabled');expect(res.headers['cache-control']).toBe('private, no-store');
});
test.each(['/connect', '/disconnect', '/credentials', '/refresh'])('read key cannot administer %s', async route => {
  const res = await request(app()).post('/psn' + route).set('X-API-Key','fixture-read-key');
  expect(res.status).toBe(404);
});
test('snapshot errors are sanitized', async () => {
  const service = { read: () => { throw new Error('secret-refresh-token'); } };
  const res = await request(app(service)).get('/psn/library').set('X-API-Key','fixture-read-key');
  expect(res.status).toBe(503);expect(res.text).not.toContain('secret');
});
