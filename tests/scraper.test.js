'use strict';

jest.mock('../src/agentData');
jest.mock('../src/rankIcons');
jest.mock('../src/mapData');
jest.mock('../src/logger');

// Require static data stores once — they share module instance with the mocked scraper
const { AGENT_DATA } = require('../src/agentData');
const { RANK_ICONS } = require('../src/rankIcons');
const { MAP_DATA } = require('../src/mapData');
const { scrapeStats } = require('../src/scraper');

let fetchSpy;

beforeEach(() => {
  process.env.APIFY_TOKEN = 'test-token';
  fetchSpy = jest.spyOn(global, 'fetch');
  // Clear static data stores between tests
  Object.keys(AGENT_DATA).forEach((k) => delete AGENT_DATA[k]);
  Object.keys(RANK_ICONS).forEach((k) => delete RANK_ICONS[k]);
  Object.keys(MAP_DATA).forEach((k) => delete MAP_DATA[k]);
});

afterEach(() => {
  delete process.env.APIFY_TOKEN;
  delete process.env.APIFY_MEMORY_MB;
  fetchSpy.mockRestore();
});

function makeOkResponse(items) {
  return {
    ok: true,
    json: async () => items,
    text: async () => '',
  };
}

function makeErrorResponse(status) {
  return {
    ok: false,
    status,
    text: async () => `Error ${status}`,
  };
}

// ─── APIFY_TOKEN guard ───────────────────────────────────────────────────────

describe('APIFY_TOKEN guard', () => {
  test('throws immediately when token missing; fetch never called', async () => {
    delete process.env.APIFY_TOKEN;
    await expect(scrapeStats('User#1', 'competitive', ['rank'])).rejects.toThrow('APIFY_TOKEN is not set');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── Module grouping ─────────────────────────────────────────────────────────

describe('module grouping', () => {
  test('one fetch call when only rank requested', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{
      rank: { current: { rank: 'Gold 2', icon: null }, peak: { rank: 'Plat 1', icon: null } },
    }]));
    await scrapeStats('User#1', 'competitive', ['rank']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('totalPlaytime with callerPlaylist=unrated → URL body contains performance and playlist=unrated', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{ totalPlaytime: { total: '100h' } }]));
    await scrapeStats('User#1', 'unrated', ['totalPlaytime']);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.startUrls[0].url).toContain('performance');
    expect(body.startUrls[0].url).toContain('playlist=unrated');
  });

  test('rank + agents → two fetch calls (different pages)', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeOkResponse([{
        rank: { current: { rank: 'Gold 2', icon: null }, peak: { rank: 'Plat 1', icon: null } },
      }]))
      .mockResolvedValueOnce(makeOkResponse([{ agents: [] }]));
    await scrapeStats('User#1', 'competitive', ['rank', 'agents']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('results from two calls are merged into one object', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeOkResponse([{
        rank: { current: { rank: 'Gold 2', icon: null }, peak: { rank: 'Plat 1', icon: null } },
      }]))
      .mockResolvedValueOnce(makeOkResponse([{ agents: [{ agent: 'Jett' }] }]));
    const result = await scrapeStats('User#1', 'competitive', ['rank', 'agents']);
    expect(result).toHaveProperty('rank');
    expect(result).toHaveProperty('agents');
  });
});

// ─── Apify run configuration ────────────────────────────────────────────────

describe('Apify run configuration', () => {
  test('defaults actor memory to 2048 MB', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [] }]));
    await scrapeStats('User#1', 'competitive', ['agents']);
    expect(fetchSpy.mock.calls[0][0]).toContain('memory=2048');
  });

  test('uses APIFY_MEMORY_MB when provided', async () => {
    process.env.APIFY_MEMORY_MB = '4096';
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [] }]));
    await scrapeStats('User#1', 'competitive', ['agents']);
    expect(fetchSpy.mock.calls[0][0]).toContain('memory=4096');
  });

  test('falls back to 2048 MB when APIFY_MEMORY_MB is invalid', async () => {
    process.env.APIFY_MEMORY_MB = 'nope';
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [] }]));
    await scrapeStats('User#1', 'competitive', ['agents']);
    expect(fetchSpy.mock.calls[0][0]).toContain('memory=2048');
  });
});

// ─── null / 404 handling ─────────────────────────────────────────────────────

