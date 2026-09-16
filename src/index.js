require('dotenv').config();
const { ENABLE_AUTO_REFRESH, REFRESH_INTERVAL_HOURS, TRACKED_USERNAMES } = require('./config');
const { createApp } = require('./app');
const { initAgentData } = require('./agentData');
const { initRankIcons } = require('./rankIcons');
const { initMapData } = require('./mapData');
const { initPlayerCardData } = require('./playerCardData');
const { initPlayerTitleData } = require('./playerTitleData');
const { startAutoRefreshScheduler } = require('./autoRefresh');
const { log } = require('./logger');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Auth middleware — only guards stats routes
const VALID_KEYS = new Set(
  (process.env.API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean)
);
let psnService = null;
let psnStatus = 'disabled';
let stopPsn = null;
if (/^(true|1|yes|on)$/i.test(process.env.ENABLE_PSN || '')) {
  try {
    const { createPsnProvider } = require('./providers/psn');
    psnService = createPsnProvider({ report: message => log('PSN', message) }).service;
  } catch (error) {
    const { safeError } = require('./shared/providerError');
    psnStatus = 'unavailable';
    log('PSN', safeError(error));
  }
}
let steamService = null;
let steamStatus = 'disabled';
let stopSteam = null;
if (/^(true|1|yes|on)$/i.test(process.env.ENABLE_STEAM || '')) {
  try {
    const { createSteamProvider } = require('./providers/steam');
    steamService = createSteamProvider({ report: message => log('STEAM', message) }).service;
  } catch (error) {
    const { safeError } = require('./shared/providerError');
    steamStatus = 'unavailable';
    log('STEAM', safeError(error));
  }
}
const app = createApp({ startTime: Date.now(), validKeys: [...VALID_KEYS], psnService, psnStatus, steamService, steamStatus });

(async () => {
  log(
    'CONFIG',
    `Boot config | trackedUsers=${TRACKED_USERNAMES.length} | autoRefresh=${ENABLE_AUTO_REFRESH} | refreshIntervalHours=${REFRESH_INTERVAL_HOURS}`
  );
  if (VALID_KEYS.size === 0) {
    throw new Error('API_KEYS must be configured before starting the server');
  }
  app.listen(PORT, HOST, () => log('INIT', `Server listening on ${HOST}:${PORT}`));
  if (psnService) stopPsn = psnService.start();
  if (steamService) stopSteam = steamService.start();
  if (TRACKED_USERNAMES.length === 0) {
    log('WARN', 'No tracked users configured; API will return 404 for all usernames until TRACKED_USERNAMES is set');
  } else {
    log('CONFIG', `Tracked usernames: ${TRACKED_USERNAMES.join(', ')}`);
  }
  log('INIT', 'Loading static data (agents, rank icons, maps, player cards, player titles)...');
  await Promise.all([initAgentData(), initRankIcons(), initMapData(), initPlayerCardData(), initPlayerTitleData()]);
  log('INIT', 'Static data loaded');
  if (ENABLE_AUTO_REFRESH) {
    log('DECISION', 'Auto refresh is enabled; starting in-process scheduler');
    startAutoRefreshScheduler();
  } else {
    log('DECISION', 'Auto refresh is disabled; background scheduler will not start');
    log('AUTOREFRESH', 'Automatic refresh scheduler disabled');
  }
})().catch((error) => {
  log('ERROR', `Fatal startup error: ${error.stack || error.message}`);
  process.exit(1);
});

process.once('SIGTERM', () => { stopPsn?.(); stopSteam?.(); process.exit(0); });
