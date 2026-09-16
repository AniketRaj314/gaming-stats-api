const { EventEmitter } = require('node:events');
const { hiddenPrompt } = require('../../scripts/psn/prompt');

function terminal() {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode: jest.fn(), resume: jest.fn(), pause: jest.fn() });
  const output = { isTTY: true, write: jest.fn() };
  return { input, output };
}
test('secret input is accepted without echo and raw mode is restored', async () => {
  const { input, output } = terminal();
  const result = hiddenPrompt(input, output);
  input.emit('data', Buffer.from('synthetic-secret\r'));
  expect(await result).toBe('synthetic-secret');
  expect(output.write.mock.calls.flat().join('')).not.toContain('synthetic-secret');
  expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  expect(input.setRawMode.mock.invocationCallOrder[0]).toBeLessThan(output.write.mock.invocationCallOrder[0]);
  expect(input.listenerCount('data')).toBe(0);
});
test('cancellation restores terminal mode and stops reading', async () => {
  const { input, output } = terminal();
  const result = hiddenPrompt(input, output);
  input.emit('data', Buffer.from('\x03'));
  await expect(result).rejects.toThrow('cancelled');
  expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  expect(input.pause).toHaveBeenCalled();
});
test('noninteractive input is rejected', async () => {
  await expect(hiddenPrompt({ isTTY: false }, { isTTY: false })).rejects.toThrow('interactive-terminal-required');
});
