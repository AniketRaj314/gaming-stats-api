const express = require('express');
const { ProviderError } = require('../../shared/providerError');

function createSteamRouter({ service, unavailableStatus = 'disabled' } = {}) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const read = fn => (req, res) => {
    if (!service) return res.status(503).json({ schemaVersion: 1, provider: 'steam', accountRef: 'owner', status: unavailableStatus });
    try { return fn(req, res); }
    catch (error) {
      const status = error instanceof ProviderError && error.code === 'invalid-identifier' ? 400 : 503;
      return res.status(status).json({ provider: 'steam', status: status === 400 ? 'invalid-request' : 'unavailable' });
    }
  };
  for (const resource of ['profile', 'library', 'recent', 'badges']) {
    router.get('/' + resource, read((req, res) => {
      const body = service.read(resource);
      return res.status(['ready', 'stale'].includes(body.status) ? 200 : 503).json(body);
    }));
  }
  router.get('/games/:appId', read((req, res) => {
    const result = service.game(req.params.appId);
    return res.status(result.httpStatus).json(result.body);
  }));
  return router;
}

module.exports = { createSteamRouter };
