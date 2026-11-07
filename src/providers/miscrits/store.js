const { EpicStore } = require('../../storage/epicStore');
// Reuse the existing private encrypted session store, atomic publication and cross-process worker lock.
class MiscritsStore extends EpicStore {
  binding(state) { return 'miscrits:' + state.accountId + ':' + state.generation + ':' + state.version; }
}
module.exports = { MiscritsStore };
