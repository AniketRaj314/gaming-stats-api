require('dotenv').config();
const { ProviderError, safeError } = require('../../src/shared/providerError');

async function main() {
  const [command, argument, ...rest] = process.argv.slice(2);
  if (rest.length || !['refresh', 'refresh-game', 'status'].includes(command)) {
    throw new ProviderError('use-refresh-refresh-game-or-status', 'setup');
  }
  if ((command === 'refresh-game') !== Boolean(argument)) throw new ProviderError('invalid-arguments', 'setup');
  const { createSteamProvider } = require('../../src/providers/steam');
  const { service } = createSteamProvider({ report: message => console.error(`Steam ${message}`) });
  if (command === 'status') {
    console.log(JSON.stringify({
      profile: service.read('profile').status,
      library: service.read('library').status,
      recent: service.read('recent').status,
    }, null, 2));
    return;
  }
  const results = command === 'refresh' ? await service.refresh() : [await service.run('details', argument)];
  console.log(JSON.stringify(results, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error(`Steam ${safeError(error)}.`);
  process.exitCode = 1;
});

module.exports = { main };
