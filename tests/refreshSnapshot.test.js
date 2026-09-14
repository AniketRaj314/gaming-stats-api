'use strict';

jest.mock('../src/scraper');
jest.mock('../src/snapshotStore');
jest.mock('../src/logger');

const { scrapeStats } = require('../src/scraper');
const { readSnapshot, writeSnapshot } = require('../src/snapshotStore');
const { refreshUserSnapshot, refreshTrackedUsers } = require('../src/refreshSnapshot');
const { mergeRankForCompatibility } = require('../src/refreshHenrikProfiles');

const USERNAME = 'Spider31415#6921';

describe('refreshUserSnapshot', () => {
  beforeEach(() => {
    process.env.REFRESH_STAGGER_MS = '0';
    scrapeStats
      .mockResolvedValueOnce({ agents: [{ agent: 'Jett' }] })
      .mockResolvedValueOnce({ maps: [{ map: 'Ascent' }] })
      .mockResolvedValueOnce({ totalPlaytime: { total: '100 hours' } })
      .mockResolvedValueOnce({ agents: [{ agent: 'Phoenix' }] })
      .mockResolvedValueOnce({ maps: [{ map: 'Lotus' }] });
  });

  afterEach(() => {
    delete process.env.REFRESH_STAGGER_MS;
  });

  test('builds a full snapshot with 5 Tracker scrape calls', async () => {
    const snapshot = await refreshUserSnapshot(USERNAME);

    expect(scrapeStats).toHaveBeenCalledTimes(5);
    expect(scrapeStats).toHaveBeenNthCalledWith(1, USERNAME, 'competitive', ['agents']);
    expect(scrapeStats).toHaveBeenNthCalledWith(3, USERNAME, 'competitive', ['totalPlaytime']);
    expect(scrapeStats).toHaveBeenNthCalledWith(4, USERNAME, 'unrated', ['agents']);
    expect(snapshot.data.shared.totalPlaytime).toEqual({ total: '100 hours' });
    expect(snapshot.data.unrated.maps).toEqual([{ map: 'Lotus' }]);
    expect(writeSnapshot).toHaveBeenCalledWith(USERNAME, expect.objectContaining({
      username: USERNAME,
      status: 'ok',
    }));
  });

  test('preserves existing Henrik profile data when Tracker snapshot refresh runs', async () => {
    const profile = {
      accountLevel: 514,
      region: 'ap',
      card: { id: 'card-id', name: 'VCT x SEN Card' },
      title: { id: 'title-id', name: 'Gnarly Title', displayText: 'Gnarly' },
    };
    const henrikRank = {
      current: { rank: 'Platinum 2', icon: 'plat2-icon.png' },
      peak: { rank: 'Platinum 3', act: 'e10a6', icon: 'plat3-icon.png' },
    };
    readSnapshot.mockReturnValue({
      username: USERNAME,
      status: 'ok',
      lastRefreshedAt: '2026-05-18T10:00:00.000Z',
      sources: { henrik: { status: 'ok', lastRefreshedAt: '2026-05-18T11:00:00.000Z' } },
      data: {
        profile,
        competitive: {
          rank: henrikRank,
        },
      },
    });

    const snapshot = await refreshUserSnapshot(USERNAME);

    expect(snapshot.data.profile).toEqual(profile);
    expect(snapshot.data.competitive.rank).toEqual(henrikRank);
    expect(snapshot.sources).toEqual(expect.objectContaining({
      henrik: { status: 'ok', lastRefreshedAt: '2026-05-18T11:00:00.000Z' },
      tracker: expect.objectContaining({ status: 'ok' }),
    }));
  });

  test('preserves previous tracker modules when a refresh returns empty data', async () => {
    scrapeStats.mockReset();
    scrapeStats
      .mockResolvedValueOnce({ agents: [] })
      .mockResolvedValueOnce({ maps: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ agents: [] })
      .mockResolvedValueOnce({ maps: [] });

    readSnapshot.mockReturnValue({
      username: USERNAME,
      status: 'ok',
      lastRefreshedAt: '2026-09-11T04:07:54.033Z',
      data: {
        competitive: {
          rank: { current: { rank: 'Platinum 2' }, peak: { rank: 'Platinum 3' } },
          agents: [{ agent: 'Omen' }],
          maps: [{ map: 'Ascent' }],
        },
        unrated: {
          agents: [{ agent: 'Raze' }],
          maps: [{ map: 'Sunset' }],
        },
        shared: {
          totalPlaytime: { total: '2,018 hrs' },
        },
      },
    });

    const snapshot = await refreshUserSnapshot(USERNAME);

    expect(snapshot.data.competitive.agents).toEqual([{ agent: 'Omen' }]);
    expect(snapshot.data.competitive.maps).toEqual([{ map: 'Ascent' }]);
    expect(snapshot.data.unrated.agents).toEqual([{ agent: 'Raze' }]);
    expect(snapshot.data.unrated.maps).toEqual([{ map: 'Sunset' }]);
    expect(snapshot.data.shared.totalPlaytime).toEqual({ total: '2,018 hrs' });
  });
});

describe('mergeRankForCompatibility', () => {
  test('preserves previous peak act label when Henrik peak rank matches', () => {
    expect(mergeRankForCompatibility(
      {
        current: { rank: 'Platinum 2', icon: 'plat2-icon.png' },
        peak: { rank: 'Platinum 3', act: 'e10a6', icon: 'plat3-icon.png' },
      },
      {
        current: { rank: 'Unranked', icon: 'unranked-icon.png' },
        peak: { rank: 'Platinum 3', act: 'V26: ACT I', icon: 'old-plat3-icon.png' },
      }
    )).toEqual({
      current: { rank: 'Platinum 2', icon: 'plat2-icon.png' },
      peak: { rank: 'Platinum 3', act: 'V26: ACT I', icon: 'plat3-icon.png' },
    });
  });
});

describe('refreshTrackedUsers', () => {
  test('marks existing snapshot stale when refresh fails', async () => {
    process.env.REFRESH_STAGGER_MS = '0';
    scrapeStats.mockRejectedValue(new Error('credits exhausted'));
    readSnapshot.mockReturnValue({
      username: USERNAME,
      status: 'ok',
      lastRefreshedAt: '2026-05-18T10:00:00.000Z',
      data: { competitive: {}, unrated: {}, shared: {} },
    });

    const results = await refreshTrackedUsers([USERNAME], { continueOnError: true });

    expect(results[0]).toEqual(expect.objectContaining({
      username: USERNAME,
      ok: false,
      error: 'credits exhausted',
    }));
    expect(writeSnapshot).toHaveBeenCalledWith(USERNAME, expect.objectContaining({
      status: 'stale',
      lastRefreshError: 'credits exhausted',
    }));
  });

  afterEach(() => {
    delete process.env.REFRESH_STAGGER_MS;
  });
});
