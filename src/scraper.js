const { AGENT_DATA } = require('./agentData');
const { RANK_ICONS } = require('./rankIcons');
const { MAP_DATA } = require('./mapData');
const { log } = require('./logger');

const APIFY_ACTOR_URL =
  'https://api.apify.com/v2/acts/apify~playwright-scraper/run-sync-get-dataset-items';
const APIFY_TIMEOUT_MS = parseInt(process.env.APIFY_TIMEOUT_MS || '420000', 10);
const DEFAULT_APIFY_MEMORY_MB = 2048;

function getApifyMemoryMb() {
  const parsed = parseInt(process.env.APIFY_MEMORY_MB || `${DEFAULT_APIFY_MEMORY_MB}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_APIFY_MEMORY_MB;
}

// Each module defines:
//   waitFor      - CSS selector passed to page.waitForSelector() (runs in Node/Playwright context)
//   waitForState - optional state passed to page.waitForSelector(); defaults to "visible"
//   readyCheck   - optional JS predicate passed to page.waitForFunction() for content readiness
//   extract    - JS snippet passed to page.evaluate() — runs IN the browser, document is available
const MODULE_DEFINITIONS = {
  rank: {
    page: 'overview',
    playlist: 'competitive', // always use competitive URL — rank doesn't exist on other playlists
    waitFor: '.area-rating .rating-entry__rank-info .value',
    extract: `
      const currentEl = document.querySelector(
        '.area-rating .rating-summary__content:not(.rating-summary__content--secondary) .rating-entry__rank-info'
      );
      const peakEl = document.querySelector(
        '.area-rating .rating-summary__content--secondary .rating-entry__rank-info'
      );
      const currentIconEl = document.querySelector(
        '.area-rating .rating-summary__content:not(.rating-summary__content--secondary) .rating-entry__rank-icon img'
      );
      const peakIconEl = document.querySelector(
        '.area-rating .rating-summary__content--secondary .rating-entry__rank-icon img'
      );
      return {
        current: {
          rank: currentEl?.querySelector('.value')?.innerText?.trim(),
          icon: currentIconEl?.src
        },
        peak: {
          rank: peakEl?.querySelector('.value')?.innerText?.trim(),
          act: peakEl?.querySelector('.subtext')?.innerText?.trim(),
          icon: peakIconEl?.src
        }
      };
    `,
  },
  agents: {
    page: 'agents',
    // no playlist → dynamic (caller-supplied)
    waitFor: 'body',
    readyCheck: `
      () => {
        const text = document.body?.innerText ?? '';
        return /\\bAGENTS\\b/i.test(text) &&
          /\\b(?:Controller|Duelist|Initiator|Sentinel)\\b/i.test(text) &&
          /\\b\\d+(?:\\.\\d+)?\\s*(?:hrs?|hours?|mins?|minutes?)\\b/i.test(text);
      }
    `,
    extract: `
      const cleanLines = (value) => String(value ?? '')
        .split(/\\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const timePattern = /^\\d+(?:\\.\\d+)?\\s*(?:hrs?|hours?|mins?|minutes?)$/i;
      const rolePattern = /\\b(Controller|Duelist|Initiator|Sentinel)\\b/i;
      const percentPattern = /^-?\\d+(?:\\.\\d+)?%$/;
      const candidates = Array.from(document.querySelectorAll('img[alt]'));
      const results = [];
      const seen = new Set();

      candidates.forEach((image) => {
        const name = image.getAttribute('alt')?.trim();
        if (!name || seen.has(name)) return;

        let row = image.parentElement;
        let lines = [];
        let timeIndex = -1;
        for (let depth = 0; row && row !== document.body && depth < 12; depth += 1) {
          lines = cleanLines(row.innerText);
          timeIndex = lines.findIndex((line) => timePattern.test(line));
          const primaryStats = timeIndex >= 0 ? lines.slice(timeIndex, timeIndex + 9) : [];
          if (
            rolePattern.test(lines.slice(0, Math.max(timeIndex, 0)).join(' ')) &&
            primaryStats.length === 9 &&
            percentPattern.test(primaryStats[2]) &&
            percentPattern.test(primaryStats[7]) &&
            percentPattern.test(primaryStats[8])
          ) break;
          row = row.parentElement;
          timeIndex = -1;
        }

        if (!row || timeIndex < 0) return;
        const role = lines.slice(0, timeIndex).join(' ').match(rolePattern)?.[1];
        if (!role) return;
        const statValues = lines.slice(timeIndex, timeIndex + 9);
        seen.add(name);
        results.push({
          agent: name,
          role,
          timePlayed: statValues[0],
          matches: statValues[1],
          winRate: statValues[2],
          kd: statValues[3],
          adr: statValues[4],
          acs: statValues[5],
          ddDelta: statValues[6],
          hsPercent: statValues[7],
          kast: statValues[8],
        });
      });
      return results;
    `,
  },
  totalPlaytime: {
    page: 'performance',
    // no playlist → dynamic (caller-supplied, doesn't matter — shows everywhere)
    waitFor: 'body',
    readyCheck: `
      () => /Total\\s*Playtime[\\s\\S]{0,100}?[\\d,.]+\\s*(?:hrs?|hours?|mins?|minutes?)/i
        .test(document.body?.innerText ?? '')
    `,
    extract: `
      const match = (document.body?.innerText ?? '').match(
        /Total\\s*Playtime[\\s\\S]{0,100}?([\\d,.]+\\s*(?:hrs?|hours?|mins?|minutes?))/i
      );
      return {
        total: match?.[1]?.trim() ?? null
      };
    `,
  },
  maps: {
    page: 'maps',
    // no playlist → dynamic (caller-supplied)
    waitFor: 'body',
    readyCheck: `
      () => {
        const text = document.body?.innerText ?? '';
        return /\\bMAPS\\b/i.test(text) && /\\bWin\\s*%/i.test(text) &&
          /\\b(?:Wins|Losses|K\\/D|ADR|ACS)\\b/i.test(text);
      }
    `,
    extract: `
      const mapNames = __MAP_NAMES__;
      const agentNames = __AGENT_NAMES__;
      const cleanLines = (value) => String(value ?? '')
        .split(/\\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const percentPattern = /^-?\\d+(?:\\.\\d+)?%$/;
      const integerPattern = /^\\d[\\d,]*$/;
      const numberPattern = /^-?\\d[\\d,]*(?:\\.\\d+)?$/;
      const findStatsIndex = (lines) => {
        for (let index = 0; index <= lines.length - 6; index += 1) {
          if (
            percentPattern.test(lines[index]) &&
            integerPattern.test(lines[index + 1]) &&
            integerPattern.test(lines[index + 2]) &&
            numberPattern.test(lines[index + 3]) &&
            numberPattern.test(lines[index + 4]) &&
            numberPattern.test(lines[index + 5])
          ) return index;
        }
        return -1;
      };
      const results = [];
      const seen = new Set();

      mapNames.forEach((mapName) => {
        const image = Array.from(document.querySelectorAll('img[alt]'))
          .find((candidate) => candidate.getAttribute('alt')?.trim() === mapName);
        const textAnchor = image ?? Array.from(document.querySelectorAll('main *'))
          .find((candidate) => candidate.children.length === 0 && candidate.textContent?.trim() === mapName);
        if (!textAnchor) return;

        let row = textAnchor.parentElement;
        let lines = [];
        let statsIndex = -1;
        for (let depth = 0; row && row !== document.body && depth < 12; depth += 1) {
          lines = cleanLines(row.innerText);
          statsIndex = findStatsIndex(lines);
          if (statsIndex >= 0) break;
          row = row.parentElement;
        }
        if (!row || statsIndex < 0 || seen.has(mapName)) return;

        const topAgents = [];
        const topAgentSeen = new Set();
        Array.from(row.querySelectorAll('img[alt]')).forEach((agentImage) => {
          const name = agentImage.getAttribute('alt')?.trim();
          if (!agentNames.includes(name) || topAgentSeen.has(name)) return;
          let holder = agentImage.parentElement;
          let winRate = null;
          for (let depth = 0; holder && holder !== row && depth < 5; depth += 1) {
            winRate = cleanLines(holder.innerText).find((line) => percentPattern.test(line)) ?? null;
            if (winRate) break;
            holder = holder.parentElement;
          }
          topAgentSeen.add(name);
          topAgents.push({ agent: name, winRate });
        });
        const statValues = lines.slice(statsIndex, statsIndex + 6);
        seen.add(mapName);
        results.push({
          map: mapName,
          topAgents,
          winRate: statValues[0],
          wins: statValues[1],
          losses: statValues[2],
          kd: statValues[3],
          adr: statValues[4],
          acs: statValues[5],
        });
      });
      return results;
    `,
  },
};

/**
 * Build the Apify pageFunction string dynamically from the requested modules.
 * pageFunction runs in Node.js (Playwright context) — use page.waitForSelector()
 * and page.evaluate() to touch the DOM.
 */
function buildPageFunction(requestedModules) {
  const blocks = requestedModules
    .map((mod) => {
      const { waitFor, waitForState, readyCheck, extract } = MODULE_DEFINITIONS[mod];
      const resolvedExtract = extract
        .replace('__MAP_NAMES__', JSON.stringify(Object.keys(MAP_DATA)))
        .replace('__AGENT_NAMES__', JSON.stringify(Object.keys(AGENT_DATA)));
      return `
  log.info('Waiting for ${mod}...');
  await page.waitForSelector(${JSON.stringify(waitFor)}, {
    state: ${JSON.stringify(waitForState ?? 'visible')},
    timeout: 30000
  });
  ${
    readyCheck
      ? `await page.waitForFunction(${readyCheck}, { timeout: 45000 });`
      : ''
  }
  result[${JSON.stringify(mod)}] = await page.evaluate(() => {
    ${resolvedExtract}
  });
  log.info('${mod} done: ' + result[${JSON.stringify(mod)}]?.length + ' items');`;
    })
    .join('\n');

  return `async function pageFunction(context) {
  const { page, request, log } = context;
  const result = {};
${blocks}
  return result;
}`;
}

/**
 * Fire a single Apify call for one resolved playlist URL and the given modules.
 * Returns the cleaned result object (Apify metadata fields stripped).
 */
async function scrapeUrl(username, page, playlist, modules) {
  const token = process.env.APIFY_TOKEN;
  const encodedUsername = encodeURIComponent(username);
  const targetUrl = `https://tracker.gg/valorant/profile/riot/${encodedUsername}/${page}?platform=pc&playlist=${playlist}`;

  log('APIFY', `Calling Apify → ${page}/${playlist} [${modules.join(',')}] for ${username}`);
  const t0 = Date.now();

  const pageFunction = buildPageFunction(modules);

  // Matches the config that is confirmed to work on Apify
  const apifyInput = {
    startUrls: [{ url: targetUrl }],
    pageFunction,
    requestHandlerTimeoutSecs: 120,
    // Playwright / browser settings
    headless: true,
    launcher: 'chromium',
    useChrome: true,
    ignoreSslErrors: true,
    ignoreCorsAndCsp: true,
    // Page load behaviour
    waitUntil: 'domcontentloaded',
    closeCookieModals: true,
    // Asset filtering
    downloadCss: true,
    downloadMedia: false,
    excludes: [{ glob: '/**/*.{png,jpg,jpeg,pdf}' }],
    // Crawl scope
    respectRobotsTxtFile: false,
    keepUrlFragments: false,
    linkSelector: '',
    // Hooks — match the working config exactly
    preNavigationHooks:
      "[\n    async (crawlingContext, gotoOptions) => {\n        gotoOptions.waitUntil = 'domcontentloaded';\n    },\n]",
    postNavigationHooks:
      '[\n    async (crawlingContext) => {\n        const { page } = crawlingContext;\n    },\n]',
    // Proxy
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
    },
    // Logging
    browserLog: false,
    debugLog: false,
  };

  const memoryMb = getApifyMemoryMb();
  const url = `${APIFY_ACTOR_URL}?token=${token}&memory=${memoryMb}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apifyInput),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`Apify request failed: ${err.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Apify returned ${response.status}: ${text}`);
  }

  const items = await response.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(
      `Apify completed without a dataset item for ${username} (${page}/${playlist}) after ${elapsed}s`
    );
  }

  log('APIFY', `Done for ${username} (${page}/${playlist}) in ${elapsed}s`);

  // Strip Apify metadata fields (#error, #debug, etc.) from the result
  const item = items[0];
  const cleaned = Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('#')));
  for (const moduleName of modules) {
    const value = cleaned[moduleName];
    const valid = moduleName === 'totalPlaytime'
      ? Boolean(value?.total)
      : moduleName === 'agents' || moduleName === 'maps'
        ? Array.isArray(value) && value.length > 0
        : value !== undefined && value !== null;
    if (!valid) {
      throw new Error(
        `Apify returned an incomplete ${moduleName} result for ${username} (${page}/${playlist})`
      );
    }
  }
  return cleaned;
}

/**
 * Scrape Valorant stats for the given username, playlist, and modules.
 * Modules that declare a fixed `playlist` in MODULE_DEFINITIONS are fetched from
 * that page regardless of the caller's playlist. Modules are grouped by their
 * resolved playlist and fetched in parallel (one Apify call per unique URL).
 *
 * @param {string} username - Decoded Riot ID, e.g. "Spider31415#6921"
 * @param {string} callerPlaylist - "competitive" or "unrated" (caller-supplied)
 * @param {string[]} modules - Array of module names to fetch
 * @returns {Promise<Object|null>} - Keyed data object per module, or null if not found
 */
async function scrapeStats(username, callerPlaylist, modules) {
  if (!process.env.APIFY_TOKEN) throw new Error('APIFY_TOKEN is not set');

  // Group modules by their resolved {page}:{playlist} key
  const groups = new Map();
  for (const mod of modules) {
    const resolved = {
      page: MODULE_DEFINITIONS[mod].page,
      playlist: MODULE_DEFINITIONS[mod].playlist ?? callerPlaylist,
    };
    const key = `${resolved.page}:${resolved.playlist}`;
    if (!groups.has(key)) groups.set(key, { ...resolved, mods: [] });
    groups.get(key).mods.push(mod);
  }

  log('SCRAPE', `${username} — ${groups.size} Apify call(s): ${[...groups.keys()].join(', ')}`);

  // Fire one Apify call per unique URL in parallel
  const results = await Promise.all(
    Array.from(groups.values()).map(({ page, playlist, mods }) =>
      scrapeUrl(username, page, playlist, mods)
    )
  );

  // If every call returned null (404), signal not found
  if (results.every((r) => r === null)) return null;

  // Merge results from all calls (null slots are skipped)
  const merged = Object.assign({}, ...results.filter(Boolean));

  // Enrich agent entries with static data (icon, portrait, killfeedPortrait)
  if (Array.isArray(merged.agents)) {
    for (const entry of merged.agents) {
      const agentData = AGENT_DATA[entry.agent];
      entry.icon = agentData?.icon ?? null;
      entry.displayIconSmall = agentData?.displayIconSmall ?? null;
      entry.portrait = agentData?.portrait ?? null;
      entry.portraitV2 = agentData?.portraitV2 ?? null;
      entry.bustPortrait = agentData?.bustPortrait ?? null;
      entry.killfeedPortrait = agentData?.killfeedPortrait ?? null;
      entry.minimapPortrait = agentData?.minimapPortrait ?? null;
      entry.background = agentData?.background ?? null;
      entry.homeScreenPromoTileImage = agentData?.homeScreenPromoTileImage ?? null;
      entry.roleIcon = agentData?.roleIcon ?? null;
      entry.abilityIcons = agentData?.abilityIcons ?? [];
      // role is already scraped from the HTML
    }
    log('ENRICH', `${username} — enriched ${merged.agents.length} agent(s) with static data`);
  }

  // Enrich map entries with static data (displayIcon, splash) and top agent details
  if (Array.isArray(merged.maps)) {
    for (const entry of merged.maps) {
      const mapData = MAP_DATA[entry.map];
      entry.displayIcon = mapData?.displayIcon ?? null;
      entry.splash = mapData?.splash ?? null;
      entry.listViewIcon = mapData?.listViewIcon ?? null;
      entry.listViewIconTall = mapData?.listViewIconTall ?? null;
      entry.backgroundImage = mapData?.backgroundImage ?? null;
      entry.stylizedBackgroundImage = mapData?.stylizedBackgroundImage ?? null;
      entry.premierBackgroundImage = mapData?.premierBackgroundImage ?? null;
      for (const topAgent of entry.topAgents) {
        const agentData = AGENT_DATA[topAgent.agent];
        topAgent.icon = agentData?.icon ?? null;
        topAgent.displayIconSmall = agentData?.displayIconSmall ?? null;
        topAgent.portrait = agentData?.portrait ?? null;
        topAgent.portraitV2 = agentData?.portraitV2 ?? null;
        topAgent.bustPortrait = agentData?.bustPortrait ?? null;
        topAgent.killfeedPortrait = agentData?.killfeedPortrait ?? null;
        topAgent.minimapPortrait = agentData?.minimapPortrait ?? null;
        topAgent.background = agentData?.background ?? null;
        topAgent.homeScreenPromoTileImage = agentData?.homeScreenPromoTileImage ?? null;
        topAgent.roleIcon = agentData?.roleIcon ?? null;
        topAgent.abilityIcons = agentData?.abilityIcons ?? [];
        topAgent.role = agentData?.role ?? null;
      }
    }
    log('ENRICH', `${username} — enriched ${merged.maps.length} map(s) with static data`);
  }

  // Resolve rank icons from the API map
  if (merged.rank) {
    const cur = merged.rank.current;
    const peak = merged.rank.peak;
    if (cur?.rank) cur.icon = RANK_ICONS[cur.rank.toLowerCase()] ?? cur.icon ?? null;
    if (peak?.rank) peak.icon = RANK_ICONS[peak.rank.toLowerCase()] ?? peak.icon ?? null;
    log('ENRICH', `${username} — rank icons resolved (current=${cur?.rank}, peak=${peak?.rank})`);
  }

  return merged;
}

module.exports = { scrapeStats, MODULE_DEFINITIONS };
