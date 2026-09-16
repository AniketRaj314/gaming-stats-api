const express = require('express');
const { ProviderError } = require('../../shared/providerError');

function createPsnRouter({ service, unavailableStatus = 'disabled' } = {}) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const read = (fn) => (req, res) => {
    if (!service) return res.status(503).json({ schemaVersion: 1, provider: 'psn', accountRef: 'owner', status: unavailableStatus });
    try { return fn(req, res); }
    catch (e) {
      return res.status(e instanceof ProviderError && e.code === 'invalid-identifier' ? 400 : 503).json({ provider: 'psn', status: 'unavailable' });
    }
  };
  for (const resource of ['library', 'summary', 'presence']) {
    router.get('/' + resource, read((req, res) => {
      const body = service.read(resource);
      return res.status(['ready', 'stale'].includes(body.status) ? 200 : 503).json(body);
    }));
  }
  router.get('/games/:titleId', read((req, res) => {
    const result = service.game(req.params.titleId);
    return res.status(result.httpStatus).json(result.body);
  }));
  return router;
}

module.exports = { createPsnRouter };
