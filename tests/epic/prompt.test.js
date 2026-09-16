const { EventEmitter } = require('node:events');
const { hiddenPrompt } = require('../../scripts/epic/prompt');

function terminal() {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode: jest.fn(), resume: jest.fn(), pause: jest.fn() });
  return { input, output: { isTTY: true, write: jest.fn() } };
}

test('Epic code input is accepted without echo and restores terminal mode', async () => {
  const { input, output } = terminal();
  const result = hiddenPrompt(input, output);
  input.emit('data', Buffer.from('synthetic-code\r'));
  expect(await result).toBe('synthetic-code');
  expect(output.write.mock.calls.flat().join('')).not.toContain('synthetic-code');
  expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  expect(input.setRawMode.mock.invocationCallOrder[0]).toBeLessThan(output.write.mock.invocationCallOrder[0]);
});

test('Epic prompt cancellation is safe and noninteractive input is rejected', async () => {
  const { input, output } = terminal();
  const result = hiddenPrompt(input, output);
  input.emit('data', Buffer.from('\x03'));
  await expect(result).rejects.toThrow('cancelled');
  expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  await expect(hiddenPrompt({ isTTY: false }, { isTTY: false })).rejects.toThrow('interactive-terminal-required');
});
