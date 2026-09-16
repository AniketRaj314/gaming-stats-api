const { config, encryptionKey } = require('./config');
const { EpicStore } = require('../../storage/epicStore');
const { createClient } = require('./client');
const { createService } = require('./service');

function createEpicProvider({ settings = config(), report } = {}) {
  const store = new EpicStore(settings.directory, encryptionKey(settings));
  try {
    if (store.state().sealed) store.session();
  } catch (error) { store.close(); throw error; }
  const client = createClient();
  const service = createService({ store, client, config: settings, report });
  return { service, store, settings, loginUrl: client.loginUrl() };
}

module.exports = { createEpicProvider };
