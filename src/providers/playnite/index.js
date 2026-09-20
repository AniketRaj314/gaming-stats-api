const { config } = require('./config');
const { PlayniteStore } = require('../../storage/playniteStore');
const { createService } = require('./service');

function createPlayniteProvider({ settings = config(), now } = {}) {
  const store = new PlayniteStore(settings.directory);
  return { service: createService({ store, config: settings, now }), store, settings };
}

module.exports = { createPlayniteProvider };
