const request = require('supertest');
const { createApp } = require('../src/app');
const { version } = require('../package.json');

test('public provider docs require no credentials or snapshot/upstream access', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('No network allowed'));
  const service = { read: jest.fn(() => { throw new Error('No snapshot access allowed'); }), game: jest.fn() };
  try {
    const app = createApp({ validKeys: ['test-read-key'], psnService: service });
    for (const route of ['/', '/docs', '/llms.txt', '/psn', '/psn/', '/psn/docs', '/psn/llms.txt', '/steam', '/steam/docs', '/steam/llms.txt']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.text).toContain(version);
      expect(res.headers['content-type']).toContain(route.endsWith('.txt') ? 'text/plain' : 'text/html');
      expect(res.text).not.toContain('test-read-key');
    }
    for (const route of ['/psn/library', '/psn/summary', '/psn/presence', '/psn/games/PPSA12345_00']) {
      expect((await request(app).get(route)).status).toBe(401);
    }
    for (const route of ['/steam/profile', '/steam/library', '/steam/recent', '/steam/games/570']) {
      expect((await request(app).get(route)).status).toBe(401);
    }
    expect(service.read).not.toHaveBeenCalled();
    expect(service.game).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  } finally { fetchMock.mockRestore(); }
});

test('Steam guides share endpoint contracts, setup, examples, and privacy semantics', async () => {
  const app = createApp();
  for (const route of ['/steam/docs', '/steam/llms.txt']) {
    const res = await request(app).get(route);
    for (const text of ['/steam/profile', '/steam/library', '/steam/recent', '/steam/games/:appId',
      'globalPercent', 'achievementStatus', 'statsStatus', 'STEAM_WEB_API_KEY', 'ENABLE_STEAM=false',
      'private, no-store', 'HTTP 401', 'HTTP 503']) expect(res.text).toContain(text);
  }
  const txt = (await request(app).get('/steam/llms.txt')).text;
  const examples = [...txt.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  expect(examples).toHaveLength(4);
  expect(examples.every(value => value.schemaVersion === 1 && value.provider === 'steam')).toBe(true);
  expect((await request(app).get('/llms.txt')).text).toContain('(/steam/llms.txt)');
});

test('PSN guides share endpoint contracts, examples, and availability semantics', async () => {
  const app = createApp();
  for (const route of ['/psn/docs', '/psn/llms.txt']) {
    const res = await request(app).get(route);
    for (const text of ['/psn/library', '/psn/summary', '/psn/presence', '/psn/games/:titleId',
      'unknownPlatformRecords', 'trophyStatus', 'earnedRate', 'reconnect-required', 'HTTP 401', 'HTTP 503',
      'private, no-store', 'npm run psn:connect:production', 'ENABLE_PSN=false', 'GAMING_ENCRYPTION_KEY']) {
      expect(res.text).toContain(text);
    }
    expect(res.text).not.toContain('```sh\nrailway ssh -- node scripts/psn/cli.js connect');
  }
  const txt = (await request(app).get('/psn/llms.txt')).text;
  const examples = [...txt.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m=>JSON.parse(m[1]));
  expect(examples).toHaveLength(4);
  expect(examples.every(e=>e.schemaVersion===1 && e.provider==='psn')).toBe(true);
  const index = (await request(app).get('/llms.txt')).text;
  expect(index).toContain('(/psn/llms.txt)');
  expect(index).toContain('(/custom/valorant/llms.txt)');
});
