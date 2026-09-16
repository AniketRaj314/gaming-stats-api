'use strict';

const express = require('express');
const { version } = require('../../package.json');
const { ENABLE_AUTO_REFRESH, REFRESH_INTERVAL_HOURS, TRACKED_USERNAMES } = require('../config');

const router = express.Router();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTrackedListMarkdown() {
  return TRACKED_USERNAMES.length
    ? TRACKED_USERNAMES.map((username) => `- ${username}`).join('\n')
    : '- none configured';
}

function buildTrackedListHtml() {
  return TRACKED_USERNAMES.length
    ? TRACKED_USERNAMES.map((username) => `<li><code>${escapeHtml(username)}</code></li>`).join('')
    : '<li><code>none configured</code></li>';
}

function buildLlmsTxt(baseUrl) {
  const trackedList = buildTrackedListMarkdown();
  const sampleUsername = TRACKED_USERNAMES[0] || 'PlayerName#TAG';
  const encodedSampleUsername = encodeURIComponent(sampleUsername);

  return `# Gaming Stats API — Valorant

> A reusable, self-hostable Valorant stats API for tracked Riot IDs.

Base URL: ${baseUrl}
Version: ${version}

## What it does
- refreshes tracked stats from tracker.gg through Apify
- refreshes profile data from HenrikDev and enriches card/title assets with Valorant API
- stores one snapshot per tracked Riot ID on disk
- serves cached snapshot data through an authenticated API
- never scrapes tracker.gg during request handling

## Authentication
All ${baseUrl}/stats routes require an API key in the X-API-Key request header.

Example:
  X-API-Key: your-key-here

Missing or invalid key returns:
  401 { "error": "Invalid or missing API key" }

## Tracked usernames
Only configured Riot IDs are available.

Tracked usernames:
${trackedList}

If a user is not configured:
  404 { "error": "User not tracked" }

If a tracked user does not have a snapshot yet:
  404 { "error": "Tracked user has no cached snapshot yet" }

## Request model
Endpoint:
  POST /stats/:username

Path parameter:
  username = URL-encoded Riot ID
  Example: ${encodedSampleUsername}

Body shape:
{
  "playlist": "competitive",
  "modules": {
    "profile": {},
    "agents": {},
    "maps": { "playlist": "unrated", "limit": 3 },
    "rank": {},
    "totalPlaytime": {}
  }
}

Rules:
- playlist must be competitive or unrated
- modules is required and must be an object
- valid modules are profile, rank, agents, maps, totalPlaytime
- profile is not playlist-scoped
- rank is Henrik-backed and is returned from the competitive response branch for compatibility
- totalPlaytime always comes from the shared snapshot
- limit must be a positive integer

## Response shape
{
  "username": "${sampleUsername}",
  "playlist": "competitive",
  "cachedAt": "2026-05-19T10:00:00.000Z",
  "nextRefreshAt": "2026-05-21T10:00:00.000Z",
  "status": "ok",
  "sources": {
    "henrik": {
      "status": "ok",
      "lastRefreshedAt": "2026-05-20T12:15:00.000Z"
    }
  },
  "data": {
    "profile": {
      "accountLevel": 514,
      "region": "ap",
      "card": {
        "id": "67d7faa4-4b40-e16a-1c54-0f9b41919849",
        "name": "VCT x SEN Card",
        "displayIcon": "https://...",
        "smallArt": "https://...",
        "wideArt": "https://...",
        "largeArt": "https://..."
      },
      "title": {
        "id": "ae54c1ce-42b9-3dc1-5e91-6c9e9161b01a",
        "name": "Gnarly Title",
        "displayText": "Gnarly"
      }
    },
    "rank": {},
    "agents": [],
    "maps": [],
    "totalPlaytime": {}
  }
}

## Refresh model
- default refresh interval: ${REFRESH_INTERVAL_HOURS} hours
- built-in scheduler enabled: ${ENABLE_AUTO_REFRESH ? 'yes' : 'no'}
- tracker refresh command: npm run refresh:snapshots
- Henrik profile/rank refresh command: npm run refresh:profiles

## Player visibility requirement
Tracked players need a public tracker.gg profile, or their stats cannot be scraped.

Current verified flow:
1. Open an incognito/private browser window.
2. Sign in to the correct Riot account.
3. Open your Valorant profile on tracker.gg.
4. Check “I acknowledge signing in makes my profile public to all users”.
5. Click “Sign in with Riot”.
6. Enter credentials manually and finish the flow.
`.trimEnd();
}

