const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../src/providers/psn', () => ({ createPsnProvider: jest.fn() }));
const { createPsnProvider } = require('../../src/providers/psn');
const { main } = require('../../scripts/psn/cli');

let dir, input, argv, connect, close, output;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psn-cli-fixture-'));
  input = path.join(dir, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ npsso: 'X'.repeat(64) }), { mode: 0o600 });
  argv = process.argv;
  process.argv = ['node', 'cli.js', 'connect', '--input-file', input];
  connect = jest.fn();close = jest.fn();
  createPsnProvider.mockReturnValue({ service: { connect }, store: { state: () => ({ sealed: null }), close }, settings: { onlineId: 'owner123' } });
  output = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { process.argv = argv;output.mockRestore();fs.rmSync(dir, { recursive: true, force: true }); });
test('failed identity verification retains the private NPSSO input', async () => {
  connect.mockRejectedValue(new Error('fixture verification failure'));
  await expect(main()).rejects.toThrow('fixture verification failure');
  expect(fs.existsSync(input)).toBe(true);expect(close).toHaveBeenCalled();
  expect(output.mock.calls.flat().join(' ')).not.toContain('X'.repeat(64));
});
test('input is removed only after connection persistence succeeds', async () => {
  connect.mockImplementation(async () => { expect(fs.existsSync(input)).toBe(true); });
  await main();
  expect(connect).toHaveBeenCalledWith('X'.repeat(64));expect(fs.existsSync(input)).toBe(false);
});
test('world-readable input is rejected before authentication', async () => {
  fs.chmodSync(input, 0o644);
  await expect(main()).rejects.toThrow('input-file-must-be-small-and-private');
  expect(connect).not.toHaveBeenCalled();expect(fs.existsSync(input)).toBe(true);
});
