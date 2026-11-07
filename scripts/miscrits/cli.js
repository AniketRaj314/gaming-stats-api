require('dotenv').config();
const fs = require('node:fs');
const { guidedCredentials } = require('./connect');
const { ProviderError, safeError } = require('../../src/shared/providerError');
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['connect','refresh','status','disconnect'].includes(command)) throw new ProviderError('use-connect-refresh-status-or-disconnect', 'setup');
  const input = command === 'connect' && args.length === 2 && args[0] === '--input-file' ? args[1] : null;
  const logFile = command === 'connect' && args.length === 2 && args[0] === '--log-file' ? args[1] : undefined;
  if (args.length && !input && !logFile) throw new ProviderError('invalid-command-options', 'setup');
  if (command === 'connect' && !input) {
    if (process.env.RAILWAY_ENVIRONMENT_ID && process.env.MISCRITS_SECURE_TTY !== '1') {
      throw new ProviderError('open-interactive-railway-ssh-then-run-miscrits-connect-production', 'setup');
    }
    if (!process.stdin.isTTY || !process.stderr.isTTY) throw new ProviderError('interactive-terminal-required', 'setup');
  }
  const { createMiscritsProvider } = require('../../src/providers/miscrits');
  const { service, store, settings } = createMiscritsProvider();
  try {
    if (command === 'connect') {
      if (store.state().sealed) throw new ProviderError('disconnect-before-reconnecting', 'setup');
      let credentials;
      if (input) {
        const fd = fs.openSync(input, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          const stat = fs.fstatSync(fd);
          if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 16384) throw new ProviderError('input-file-must-be-small-and-private', 'setup');
          credentials = JSON.parse(fs.readFileSync(fd, 'utf8'));
        } finally { fs.closeSync(fd); }
      } else {
        console.error('Your login and session tokens will be stored encrypted for future refreshes. Nothing is written to .env.');
        credentials = await guidedCredentials({ applicationCredential: settings.applicationCredential, logFile });
      }
      const result = await service.connect(credentials, { refresh: true });
      if (input) fs.unlinkSync(input);
      if (result.refreshed) console.log(JSON.stringify({ connected: true, fetchedAt: result.fetchedAt, playerMiscritCount: result.playerMiscritCount }));
      else {
        console.error('Account connected and credentials saved, but the first snapshot failed (' + result.error + '). Run npm run miscrits:refresh to retry without reconnecting.');
        process.exitCode = 1;
      }
    } else if (command === 'refresh') console.log(JSON.stringify(await service.run()));
    else if (command === 'disconnect') console.log(JSON.stringify(await service.disconnect()));
    else { const { data, ...status } = service.read(); console.log(JSON.stringify({ connection: store.state().status, ...status })); }
  } finally { store.close(); }
}
if (require.main === module) main().catch(error => {
  console.error('Miscrits ' + safeError(error) + '. Never paste credentials or tokens into chat.');
  process.exitCode = 1;
});
module.exports = { main };
