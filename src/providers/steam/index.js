const { config } = require('./config');
const { SteamStore } = require('../../storage/steamStore');
const { createClient } = require('./client');
const { createService } = require('./service');

function createSteamProvider({ settings = config(), report } = {}) {
  const store = new SteamStore(settings.directory);
  const client = createClient({ apiKey: settings.apiKey });
  const service = createService({ store, client, config: settings, report });
  return { service, store, settings };
}

module.exports = { createSteamProvider };
