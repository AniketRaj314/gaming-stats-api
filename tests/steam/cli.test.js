jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../src/providers/steam', () => ({ createSteamProvider: jest.fn() }));
const { createSteamProvider } = require('../../src/providers/steam');
const { main } = require('../../scripts/steam/cli');

let argv, output, error, service;
beforeEach(() => {
  argv = process.argv;
  output = jest.spyOn(console, 'log').mockImplementation(() => {});
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
  service = {
    read: jest.fn(resource => ({ status: resource === 'library' ? 'stale' : 'ready' })),
    refresh: jest.fn(async () => [{ ok: true, kind: 'profile' }, { ok: true, kind: 'library' }, { ok: true, kind: 'recent' }]),
    run: jest.fn(async () => ({ ok: true, kind: 'details' })),
  };
  createSteamProvider.mockReturnValue({ service });
});
afterEach(() => { process.argv = argv; output.mockRestore(); error.mockRestore(); process.exitCode = undefined; });

test('status prints resource states without credentials or cached payloads', async () => {
  process.argv = ['node', 'cli.js', 'status'];
  await main();
  const printed = output.mock.calls.flat().join(' ');
  expect(printed).toContain('"library": "stale"');
  expect(printed).not.toContain('STEAM_WEB_API_KEY');
  expect(service.refresh).not.toHaveBeenCalled();
});

test('refresh and explicit owned-game enrichment call only private service jobs', async () => {
  process.argv = ['node', 'cli.js', 'refresh'];
  await main();
  expect(service.refresh).toHaveBeenCalledTimes(1);
  process.argv = ['node', 'cli.js', 'refresh-game', '570'];
  await main();
  expect(service.run).toHaveBeenCalledWith('details', '570');
});