function buildExampleBlock({ id, title, curl, js, payloadNote }) {
  return `
    <section class="example-block">
      <div class="example-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${payloadNote ? `<p>${escapeHtml(payloadNote)}</p>` : ''}
        </div>
        <div class="toggle" role="tablist" aria-label="${escapeHtml(title)} example format">
          <button type="button" class="toggle__btn is-active" data-example="${escapeHtml(id)}" data-lang="curl">cURL</button>
          <button type="button" class="toggle__btn" data-example="${escapeHtml(id)}" data-lang="js">JavaScript</button>
        </div>
      </div>
      <pre class="code code--active" data-example-panel="${escapeHtml(id)}" data-lang="curl"><code>${escapeHtml(curl)}</code></pre>
      <pre class="code" data-example-panel="${escapeHtml(id)}" data-lang="js"><code>${escapeHtml(js)}</code></pre>
    </section>
  `;
}

function buildDocsHtml(baseUrl) {
  const trackedHtml = buildTrackedListHtml();
  const sampleUsername = TRACKED_USERNAMES[0] || 'PlayerName#TAG';
  const encodedSampleUsername = encodeURIComponent(sampleUsername);
  const statsUrl = `${baseUrl}/stats/${encodedSampleUsername}`;
  const docsUrl = `${baseUrl}/docs`;
  const healthUrl = `${baseUrl}/health`;
  const llmsUrl = `${baseUrl}/llms.txt`;

  const exampleBlocks = [
    buildExampleBlock({
      id: 'profile-basic',
      title: 'Player profile',
      payloadNote: 'Profile returns account level, region, player card assets, and title display text.',
      curl: `curl -X POST '${statsUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: your-api-key' \\
  -d '{
    "modules": {
      "profile": {}
    }
  }'`,
      js: `const response = await fetch('${statsUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    modules: {
      profile: {}
    }
  })
});

const data = await response.json();`,
    }),
    buildExampleBlock({
      id: 'agents-basic',
      title: 'Basic request: competitive agents',
      payloadNote: 'Use the top-level playlist when all requested modules come from the same playlist.',
      curl: `curl -X POST '${statsUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: your-api-key' \\
  -d '{
    "playlist": "competitive",
    "modules": {
      "agents": {}
    }
  }'`,
      js: `const response = await fetch('${statsUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    playlist: 'competitive',
    modules: {
      agents: {}
    }
  })
});

const data = await response.json();`,
    }),
    buildExampleBlock({
      id: 'multiple-modules',
      title: 'Multiple modules in one request',
      payloadNote: 'You can request profile, rank, agents, maps, and shared total playtime together.',
      curl: `curl -X POST '${statsUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: your-api-key' \\
  -d '{
    "playlist": "competitive",
    "modules": {
      "profile": {},
      "rank": {},
      "agents": {},
      "maps": {},
      "totalPlaytime": {}
    }
  }'`,
      js: `const response = await fetch('${statsUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    playlist: 'competitive',
    modules: {
      profile: {},
      rank: {},
      agents: {},
      maps: {},
      totalPlaytime: {}
    }
  })
});

const data = await response.json();`,
    }),
    buildExampleBlock({
      id: 'mixed-playlists',
      title: 'Mixed playlists in one request',
      payloadNote: 'Override the top-level playlist per module when you want to mix competitive and unrated data.',
      curl: `curl -X POST '${statsUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: your-api-key' \\
  -d '{
    "playlist": "competitive",
    "modules": {
      "agents": { "playlist": "unrated" },
      "maps": { "playlist": "competitive" },
      "totalPlaytime": {}
    }
  }'`,
      js: `const response = await fetch('${statsUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    playlist: 'competitive',
    modules: {
      agents: { playlist: 'unrated' },
      maps: { playlist: 'competitive' },
      totalPlaytime: {}
    }
  })
});

const data = await response.json();`,
    }),
    buildExampleBlock({
      id: 'limits',
      title: 'Trim array results with limit',
      payloadNote: 'Limit only affects array modules such as agents and maps.',
      curl: `curl -X POST '${statsUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: your-api-key' \\
  -d '{
    "playlist": "competitive",
    "modules": {
      "agents": { "limit": 3 },
      "maps": { "limit": 5 }
    }
  }'`,
      js: `const response = await fetch('${statsUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    playlist: 'competitive',
    modules: {
      agents: { limit: 3 },
      maps: { limit: 5 }
    }
  })
});

const data = await response.json();`,
    }),
    buildExampleBlock({
      id: 'unrated-default',
      title: 'Use unrated as the default playlist',
      payloadNote: 'This keeps the payload shorter when most modules should use unrated data.',
      curl: `curl -X POST '${statsUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: your-api-key' \\
  -d '{
    "playlist": "unrated",
    "modules": {
      "agents": {},
      "maps": {},
      "rank": {},
      "totalPlaytime": {}
    }
  }'`,
      js: `const response = await fetch('${statsUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    playlist: 'unrated',
    modules: {
      agents: {},
      maps: {},
      rank: {},
      totalPlaytime: {}
    }
  })
});

const data = await response.json();`,
    }),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gaming Stats API — Valorant Docs</title>
  <style>
    :root {
      --bg: #0d1016;
      --panel: #151a23;
      --panel-2: #1d2430;
      --panel-3: #242d3c;
      --text: #edf2f7;
      --muted: #9fb0c6;
      --border: #2f3a4d;
      --accent: #ff4655;
      --accent-soft: rgba(255, 70, 85, 0.12);
      --good: #50c878;
      --code: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --sans: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      --shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top right, rgba(255, 70, 85, 0.14), transparent 24%),
        linear-gradient(180deg, #0d1016 0%, #111723 100%);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.6;
    }
    a { color: var(--text); }
    code, pre { font-family: var(--code); }
    .wrap {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 64px;
    }
    .hero {
      background: rgba(21, 26, 35, 0.92);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 28px;
      box-shadow: var(--shadow);
      overflow: hidden;
      position: relative;
    }
    .hero::after {
      content: '';
      position: absolute;
      inset: auto -80px -80px auto;
      width: 240px;
      height: 240px;
      background: radial-gradient(circle, rgba(255, 70, 85, 0.22), transparent 65%);
      pointer-events: none;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 70, 85, 0.35);
      background: var(--accent-soft);
      color: #ffd6da;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      margin: 0 0 12px;
      line-height: 1.15;
    }
    h1 { font-size: clamp(34px, 5vw, 56px); max-width: 720px; }
    h2 { font-size: 26px; margin-top: 0; }
    h3 { font-size: 19px; }
    p, li { color: var(--muted); }
    .hero-copy {
      max-width: 760px;
      font-size: 17px;
    }
    .hero-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 22px;
    }
    .link-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: var(--panel-2);
      border: 1px solid var(--border);
      text-decoration: none;
    }
    .grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      margin-top: 18px;
    }
    .card, .section {
      background: rgba(21, 26, 35, 0.92);
      border: 1px solid var(--border);
      border-radius: 22px;
      box-shadow: var(--shadow);
    }
    .card {
      padding: 22px;
    }
    .section {
      padding: 26px;
      margin-top: 18px;
    }
    .stat-list, .plain-list {
      margin: 0;
      padding-left: 18px;
    }
    .muted {
      color: var(--muted);
    }
    .good {
      color: var(--good);
      font-weight: 600;
    }
    .code {
      margin: 0;
      padding: 16px;
      background: #0f141d;
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: auto;
      display: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .code--active {
      display: block;
    }
    .inline-code {
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--panel-3);
      border: 1px solid var(--border);
      font-family: var(--code);
      font-size: 0.95em;
    }
    .example-block {
      margin-top: 22px;
    }
    .example-head {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .toggle {
      display: inline-flex;
      background: var(--panel-2);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px;
      gap: 4px;
    }
    .toggle__btn {
      border: 0;
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }
    .toggle__btn.is-active {
      background: var(--accent);
      color: white;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th { color: var(--text); }
    .note {
      border-left: 3px solid var(--accent);
      padding: 12px 14px;
      background: rgba(255, 70, 85, 0.08);
      border-radius: 0 14px 14px 0;
      margin-top: 14px;
    }
    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 14px;
    }
    @media (max-width: 720px) {
      .wrap { width: min(100% - 20px, 1120px); padding-top: 20px; }
      .hero, .card, .section { border-radius: 18px; }
      .section { padding: 20px; }
      .hero { padding: 22px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="eyebrow">Self-hostable • Snapshot-backed • Authenticated</div>
      <h1>Gaming Stats API — Valorant</h1>
      <p class="muted"><strong>Version:</strong> <span class="inline-code">${escapeHtml(version)}</span></p>
      <p class="hero-copy">
        A reusable API for tracked Riot IDs that refreshes stats through Apify, enriches profile data through HenrikDev and Valorant API, stores snapshots on disk, and serves clean cached responses to your app, site, or dashboard.
      </p>
      <p class="hero-copy">
        This project is built for people who want stable stats responses, predictable hosting, and a simple setup without adding a database on day one.
      </p>
      <div class="hero-links">
        <a class="link-chip" href="${escapeHtml(baseUrl)}">Base URL: ${escapeHtml(baseUrl)}</a>
        <a class="link-chip" href="${escapeHtml(healthUrl)}">Health: ${escapeHtml(healthUrl)}</a>
        <a class="link-chip" href="${escapeHtml(llmsUrl)}">LLMs.txt</a>
        <a class="link-chip" href="https://github.com/AniketRaj314/valorant-stats-api" target="_blank" rel="noreferrer">GitHub repository</a>
      </div>
    </section>

    <div class="grid">
      <section class="card">
        <h3>Tracked players</h3>
        <ul class="plain-list">${trackedHtml}</ul>
        <p>Only configured Riot IDs are available. Unknown users return <span class="inline-code">404 User not tracked</span>.</p>
      </section>
      <section class="card">
        <h3>Authentication</h3>
        <p>All <span class="inline-code">${escapeHtml(baseUrl)}/stats</span> routes require <span class="inline-code">X-API-Key</span>.</p>
        <pre class="code code--active"><code>X-API-Key: your-api-key</code></pre>
        <p>API keys are mandatory by design so accidental public deployments do not fail open.</p>
      </section>
      <section class="card">
        <h3>Refresh model</h3>
        <p>Snapshots refresh every <span class="inline-code">${REFRESH_INTERVAL_HOURS}h</span> by default.</p>
        <p>Built-in scheduler: <span class="good">${ENABLE_AUTO_REFRESH ? 'enabled' : 'disabled'}</span></p>
        <p>Tracker refresh command: <span class="inline-code">npm run refresh:snapshots</span></p>
        <p>Henrik profile/rank refresh command: <span class="inline-code">npm run refresh:profiles</span></p>
        <p>Henrik refreshes are separate so you can update account/card/title/rank data without rerunning the slower tracker.gg scrape.</p>
      </section>
    </div>

    <section class="section">
      <h2>Request Shape</h2>
      <p>
        Endpoint: <span class="inline-code">POST /stats/:username</span><br>
        Sample path: <span class="inline-code">POST /stats/${escapeHtml(encodedSampleUsername)}</span>
      </p>
      <pre class="code code--active"><code>{
  "playlist": "competitive",
  "modules": {
    "profile": {},
    "rank": {},
    "agents": {},
    "maps": { "playlist": "unrated", "limit": 3 },
    "totalPlaytime": {}
  }
}</code></pre>
      <div class="note">
        <strong>Rules:</strong> <span class="muted">top-level <span class="inline-code">playlist</span> must be <span class="inline-code">competitive</span> or <span class="inline-code">unrated</span>. <span class="inline-code">modules</span> is required. Each module config must be an object. <span class="inline-code">profile</span> is not playlist-scoped, <span class="inline-code">rank</span> is Henrik-backed and returned from the competitive branch for compatibility, and <span class="inline-code">totalPlaytime</span> always comes from shared data.</span>
      </div>
    </section>

    <section class="section">
      <h2>Examples</h2>
      <p>Use these as copy-paste starters. Every example below is shown in both cURL and JavaScript.</p>
      ${exampleBlocks}
    </section>

    <section class="section">
      <h2>Response Shape</h2>
      <pre class="code code--active"><code>{
  "username": "${escapeHtml(sampleUsername)}",
  "playlist": "competitive",
  "cachedAt": "2026-05-19T10:00:00.000Z",
  "nextRefreshAt": "2026-05-21T10:00:00.000Z",
  "status": "ok",
  "sources": {
    "henrik": {
      "status": "ok",
      "lastRefreshedAt": "2026-05-20T12:15:00.000Z"
    }
  },
  "data": {
    "profile": {
      "accountLevel": 514,
      "region": "ap",
      "card": {
        "id": "67d7faa4-4b40-e16a-1c54-0f9b41919849",
        "name": "VCT x SEN Card",
        "displayIcon": "https://...",
        "smallArt": "https://...",
        "wideArt": "https://...",
        "largeArt": "https://..."
      },
      "title": {
        "id": "ae54c1ce-42b9-3dc1-5e91-6c9e9161b01a",
        "name": "Gnarly Title",
        "displayText": "Gnarly"
      }
    },
    "agents": [
      {
        "agent": "Omen",
        "role": "Controller",
        "timePlayed": "58 hrs",
        "matches": "98",
        "winRate": "53.1%",
        "kd": "1.05",
        "adr": "143.3",
        "acs": "222.3",
        "ddDelta": "+8",
        "hsPercent": "17.8%",
        "kast": "71.7%",
        "icon": "https://...",
        "portrait": "https://...",
        "killfeedPortrait": "https://..."
      }
    ]
  }
}</code></pre>
    </section>

    <section class="section">
      <h2>Error Behavior</h2>
      <table>
        <thead>
          <tr><th>Status</th><th>When it happens</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="inline-code">400</span></td><td>Malformed username encoding, invalid playlist, invalid module name, invalid module config, or invalid limit</td></tr>
          <tr><td><span class="inline-code">401</span></td><td>Missing or invalid API key</td></tr>
          <tr><td><span class="inline-code">404</span></td><td>User not tracked, snapshot missing, or requested cached module unavailable</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Profile Visibility Requirement</h2>
      <p>
        For this API to track a player, that player’s tracker.gg profile needs to be public. If the profile stays private, the refresh job will not be able to collect the data your API serves.
      </p>
      <p>
        Based on current Tracker Network support guidance, the most reliable flow is:
      </p>
      <ol class="plain-list">
        <li>Open an incognito/private browser window.</li>
        <li>Sign in to the correct Riot account, and if needed the correct Tracker Network account.</li>
        <li>Open your own Valorant profile page on tracker.gg.</li>
        <li>Check the box that says <span class="inline-code">I acknowledge signing in makes my profile public to all users</span>.</li>
        <li>Click <span class="inline-code">Sign in with Riot</span>.</li>
        <li>Enter credentials manually instead of relying on browser auto sign-in.</li>
        <li>Finish the sign-in flow and return to your now-public profile page.</li>
      </ol>
      <div class="note">
        <strong>Common gotchas:</strong> <span class="muted">multiple Riot accounts in one browser session, browser auto sign-in choosing the wrong account, and assuming that signing into your own account will reveal someone else’s private profile.</span>
      </div>
      <div class="footer-links">
        <a class="link-chip" href="https://feedback.tracker.gg/t/cant-make-my-account-public/59367/2" target="_blank" rel="noreferrer">Tracker support: make profile public</a>
        <a class="link-chip" href="https://feedback.tracker.gg/t/cannot-link-valorant-account/57359" target="_blank" rel="noreferrer">Tracker support: linking/account mismatch</a>
      </div>
    </section>

    <section class="section">
      <h2>Operational Notes</h2>
      <ul class="plain-list">
        <li>One snapshot file is stored per tracked Riot ID.</li>
        <li>Snapshots are served from disk and are not regenerated during request handling.</li>
        <li>If you deploy this yourself, keep persistent storage attached to <span class="inline-code">cache/snapshots/</span>.</li>
        <li>For setup and deployment guidance, use the project README first, then come back here for request examples and usage patterns.</li>
      </ul>
      <div class="footer-links">
        <a class="link-chip" href="${escapeHtml(docsUrl)}">Current docs page</a>
        <a class="link-chip" href="${escapeHtml(baseUrl)}">Base URL</a>
      </div>
    </section>

    <section class="section">
      <h2>Contact</h2>
      <p>If you are using this project, forking it, or want to contribute back, feel free to reach out.</p>
      <ul class="plain-list">
        <li>Email: <span class="inline-code">dev@aniketraj.me</span></li>
        <li>Telegram: <span class="inline-code">@AniketRaj314</span></li>
      </ul>
    </section>
  </div>

  <script>
    document.querySelectorAll('.toggle__btn').forEach((button) => {
      button.addEventListener('click', () => {
        const { example, lang } = button.dataset;
        const groupButtons = document.querySelectorAll('.toggle__btn[data-example="' + example + '"]');
        const panels = document.querySelectorAll('[data-example-panel="' + example + '"]');

        groupButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
        panels.forEach((panel) => {
          const isActive = panel.dataset.lang === lang;
          panel.classList.toggle('code--active', isActive);
        });
      });
    });
  </script>
</body>
</html>`;
}

router.get('/llms.txt', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
  res.type('text/plain').send(buildLlmsTxt(baseUrl));
});

router.get(['/docs', '/'], (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
  res.type('html').send(buildDocsHtml(baseUrl));
});

module.exports = router;
