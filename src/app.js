const express = require('express');
const { version } = require('../package.json');

const { requireApiKey, requireHeaderKey } = require('./shared/auth');
const { createValorantRouter } = require('./providers/valorant');
const { createPsnRouter } = require('./providers/psn/routes');
const { createSteamRouter } = require('./providers/steam/routes');
const { createEpicRouter } = require('./providers/epic/routes');
const { createPlayniteRouter } = require('./providers/playnite/routes');
const { createAggregateRouter } = require('./providers/aggregate/routes');
const { createAggregateService } = require('./providers/aggregate');
const { createGamingDocsRouter } = require('./routes/gamingDocs');
const { readSnapshot } = require('./snapshotStore');
const { TRACKED_USERNAMES } = require('./config');

function createApp({ startTime = Date.now(), validKeys = [], psnService = null, psnStatus = 'disabled', steamService = null,
  steamStatus = 'disabled', epicService = null, epicStatus = 'disabled', playniteService = null,
  playniteStatus = 'disabled', playniteUploadKeys = [], aggregateService = null,
  trackedUsernames = TRACKED_USERNAMES, readValorantSnapshot = readSnapshot } = {}) {
  const app = express();
  const auth = requireApiKey(validKeys);
  const playniteUploadAuth = requireHeaderKey(playniteUploadKeys, 'x-playnite-key', 'Invalid or missing Playnite upload key');

  app.use(express.json({ limit: '4mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version, uptime: Math.floor((Date.now() - startTime) / 1000) });
  });

  app.use(createGamingDocsRouter());

  // Both mounts use the same router and snapshots. The old mount remains during
  // frontend migration; serving it directly also preserves POST request bodies.
  const valorant = createValorantRouter({ auth, startTime });
  app.use('/custom/valorant', valorant);
  app.use('/valorant', valorant);
  app.use('/psn', auth, createPsnRouter({ service: psnService, unavailableStatus: psnStatus }));
  app.use('/steam', auth, createSteamRouter({ service: steamService, unavailableStatus: steamStatus }));
  app.use('/epic', auth, createEpicRouter({ service: epicService, unavailableStatus: epicStatus }));
  app.use('/playnite', createPlayniteRouter({ service: playniteService, readAuth: auth,
    uploadAuth: playniteUploadAuth, unavailableStatus: playniteStatus }));
  const aggregate = aggregateService || createAggregateService({ steamService, steamStatus, psnService, psnStatus,
    epicService, epicStatus, playniteService, playniteStatus, trackedUsernames, readValorantSnapshot });
  app.use('/aggregate', auth, createAggregateRouter({ service: aggregate }));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

module.exports = { createApp };
