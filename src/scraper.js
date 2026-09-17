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
    waitFor: '.st-content__item',
    waitForState: 'attached',
    readyCheck: `
      () => {
        const names = document.querySelectorAll(
          '.st-content__item .st__item--sticky.st__item--wide.agent-row .info .value'
        );
        return Array.from(names).some((node) => node.textContent?.trim());
      }
    `,
    extract: `
      const rows = document.querySelectorAll('.st-content__item');
      const results = [];
      rows.forEach(row => {
        const nameEl   = row.querySelector('.st__item--sticky.st__item--wide.agent-row .info .value');
        if (!nameEl) return;
        const roleEl   = row.querySelector('.st__item--sticky.st__item--wide.agent-row .info .label');
        const statEls  = row.querySelectorAll(
          '.st-content__item-value:not(.st__item--sticky):not(.st__item--expand) .info .value'
        );
        results.push({
          agent:      nameEl?.innerText?.trim(),
          role:       roleEl?.innerText?.trim(),
          timePlayed: statEls[0]?.innerText?.trim(),
          matches:    statEls[1]?.innerText?.trim(),
          winRate:    statEls[2]?.innerText?.trim(),
          kd:         statEls[3]?.innerText?.trim(),
          adr:        statEls[4]?.innerText?.trim(),
          acs:        statEls[5]?.innerText?.trim(),
          ddDelta:    statEls[6]?.innerText?.trim(),
          hsPercent:  statEls[7]?.innerText?.trim(),
          kast:       statEls[8]?.innerText?.trim(),
        });
      });
      return results;
    `,
  },
  totalPlaytime: {
    page: 'performance',
    // no playlist → dynamic (caller-supplied, doesn't matter — shows everywhere)
    waitFor: '.playtime-summary .value',
    extract: `
      return {
        total: document.querySelector('.playtime-summary .value')?.innerText?.trim()
      };
    `,
  },
  maps: {
    page: 'maps',
    // no playlist → dynamic (caller-supplied)
    waitFor: '.st-content__item',
    extract: `
      const rows = document.querySelectorAll('.st-content__item');
      const results = [];
      rows.forEach(row => {
        const nameEl = row.querySelector('.st__item--sticky.st__item--wide .info .value');
        if (!nameEl) return;
        const agentEls = row.querySelectorAll('.rounded-md.flex-col.overflow-hidden');
        const topAgents = [];
        agentEls.forEach(el => {
          const name = el.querySelector('img')?.alt?.trim();
          const winRate = el.querySelector('.text-10')?.innerText?.trim();
          if (name) topAgents.push({ agent: name, winRate: winRate ?? null });
        });
        const statEls = row.querySelectorAll(
          '.st-content__item-value:not(.st__item--sticky):not(.st__item--expand) .info .value'
        );
        results.push({
          map:     nameEl?.innerText?.trim(),
          topAgents,
          winRate: statEls[0]?.innerText?.trim(),
          wins:    statEls[1]?.innerText?.trim(),
          losses:  statEls[2]?.innerText?.trim(),
          kd:      statEls[3]?.innerText?.trim(),
          adr:     statEls[4]?.innerText?.trim(),
          acs:     statEls[5]?.innerText?.trim(),
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
    ${extract}
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
 * Returns the cleaned result object (Apify metadata fields stripped), or null on 404.
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
    log('APIFY', `No data returned for ${username} (${page}/${playlist}) after ${elapsed}s`);
    return null; // signals 404
  }

  log('APIFY', `Done for ${username} (${page}/${playlist}) in ${elapsed}s`);

  // Strip Apify metadata fields (#error, #debug, etc.) from the result
  const item = items[0];
  return Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('#')));
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
