const { StringDecoder } = require('node:string_decoder');
const { ProviderError } = require('../../src/shared/providerError');

function prompt(label, { hidden = true, input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new ProviderError('interactive-terminal-required', 'setup'));
  }
  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw);
    const decoder = new StringDecoder('utf8');
    let value = '', escape = '', settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.removeListener('error', onError);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\x1b[?2004l\n');
      if (error) reject(error); else resolve(value);
      value = '';
    }
    const onEnd = () => finish(new ProviderError('input-ended', 'setup'));
    const onError = () => finish(new ProviderError('terminal-input-failed', 'setup'));
    function onData(chunk) {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      for (let i = 0; i < text.length;) {
        const ch = String.fromCodePoint(text.codePointAt(i));
        i += ch.length;
        if (ch === '\x03' || ch === '\x04') return finish(new ProviderError('cancelled', 'setup'));
        if (escape || ch === '\x1b') {
          escape += ch;
          if (escape === '\x1b' || /^\x1b\[[0-9;]*$/.test(escape)) continue;
          // Strip terminal controls, including bracketed-paste wrappers.
          escape = '';
          continue;
        }
        if (ch === '\r' || ch === '\n') {
          const rest = text.slice(i).replace(/\x1b\[20[01]~/g, '').replace(/[\r\n]/g, '');
          if (rest) return finish(new ProviderError('one-value-per-prompt', 'setup'));
          if (!value) return finish(new ProviderError('empty-input', 'setup'));
          return finish();
        }
        if (ch === '\x7f' || ch === '\b') {
          if (value && !hidden) output.write('\b \b');
          value = Array.from(value).slice(0, -1).join('');
        } else if (ch.codePointAt(0) >= 32 && !(ch.codePointAt(0) >= 127 && ch.codePointAt(0) <= 159)) {
          value += ch;
          if (!hidden) output.write(ch);
        }
        if (value.length > 4096) return finish(new ProviderError('input-too-long', 'setup'));
      }
    }
    // Echo is disabled before displaying readiness, including over an interactive SSH TTY.
    input.setRawMode(true);
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onError);
    input.resume();
    output.write('\x1b[?2004h' + label + (hidden ? ' (hidden; Ctrl-C cancels): ' : ': '));
  });
}
module.exports = { prompt };
