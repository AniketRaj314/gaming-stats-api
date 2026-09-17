'use strict';

let fetchSpy;
let MAP_DATA, initMapData;

beforeEach(() => {
  jest.resetModules();
  fetchSpy = jest.spyOn(global, 'fetch');
  ({ MAP_DATA, initMapData } = require('../src/mapData'));
  Object.keys(MAP_DATA).forEach((k) => delete MAP_DATA[k]);
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

describe('initMapData', () => {
  test('retains the substantial map artwork variants', async () => {
    mockFetchOk([
      { displayName: 'Ascent', displayIcon: 'ascent-icon.png', splash: 'ascent-splash.png',
        listViewIcon: 'ascent-list.png', listViewIconTall: 'ascent-list-tall.png', backgroundImage: 'ascent-background.png',
        stylizedBackgroundImage: 'ascent-stylized.png', premierBackgroundImage: 'ascent-premier.png' },
    ]);
    await initMapData();
    expect(MAP_DATA['Ascent']).toEqual({
      displayIcon: 'ascent-icon.png',
      splash: 'ascent-splash.png',
      listViewIcon: 'ascent-list.png',
      listViewIconTall: 'ascent-list-tall.png',
      backgroundImage: 'ascent-background.png',
      stylizedBackgroundImage: 'ascent-stylized.png',
      premierBackgroundImage: 'ascent-premier.png',
    });
  });

  test('skips entries with null displayName', async () => {
    mockFetchOk([
      { displayName: null, displayIcon: 'x.png', splash: 'y.png' },
      { displayName: 'Bind', displayIcon: 'bind-icon.png', splash: 'bind-splash.png' },
    ]);
    await initMapData();
    expect(MAP_DATA[null]).toBeUndefined();
    expect(MAP_DATA['Bind']).toBeDefined();
    expect(Object.keys(MAP_DATA)).toHaveLength(1);
  });

  test('does not throw on HTTP error', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404 });
    await expect(initMapData()).resolves.not.toThrow();
  });

  test('does not throw on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));
    await expect(initMapData()).resolves.not.toThrow();
  });
});
