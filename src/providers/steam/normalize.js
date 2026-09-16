const { ProviderError } = require('../../shared/providerError');

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 512) => typeof value === 'string' && value.length <= max ? value : null;

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

function game(raw) {
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
    playtimeDisconnectedMinutes: minutes(raw.playtime_disconnected),
    lastPlayedAt: timestamp(raw.rtime_last_played),
    hasCommunityVisibleStats: raw.has_community_visible_stats === true,
    iconUrl: iconUrl(id, raw.img_icon_url),
  };
}

function gamesResponse(raw, countField, stage) {
  const response = raw?.response;
  if (!object(response) || !Number.isSafeInteger(response[countField]) || response[countField] < 0 || response[countField] > 100000) {
    throw new ProviderError('private-or-invalid-response', stage);
  }
  const rows = response.games === undefined && response[countField] === 0 ? [] : response.games;
  if (!Array.isArray(rows) || rows.length !== response[countField]) throw new ProviderError('invalid-game-count', 'schema');
  const normalized = rows.map(game);
  if (new Set(normalized.map(item => item.appId)).size !== normalized.length) throw new ProviderError('duplicate-game-record', 'schema');
  normalized.sort((a, b) => (b.playtimeTwoWeeksMinutes || 0) - (a.playtimeTwoWeeksMinutes || 0)
    || (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0) || a.name.localeCompare(b.name));
  return normalized;
}

function library(raw) {
  const games = gamesResponse(raw, 'game_count', 'library');
  const sum = key => games.reduce((total, item) => total + (item[key] || 0), 0);
  return {
    coverage: { kind: 'owned-games', complete: true, includePlayedFreeGames: true, privacyDependent: true },
    totals: {
      gameCount: games.length,
      playedGameCount: games.filter(item => item.playtimeMinutes > 0).length,
      totalPlaytimeMinutes: sum('playtimeMinutes'),
      windowsPlaytimeMinutes: sum('playtimeWindowsMinutes'),
      macPlaytimeMinutes: sum('playtimeMacMinutes'),
      linuxPlaytimeMinutes: sum('playtimeLinuxMinutes'),
      disconnectedPlaytimeMinutes: sum('playtimeDisconnectedMinutes'),
      gamesWithCommunityStats: games.filter(item => item.hasCommunityVisibleStats).length,
    },
    games,
  };
}

function recent(raw) {
  const games = gamesResponse(raw, 'total_count', 'recent');
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
  return {
    steamId: expectedSteamId,
    personaName: text(value.personaname, 256),
    profileUrl: safeUrl(value.profileurl, new Set(['steamcommunity.com'])),
    avatarUrl: safeUrl(value.avatarfull || value.avatarmedium || value.avatar, new Set([
      'avatars.akamai.steamstatic.com', 'avatars.fastly.steamstatic.com', 'avatars.cloudflare.steamstatic.com',
      'avatars.steamstatic.com', 'steamcdn-a.akamaihd.net',
    ])),
    communityVisibility: visibility,
    personaState,
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

function details({ schemaRaw, achievementsRaw, statsRaw, globalRaw, failures = {} }) {
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
    return {
      apiName: definition.name,
      name: conceal ? 'Hidden achievement' : text(definition.displayName, 512),
      description: conceal ? null : text(definition.description, 2048),
      hidden,
      achieved,
      unlockedAt: achieved ? timestamp(player.unlocktime) : null,
      iconUrl: conceal ? null : safeUrl(achieved ? definition.icon : definition.icongray, new Set([
        'cdn.akamai.steamstatic.com', 'cdn.fastly.steamstatic.com', 'cdn.cloudflare.steamstatic.com',
        'steamcdn-a.akamaihd.net', 'media.steampowered.com',
      ])),
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
    value: item.value,
  }));
  const statsStatus = Array.isArray(statsRaw?.playerstats?.stats) ? 'available'
    : failures.stats === 'game-stats:forbidden' || statsRaw?.playerstats?.success === false ? 'private'
      : schemaStats.size || failures.stats && failures.stats !== 'game-stats:not-supported' ? 'unavailable' : 'not-supported';
  return {
    gameName: text(schemaGame?.gameName, 512),
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

module.exports = { appId, game, library, recent, profile, details };
