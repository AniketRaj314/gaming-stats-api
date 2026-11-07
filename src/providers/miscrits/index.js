const { config, encryptionKey } = require('./config');
const { MiscritsStore } = require('./store');
const { createClient } = require('./client');
const { createService } = require('./service');
function createMiscritsProvider({ settings = config() } = {}) {
  const store = new MiscritsStore(settings.directory, encryptionKey(settings));
  try { if (store.state().sealed) store.session(); }
  catch (error) { store.close(); throw error; }
  return { settings, store, service: createService({ store, client: createClient(), settings }) };
}
module.exports = { createMiscritsProvider };
