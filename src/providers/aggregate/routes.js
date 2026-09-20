const express = require('express');

function createAggregateRouter({ service } = {}) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.get('/library', (req, res) => {
    const body = service.library();
    return res.status(body.status === 'unavailable' ? 503 : 200).json(body);
  });
  router.get('/now-playing', (req, res) => {
    const body = service.nowPlaying();
    return res.status(body.state === 'unknown' ? 503 : 200).json(body);
  });
  router.get('/games/:canonicalGameId', (req, res) => {
    const result = service.game(req.params.canonicalGameId);
    return res.status(result.httpStatus).json(result.body);
  });
  return router;
}

module.exports = { createAggregateRouter };
