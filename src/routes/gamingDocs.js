'use strict';

const express = require('express');
const { version } = require('../../package.json');

const game = {
  providerGameId: 'PPSA12345_00', conceptId: '10001234', canonicalGameId: null,
  name: 'Example Game', platform: 'PS5', playtimeMinutes: 90.5, playCount: 3,
  firstPlayedAt: '2026-09-01T12:00:00.000Z', lastPlayedAt: '2026-09-16T12:00:00.000Z',
  activityStatus: 'played-history', artwork: {
    url: 'https://image.api.playstation.com/example/primary.png',
    localizedUrl: 'https://image.api.playstation.com/example/localized.png',
    width: null, height: null,
    images: [
      { type: 'GAMEHUB_COVER_ART', format: 'IMAGE', url: 'https://image.api.playstation.com/example/cover.png' },
      { type: 'SCREENSHOT', format: 'IMAGE', url: 'https://image.api.playstation.com/example/screenshot.png' },
    ],
  },
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

const steamEnvelope = {
  schemaVersion: 1, provider: 'steam', accountRef: 'owner', status: 'ready', stale: false,
  lastAttemptAt: '2026-09-16T12:00:00.000Z', lastSuccessAt: '2026-09-16T12:00:00.000Z',
  nextRefreshAt: '2026-09-16T12:15:00.000Z',
};
const steamGame = {
  providerGameId: '570', appId: 570, name: 'Example Game', playtimeMinutes: 600,
  playtimeTwoWeeksMinutes: 30, playtimeWindowsMinutes: 500, playtimeMacMinutes: 0,
  playtimeLinuxMinutes: 100, playtimeDeckMinutes: 10, playtimeDisconnectedMinutes: null,
  lastPlayedAt: '2026-09-15T12:00:00.000Z', hasCommunityVisibleStats: true,
  hasWorkshop: true, hasMarket: true, hasDlc: true, hasLeaderboards: false,
  contentDescriptorIds: [], capsuleFilename: null,
  iconUrl: 'https://media.steampowered.com/steamcommunity/public/images/apps/570/example.jpg',
  coverUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/library_600x900_2x.jpg',
  store: { visible: true, unlisted: false, itemType: 0, type: 0, isFree: false, urlPath: 'app/570/example_game',
    urlSlug: 'example_game', url: 'https://store.steampowered.com/app/570/example_game',
    shortDescription: 'An example store description.', developers: [{ name: 'Example Studio', creatorClanAccountId: 123 }],
    publishers: [{ name: 'Example Publisher', creatorClanAccountId: 456 }], franchises: [],
    tagIds: [1], tags: [{ tagId: 1, weight: 100 }],
    categories: { supportedPlayerCategoryIds: [1], featureCategoryIds: [22] },
    reviews: { allLanguages: { count: 100, percentPositive: 90, score: 8, label: 'Very Positive' }, selectedLanguage: null },
    releaseAt: '2026-01-01T00:00:00.000Z', contentDescriptorIds: [],
    platforms: { windows: true, mac: false, linux: true, steamDeckCompatibilityCategory: 3,
      steamOsCompatibilityCategory: null, steamFrameCompatibilityCategory: null,
      steamMachineCompatibilityCategory: null, vrSupport: null },
    artwork: { libraryCapsuleUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/library_600x900_2x.jpg',
      libraryCapsule1xUrl: null, libraryCapsule2xUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/library_600x900_2x.jpg',
      mainCapsuleUrl: null, mainCapsule2xUrl: null, smallCapsuleUrl: null, smallCapsule2xUrl: null,
      headerUrl: null, header2xUrl: null, packageHeaderUrl: null,
      heroCapsuleUrl: null, heroCapsule2xUrl: null, libraryHeroUrl: null, libraryHero2xUrl: null,
      libraryHeaderUrl: null, libraryLogoUrl: null, libraryLogo2xUrl: null,
      verticalCapsuleUrl: null, verticalCapsule2xUrl: null, communityIconUrl: null,
      pageBackgroundUrl: null, rawPageBackgroundUrl: null, pageBackgroundPath: null, lastModifiedAt: null },
    originalArtwork: null,
    screenshots: { allAges: [{ ordinal: 0, filename: 'ss_example.jpg', url: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/ss_example.jpg' }], matureContent: [] } },
};
const epicEnvelope = {
  schemaVersion: 1, provider: 'epic', accountRef: 'owner', status: 'ready', stale: false,
  lastAttemptAt: '2026-09-17T12:00:00.000Z', lastSuccessAt: '2026-09-17T12:00:00.000Z',
  nextRefreshAt: '2026-09-17T12:15:00.000Z',
};
const epicGame = {
  providerGameId: 'E'.repeat(43), name: 'Example Game', imageUrl: 'https://cdn1.epicgames.com/example/wide.jpg',
  artwork: { url: 'https://cdn1.epicgames.com/example/wide.jpg', images: [
    { type: 'DieselGameBoxWide', url: 'https://cdn1.epicgames.com/example/wide.jpg', alt: 'Example landscape art',
      width: 2560, height: 1440, sizeBytes: 123456, uploadedAt: '2026-09-01T12:00:00.000Z',
      checksumMd5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { type: 'DieselGameBoxTall', url: 'https://cdn1.epicgames.com/example/tall.jpg', alt: 'Example portrait art',
      width: 1200, height: 1600, sizeBytes: 654321, uploadedAt: '2026-09-01T12:00:00.000Z',
      checksumMd5: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
  ] },
  playtimeMinutes: 90.5, playtimeStatus: 'known', lastPlayedAt: null,
};
const playniteEnvelope = {
  schemaVersion: 1, provider: 'playnite', accountRef: 'owner', status: 'ready', stale: false,
  lastAttemptAt: '2026-09-20T12:00:00.000Z', lastSuccessAt: '2026-09-20T12:00:00.000Z', nextRefreshAt: null,
};
const playniteGame = {
  playniteId: 'a85aec7d-447d-4c0c-9506-f8b27c2ad310', providerGameId: 'example-provider-id',
  libraryPluginId: null, source: { id: null, name: 'Epic' }, name: 'Example Game', sortingName: null,
  playtimeSeconds: 5460, playtimeMinutes: 91, playCount: 3,
  lastActivityAt: '2026-09-20T12:00:00.000Z', addedAt: null, modifiedAt: null,
  isInstalled: true, isRunning: true, hidden: false, favorite: true, isCustomGame: false,
  installSizeBytes: null, releaseDate: { year: 2026, month: 1, day: 1 }, completionStatus: 'Playing',
  platforms: ['PC (Windows)'], genres: ['Action'], categories: [], tags: [], features: [], ageRatings: [],
  regions: [], series: [], developers: ['Example Studio'], publishers: ['Example Publisher'],
  scores: { user: null, critic: null, community: null }, links: [], artwork: {
    icon: { assetId: 'a'.repeat(64), path: '/playnite/assets/' + 'a'.repeat(64), contentType: 'image/png', width: 256, height: 256 },
    cover: null, background: null,
  },
};

function psnSections() {
  return [
    { title: 'Overview', text: 'Base path: /psn\nRead cached PlayStation history, trophies and presence for the server-configured owner. Website requests never call Sony or trigger refreshes. This is an unofficial integration. All examples below are illustrative, not live account data.' },
    { title: 'Authentication', text: 'Every data endpoint requires X-API-Key. Send it from your website server or backend proxy; never put it in browser JavaScript. Documentation is public. Missing or invalid keys return HTTP 401 with {"error":"Invalid or missing API key"}. Data responses use Cache-Control: private, no-store. No account selector, credential upload, disconnect, or refresh HTTP endpoint exists.' },
    { title: 'Requests', text: 'GET /psn/library — PS4/PS5 played history and totals\nGET /psn/summary — trophy level and grade counts\nGET /psn/presence — latest observed activity\nGET /psn/games/:titleId — a played record, related editions and trophy details\nUse providerGameId from the library as titleId, not conceptId or a trophy-set ID. No request body or pagination parameters are required: the library snapshot contains the fully fetched upstream result.' },
    { title: 'Request example', text: 'Set API_BASE_URL to your deployment origin, without /psn. PSN_API_KEY is an existing API_KEYS read key, not a Sony credential.', language: 'sh', code: 'curl --fail-with-body "$API_BASE_URL/psn/library" \\\n  -H "X-API-Key: $PSN_API_KEY"' },
    { title: 'Library response', text: 'Fields absent from Sony become null where supported. playtimeMinutes keeps fractional minutes; zero is distinct from unknown. platform is PS4, PS5, or null for Sony\'s unknown category. Games are sorted by known playtime descending. conceptId groups related editions without merging them; canonicalGameId is currently null. artwork.url is the compatibility image, localizedUrl is Sony\'s localized variant, and artwork.images preserves every safe typed cover, logo, master, background, hero, banner, portrait, and screenshot record. Duplicate record/concept media is collapsed by type, format, and URL. Sony does not supply dimensions here. coverage.complete means pagination completed for this history query, not a complete purchase inventory. Platforms describe the query filter. Totals sum records, not deduplicated lifetime hours across editions.', language: 'json', code: JSON.stringify({ ...envelope,
      coverage: { kind: 'played-history', platforms: ['PS4', 'PS5'], complete: true, purchaseLibrary: false },
      totals: { recordCount: 1, conceptCount: 1, knownRecordPlaytimeMinutes: 90.5, knownPlaytimeRecords: 1, unknownPlaytimeRecords: 0, unknownPlatformRecords: 0 }, games: [game],
    }, null, 2) },
    { title: 'Summary response', text: 'Summary totals may include hidden titles. visibleTrophySets counts only visible sets, so it need not explain all summary trophies. Unknown trophy counts or level are null.', language: 'json', code: JSON.stringify({ ...envelope, trophyLevel: 1, earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 }, visibleTrophySets: 1, totalsMayIncludeHiddenTitles: true }, null, 2) },
    { title: 'Presence response', text: 'activity is playing, idle, or unavailable. online is true, false, or null. An online player without a reported game is idle; offline clears game fields. Reported games contain providerGameId, name, platform, and imageUrl. Missing upstream activity can produce activity: unavailable even when the fetch status is ready. Display observed status only while fresh; unavailable is not proof the user is offline.', language: 'json', code: JSON.stringify({ ...envelope, nextRefreshAt: '2026-09-16T12:01:00.000Z', activity: 'idle', online: false, platform: 'PS5', games: [] }, null, 2) },
    { title: 'Game detail response', text: 'A known game returns HTTP 200 even if trophies are pending or unavailable. Inspect trophyStatus separately from the top-level status, which describes the detail snapshot. trophyStatus is pending, available, no-visible-synced-set, private, or unavailable. relatedEditions lists records sharing conceptId and can include this edition. Hidden trophy sets are excluded. Locked or unknown secret trophies show Hidden trophy with no description or image. earned: null means unknown, not locked. earnedRate is a percentage or null; zero is valid. Rare unlocks are selected only among earned trophies with known rarity in visible cached sets.', language: 'json', code: JSON.stringify({ ...envelope, nextRefreshAt: '2026-09-16T13:00:00.000Z', game, relatedEditions: [{ providerGameId: game.providerGameId, name: game.name, platform: game.platform }], trophyStatus: 'available', trophySets: [set], rarestUnlock: { ...trophy, trophySetId: set.id, service: set.service }, rarityComparison: 'earned-trophies-with-known-rarity-in-visible-cached-sets' }, null, 2) },
    { title: 'Freshness and errors', text: 'All successful resource snapshots include schemaVersion, provider, accountRef, status, stale, lastAttemptAt, lastSuccessAt, and nextRefreshAt. Unconfigured or disabled responses may omit timestamps and payload fields. Timestamps are UTC ISO strings or null; nextRefreshAt is scheduling information, not a delivery guarantee.\nHTTP 200: ready or bounded stale library/summary/presence; also known game details with separate trophyStatus.\nHTTP 400: malformed titleId (must match [A-Za-z0-9_-]{3,64}).\nHTTP 401: missing/invalid API key.\nHTTP 404: titleId not in available cached played history.\nHTTP 503: disabled, not-configured, reconnect-required, private, or unavailable main resource; also a game lookup when the library is unavailable.\nNever render unavailable data as an empty library or a zero trophy count. Keep the previous UI only when response freshness permits it.' },
    { title: 'Refresh behavior', text: 'Default cadence: library/summary 15 minutes, presence 60 seconds, and trophy details 60 minutes per title. Detail enrichment happens one title at a time, so it may initially be pending. These intervals are configurable. Presence expires after twice its interval, with a 90-second minimum, and failed presence clears the payload. Other snapshots can remain stale for up to 24 hours by default. Jobs back off on errors and rate limits. These routes do not consume Valorant scraping quota.' },
    { title: 'Owner setup and operations', text: 'Use Node 24. Configure PSN_ONLINE_ID, GAMING_DATA_DIR on persistent storage, and one encryption source: a 64-character hex GAMING_ENCRYPTION_KEY secret or private local GAMING_ENCRYPTION_KEY_FILE. Deploy with ENABLE_PSN=false until connection and initial refresh succeed. Sign in at https://www.playstation.com/ and then open https://ca.account.sony.com/api/v1/ssocookie in the same browser to obtain NPSSO. The CLI accepts the value or Sony JSON, verifies the configured account, and saves only an encrypted access/refresh session; it does not retain NPSSO. psn:refresh and psn:status operate only on PSN. One always-on replica and one writer per session are required. Keep credentials out of website code, chat, screenshots, command arguments, and Git. psn:disconnect deletes local state but does not revoke the session at Sony.' },
    { title: 'Local owner connection', text: 'Generate a private key file, configure the expected online ID and key path, then connect and perform the initial PSN-only refresh. Start with Valorant auto-refresh disabled when checking PSN in isolation.', language: 'sh', code: 'npm run psn:init-key\nexport PSN_ONLINE_ID=your-psn-online-id\nexport GAMING_ENCRYPTION_KEY_FILE=.private/psn.key\nnpm run psn:connect\nnpm run psn:status\nnpm run psn:refresh\nENABLE_AUTO_REFRESH=false ENABLE_PSN=true npm start' },
    { title: 'Railway connection', text: 'Mount persistent storage at /app/cache, set GAMING_DATA_DIR=/app/cache/gaming, use one always-on replica, and deploy initially with ENABLE_PSN=false. Generate the hosted encryption key through the pipe below so it is not printed or stored in shell history. Run railway ssh with no remote command. After the remote root@...:/app# prompt appears, run the remaining commands. Paste a fresh NPSSO only into the hidden prompt. Railway command-mode SSH can echo input without forwarding it, so never use railway ssh -- node scripts/psn/cli.js connect. railway run executes locally and must not create the hosted session. If a credential appears or is shared, cancel it, use PlayStation Account Management to sign out on all devices, and generate a fresh NPSSO. After refresh, set ENABLE_PSN=true, allow the redeploy, and confirm connected/ready status after restart.', language: 'sh', code: 'node -e "process.stdout.write(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))" | railway variable set GAMING_ENCRYPTION_KEY --stdin --skip-deploys\nrailway ssh\n# After the remote prompt appears:\nnpm run psn:connect:production\nnpm run psn:status\nnpm run psn:refresh\nexit\nrailway variable set ENABLE_PSN=true\nrailway ssh -- node scripts/psn/cli.js status' },
  ];
}

function steamSections() {
  return [
    { title: 'Overview', text: 'Base path: /steam\nRead cached Steam profile, API-visible library, playtime, catalog facts and artwork, recent activity, badges/XP, achievements, global rarity, game-specific stats, and current-player observations for the configured owner. Website requests never call Steam or trigger refreshes. All examples below are illustrative, not live account data.' },
    { title: 'Authentication', text: 'Every data endpoint requires X-API-Key from the website server or another trusted backend. Never put API_KEYS or STEAM_WEB_API_KEY in browser JavaScript. Documentation is public. Missing or invalid read keys return HTTP 401. Data responses use Cache-Control: private, no-store. No HTTP refresh, credential, or account-selection endpoint exists.' },
    { title: 'Requests', text: 'GET /steam/profile — public profile fields, all avatar sizes, persona state, Steam level, and current game when visible\nGET /steam/library — owned/free-subscription games, playtime, capabilities, catalog facts, and artwork\nGET /steam/recent — games and playtime reported for Steam\'s recent two-week window\nGET /steam/badges — Steam level/XP, owned badges, and Community badge quests\nGET /steam/games/:appId — one owned game plus achievement schema/state, global rarity, title stats, and current players\nUse the numeric appId/providerGameId from the library. No request body or pagination parameter is accepted.' },
    { title: 'Request example', text: 'Set API_BASE_URL to the deployment origin. STEAM_API_KEY is one of this service\'s API_KEYS read keys, not the Steam Web API key.', language: 'sh', code: 'curl --fail-with-body "$API_BASE_URL/steam/library" \\\n  -H "X-API-Key: $STEAM_API_KEY"' },
    { title: 'Profile response', text: 'communityVisibility is public, private, or unknown. personaState maps Steam\'s public state enum. currentGame is null unless Steam reports an active game. Private profiles can omit optional fields. Steam ID remains a string so 64-bit precision is never lost.', language: 'json', code: JSON.stringify({ ...steamEnvelope,
      steamId: '76561198000000000', personaName: 'Example Player', profileUrl: 'https://steamcommunity.com/profiles/76561198000000000/',
      avatarUrl: null, avatarUrls: { small: null, medium: null, full: null }, avatarHash: null,
      communityVisibility: 'public', communityVisibilityCode: 3, profileState: 1, commentPermission: 1,
      personaState: 'online', personaStateCode: 1, personaStateFlags: 0, lastLogoffAt: null,
      createdAt: null, countryCode: null, steamLevel: 42,
      currentGame: { providerGameId: '570', appId: 570, name: 'Example Game' },
    }, null, 2) },
    { title: 'Library response', text: 'This is Steam\'s API-visible owned-game list with played free games and free subscriptions included. Privacy settings can hide the list. Game rows retain source playtime splits, Steam Deck/disconnected time, capability flags, content descriptors, catalog facts, reviews and platform compatibility. artwork includes Steam\'s icon/background and 1×/2× small, main, header, hero, library-capsule and library-hero variants when published. originalArtwork retains the non-override set when Steam is serving temporary artwork. screenshots separates all-ages and mature-content lists. coverUrl remains the best 600×900 library capsule for compatibility. Missing source values remain null or empty arrays.', language: 'json', code: JSON.stringify({ ...steamEnvelope,
      coverage: { kind: 'owned-games', complete: true, includePlayedFreeGames: true, includeFreeSubscriptions: true, privacyDependent: true },
      totals: { gameCount: 1, playedGameCount: 1, totalPlaytimeMinutes: 600, windowsPlaytimeMinutes: 500, macPlaytimeMinutes: 0, linuxPlaytimeMinutes: 100, deckPlaytimeMinutes: 10, disconnectedPlaytimeMinutes: 0, gamesWithCommunityStats: 1 },
      games: [steamGame],
    }, null, 2) },
    { title: 'Recent response', text: 'Steam defines this as a recent two-week window. A missing playtimeTwoWeeksMinutes is unknown, not zero. The lifetime playtime fields are repeated from Steam\'s recent-game records when available.', language: 'json', code: JSON.stringify({ ...steamEnvelope,
      windowDays: 14, totals: { gameCount: 1, playtimeMinutes: 30 }, games: [steamGame],
    }, null, 2) },
    { title: 'Badges response', text: 'Badge records retain Steam\'s badge ID, level, completion time, XP, scarcity, optional app/community-item IDs, and border color. XP threshold values are source fields; the API does not calculate a replacement progress score. communityBadgeQuests specifically describes Steam Community badge ID 2.', language: 'json', code: JSON.stringify({ ...steamEnvelope,
      playerXp: 4200, playerLevel: 42, playerXpNeededToLevelUp: 300, playerXpNeededCurrentLevel: 200,
      communityBadgeId: 2, communityBadgeQuestStatus: 'available',
      badges: [{ badgeId: 1, level: 2, completedAt: '2026-09-01T12:00:00.000Z', xp: 100, scarcity: 500,
        appId: null, communityItemId: null, borderColor: null }],
      communityBadgeQuests: [{ questId: 1, completed: true }],
    }, null, 2) },
    { title: 'Game detail response', text: 'Known owned games return HTTP 200 while background enrichment is pending or when a title lacks community stats. achievementStatus, statsStatus, and currentPlayersStatus report each independent source. Locked hidden achievements conceal their name, description, and both icon states. globalPercent is Steam\'s global unlock percentage normalized to a number from 0 through 100; malformed, non-finite, and out-of-range source values become null, while zero is valid. Raw title stats retain their API name, optional display name, schema default, and numeric value. currentPlayers is Steam\'s online observation at the detail snapshot time.', language: 'json', code: JSON.stringify({ ...steamEnvelope, game: steamGame,
      gameName: 'Example Game', gameVersion: '1', currentPlayers: 12345, currentPlayersStatus: 'available',
      achievementStatus: 'available', achievementCoverage: { defined: 1, playerRows: 1, unlocked: 1, unlockedWithKnownGlobalPercent: 1 },
      achievements: [{ apiName: 'FIRST_WIN', name: 'First Win', description: 'Win once.', hidden: false, defaultValue: 0,
        achieved: true, unlockedAt: '2026-09-01T12:00:00.000Z', iconUrl: null, unlockedIconUrl: null, lockedIconUrl: null, globalPercent: 12.5 }],
      rarestUnlock: { apiName: 'FIRST_WIN', name: 'First Win', description: 'Win once.', hidden: false, defaultValue: 0,
        achieved: true, unlockedAt: '2026-09-01T12:00:00.000Z', iconUrl: null, unlockedIconUrl: null, lockedIconUrl: null, globalPercent: 12.5 },
      rarityComparison: 'unlocked-achievements-with-known-global-percent', statsStatus: 'available',
      stats: [{ name: 'kills', displayName: 'Kills', defaultValue: 0, value: 99 }],
    }, null, 2) },
    { title: 'Freshness and errors', text: 'Successful resources include schemaVersion, provider, accountRef, status, stale, lastAttemptAt, lastSuccessAt, and nextRefreshAt. HTTP 200 serves ready or bounded stale core resources and known owned-game details. Detail status can be pending while enrichment runs. HTTP 400 means malformed appId. HTTP 401 means missing/invalid service read key. HTTP 404 means the app is not in the cached owned library. HTTP 503 means disabled, unavailable, private, or expired data. Never render unavailable as an empty library or zero playtime.' },
    { title: 'Refresh and privacy', text: 'Profile, library, recent activity, and badges refresh every 15 minutes by default. Per-game detail snapshots refresh every 12 hours, one game per background job. Non-presence snapshots can remain stale for 24 hours by default after a transient failure. Steam profile and Game details privacy settings control availability. Friends, groups, real name, exact location, bans, server addresses, wishlists, followed games, commerce data, and credentials are intentionally excluded. An empty or private response is never converted into invented data. These jobs do not consume Valorant scraping quota.' },
    { title: 'Owner setup', text: 'Use a standard Steam user Web API key from https://steamcommunity.com/dev/apikey and the owner\'s exact 17-digit SteamID64. Keep STEAM_WEB_API_KEY in server secrets; the provider sends it in the x-webapi-key header rather than request URLs. Configure STEAM_ID, GAMING_DATA_DIR on persistent storage, optional refresh settings, and deploy with ENABLE_STEAM=false. Run npm run steam:refresh privately, inspect npm run steam:status, then enable and redeploy. The integration stores sanitized JSON snapshots only; no Steam password, session cookie, or rotating user token is collected.', language: 'sh', code: 'export STEAM_ID=76561198000000000\nexport STEAM_WEB_API_KEY=your-private-32-character-key\nnpm run steam:refresh\nnpm run steam:status\nENABLE_STEAM=true npm start' },
  ];
}

function epicSections() {
  return [
    { title: 'Overview', text: 'Base path: /epic\nRead a cached Epic Games owner library with claimed and uninstalled PC base games, catalog artwork, and Epic-reported playtime. Website requests never call Epic or trigger refreshes. This is an unofficial launcher-protocol integration and can require reconnection if Epic changes or revokes the session. Examples are illustrative, not live account data.' },
    { title: 'Authentication', text: 'Every data endpoint requires X-API-Key from a trusted website server or backend proxy. Documentation is public. Missing or invalid read keys return HTTP 401. Data responses use Cache-Control: private, no-store. The read key cannot connect, refresh, disconnect, select an account, or retrieve credentials. Never put API_KEYS, Epic authorization codes, or session tokens in browser JavaScript.' },
    { title: 'Requests', text: 'GET /epic/library — complete cached owned base-game collection, coverage and totals\nGET /epic/games/:gameId — one cached owned game\nUse providerGameId from the library. It is an opaque 43-character identifier. No request body or pagination argument is accepted; the refresh worker completes upstream pagination before publication.' },
    { title: 'Request example', text: 'EPIC_API_KEY is one of this service\'s API_KEYS read keys, not an Epic credential.', language: 'sh', code: 'curl --fail-with-body "$API_BASE_URL/epic/library" \\\n  -H "X-API-Key: $EPIC_API_KEY"' },
    { title: 'Library response', text: 'coverage.inventoryComplete and catalogComplete describe the published snapshot. Epic playtime is converted from integer seconds to minutes without early rounding. playtimeStatus is known, unknown, ambiguous, or unavailable. A missing Epic playtime record remains null/unknown; it never becomes zero. Explicit upstream zero remains known zero. imageUrl and artwork.url retain the preferred compatibility image. artwork.images preserves every safe catalog key image with type, URL, alt text, dimensions, byte size, upload timestamp, and MD5 checksum when supplied. Totals sum only known records and do not merge Steam, Playnite, PSN, editions, or aliases. Add-ons, private sandboxes, Unreal Engine assets, records without an app artifact, and unknown classifications are excluded and counted.', language: 'json', code: JSON.stringify({ ...epicEnvelope,
      coverage: { kind: 'owned-pc-base-games', inventoryComplete: true, catalogComplete: true, catalogStale: false,
        playtimeStatus: 'available', missingPlaytimeMeans: 'unknown', unmatchedPlaytimeRecords: 0,
        excluded: { addons: 0, engineAssets: 0, unknownClassification: 0, privateRecords: 0, noAppArtifactRecords: 0 } },
      totals: { gameCount: 1, playedGameCount: 1, knownPlaytimeGameCount: 1, unknownPlaytimeGameCount: 0,
        ambiguousPlaytimeGameCount: 0, totalPlaytimeMinutes: 90.5 }, games: [epicGame],
    }, null, 2) },
    { title: 'Game response', text: 'A valid ID that is absent from the current cached library returns HTTP 404. The game endpoint repeats the library snapshot freshness metadata and returns the same normalized game record. Epic achievements, current presence, installation state, and reliable last-played time are not included in this release.', language: 'json', code: JSON.stringify({ ...epicEnvelope, game: epicGame }, null, 2) },
    { title: 'Freshness and errors', text: 'HTTP 200 serves ready or bounded stale snapshots. HTTP 400 means malformed gameId. HTTP 401 means a missing or invalid service read key. HTTP 404 means the ID is not in the cached Epic base-game library. HTTP 503 means disabled, not-configured, reconnect-required, unavailable, or expired data. Never display unavailable data as an empty library or zero playtime. status, stale, lastAttemptAt, lastSuccessAt, and nextRefreshAt describe the snapshot.' },
    { title: 'Refresh and storage', text: 'Library and playtime target a 15-minute cadence. Sanitized catalog metadata is cached for 24 hours. Completed snapshots can remain stale for up to 24 hours after a transient failure. Jobs use persistent due times, bounded requests, backoff, a single SQLite writer lock, and one controlled token recovery attempt. Rotating access and refresh tokens are AES-256-GCM encrypted in a separate private SQLite file on GAMING_DATA_DIR. Raw Epic responses and credentials are not published. Run one always-on Railway replica per session.' },
    { title: 'Owner connection', text: 'Deploy with ENABLE_EPIC=false. Configure EPIC_EXPECTED_DISPLAY_NAME, GAMING_DATA_DIR on the persistent volume, and the existing private GAMING_ENCRYPTION_KEY. Open a full railway ssh shell and run npm run epic:connect:production. The CLI prints an official epicgames.com login URL. Sign in and complete 2FA only on Epic, then paste only the returned authorizationCode or Epic JSON into the hidden terminal prompt. Do not paste it into chat, command arguments, screenshots, or website routes. Run epic:refresh and epic:status before enabling the provider. The gaming PC does not need to remain running.', language: 'sh', code: 'railway ssh\n# After the remote prompt appears:\nnpm run epic:connect:production\nnpm run epic:refresh\nnpm run epic:status\nexit\nrailway variable set ENABLE_EPIC=true' },
    { title: 'Disconnect and recovery', text: 'npm run epic:disconnect revokes the current Epic access session before deleting local credentials, cached metadata, and snapshots. If the session cannot be renewed or revoked, fix connectivity and retry. npm run epic:disconnect -- --local-only is an explicit recovery option that removes local data but cannot revoke Epic remotely; then use Epic account security controls. A token rotation interrupted before durable replacement becomes reconnect-required rather than blindly retrying an old token.' },
  ];
}

function playniteSections() {
  return [
    { title: 'Overview', text: 'Base path: /playnite\nRead the latest complete library, local artwork, per-game metadata, tracked playtime, and short-lived now-playing state uploaded by the Gaming Stats Sync extension on a Windows PC. The cached library remains readable while the PC is off. Examples are illustrative.' },
    { title: 'Authentication', text: 'Every read and artwork endpoint requires X-API-Key from a trusted backend. Documentation is public. The Windows extension uses a separate X-Playnite-Key only on private /playnite/sync routes. Never put either credential in browser JavaScript. Read responses use Cache-Control: private, no-store.' },
    { title: 'Requests', text: 'GET /playnite/library - complete selected Playnite library and totals\nGET /playnite/presence - online, playing, or expired-to-offline presence\nGET /playnite/games/:playniteId - one game selected by its Playnite GUID\nGET /playnite/assets/:assetId - cached JPEG, PNG, WebP, or AVIF artwork selected by SHA-256 ID\nNo read request accepts a body or triggers the Windows PC.' },
    { title: 'Request example', text: 'PLAYNITE_API_KEY is an existing API_KEYS read key, not the extension upload key.', language: 'sh', code: 'curl --fail-with-body "$API_BASE_URL/playnite/library" \\\n  -H "X-API-Key: $PLAYNITE_API_KEY"' },
    { title: 'Library response', text: 'The extension publishes a complete selected snapshot. playtimeSeconds is Playnite\'s tracked/imported total and playtimeMinutes is derived using whole elapsed minutes. Artwork paths require the same read key. The record also retains source and library IDs, play count, timestamps, install/running/favorite/custom flags, install size, release date, completion status, descriptive metadata, scores, and safe HTTPS links. Hidden games are excluded by default. A direct Epic record and its Playnite record remain separate and their playtime must not be added together.', language: 'json', code: JSON.stringify({ ...playniteEnvelope,
      deviceId: 'be30ba39-154f-4c93-9830-781979722243', deviceName: 'Gaming PC', sequence: 1726833600000,
      generatedAt: '2026-09-20T12:00:00.000Z', playniteVersion: '10.35', extensionVersion: '1.0.0',
      coverage: { kind: 'complete-playnite-library', gameCount: 1, artworkUploaded: true },
      totals: { gameCount: 1, installedGameCount: 1, playedGameCount: 1, totalPlaytimeSeconds: 5460 }, games: [playniteGame],
    }, null, 2) },
    { title: 'Presence response', text: 'Presence reports online or playing while extension updates arrive. A playing response includes the stable Playnite ID, provider game ID, source, name, and session start. When no update arrives within PLAYNITE_PRESENCE_TTL_SECONDS, the API returns stale/offline and clears currentGame so a crashed or sleeping PC cannot remain playing forever.', language: 'json', code: JSON.stringify({ ...playniteEnvelope,
      deviceId: 'be30ba39-154f-4c93-9830-781979722243', deviceName: 'Gaming PC', sequence: 1726833600001,
      generatedAt: '2026-09-20T12:00:00.000Z', playniteVersion: '10.35', extensionVersion: '1.0.0', state: 'playing',
      currentGame: { playniteId: playniteGame.playniteId, providerGameId: playniteGame.providerGameId,
        source: playniteGame.source, name: playniteGame.name, startedAt: '2026-09-20T11:55:00.000Z' },
    }, null, 2) },
    { title: 'Game response', text: 'A malformed Playnite GUID returns HTTP 400. A valid GUID absent from the current cached library returns HTTP 404. A known game repeats snapshot freshness and device metadata and returns the same normalized game object.', language: 'json', code: JSON.stringify({ ...playniteEnvelope,
      deviceId: 'be30ba39-154f-4c93-9830-781979722243', deviceName: 'Gaming PC', sequence: 1726833600000,
      generatedAt: '2026-09-20T12:00:00.000Z', playniteVersion: '10.35', extensionVersion: '1.0.0', game: playniteGame,
    }, null, 2) },
    { title: 'Freshness and errors', text: 'HTTP 200 serves ready or stale library/presence and known game records. HTTP 400 means a malformed identifier. HTTP 401 means a missing or invalid read key. HTTP 404 means the game or artwork is absent. HTTP 503 means disabled, pending, corrupt, or unavailable storage. Library status becomes stale after PLAYNITE_LIBRARY_STALE_HOURS. Presence becomes offline after its TTL. Never render pending or unavailable as an empty library or zero playtime.' },
    { title: 'Extension behavior', text: 'The extension sends a complete library on Playnite start, when games are added, removed, or edited, after library updates, after install/uninstall events, and after a game stops. Related database changes are debounced into one upload. It sends presence on application and game state changes plus a 60-second heartbeat while playing. Manual Sync now sends both presence and library data. It uploads only content-addressed local artwork that the server does not already have. Launch games through Playnite for reliable session tracking.' },
    { title: 'Owner setup', text: 'Create an independent random upload key, set ENABLE_PLAYNITE=true and PLAYNITE_UPLOAD_KEYS on the server, and keep GAMING_DATA_DIR on persistent storage. Install GamingStatsSync-1.0.1.pext on Windows. In Add-ons > Extension settings > Generic > Gaming Stats Sync, enter the HTTPS deployment origin and upload key, save, then choose Sync now. The extension protects the key for the current Windows user and excludes paths, launch commands, notes, scripts, cookies, and store credentials.', language: 'sh', code: 'node -e "process.stdout.write(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))"\n# Set the result privately as PLAYNITE_UPLOAD_KEYS, then:\nENABLE_PLAYNITE=true npm start' },
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
  const steamSetup = 'https://github.com/AniketRaj314/gaming-stats-api/blob/main/docs/steam.md';
  const epicSetup = 'https://github.com/AniketRaj314/gaming-stats-api/blob/main/docs/epic.md';
  const playniteSetup = 'https://github.com/AniketRaj314/gaming-stats-api/blob/main/docs/playnite.md';
  const coverage = 'https://github.com/AniketRaj314/gaming-stats-api/blob/main/docs/data-coverage.md';
  const indexSections = [
    { title: 'Providers', text: 'Valorant: /custom/valorant - cached Riot-player stats. /valorant remains a compatibility alias.\nPSN: /psn - cached played history, trophy summary, presence and game trophies. Requires operator configuration.\nSteam: /steam - cached profile, API-visible library and catalog facts, recent playtime, badges/XP, achievements, rarity, title stats and current players. Requires operator configuration.\nEpic: /epic - cached claimed PC base games, catalog artwork and Epic-reported playtime. Requires an owner connection.\nPlaynite: /playnite - cached local/launcher library, artwork, tracked playtime, and expiring now-playing presence from the Windows extension.' },
    { title: 'Documentation', text: '[Valorant guide](/custom/valorant/docs)\n[Valorant machine-readable guide](/custom/valorant/llms.txt)\n[PSN guide](/psn/docs)\n[PSN machine-readable guide](/psn/llms.txt)\n[Steam guide](/steam/docs)\n[Steam machine-readable guide](/steam/llms.txt)\n[Epic guide](/epic/docs)\n[Epic machine-readable guide](/epic/llms.txt)\n[Playnite guide](/playnite/docs)\n[Playnite machine-readable guide](/playnite/llms.txt)\n[Provider data coverage policy](' + coverage + ')\n[PSN setup and recovery](' + setup + ')\n[Steam setup and operations](' + steamSetup + ')\n[Epic setup and operations](' + epicSetup + ')\n[Playnite setup](' + playniteSetup + ')' },
    { title: 'Access', text: 'GET /health is public and reports the running release. Documentation is public. Valorant, PSN, Steam, Epic, and Playnite data require X-API-Key from a server-side consumer. The Playnite Windows extension has a separate upload-only key. Requests serve stored snapshots; refresh jobs run independently. See each provider guide for schemas and availability.' },
  ];
  router.get('/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API', indexSections)));
  router.get(['/', '/docs'], (req,res)=>res.type('html').send(html('Gaming Stats API', indexSections.filter(s=>s.title!=='Documentation'), [
    ['Valorant docs','/custom/valorant/docs'],['PSN docs','/psn/docs'],['Steam docs','/steam/docs'],['Epic docs','/epic/docs'],['Playnite docs','/playnite/docs'],['llms.txt','/llms.txt'],['Coverage policy',coverage],['PSN setup',setup],['Steam setup',steamSetup],['Epic setup',epicSetup],['Playnite setup',playniteSetup],
  ])));
  router.get('/psn/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API — PSN', psnSections())));
  router.get(['/psn','/psn/docs'], (req,res)=>res.type('html').send(html('PSN API', psnSections(), [
    ['All providers','/docs'],['llms.txt','/psn/llms.txt'],['Setup and recovery',setup],
  ])));
  router.get('/steam/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API — Steam', steamSections())));
  router.get(['/steam','/steam/docs'], (req,res)=>res.type('html').send(html('Steam API', steamSections(), [
    ['All providers','/docs'],['llms.txt','/steam/llms.txt'],['Setup and operations',steamSetup],
  ])));
  router.get('/epic/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API — Epic', epicSections())));
  router.get(['/epic','/epic/docs'], (req,res)=>res.type('html').send(html('Epic API', epicSections(), [
    ['All providers','/docs'],['llms.txt','/epic/llms.txt'],['Setup and operations',epicSetup],
  ])));
  router.get('/playnite/llms.txt', (req,res)=>res.type('text/plain').send(markdown('Gaming Stats API: Playnite', playniteSections())));
  router.get(['/playnite','/playnite/docs'], (req,res)=>res.type('html').send(html('Playnite API', playniteSections(), [
    ['All providers','/docs'],['llms.txt','/playnite/llms.txt'],['Setup and operations',playniteSetup],
  ])));
  return router;
}

module.exports = { createGamingDocsRouter };
