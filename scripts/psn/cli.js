require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hiddenPrompt } = require('./prompt');
const { ProviderError, safeError } = require('../../src/shared/providerError');

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'init-key') {
    if (args.length) throw new ProviderError('unexpected-arguments', 'setup');
    fs.mkdirSync('.private', { recursive: true, mode: 0o700 });
    if (fs.lstatSync('.private').isSymbolicLink()) throw new ProviderError('unsafe-key-directory', 'setup');
    fs.chmodSync('.private', 0o700);
    fs.writeFileSync('.private/psn.key', crypto.randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Created .private/psn.key. Set GAMING_ENCRYPTION_KEY_FILE to this path for local use. The key was not printed.');
    return;
  }
  if (!['connect', 'refresh', 'status', 'disconnect'].includes(command)) throw new ProviderError('use-init-key-connect-refresh-status-or-disconnect', 'setup');
  const inputFile = command === 'connect' && args.length === 2 && args[0] === '--input-file' ? path.resolve(args[1]) : null;
  if (args.length && !inputFile) throw new ProviderError('unexpected-arguments-do-not-pass-tokens-as-arguments', 'setup');
  const { createPsnProvider } = require('../../src/providers/psn');
  const provider = createPsnProvider({ report: (message) => console.error(`PSN ${message}`) });
  const { service, store } = provider;
  try {
    if (command === 'connect') {
      if (store.state().sealed) throw new ProviderError('disconnect-before-reconnecting', 'connection');
      if (process.env.RAILWAY_ENVIRONMENT_ID && process.env.PSN_SECURE_TTY !== '1') {
        throw new ProviderError('use-npm-run-psn-connect-production', 'setup');
      }
      console.log(`Connecting only the configured PSN account: ${provider.settings.onlineId}`);
      console.log('Sign in yourself at https://www.playstation.com/, then visit https://ca.account.sony.com/api/v1/ssocookie in the same browser.');
      let raw;
      if (inputFile) {
        const stat = fs.lstatSync(inputFile);
        if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 1024) throw new ProviderError('input-file-must-be-small-and-private', 'setup');
        raw = fs.readFileSync(inputFile, 'utf8').trim();
      } else raw = (await hiddenPrompt()).trim();
      let npsso = raw;
      if (raw.startsWith('{')) {
        try { npsso = JSON.parse(raw).npsso; } catch { throw new ProviderError('invalid-input-json', 'setup'); }
      }
      await service.connect(npsso);
      // Only remove caller-provided input after verified credentials are durable.
      if (inputFile) fs.unlinkSync(inputFile);
      console.log('Account verified and encrypted session saved. Run psn:refresh to fetch gaming data.');
    } else if (command === 'disconnect') {
      service.disconnect();
      console.log('Local PSN connection and snapshots removed. This does not revoke the Sony session. Use Sony account security controls to revoke remote sessions if needed.');
    } else if (command === 'status') {
      console.log(JSON.stringify({ connection: store.state().status, rotationRecoveryRequired: store.state().rotationPending,
        library: service.read('library').status, presence: service.read('presence').status }, null, 2));
    } else {
      // These are explicitly owner-triggered PSN requests, never Valorant refreshes.
      const results = [await service.run('presence'), await service.run('library')];
      console.log(JSON.stringify(results, null, 2));
      if (results.some(r => !r.ok)) process.exitCode = 1;
    }
  } finally { store.close(); }
}

if (require.main === module) main().catch(error => {
  console.error(`PSN ${safeError(error)}. Input files are retained on connection failure; do not paste credentials into chat.`);
  process.exitCode = 1;
});

module.exports = { main };