describe('null / 404 handling', () => {
  test('returns null when all Apify calls return []', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([]));
    const result = await scrapeStats('User#1', 'competitive', ['rank']);
    expect(result).toBeNull();
  });

  test('returns data when one call returns [] and another has data', async () => {
    // rank (overview/competitive) and agents (agents/competitive) go to different pages
    fetchSpy
      .mockResolvedValueOnce(makeOkResponse([]))                                   // rank: no data
      .mockResolvedValueOnce(makeOkResponse([{ agents: [{ agent: 'Jett' }] }]));  // agents: data
    const result = await scrapeStats('User#1', 'competitive', ['rank', 'agents']);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('agents');
  });

  test('throws with "Apify request failed" on network rejection', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));
    await expect(scrapeStats('User#1', 'competitive', ['rank'])).rejects.toThrow('Apify request failed');
  });

  test('throws with "Apify returned 500" on non-ok HTTP', async () => {
    fetchSpy.mockResolvedValue(makeErrorResponse(500));
    await expect(scrapeStats('User#1', 'competitive', ['rank'])).rejects.toThrow('Apify returned 500');
  });
});

// ─── Metadata stripping ──────────────────────────────────────────────────────

describe('metadata stripping', () => {
  test('keys starting with # removed from Apify item; real keys preserved', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{
      '#error': false,
      '#debug': { timings: {} },
      rank: { current: { rank: 'Silver 1', icon: null }, peak: { rank: 'Gold 1', icon: null } },
    }]));
    const result = await scrapeStats('User#1', 'competitive', ['rank']);
    expect(result).not.toHaveProperty('#error');
    expect(result).not.toHaveProperty('#debug');
    expect(result).toHaveProperty('rank');
  });
});

// ─── Agent enrichment ────────────────────────────────────────────────────────

describe('agent enrichment', () => {
  test('icon, portrait, killfeedPortrait attached from AGENT_DATA by agent name', async () => {
    AGENT_DATA['Jett'] = {
      icon: 'jett-icon.png',
      role: 'Duelist',
      portrait: 'jett-portrait.png',
      killfeedPortrait: 'jett-killfeed.png',
    };
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [{ agent: 'Jett', role: 'Duelist' }] }]));
    const result = await scrapeStats('User#1', 'competitive', ['agents']);
    expect(result.agents[0].icon).toBe('jett-icon.png');
    expect(result.agents[0].portrait).toBe('jett-portrait.png');
    expect(result.agents[0].killfeedPortrait).toBe('jett-killfeed.png');
  });

  test('all three set to null when agent not in AGENT_DATA', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [{ agent: 'Unknown' }] }]));
    const result = await scrapeStats('User#1', 'competitive', ['agents']);
    expect(result.agents[0].icon).toBeNull();
    expect(result.agents[0].portrait).toBeNull();
    expect(result.agents[0].killfeedPortrait).toBeNull();
    expect(result.agents[0].abilityIcons).toEqual([]);
  });

  test('substantial agent artwork and ability icons are attached', async () => {
    AGENT_DATA['Jett'] = {
      icon: 'icon.png', displayIconSmall: 'small.png', role: 'Duelist', roleIcon: 'role.png',
      portrait: 'portrait.png', portraitV2: 'portrait-v2.png', bustPortrait: 'bust.png',
      killfeedPortrait: 'killfeed.png', minimapPortrait: 'minimap.png', background: 'background.png',
      homeScreenPromoTileImage: 'promo.png', abilityIcons: [{ slot: 'Ability1', name: 'Updraft', icon: 'ability.png' }],
    };
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [{ agent: 'Jett', role: 'Duelist' }] }]));
    expect((await scrapeStats('User#1', 'competitive', ['agents'])).agents[0]).toMatchObject({
      displayIconSmall: 'small.png', roleIcon: 'role.png', portraitV2: 'portrait-v2.png', bustPortrait: 'bust.png',
      minimapPortrait: 'minimap.png', background: 'background.png', homeScreenPromoTileImage: 'promo.png',
      abilityIcons: [{ slot: 'Ability1', name: 'Updraft', icon: 'ability.png' }],
    });
  });

  test('no error when agents absent from result', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{
      rank: { current: { rank: 'Gold 1', icon: null }, peak: { rank: 'Plat 1', icon: null } },
    }]));
    await expect(scrapeStats('User#1', 'competitive', ['rank'])).resolves.not.toThrow();
  });
});

// ─── Map enrichment ──────────────────────────────────────────────────────────

