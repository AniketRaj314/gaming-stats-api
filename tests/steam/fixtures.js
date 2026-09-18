const steamId = '76561198000000000';
const profile = { response: { players: [{
  steamid: steamId,
  communityvisibilitystate: 3,
  personaname: 'Fixture Player',
  profileurl: `https://steamcommunity.com/profiles/${steamId}/`,
  avatarfull: 'https://avatars.akamai.steamstatic.com/0123456789abcdef0123456789abcdef01234567_full.jpg',
  avatarmedium: 'https://avatars.akamai.steamstatic.com/0123456789abcdef0123456789abcdef01234567_medium.jpg',
  avatar: 'https://avatars.akamai.steamstatic.com/0123456789abcdef0123456789abcdef01234567.jpg',
  avatarhash: '0123456789abcdef0123456789abcdef01234567',
  profilestate: 1,
  commentpermission: 1,
  personastate: 1,
  personastateflags: 4,
  lastlogoff: 1700000000,
  timecreated: 1500000000,
  loccountrycode: 'IN',
  gameid: '570',
  gameextrainfo: 'Dota 2',
}] } };
const level = { response: { player_level: 42 } };
const games = [
  { appid: 570, name: 'Dota 2', playtime_forever: 600, playtime_2weeks: 30, playtime_windows_forever: 500,
    playtime_linux_forever: 100, playtime_mac_forever: 0, playtime_deck_forever: 10, rtime_last_played: 1700000000,
    img_icon_url: 'a'.repeat(40), has_community_visible_stats: true, has_workshop: true, has_market: true,
    has_dlc: true, has_leaderboards: true, content_descriptorids: [2, 5], capsule_filename: '570/capsule.jpg' },
  { appid: 730, name: 'Counter-Strike 2', playtime_forever: 120, playtime_windows_forever: 120,
    rtime_last_played: 1600000000, img_icon_url: 'b'.repeat(40), has_community_visible_stats: false },
];
const library = { response: { game_count: games.length, games } };
const recent = { response: { total_count: 1, games: [games[0]] } };
const asset = (appid, filename = 'library_600x900_2x.jpg') => ({
  appid, success: 1, visible: true, unlisted: false, item_type: 0, type: 0, is_free: appid === 570,
  store_url_path: `app/${appid}/fixture_game`, store_url_slug: 'fixture_game', tagids: [1, 2],
  tags: [{ tagid: 1, weight: 100 }],
  categories: { supported_player_categoryids: [1], feature_categoryids: [22] },
  reviews: { summary_filtered: { count: 100, percent_positive: 90, score: 8, label: 'Very Positive' } },
  basic_info: { short_description: 'Fixture description', developers: [{ name: 'Fixture Studio', creator_clan_account_id: 123 }],
    publishers: [{ name: 'Fixture Publisher', creator_clan_account_id: 456 }] },
  release: { steam_release_date: 1500000000 },
  content_descriptorids: [2],
  platforms: { windows: true, mac: false, steamos_linux: true, steam_deck_compat_category: 3 },
  assets: {
    asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1700000000`,
    library_capsule_2x: `${String(appid).padStart(40, '0')}/${filename}`,
    header: `${String(appid).padStart(40, '0')}/header.jpg`,
    header_2x: `${String(appid).padStart(40, '0')}/header_2x.jpg`,
    main_capsule_2x: `${String(appid).padStart(40, '0')}/main_2x.jpg`,
    small_capsule_2x: `${String(appid).padStart(40, '0')}/small_2x.jpg`,
    raw_page_background: `${String(appid).padStart(40, '0')}/background_raw.jpg`,
    page_background_path: `app/${appid}?t=1700000000`,
    last_modified: 1700000000,
  },
  assets_without_overrides: {
    asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1600000000`,
    library_capsule_2x: `${String(appid).padStart(40, '0')}/original_library.jpg`,
    last_modified: 1600000000,
  },
  screenshots: {
    all_ages_screenshots: [{ filename: `steam/apps/${appid}/${String(appid).padStart(40, '0')}/ss_all.jpg?t=1700000000`, ordinal: 0 }],
    mature_content_screenshots: [{ filename: `${String(appid).padStart(40, '0')}/ss_mature.jpg`, ordinal: 1 }],
  },
});
const assets = { response: { store_items: games.map(game => asset(game.appid)) } };
const recentAssets = { response: { store_items: [asset(games[0].appid)] } };
const schema = { game: { gameName: 'Dota 2', gameVersion: '42', availableGameStats: {
  achievements: [
    { name: 'FIRST', defaultvalue: 0, displayName: 'First Win', description: 'Win once', hidden: 0,
      icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/first.jpg',
      icongray: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/first_gray.jpg' },
    { name: 'SECRET', displayName: 'Spoiler', description: 'Secret description', hidden: 1,
      icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/secret.jpg',
      icongray: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/secret_gray.jpg' },
  ],
  stats: [{ name: 'kills', displayName: 'Kills', defaultvalue: 0 }],
} } };
const achievements = { playerstats: { steamID: steamId, gameName: 'Dota 2', success: true, achievements: [
  { apiname: 'FIRST', achieved: 1, unlocktime: 1700000000 },
  { apiname: 'SECRET', achieved: 0, unlocktime: 0 },
] } };
const stats = { playerstats: { steamID: steamId, gameName: 'Dota 2', success: true, stats: [{ name: 'kills', value: 99 }] } };
const globalAchievements = { achievementpercentages: { achievements: [
  { name: 'FIRST', percent: '12.5' }, { name: 'SECRET', percent: '0' },
] } };
const currentPlayers = { response: { player_count: 12345, result: 1 } };
const badges = { response: { badges: [{ badgeid: 1, level: 2, completion_time: 1700000000, xp: 100, scarcity: 500 }],
  player_xp: 4200, player_level: 42, player_xp_needed_to_level_up: 300, player_xp_needed_current_level: 200 } };
const communityBadgeProgress = { response: { quests: [{ questid: 1, completed: true }, { questid: 2, completed: false }] } };

module.exports = { steamId, profile, level, games, library, recent, asset, assets, recentAssets,
  schema, achievements, stats, globalAchievements, currentPlayers, badges, communityBadgeProgress };
