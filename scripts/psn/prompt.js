const { ProviderError } = require('../../src/shared/providerError');

function hiddenPrompt(input = process.stdin, output = process.stderr) {
  if (!input.isTTY || !output.isTTY) return Promise.reject(new ProviderError('interactive-terminal-required', 'setup'));
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let value = '';
    const finish = (error) => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.setRawMode(wasRaw || false);
      input.pause();
      output.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onEnd = () => finish(new ProviderError('input-ended', 'setup'));
    const onData = (chunk) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\u0003' || ch === '\u0004') return finish(new ProviderError('cancelled', 'setup'));
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) value += ch;
        if (value.length > 1024) return finish(new ProviderError('input-too-long', 'setup'));
      }
    };
    // Disable echo and attach the handler before announcing readiness: a fast
    // paste (or Ctrl-C) immediately after the prompt must already be protected.
    input.setRawMode(true);
    input.on('data', onData);
    input.once('end', onEnd);
    input.resume();
    output.write('NPSSO or Sony JSON (hidden; Ctrl-C cancels): ');
  });
}

module.exports = { hiddenPrompt };