describe('map enrichment', () => {
  test('displayIcon and splash attached from MAP_DATA by map name', async () => {
    MAP_DATA['Ascent'] = { displayIcon: 'ascent-icon.png', splash: 'ascent-splash.png' };
    fetchSpy.mockResolvedValue(makeOkResponse([{ maps: [{ map: 'Ascent', topAgents: [] }] }]));
    const result = await scrapeStats('User#1', 'competitive', ['maps']);
    expect(result.maps[0].displayIcon).toBe('ascent-icon.png');
    expect(result.maps[0].splash).toBe('ascent-splash.png');
  });

  test('topAgents enriched with icon, portrait, killfeedPortrait, role from AGENT_DATA', async () => {
    MAP_DATA['Ascent'] = { displayIcon: 'ascent-icon.png', splash: 'ascent-splash.png' };
    AGENT_DATA['Jett'] = {
      icon: 'jett-icon.png',
      role: 'Duelist',
      portrait: 'jett-portrait.png',
      killfeedPortrait: 'jett-killfeed.png',
    };
    fetchSpy.mockResolvedValue(makeOkResponse([{
      maps: [{ map: 'Ascent', topAgents: [{ agent: 'Jett', winRate: '65%' }] }],
    }]));
    const result = await scrapeStats('User#1', 'competitive', ['maps']);
    const topAgent = result.maps[0].topAgents[0];
    expect(topAgent.icon).toBe('jett-icon.png');
    expect(topAgent.portrait).toBe('jett-portrait.png');
    expect(topAgent.killfeedPortrait).toBe('jett-killfeed.png');
    expect(topAgent.role).toBe('Duelist');
  });

  test('displayIcon and splash set to null when map not in MAP_DATA', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{ maps: [{ map: 'UnknownMap', topAgents: [] }] }]));
    const result = await scrapeStats('User#1', 'competitive', ['maps']);
    expect(result.maps[0].displayIcon).toBeNull();
    expect(result.maps[0].splash).toBeNull();
  });

  test('substantial map artwork variants are attached', async () => {
    MAP_DATA['Ascent'] = { displayIcon: 'icon.png', splash: 'splash.png', listViewIcon: 'list.png',
      listViewIconTall: 'list-tall.png', backgroundImage: 'background.png',
      stylizedBackgroundImage: 'stylized.png', premierBackgroundImage: 'premier.png' };
    fetchSpy.mockResolvedValue(makeOkResponse([{ maps: [{ map: 'Ascent', topAgents: [] }] }]));
    expect((await scrapeStats('User#1', 'competitive', ['maps'])).maps[0]).toMatchObject({
      listViewIcon: 'list.png', listViewIconTall: 'list-tall.png', backgroundImage: 'background.png',
      stylizedBackgroundImage: 'stylized.png', premierBackgroundImage: 'premier.png',
    });
  });

  test('topAgent fields set to null when agent not in AGENT_DATA', async () => {
    MAP_DATA['Bind'] = { displayIcon: 'bind-icon.png', splash: 'bind-splash.png' };
    fetchSpy.mockResolvedValue(makeOkResponse([{
      maps: [{ map: 'Bind', topAgents: [{ agent: 'Unknown', winRate: '50%' }] }],
    }]));
    const result = await scrapeStats('User#1', 'competitive', ['maps']);
    const topAgent = result.maps[0].topAgents[0];
    expect(topAgent.icon).toBeNull();
    expect(topAgent.portrait).toBeNull();
    expect(topAgent.killfeedPortrait).toBeNull();
    expect(topAgent.role).toBeNull();
  });
});

// ─── Rank icon enrichment ────────────────────────────────────────────────────

describe('rank icon enrichment', () => {
  test('current.icon replaced from RANK_ICONS[rank.toLowerCase()]', async () => {
    RANK_ICONS['gold 2'] = 'gold2-icon.png';
    fetchSpy.mockResolvedValue(makeOkResponse([{
      rank: { current: { rank: 'Gold 2', icon: 'scraped-icon.png' }, peak: { rank: 'Gold 2', icon: null } },
    }]));
    const result = await scrapeStats('User#1', 'competitive', ['rank']);
    expect(result.rank.current.icon).toBe('gold2-icon.png');
  });

  test('peak.icon replaced from RANK_ICONS', async () => {
    RANK_ICONS['platinum 1'] = 'plat1-icon.png';
    fetchSpy.mockResolvedValue(makeOkResponse([{
      rank: { current: { rank: 'Gold 2', icon: null }, peak: { rank: 'Platinum 1', icon: 'old-icon.png' } },
    }]));
    const result = await scrapeStats('User#1', 'competitive', ['rank']);
    expect(result.rank.peak.icon).toBe('plat1-icon.png');
  });

  test('falls back to scraped icon when rank not in RANK_ICONS', async () => {
    // RANK_ICONS is empty → falls back to cur.icon via ?? cur.icon ?? null
    fetchSpy.mockResolvedValue(makeOkResponse([{
      rank: { current: { rank: 'Radiant', icon: 'scraped-radiant.png' }, peak: { rank: 'Radiant', icon: null } },
    }]));
    const result = await scrapeStats('User#1', 'competitive', ['rank']);
    expect(result.rank.current.icon).toBe('scraped-radiant.png');
  });

  test('no error when rank absent from result', async () => {
    fetchSpy.mockResolvedValue(makeOkResponse([{ agents: [{ agent: 'Jett' }] }]));
    await expect(scrapeStats('User#1', 'competitive', ['agents'])).resolves.not.toThrow();
  });
});
