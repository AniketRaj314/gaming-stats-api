const { ProviderError } = require('../../shared/providerError');

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 512) => typeof value === 'string' && value.length <= max ? value : null;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;

const avatarHosts = new Set([
  'avatars.akamai.steamstatic.com', 'avatars.fastly.steamstatic.com', 'avatars.cloudflare.steamstatic.com',
  'avatars.steamstatic.com', 'steamcdn-a.akamaihd.net',
]);
const achievementHosts = new Set([
  'cdn.akamai.steamstatic.com', 'cdn.fastly.steamstatic.com', 'cdn.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net', 'media.steampowered.com',
]);

function appId(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 0xffffffff) {
    throw new ProviderError('invalid-identifier', 'schema');
  }
  return parsed;
}

function minutes(value) {
  if (value === undefined || value === null) return null;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestamp(seconds) {
  if (seconds === undefined || seconds === null || seconds === 0) return null;
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 8640000000000 / 1000) return null;
  return new Date(seconds * 1000).toISOString();
}

function safeUrl(value, hosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.has(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function iconUrl(id, hash) {
  return typeof hash === 'string' && /^[a-f\d]{40}$/i.test(hash)
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${id}/${hash}.jpg`
    : null;
}

function assetFileUrl(format, id, filename) {
  const formatPattern = new RegExp(`^steam/apps/${id}/\\$\\{FILENAME\\}(?:\\?t=\\d{1,12})?$`);
  const validFilename = typeof filename === 'string' && filename.length <= 512 && /^[A-Za-z0-9._/-]+$/.test(filename)
    && filename.split('/').every(part => part && part !== '.' && part !== '..');
  if (!formatPattern.test(format) || !validFilename) return null;
  return new URL(format.replace('${FILENAME}', filename),
    'https://shared.fastly.steamstatic.com/store_item_assets/').toString();
}

function nameRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter(object).map(row => ({
    name: text(row.name, 512),
    creatorClanAccountId: integer(row.creator_clan_account_id, 0, 0xffffffff),
  })).filter(row => row.name);
}

function reviewSummary(value) {
  if (!object(value)) return null;
  return {
    count: integer(value.review_count ?? value.count),
    percentPositive: finite(value.percent_positive),
    score: integer(value.review_score ?? value.score),
    label: text(value.review_score_label ?? value.label, 128),
  };
}

function storeMetadata(raw, expectedIds) {
  const rows = raw?.response?.store_items;
  if (!Array.isArray(rows)) throw new ProviderError('invalid-assets-response', 'assets');
  const expected = new Set(expectedIds);
  const output = new Map();
  for (const row of rows) {
    const id = appId(row?.appid);
    if (!expected.has(id) || output.has(id)) throw new ProviderError('invalid-asset-record', 'assets');
    const format = row?.assets?.asset_url_format;
    const image = filename => row.success === 1 ? assetFileUrl(format, id, filename) : null;
    const assets = object(row.assets) ? row.assets : {};
    const path = text(row.store_url_path, 1024);
    const pathParts = path?.split('/').filter(Boolean) || [];
    const safePath = path && /^\/?(?:app|sub|bundle)\/\d+(?:\/[A-Za-z0-9_.~-]+)*\/?$/.test(path)
      && pathParts.every(part => part !== '.' && part !== '..') ? path : null;
    const tagIds = Array.isArray(row.tagids) ? row.tagids.map(value => integer(value, 0, 0xffffffff)).filter(value => value !== null) : [];
    const tags = Array.isArray(row.tags) ? row.tags.slice(0, 100).filter(object).map(value => ({
      tagId: integer(value.tagid, 0, 0xffffffff),
      weight: finite(value.weight),
    })).filter(value => value.tagId !== null) : [];
    const categories = object(row.categories) ? row.categories : {};
    const categoryIds = key => Array.isArray(categories[key])
      ? categories[key].map(value => integer(value, 0, 0xffffffff)).filter(value => value !== null) : [];
    const platforms = object(row.platforms) ? row.platforms : {};
    const basic = object(row.basic_info) ? row.basic_info : {};
    const release = object(row.release) ? row.release : {};
    const libraryCapsuleUrl = image(assets.library_capsule_2x) || image(assets.library_capsule);
    output.set(id, {
      visible: boolean(row.visible),
      itemType: integer(row.item_type),
      type: integer(row.type),
      isFree: boolean(row.is_free),
      urlPath: safePath,
      urlSlug: text(row.store_url_slug, 512),
      url: safePath ? new URL(safePath, 'https://store.steampowered.com/').toString() : null,
      shortDescription: text(basic.short_description, 4096),
      developers: nameRecords(basic.developers),
      publishers: nameRecords(basic.publishers),
      franchises: nameRecords(basic.franchises),
      tagIds,
      tags,
      categories: {
        supportedPlayerCategoryIds: categoryIds('supported_player_categoryids'),
        featureCategoryIds: categoryIds('feature_categoryids'),
      },
      reviews: {
        allLanguages: reviewSummary(row.reviews?.summary_filtered),
        selectedLanguage: reviewSummary(row.reviews?.summary_language_specific),
      },
      releaseAt: timestamp(release.steam_release_date),
      platforms: {
        windows: boolean(platforms.windows),
        mac: boolean(platforms.mac),
        linux: boolean(platforms.steamos_linux),
        steamDeckCompatibilityCategory: integer(platforms.steam_deck_compat_category),
        steamOsCompatibilityCategory: integer(platforms.steam_os_compat_category),
        steamFrameCompatibilityCategory: integer(platforms.steam_frame_compat_category),
        steamMachineCompatibilityCategory: integer(platforms.steam_machine_compat_category),
        vrSupport: object(platforms.vr_support) ? {
          hmd: boolean(platforms.vr_support.vr_hmd),
          hmdOnly: boolean(platforms.vr_support.vr_hmd_only),
          htcVive: boolean(platforms.vr_support.htc_vive),
          oculusRift: boolean(platforms.vr_support.oculus_rift),
          windowsMixedReality: boolean(platforms.vr_support.windows_mixed_reality),
        } : null,
      },
      artwork: {
        libraryCapsuleUrl,
        libraryCapsule1xUrl: image(assets.library_capsule),
        libraryCapsule2xUrl: image(assets.library_capsule_2x),
        mainCapsuleUrl: image(assets.main_capsule),
        smallCapsuleUrl: image(assets.small_capsule),
        headerUrl: image(assets.header),
        packageHeaderUrl: image(assets.package_header),
        heroCapsuleUrl: image(assets.hero_capsule),
        heroCapsule2xUrl: image(assets.hero_capsule_2x),
        libraryHeroUrl: image(assets.library_hero),
        libraryHero2xUrl: image(assets.library_hero_2x),
        libraryHeaderUrl: image(assets.library_header),
        libraryLogoUrl: image(assets.library_logo),
        libraryLogo2xUrl: image(assets.library_logo_2x),
        verticalCapsuleUrl: image(assets.vertical_capsule),
        verticalCapsule2xUrl: image(assets.vertical_capsule_2x),
        communityIconUrl: image(assets.community_icon),
        pageBackgroundUrl: image(assets.page_background),
        lastModifiedAt: timestamp(assets.asset_time_created),
      },
    });
  }
  return output;
}

function assetUrls(raw, expectedIds) {
  return new Map([...storeMetadata(raw, expectedIds)].map(([id, value]) => [id, value.artwork.libraryCapsuleUrl]));
}

function game(raw, stores = new Map()) {
  if (!object(raw)) throw new ProviderError('invalid-game-record', 'schema');
  const id = appId(raw.appid);
  const name = text(raw.name, 512);
  if (!name) throw new ProviderError('invalid-game-record', 'schema');
  return {
    providerGameId: String(id), appId: id, name,
    playtimeMinutes: minutes(raw.playtime_forever),
    playtimeTwoWeeksMinutes: minutes(raw.playtime_2weeks),
    playtimeWindowsMinutes: minutes(raw.playtime_windows_forever),
    playtimeMacMinutes: minutes(raw.playtime_mac_forever),
    playtimeLinuxMinutes: minutes(raw.playtime_linux_forever),
    playtimeDeckMinutes: minutes(raw.playtime_deck_forever),
    playtimeDisconnectedMinutes: minutes(raw.playtime_disconnected),
    lastPlayedAt: timestamp(raw.rtime_last_played),
    hasCommunityVisibleStats: raw.has_community_visible_stats === true,
    hasWorkshop: boolean(raw.has_workshop),
    hasMarket: boolean(raw.has_market),
    hasDlc: boolean(raw.has_dlc),
    hasLeaderboards: boolean(raw.has_leaderboards),
    contentDescriptorIds: Array.isArray(raw.content_descriptorids)
      ? raw.content_descriptorids.map(value => integer(value, 0, 0xffffffff)).filter(value => value !== null) : [],
    capsuleFilename: text(raw.capsule_filename, 512),
    iconUrl: iconUrl(id, raw.img_icon_url),
    coverUrl: stores.get(id)?.artwork?.libraryCapsuleUrl || null,
    store: stores.get(id) || null,
  };
}

function gamesResponse(raw, countField, stage, assetsRaw) {
  const response = raw?.response;
  if (!object(response) || !Number.isSafeInteger(response[countField]) || response[countField] < 0 || response[countField] > 100000) {
    throw new ProviderError('private-or-invalid-response', stage);
  }
  const rows = response.games === undefined && response[countField] === 0 ? [] : response.games;
  if (!Array.isArray(rows) || rows.length !== response[countField]) throw new ProviderError('invalid-game-count', 'schema');
  const ids = rows.map(row => appId(row?.appid));
  const stores = assetsRaw ? storeMetadata(assetsRaw, ids) : new Map();
  const normalized = rows.map(row => game(row, stores));
  if (new Set(normalized.map(item => item.appId)).size !== normalized.length) throw new ProviderError('duplicate-game-record', 'schema');
  normalized.sort((a, b) => (b.playtimeTwoWeeksMinutes || 0) - (a.playtimeTwoWeeksMinutes || 0)
    || (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0) || a.name.localeCompare(b.name));
  return normalized;
}

function library(raw, assetsRaw) {
  const games = gamesResponse(raw, 'game_count', 'library', assetsRaw);
  const sum = key => games.reduce((total, item) => total + (item[key] || 0), 0);
  return {
    coverage: { kind: 'owned-games', complete: true, includePlayedFreeGames: true, includeFreeSubscriptions: true, privacyDependent: true },
    totals: {
      gameCount: games.length,
      playedGameCount: games.filter(item => item.playtimeMinutes > 0).length,
      totalPlaytimeMinutes: sum('playtimeMinutes'),
      windowsPlaytimeMinutes: sum('playtimeWindowsMinutes'),
      macPlaytimeMinutes: sum('playtimeMacMinutes'),
      linuxPlaytimeMinutes: sum('playtimeLinuxMinutes'),
      deckPlaytimeMinutes: sum('playtimeDeckMinutes'),
      disconnectedPlaytimeMinutes: sum('playtimeDisconnectedMinutes'),
      gamesWithCommunityStats: games.filter(item => item.hasCommunityVisibleStats).length,
    },
    games,
  };
}

function recent(raw, assetsRaw) {
  const games = gamesResponse(raw, 'total_count', 'recent', assetsRaw);
  return {
    windowDays: 14,
    totals: {
      gameCount: games.length,
      playtimeMinutes: games.reduce((total, item) => total + (item.playtimeTwoWeeksMinutes || 0), 0),
    },
    games,
  };
}

const personaStates = ['offline', 'online', 'busy', 'away', 'snooze', 'looking-to-trade', 'looking-to-play'];
function profile(raw, levelRaw, expectedSteamId) {
  const players = raw?.response?.players;
  if (!Array.isArray(players) || players.length !== 1 || players[0]?.steamid !== expectedSteamId) {
    throw new ProviderError('profile-unavailable', 'profile');
  }
  const value = players[0];
  const personaState = Number.isInteger(value.personastate) && personaStates[value.personastate]
    ? personaStates[value.personastate] : 'unknown';
  const visibility = value.communityvisibilitystate === 3 ? 'public'
    : value.communityvisibilitystate === 1 ? 'private' : 'unknown';
  const level = levelRaw?.response?.player_level;
  const avatarUrls = {
    small: safeUrl(value.avatar, avatarHosts),
    medium: safeUrl(value.avatarmedium, avatarHosts),
    full: safeUrl(value.avatarfull, avatarHosts),
  };
  return {
    steamId: expectedSteamId,
    personaName: text(value.personaname, 256),
    profileUrl: safeUrl(value.profileurl, new Set(['steamcommunity.com'])),
    avatarUrl: avatarUrls.full || avatarUrls.medium || avatarUrls.small,
    avatarUrls,
    avatarHash: typeof value.avatarhash === 'string' && /^[a-f\d]{40}$/i.test(value.avatarhash) ? value.avatarhash : null,
    communityVisibility: visibility,
    communityVisibilityCode: integer(value.communityvisibilitystate),
    profileState: integer(value.profilestate),
    commentPermission: integer(value.commentpermission),
    personaState,
    personaStateCode: integer(value.personastate),
    personaStateFlags: integer(value.personastateflags),
    lastLogoffAt: timestamp(value.lastlogoff),
    createdAt: timestamp(value.timecreated),
    countryCode: typeof value.loccountrycode === 'string' && /^[A-Z]{2}$/.test(value.loccountrycode) ? value.loccountrycode : null,
    steamLevel: Number.isSafeInteger(level) && level >= 0 ? level : null,
    currentGame: value.gameid && value.gameid !== '0' ? {
      providerGameId: String(appId(value.gameid)),
      appId: appId(value.gameid),
      name: text(value.gameextrainfo, 512),
    } : null,
  };
}

function badges(badgesRaw, questsRaw, failures = {}) {
  const response = badgesRaw?.response;
  const questResponse = questsRaw?.response;
  if (!object(response)) throw new ProviderError('invalid-badges-response', 'badges');
  const rows = Array.isArray(response.badges) ? response.badges : [];
  const quests = Array.isArray(questResponse?.quests) ? questResponse.quests : [];
  return {
    playerXp: integer(response.player_xp),
    playerLevel: integer(response.player_level),
    playerXpNeededToLevelUp: integer(response.player_xp_needed_to_level_up),
    playerXpNeededCurrentLevel: integer(response.player_xp_needed_current_level),
    communityBadgeId: 2,
    communityBadgeQuestStatus: object(questResponse) ? 'available'
      : failures.quests === 'badges:not-supported' ? 'not-supported'
        : failures.quests === 'badges:forbidden' ? 'private' : 'unavailable',
    badges: rows.slice(0, 10000).filter(object).map(row => ({
      badgeId: integer(row.badgeid, 0, 0xffffffff),
      level: integer(row.level),
      completedAt: timestamp(row.completion_time),
      xp: integer(row.xp),
      scarcity: integer(row.scarcity),
      appId: row.appid === undefined ? null : integer(row.appid, 0, 0xffffffff),
      communityItemId: typeof row.communityitemid === 'string' && /^\d{1,20}$/.test(row.communityitemid)
        ? row.communityitemid : Number.isSafeInteger(row.communityitemid) ? String(row.communityitemid) : null,
      borderColor: integer(row.border_color),
    })).filter(row => row.badgeId !== null),
    communityBadgeQuests: quests.slice(0, 10000).filter(object).map(row => ({
      questId: integer(row.questid, 0, 0xffffffff),
      completed: boolean(row.completed),
    })).filter(row => row.questId !== null),
  };
}

function details({ schemaRaw, achievementsRaw, statsRaw, globalRaw, currentPlayersRaw, failures = {} }) {
  const schemaGame = object(schemaRaw?.game) ? schemaRaw.game : null;
  const available = object(schemaGame?.availableGameStats) ? schemaGame.availableGameStats : {};
  const definitions = Array.isArray(available.achievements) ? available.achievements : [];
  const playerStats = achievementsRaw?.playerstats;
  const playerRows = Array.isArray(playerStats?.achievements) ? playerStats.achievements : [];
  const globalRows = Array.isArray(globalRaw?.achievementpercentages?.achievements)
    ? globalRaw.achievementpercentages.achievements : [];
  const players = new Map(playerRows.filter(object).map(row => [row.apiname, row]));
  const globals = new Map(globalRows.filter(object).map(row => [row.name, row.percent]));

  let achievementStatus = 'not-supported';
  if (definitions.length) {
    achievementStatus = playerStats?.success === false ? 'private'
      : Array.isArray(playerStats?.achievements) ? 'available'
        : failures.achievements === 'privacy:private' || failures.achievements === 'game-achievements:forbidden' ? 'private' : 'unavailable';
  } else if (!schemaGame && failures.schema && failures.schema !== 'game-schema:not-supported') {
    achievementStatus = 'unavailable';
  }

  const seen = new Set();
  const achievements = definitions.map(definition => {
    if (!object(definition) || typeof definition.name !== 'string' || !definition.name || seen.has(definition.name)) {
      throw new ProviderError('invalid-achievement-schema', 'schema');
    }
    seen.add(definition.name);
    const player = players.get(definition.name);
    const achieved = player?.achieved === 1 ? true : player?.achieved === 0 ? false : null;
    const hidden = definition.hidden === 1;
    const conceal = hidden && achieved !== true;
    const percent = globals.get(definition.name);
    const unlockedIconUrl = conceal ? null : safeUrl(definition.icon, achievementHosts);
    const lockedIconUrl = conceal ? null : safeUrl(definition.icongray, achievementHosts);
    return {
      apiName: definition.name,
      name: conceal ? 'Hidden achievement' : text(definition.displayName, 512),
      description: conceal ? null : text(definition.description, 2048),
      hidden,
      defaultValue: finite(definition.defaultvalue),
      achieved,
      unlockedAt: achieved ? timestamp(player.unlocktime) : null,
      iconUrl: achieved ? unlockedIconUrl : lockedIconUrl,
      unlockedIconUrl,
      lockedIconUrl,
      globalPercent: typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null,
    };
  });
  const unlocked = achievements.filter(item => item.achieved === true);
  const rarest = unlocked.filter(item => item.globalPercent !== null)
    .sort((a, b) => a.globalPercent - b.globalPercent || a.apiName.localeCompare(b.apiName))[0] || null;

  const schemaStats = new Map((Array.isArray(available.stats) ? available.stats : [])
    .filter(item => object(item) && typeof item.name === 'string').map(item => [item.name, item]));
  const rawStats = Array.isArray(statsRaw?.playerstats?.stats) ? statsRaw.playerstats.stats : [];
  const stats = rawStats.filter(item => object(item) && typeof item.name === 'string' && Number.isFinite(item.value)).map(item => ({
    name: item.name,
    displayName: text(schemaStats.get(item.name)?.displayName, 512),
    defaultValue: finite(schemaStats.get(item.name)?.defaultvalue),
    value: item.value,
  }));
  const statsStatus = Array.isArray(statsRaw?.playerstats?.stats) ? 'available'
    : failures.stats === 'game-stats:forbidden' || statsRaw?.playerstats?.success === false ? 'private'
      : schemaStats.size || failures.stats && failures.stats !== 'game-stats:not-supported' ? 'unavailable' : 'not-supported';
  return {
    gameName: text(schemaGame?.gameName, 512),
    gameVersion: text(schemaGame?.gameVersion, 128),
    currentPlayers: integer(currentPlayersRaw?.response?.player_count),
    currentPlayersStatus: Number.isSafeInteger(currentPlayersRaw?.response?.player_count) ? 'available'
      : failures.currentPlayers === 'current-players:not-supported' ? 'not-supported' : 'unavailable',
    achievementStatus,
    achievementCoverage: {
      defined: achievements.length,
      playerRows: playerRows.length,
      unlocked: unlocked.length,
      unlockedWithKnownGlobalPercent: unlocked.filter(item => item.globalPercent !== null).length,
    },
    achievements: achievementStatus === 'available' ? achievements : [],
    rarestUnlock: achievementStatus === 'available' ? rarest : null,
    rarityComparison: 'unlocked-achievements-with-known-global-percent',
    statsStatus,
    stats: statsStatus === 'available' ? stats : [],
  };
}

module.exports = { appId, game, assetUrls, storeMetadata, library, recent, profile, badges, details };
