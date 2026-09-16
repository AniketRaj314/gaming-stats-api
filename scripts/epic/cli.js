require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { hiddenPrompt } = require('./prompt');
const { ProviderError, safeError } = require('../../src/shared/providerError');

function authorizationCode(raw) {
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.authorizationCode === 'string') return parsed.authorizationCode;
    } catch { throw new ProviderError('invalid-input-json', 'setup'); }
    throw new ProviderError('authorization-code-missing', 'setup');
  }
  return raw;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['connect', 'refresh', 'status', 'disconnect'].includes(command)) {
    throw new ProviderError('use-connect-refresh-status-or-disconnect', 'setup');
  }
  const inputFile = command === 'connect' && args.length === 2 && args[0] === '--input-file' ? path.resolve(args[1]) : null;
  const localOnly = command === 'disconnect' && args.length === 1 && args[0] === '--local-only';
  if (args.length && !inputFile && !localOnly) throw new ProviderError('unexpected-arguments-do-not-pass-codes-as-arguments', 'setup');
  const { createEpicProvider } = require('../../src/providers/epic');
  const provider = createEpicProvider({ report: message => console.error(`Epic ${message}`) });
  const { service, store } = provider;
  try {
    if (command === 'connect') {
      if (store.state().sealed) throw new ProviderError('disconnect-before-reconnecting', 'connection');
      if (process.env.RAILWAY_ENVIRONMENT_ID && process.env.EPIC_SECURE_TTY !== '1') {
        throw new ProviderError('use-npm-run-epic-connect-production', 'setup');
      }
      console.log(`Connect only the intended Epic owner account${provider.settings.expectedDisplayName ? ` (${provider.settings.expectedDisplayName})` : ''}.`);
      console.log('Open this official Epic sign-in URL in your browser:');
      console.log(provider.loginUrl);
      let raw;
      if (inputFile) {
        const stat = fs.lstatSync(inputFile);
        if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 4096) {
          throw new ProviderError('input-file-must-be-small-and-private', 'setup');
        }
        raw = fs.readFileSync(inputFile, 'utf8').trim();
      } else raw = (await hiddenPrompt()).trim();
      const result = await service.connect(authorizationCode(raw));
      if (inputFile) fs.unlinkSync(inputFile);
      console.log(`Account ${result.displayName} verified and encrypted session saved. Run epic:refresh next.`);
    } else if (command === 'refresh') {
      const result = await service.run();
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } else if (command === 'status') {
      const state = store.state();
      console.log(JSON.stringify({
        connection: state.status,
        rotationRecoveryRequired: state.rotationPending,
        account: state.displayName || null,
        library: service.read().status,
        catalogEntries: store.catalogCount(),
      }, null, 2));
    } else {
      const result = await service.disconnect({ localOnly });
      console.log(result.remoteRevoked
        ? 'Epic session revoked; local connection and snapshots removed.'
        : 'Local Epic connection and snapshots removed. Revoke remaining sessions through Epic account security.');
    }
  } finally { store.close(); }
}

if (require.main === module) main().catch(error => {
  console.error(`Epic ${safeError(error)}. Input files are retained on connection failure; never paste Epic codes or tokens into chat.`);
  process.exitCode = 1;
});

module.exports = { main, authorizationCode };
