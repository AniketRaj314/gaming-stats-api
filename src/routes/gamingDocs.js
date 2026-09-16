'use strict';

const express = require('express');
const { version } = require('../../package.json');

const game = {
  providerGameId: 'PPSA12345_00', conceptId: '10001234', canonicalGameId: null,
  name: 'Example Game', platform: 'PS5', playtimeMinutes: 90.5, playCount: 3,
  firstPlayedAt: '2026-09-01T12:00:00.000Z', lastPlayedAt: '2026-09-16T12:00:00.000Z',
  activityStatus: 'played-history', artwork: { url: null, width: null, height: null },
};
const envelope = {
  schemaVersion: 1, provider: 'psn', accountRef: 'owner', status: 'ready', stale: false,
  lastAttemptAt: '2026-09-16T12:00:00.000Z', lastSuccessAt: '2026-09-16T12:00:00.000Z',
  nextRefreshAt: '2026-09-16T12:15:00.000Z',
};
const trophy = {
  id: 1, grade: 'bronze', hidden: false, earned: true, name: 'First steps', description: 'Finish the introduction.',
  imageUrl: null, earnedAt: '2026-09-01T12:05:00.000Z', earnedRate: 75.5,
};
const set = {
  id: 'NPWR12345_00', service: 'trophy2', name: 'Example Game', platform: 'PS5', imageUrl: null,
  progress: 100, defined: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
  earned: { bronze: 1, silver: 0, gold: 0, platinum: 0 }, complete: true,
  trophies: [trophy], rarestUnlock: trophy, rarityCoverage: { earned: 1, earnedWithKnownRarity: 1 },
};

function psnSections() {
  return [
    { title: 'Overview', text: 'Base path: /psn\nRead cached PlayStation history, trophies and presence for the server-configured owner. Website requests never call Sony or trigger refreshes. This is an unofficial integration. All examples below are illustrative, not live account data.' },
    { title: 'Authentication', text: 'Every data endpoint requires X-API-Key. Send it from your website server or backend proxy; never put it in browser JavaScript. Documentation is public. Missing or invalid keys return HTTP 401 with {"error":"Invalid or missing API key"}. Data responses use Cache-Control: private, no-store. No account selector, credential upload, disconnect, or refresh HTTP endpoint exists.' },
    { title: 'Requests', text: 'GET /psn/library — PS4/PS5 played history and totals\nGET /psn/summary — trophy level and grade counts\nGET /psn/presence — latest observed activity\nGET /psn/games/:titleId — a played record, related editions and trophy details\nUse providerGameId from the library as titleId, not conceptId or a trophy-set ID. No request body or pagination parameters are required: the library snapshot contains the fully fetched upstream result.' },
    { title: 'Request example', text: 'Set API_BASE_URL to your deployment origin, without /psn. PSN_API_KEY is an existing API_KEYS read key, not a Sony credential.', language: 'sh', code: 'curl --fail-with-body "$API_BASE_URL/psn/library" \\\n  -H "X-API-Key: $PSN_API_KEY"' },
    { title: 'Library response', text: 'Fields absent from Sony become null where supported. playtimeMinutes keeps fractional minutes; zero is distinct from unknown. platform is PS4, PS5, or null for Sony\'s unknown category. Games are sorted by known playtime descending. conceptId groups related editions without merging them; canonicalGameId is currently null. coverage.complete means pagination completed for this history query, not a complete purchase inventory. Platforms describe the query filter. Totals sum records, not deduplicated lifetime hours across editions.', language: 'json', code: JSON.stringify({ ...envelope,
      coverage: { kind: 'played-history', platforms: ['PS4', 'PS5'], complete: true, purchaseLibrary: false },
      totals: { recordCount: 1, conceptCount: 1, knownRecordPlaytimeMinutes: 90.5, knownPlaytimeRecords: 1, unknownPlaytimeRecords: 0, unknownPlatformRecords: 0 }, games: [game],
    }, null, 2) },
    { title: 'Summary response', text: 'Summary totals may include hidden titles. visibleTrophySets counts only visible sets, so it need not explain all summary trophies. Unknown trophy counts or level are null.', language: 'json', code: JSON.stringify({ ...envelope, trophyLevel: 1, earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 }, visibleTrophySets: 1, totalsMayIncludeHiddenTitles: true }, null, 2) },
    { title: 'Presence response', text: 'activity is playing, idle, or unavailable. online is true, false, or null. An online player without a reported game is idle; offline clears game fields. Reported games contain providerGameId, name, platform, and imageUrl. Missing upstream activity can produce activity: unavailable even when the fetch status is ready. Display observed status only while fresh; unavailable is not proof the user is offline.', language: 'json', code: JSON.stringify({ ...envelope, nextRefreshAt: '2026-09-16T12:01:00.000Z', activity: 'idle', online: false, platform: 'PS5', games: [] }, null, 2) },
    { title: 'Game detail response', text: 'A known game returns HTTP 200 even if trophies are pending or unavailable. Inspect trophyStatus separately from the top-level status, which describes the detail snapshot. trophyStatus is pending, available, no-visible-synced-set, private, or unavailable. relatedEditions lists records sharing conceptId and can include this edition. Hidden trophy sets are excluded. Locked or unknown secret trophies show Hidden trophy with no description or image. earned: null means unknown, not locked. earnedRate is a percentage or null; zero is valid. Rare unlocks are selected only among earned trophies with known rarity in visible cached sets.', language: 'json', code: JSON.stringify({ ...envelope, nextRefreshAt: '2026-09-16T13:00:00.000Z', game, relatedEditions: [{ providerGameId: game.providerGameId, name: game.name, platform: game.platform }], trophyStatus: 'available', trophySets: [set], rarestUnlock: { ...trophy, trophySetId: set.id, service: set.service }, rarityComparison: 'earned-trophies-with-known-rarity-in-visible-cached-sets' }, null, 2) },
    { title: 'Freshness and errors', text: 'All successful resource snapshots include schemaVersion, provider, accountRef, status, stale, lastAttemptAt, lastSuccessAt, and nextRefreshAt. Unconfigured or disabled responses may omit timestamps and payload fields. Timestamps are UTC ISO strings or null; nextRefreshAt is scheduling information, not a delivery guarantee.\nHTTP 200: ready or bounded stale library/summary/presence; also known game details with separate trophyStatus.\nHTTP 400: malformed titleId (must match [A-Za-z0-9_-]{3,64}).\nHTTP 401: missing/invalid API key.\nHTTP 404: titleId not in available cached played history.\nHTTP 503: disabled, not-configured, reconnect-required, private, or unavailable main resource; also a game lookup when the library is unavailable.\nNever render unavailable data as an empty library or a zero trophy count. Keep the previous UI only when response freshness permits it.' },
    { title: 'Refresh behavior', text: 'Default cadence: library/summary 15 minutes, presence 60 seconds, and trophy details 60 minutes per title. Detail enrichment happens one title at a time, so it may initially be pending. These intervals are configurable. Presence expires after twice its interval, with a 90-second minimum, and failed presence clears the payload. Other snapshots can remain stale for up to 24 hours by default. Jobs back off on errors and rate limits. These routes do not consume Valorant scraping quota.' },
    { title: 'Owner setup and operations', text: 'Use Node 24 and ENABLE_PSN=true with PSN_ONLINE_ID, GAMING_DATA_DIR on persistent storage, and a GAMING_ENCRYPTION_KEY secret (or private local GAMING_ENCRYPTION_KEY_FILE). Connect using the private psn:connect CLI; it verifies the configured account and saves an encrypted session. psn:refresh and psn:status operate only on PSN. One replica and one writer per session are required. Keep credentials out of website code and Git. psn:disconnect deletes local state but does not revoke the session at Sony. See the repository setup guide for production connection, key storage, recovery, and backups.' },
  ];
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function markdown(title, sections) {
  return `# ${title}\n\nVersion: ${version}\n\n` + sections.map(s => `## ${s.title}\n\n${s.text}${s.code ? `\n\n\`\`\`${s.language || ''}\n${s.code}\n\`\`\`` : ''}`).join('\n\n') + '\n';
}
function html(title, sections, links) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{color-scheme:light dark;font:16px/1.65 system-ui,sans-serif}body{max-width:960px;margin:auto;padding:36px 22px;background:#10151c;color:#e6edf5}h1,h2{line-height:1.2}h1{font-size:2.4rem}h2{font-size:1.4rem;margin-top:42px}a{color:#8bc8ff}nav{display:flex;gap:18px;flex-wrap:wrap}p{white-space:pre-line}pre{padding:20px;background:#1a2330;border:1px solid #334155;border-radius:10px;overflow:auto;font-size:.85rem}header p{color:#aebed0}section{scroll-margin-top:20px}code{font-family:ui-monospace,monospace}</style></head>
  <body><header><p>GAMING STATS API · ${escapeHtml(version)}</p><h1>${escapeHtml(title)}</h1><nav>${links.map(([label,url])=>`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`).join('')}</nav></header><main>${sections.map(s=>`<section><h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.text)}</p>${s.code ? `<pre><code>${escapeHtml(s.code)}</code></pre>` : ''}</section>`).join('')}</main></body></html>`;
}

