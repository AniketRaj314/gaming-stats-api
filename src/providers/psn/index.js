const { config, encryptionKey } = require('./config');
const { PsnStore } = require('../../storage/psnStore');
const { createClient } = require('./client');
const { createService } = require('./service');

function createPsnProvider({ settings = config(), report } = {}) {
  const store = new PsnStore(settings.directory, encryptionKey(settings), settings.onlineId);
  try {
    // Refuse even cached publication if configuration no longer matches the
    // account/key bound to this connection.
    if (store.state().sealed) store.session();
  } catch (error) { store.close(); throw error; }
  const service = createService({ store, client: createClient(), config: settings, report });
  return { service, store, settings };
}

module.exports = { createPsnProvider };
