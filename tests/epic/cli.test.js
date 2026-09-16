const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../src/providers/epic', () => ({ createEpicProvider: jest.fn() }));
const { createEpicProvider } = require('../../src/providers/epic');
const { main, authorizationCode } = require('../../scripts/epic/cli');

let directory, input, argv, output, close, service, store;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-cli-'));
  input = path.join(directory, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ authorizationCode: 'fixture-code' }), { mode: 0o600 });
  argv = process.argv;
  output = jest.spyOn(console, 'log').mockImplementation(() => {});
  close = jest.fn();
  service = { connect: jest.fn(async () => ({ connected: true, displayName: 'Spider31415' })),
    run: jest.fn(async () => ({ ok: true, kind: 'library' })), read: jest.fn(() => ({ status: 'ready' })),
    disconnect: jest.fn(async () => ({ disconnected: true, remoteRevoked: true })) };
  store = { state: jest.fn(() => ({ status: 'connected', sealed: null, rotationPending: false, displayName: 'Spider31415' })),
    catalogCount: jest.fn(() => 23), close };
  createEpicProvider.mockReturnValue({ service, store, settings: { expectedDisplayName: 'Spider31415' }, loginUrl: 'https://www.epicgames.com/id/login?fixture=1' });
});
afterEach(() => { process.argv = argv; output.mockRestore(); fs.rmSync(directory, { recursive: true, force: true }); });

test('extracts only the authorization code from Epic JSON', () => {
  expect(authorizationCode('{"authorizationCode":"abc","sid":"ignored"}')).toBe('abc');
  expect(() => authorizationCode('{"sid":"secret"}')).toThrow('authorization-code-missing');
});

test('removes a private input file only after verified persistence', async () => {
  process.argv = ['node', 'cli.js', 'connect', '--input-file', input];
  await main();
  expect(service.connect).toHaveBeenCalledWith('fixture-code');
  expect(fs.existsSync(input)).toBe(false);
  expect(close).toHaveBeenCalled();
  expect(output.mock.calls.flat().join(' ')).not.toContain('fixture-code');
});

test('retains the input on failure and rejects world-readable input', async () => {
  process.argv = ['node', 'cli.js', 'connect', '--input-file', input];
  service.connect.mockRejectedValueOnce(new Error('verification failed'));
  await expect(main()).rejects.toThrow('verification failed');
  expect(fs.existsSync(input)).toBe(true);
  fs.chmodSync(input, 0o644);
  await expect(main()).rejects.toThrow('input-file-must-be-small-and-private');
});

test('Railway requires the explicitly guarded full interactive command', async () => {
  const previousEnvironment = process.env.RAILWAY_ENVIRONMENT_ID;
  const previousSecure = process.env.EPIC_SECURE_TTY;
  process.env.RAILWAY_ENVIRONMENT_ID = 'production';
  delete process.env.EPIC_SECURE_TTY;
  process.argv = ['node', 'cli.js', 'connect'];
  try { await expect(main()).rejects.toThrow('use-npm-run-epic-connect-production'); }
  finally {
    if (previousEnvironment === undefined) delete process.env.RAILWAY_ENVIRONMENT_ID;
    else process.env.RAILWAY_ENVIRONMENT_ID = previousEnvironment;
    if (previousSecure === undefined) delete process.env.EPIC_SECURE_TTY;
    else process.env.EPIC_SECURE_TTY = previousSecure;
  }
});

test('status and disconnect reveal no credentials', async () => {
  process.argv = ['node', 'cli.js', 'status'];
  await main();
  expect(output.mock.calls.flat().join(' ')).toContain('"library": "ready"');
  output.mockClear();
  process.argv = ['node', 'cli.js', 'disconnect'];
  await main();
  expect(service.disconnect).toHaveBeenCalledWith({ localOnly: false });
});
