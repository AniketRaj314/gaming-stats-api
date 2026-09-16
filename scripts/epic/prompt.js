const { ProviderError } = require('../../src/shared/providerError');

function hiddenPrompt(input = process.stdin, output = process.stderr) {
  if (!input.isTTY || !output.isTTY) return Promise.reject(new ProviderError('interactive-terminal-required', 'setup'));
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let value = '';
    const finish = error => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.setRawMode(wasRaw || false);
      input.pause();
      output.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onEnd = () => finish(new ProviderError('input-ended', 'setup'));
    const onData = chunk => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003' || character === '\u0004') return finish(new ProviderError('cancelled', 'setup'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126) value += character;
        if (value.length > 4096) return finish(new ProviderError('input-too-long', 'setup'));
      }
    };
    input.setRawMode(true);
    input.on('data', onData);
    input.once('end', onEnd);
    input.resume();
    output.write('Epic authorization code or JSON (hidden; Ctrl-C cancels): ');
  });
}

module.exports = { hiddenPrompt };
