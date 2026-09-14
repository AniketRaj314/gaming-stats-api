const { scrapeStats } = require('./scraper');
const { writeSnapshot, readSnapshot } = require('./snapshotStore');
const { formatDuration, log } = require('./logger');

const REFRESH_STEPS = [
  { key: 'competitiveAgents', playlist: 'competitive', modules: ['agents'] },
  { key: 'competitiveMaps', playlist: 'competitive', modules: ['maps'] },
  { key: 'sharedPlaytime', playlist: 'competitive', modules: ['totalPlaytime'] },
  { key: 'unratedAgents', playlist: 'unrated', modules: ['agents'] },
  { key: 'unratedMaps', playlist: 'unrated', modules: ['maps'] },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function preferFreshArray(fresh, previous) {
  if (Array.isArray(fresh) && fresh.length > 0) return fresh;
  if (Array.isArray(previous) && previous.length > 0) return previous;
  return Array.isArray(fresh) ? fresh : [];
}

function preferFreshTotalPlaytime(fresh, previous) {
  if (fresh?.total) return fresh;
  if (previous?.total) return previous;
  return fresh ?? previous ?? null;
}

async function refreshUserSnapshot(username) {
  log('REFRESH', `Starting snapshot refresh for ${username}`);
  const previous = readSnapshot(username);
  const staggerMs = parseInt(process.env.REFRESH_STAGGER_MS || '5000', 10);
  log('CONFIG', `${username} | refresh steps=${REFRESH_STEPS.length} | staggerMs=${staggerMs}`);
  const results = {};

  for (const [index, step] of REFRESH_STEPS.entries()) {
    log('DECISION', `${username} | step ${index + 1}/${REFRESH_STEPS.length} → ${step.modules.join(',')} (${step.playlist})`);
    if (index > 0 && staggerMs > 0) {
      log('REFRESH', `Waiting ${formatDuration(staggerMs)} before ${step.modules.join(',')} (${step.playlist})`);
      await delay(staggerMs);
    }
    results[step.key] = await scrapeStats(username, step.playlist, step.modules);
    log('REFRESH', `${username} | finished ${step.modules.join(',')} (${step.playlist})`);
  }

  const refreshedAt = new Date().toISOString();
  const snapshot = {
    username,
    status: 'ok',
    lastRefreshedAt: refreshedAt,
    sources: {
      ...(previous?.sources ?? {}),
      tracker: {
        status: 'ok',
        lastRefreshedAt: refreshedAt,
      },
    },
    data: {
      ...(previous?.data?.profile ? { profile: previous.data.profile } : {}),
      competitive: {
        rank: previous?.data?.competitive?.rank ?? null,
        agents: preferFreshArray(results.competitiveAgents?.agents, previous?.data?.competitive?.agents),
        maps: preferFreshArray(results.competitiveMaps?.maps, previous?.data?.competitive?.maps),
      },
      unrated: {
        agents: preferFreshArray(results.unratedAgents?.agents, previous?.data?.unrated?.agents),
        maps: preferFreshArray(results.unratedMaps?.maps, previous?.data?.unrated?.maps),
      },
      shared: {
        totalPlaytime: preferFreshTotalPlaytime(
          results.sharedPlaytime?.totalPlaytime,
          previous?.data?.shared?.totalPlaytime
        ),
      },
    },
  };

  writeSnapshot(username, snapshot);
  log('REFRESH', `Snapshot refresh complete for ${username} at ${snapshot.lastRefreshedAt}`);
  return snapshot;
}

async function refreshTrackedUsers(usernames, { continueOnError = true } = {}) {
  log('REFRESH', `Refreshing ${usernames.length} tracked user(s) | continueOnError=${continueOnError}`);
  const results = [];

  for (const username of usernames) {
    log('DECISION', `Starting refresh cycle for ${username}`);
    try {
      const snapshot = await refreshUserSnapshot(username);
      results.push({ username, ok: true, snapshot });
      log('REFRESH', `Refresh cycle succeeded for ${username}`);
    } catch (err) {
      log('ERROR', `Snapshot refresh failed for ${username}: ${err.message}`);

      const previous = readSnapshot(username);
      if (previous) {
        log('DECISION', `Existing snapshot found for ${username}; marking it stale`);
        previous.status = 'stale';
        previous.lastRefreshError = err.message;
        previous.lastRefreshAttemptAt = new Date().toISOString();
        writeSnapshot(username, previous);
      } else {
        log('DECISION', `No previous snapshot exists for ${username}; nothing to mark stale`);
      }

      const result = { username, ok: false, error: err.message };
      results.push(result);
      if (!continueOnError) throw err;
    }
  }

  return results;
}

module.exports = { refreshUserSnapshot, refreshTrackedUsers };
