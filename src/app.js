const express = require('express');
const { version } = require('../package.json');

const { requireApiKey } = require('./shared/auth');
const { createValorantRouter } = require('./providers/valorant');

function createApp({ startTime = Date.now(), validKeys = [] } = {}) {
  const app = express();
  const auth = requireApiKey(validKeys);

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version, uptime: Math.floor((Date.now() - startTime) / 1000) });
  });

  // Both mounts use the same router and snapshots. The old mount remains during
  // frontend migration; serving it directly also preserves POST request bodies.
  const valorant = createValorantRouter({ auth, startTime });
  app.use('/custom/valorant', valorant);
  app.use('/valorant', valorant);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

module.exports = { createApp };
