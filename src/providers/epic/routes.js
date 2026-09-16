const express = require('express');
const { ProviderError } = require('../../shared/providerError');

function createEpicRouter({ service, unavailableStatus = 'disabled' } = {}) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const read = fn => (req, res) => {
    if (!service) return res.status(503).json({ schemaVersion: 1, provider: 'epic', accountRef: 'owner', status: unavailableStatus });
    try { return fn(req, res); }
    catch (error) {
      const status = error instanceof ProviderError && error.code === 'invalid-identifier' ? 400 : 503;
      return res.status(status).json({ provider: 'epic', status: status === 400 ? 'invalid-request' : 'unavailable' });
    }
  };
  router.get('/library', read((req, res) => {
    const body = service.read();
    return res.status(['ready', 'stale'].includes(body.status) ? 200 : 503).json(body);
  }));
  router.get('/games/:gameId', read((req, res) => {
    const result = service.game(req.params.gameId);
    return res.status(result.httpStatus).json(result.body);
  }));
  return router;
}

module.exports = { createEpicRouter };