function createGamingDocsRouter() {
  const router = express.Router();
  const setup = 'https://github.com/AniketRaj314/gaming-stats-api/blob/main/docs/psn.md';
  const indexSections = [
    { title: 'Providers', text: 'Valorant: /custom/valorant — cached Riot-player stats. /valorant remains a compatibility alias.\nPSN: /psn — cached played history, trophy summary, presence and game trophies. Requires operator configuration.\nSteam, Epic and Playnite ingestion are planned, not implemented.' },
    { title: 'Documentation', text: '[Valorant guide](/custom/valorant/docs)\n[Valorant machine-readable guide](/custom/valorant/llms.txt)\n[PSN guide](/psn/docs)\n[PSN machine-readable guide](/psn/llms.txt)\n[PSN setup and recovery](' + setup + ')' },
    { title: 'Access', text: 'GET /health is public and reports the running release. Documentation is public. Valorant stats and PSN data require X-API-Key from a server-side consumer. Requests serve stored snapshots; refresh jobs run independently. See each provider guide for schemas and availability.' },
  ];
  router.get('/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API', indexSections)));
  router.get(['/', '/docs'], (req,res)=>res.type('html').send(html('Gaming Stats API', indexSections.filter(s=>s.title!=='Documentation'), [
    ['Valorant docs','/custom/valorant/docs'],['PSN docs','/psn/docs'],['llms.txt','/llms.txt'],['PSN setup',setup],
  ])));
  router.get('/psn/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API — PSN', psnSections())));
  router.get(['/psn','/psn/docs'], (req,res)=>res.type('html').send(html('PSN API', psnSections(), [
    ['All providers','/docs'],['llms.txt','/psn/llms.txt'],['Setup and recovery',setup],
  ])));
  return router;
}

module.exports = { createGamingDocsRouter };
