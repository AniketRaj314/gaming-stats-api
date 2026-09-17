'use strict';

let fetchSpy;
let AGENT_DATA, initAgentData;

beforeEach(() => {
  jest.resetModules();
  fetchSpy = jest.spyOn(global, 'fetch');
  ({ AGENT_DATA, initAgentData } = require('../src/agentData'));
  // Wipe the store
  Object.keys(AGENT_DATA).forEach((k) => delete AGENT_DATA[k]);
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function mockFetchOk(data) {
  fetchSpy.mockResolvedValue({
    ok: true,
    json: async () => ({ data }),
  });
}

describe('initAgentData', () => {
  test('retains the substantial agent artwork and ability icons', async () => {
    mockFetchOk([
      {
        displayName: 'Jett',
        displayIcon: 'jett-icon.png',
        displayIconSmall: 'jett-small.png',
        role: { displayName: 'Duelist', displayIcon: 'duelist.png' },
        fullPortrait: 'jett-portrait.png',
        fullPortraitV2: 'jett-portrait-v2.png',
        bustPortrait: 'jett-bust.png',
        killfeedPortrait: 'jett-killfeed.png',
        minimapPortrait: 'jett-minimap.png',
        background: 'jett-background.png',
        homeScreenPromoTileImage: 'jett-promo.png',
        abilities: [{ slot: 'Ability1', displayName: 'Updraft', displayIcon: 'updraft.png' }],
      },
    ]);
    await initAgentData();
    expect(AGENT_DATA['Jett']).toEqual({
      icon: 'jett-icon.png',
      displayIconSmall: 'jett-small.png',
      role: 'Duelist',
      roleIcon: 'duelist.png',
      portrait: 'jett-portrait.png',
      portraitV2: 'jett-portrait-v2.png',
      bustPortrait: 'jett-bust.png',
      killfeedPortrait: 'jett-killfeed.png',
      minimapPortrait: 'jett-minimap.png',
      background: 'jett-background.png',
      homeScreenPromoTileImage: 'jett-promo.png',
      abilityIcons: [{ slot: 'Ability1', name: 'Updraft', icon: 'updraft.png' }],
    });
  });

  test('role is null when agent has no role', async () => {
    mockFetchOk([
      {
        displayName: 'KAY/O',
        displayIcon: 'kayo-icon.png',
        role: null,
        fullPortrait: 'kayo-portrait.png',
        killfeedPortrait: 'kayo-killfeed.png',
      },
    ]);
    await initAgentData();
    expect(AGENT_DATA['KAY/O'].role).toBeNull();
  });

  test('multiple agents in one call', async () => {
    mockFetchOk([
      { displayName: 'Jett', displayIcon: 'a', role: { displayName: 'Duelist' }, fullPortrait: 'b', killfeedPortrait: 'c' },
      { displayName: 'Sage', displayIcon: 'd', role: { displayName: 'Sentinel' }, fullPortrait: 'e', killfeedPortrait: 'f' },
    ]);
    await initAgentData();
    expect(Object.keys(AGENT_DATA)).toEqual(['Jett', 'Sage']);
  });

  test('does not throw on HTTP error (non-ok response)', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503 });
    await expect(initAgentData()).resolves.not.toThrow();
  });

  test('does not throw on network error (fetch rejects)', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));
    await expect(initAgentData()).resolves.not.toThrow();
  });
});
