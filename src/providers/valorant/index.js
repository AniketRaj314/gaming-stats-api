const express = require('express');
const { version } = require('../../../package.json');
const stats = require('../../routes/valorant');
const docs = require('../../routes/docs');

function createValorantRouter({ auth, startTime }) {
  const router = express.Router();
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', version, uptime: Math.floor((Date.now() - startTime) / 1000) });
  });
  router.use('/stats', auth);
  router.use(stats);
  router.use(docs);
  return router;
}

module.exports = { createValorantRouter };
