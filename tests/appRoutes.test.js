'use strict';

process.env.TRACKED_USERNAMES = 'Spider31415#6921';

jest.mock('../src/snapshotStore');
jest.mock('../src/logger');

const request = require('supertest');
const { version } = require('../package.json');
const { REFRESH_INTERVAL_MS } = require('../src/config');
const { readSnapshot } = require('../src/snapshotStore');
const { createApp } = require('../src/app');

const USERNAME = 'Spider31415#6921';
const ENCODED_USERNAME = encodeURIComponent(USERNAME);
const VALID_API_KEY = 'test-api-key';

const SNAPSHOT = {
  username: USERNAME,
  lastRefreshedAt: '2026-05-19T10:00:00.000Z',
  status: 'ok',
  data: {
    competitive: {
      rank: { current: { rank: 'Gold 2', icon: null }, peak: { rank: 'Plat 1', icon: null } },
      agents: [{ agent: 'Jett' }],
      maps: [{ map: 'Ascent' }],
    },
    unrated: {
      agents: [{ agent: 'Phoenix' }],
      maps: [{ map: 'Lotus' }],
    },
    shared: {
      totalPlaytime: { total: '1,243 hours' },
    },
    profile: {
      accountLevel: 514,
      region: 'ap',
      card: { id: 'card-id', name: 'VCT x SEN Card' },
      title: { id: 'title-id', name: 'Gnarly Title', displayText: 'Gnarly' },
    },
  },
};

describe.each(['/custom/valorant', '/valorant'])('Valorant route wiring at %s', (basePath) => {
  let app;

  beforeEach(() => {
    readSnapshot.mockReturnValue(SNAPSHOT);
    app = createApp({
      startTime: Date.parse('2026-05-19T10:00:00.000Z'),
      validKeys: [VALID_API_KEY],
    });
  });

  test('health endpoint is public and namespaced', async () => {
    const res = await request(app).get(`${basePath}/health`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe(version);
    expect(typeof res.body.uptime).toBe('number');
  });

  test('docs endpoint is public and uses the namespaced base url', async () => {
    const res = await request(app).get(`${basePath}/docs`).set('Host', 'api.example.test');

    expect(res.status).toBe(200);
    expect(res.text).toContain(`Base URL: http://api.example.test${basePath}`);
    expect(res.text).toContain(`http://api.example.test${basePath}/stats/`);
    expect(res.text).toContain(`http://api.example.test${basePath}/health`);
    expect(res.text).toContain(`http://api.example.test${basePath}/llms.txt`);
    expect(res.text).toContain(`http://api.example.test${basePath}/stats</span> routes require`);
  });

  test('llms endpoint is public and includes version and base url', async () => {
    const res = await request(app).get(`${basePath}/llms.txt`).set('Host', 'api.example.test');

    expect(res.status).toBe(200);
    expect(res.text).toContain(`Version: ${version}`);
    expect(res.text).toContain(`Base URL: http://api.example.test${basePath}`);
    expect(res.text).toContain(`All http://api.example.test${basePath}/stats routes require`);
    expect(res.text).toContain('Endpoint:\n  POST /stats/:username');
    expect(res.text).toContain(`Example: ${ENCODED_USERNAME}`);
  });

  test('stats endpoint requires an API key', async () => {
    const res = await request(app)
      .post(`${basePath}/stats/${ENCODED_USERNAME}`)
      .send({ modules: { agents: {} } });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or missing API key' });
  });

  test('stats endpoint works with a valid API key', async () => {
    const res = await request(app)
      .post(`${basePath}/stats/${ENCODED_USERNAME}`)
      .set('X-API-Key', VALID_API_KEY)
      .send({ modules: { agents: {}, totalPlaytime: {}, profile: {} } });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(USERNAME);
    expect(res.body.cachedAt).toBe(SNAPSHOT.lastRefreshedAt);
    expect(res.body.nextRefreshAt).toBe(
      new Date(Date.parse(SNAPSHOT.lastRefreshedAt) + REFRESH_INTERVAL_MS).toISOString()
    );
    expect(res.body.data.agents).toEqual(SNAPSHOT.data.competitive.agents);
    expect(res.body.data.totalPlaytime).toEqual(SNAPSHOT.data.shared.totalPlaytime);
    expect(res.body.data.profile).toEqual(SNAPSHOT.data.profile);
  });

  test('incorrect keys cannot read snapshots', async () => {
    const res = await request(app).post(`${basePath}/stats/${ENCODED_USERNAME}`)
      .set('X-API-Key', 'wrong-key').send({ modules: { agents: {} } });
    expect(res.status).toBe(401);
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  test('missing snapshots still return 404', async () => {
    readSnapshot.mockReturnValue(null);
    const res = await request(app).post(`${basePath}/stats/${ENCODED_USERNAME}`)
      .set('X-API-Key', VALID_API_KEY).send({ modules: { agents: {} } });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Tracked user has no cached snapshot yet');
  });
});

describe('shared application and migration compatibility', () => {
  test('shared health endpoint does not need a provider snapshot or API key', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version, uptime: expect.any(Number) });
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  test('old and new routes return identical data without external requests or redirects', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Live requests forbidden in route tests'));
    try {
      readSnapshot.mockReturnValue({ ...SNAPSHOT, status: 'stale', sources: { tracker: { status: 'stale' } } });
      const app = createApp({ validKeys: [VALID_API_KEY] });
      const body = { playlist: 'unrated', modules: { agents: { limit: 1 }, rank: {}, profile: {}, maps: {}, totalPlaytime: {} } };
      const responses = await Promise.all(['/custom/valorant', '/valorant'].map((basePath) =>
        request(app).post(`${basePath}/stats/${ENCODED_USERNAME}`).set('X-API-Key', VALID_API_KEY).send(body)
      ));
      expect(responses.map((res) => res.status)).toEqual([200, 200]);
      expect(responses[0].body).toEqual(responses[1].body);
      expect(responses[0].body.status).toBe('stale');
      expect(responses[0].body.data.agents).toEqual(SNAPSHOT.data.unrated.agents);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  test('an application without keys rejects both stats paths', async () => {
    const app = createApp();
    for (const basePath of ['/custom/valorant', '/valorant']) {
      const res = await request(app).post(`${basePath}/stats/${ENCODED_USERNAME}`)
        .set('X-API-Key', VALID_API_KEY).send({ modules: { agents: {} } });
      expect(res.status).toBe(401);
    }
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  test.each(['/docs', '/llms.txt', '/steam', '/epic', '/psn'])('unimplemented route %s returns 404', async (url) => {
    const res = await request(createApp()).get(url);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
