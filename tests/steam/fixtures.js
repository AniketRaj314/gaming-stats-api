const steamId = '76561198000000000';
const profile = { response: { players: [{
  steamid: steamId,
  communityvisibilitystate: 3,
  personaname: 'Fixture Player',
  profileurl: `https://steamcommunity.com/profiles/${steamId}/`,
  avatarfull: 'https://avatars.akamai.steamstatic.com/0123456789abcdef0123456789abcdef01234567_full.jpg',
  personastate: 1,
  lastlogoff: 1700000000,
  timecreated: 1500000000,
  loccountrycode: 'IN',
  gameid: '570',
  gameextrainfo: 'Dota 2',
}] } };
const level = { response: { player_level: 42 } };
const games = [
  { appid: 570, name: 'Dota 2', playtime_forever: 600, playtime_2weeks: 30, playtime_windows_forever: 500,
    playtime_linux_forever: 100, playtime_mac_forever: 0, rtime_last_played: 1700000000,
    img_icon_url: 'a'.repeat(40), has_community_visible_stats: true },
  { appid: 730, name: 'Counter-Strike 2', playtime_forever: 120, playtime_windows_forever: 120,
    rtime_last_played: 1600000000, img_icon_url: 'b'.repeat(40), has_community_visible_stats: false },
];
const library = { response: { game_count: games.length, games } };
const recent = { response: { total_count: 1, games: [games[0]] } };
const asset = (appid, filename = 'library_600x900_2x.jpg') => ({
  appid, success: 1, assets: {
    asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1700000000`,
    library_capsule_2x: `${String(appid).padStart(40, '0')}/${filename}`,
  },
});
const assets = { response: { store_items: games.map(game => asset(game.appid)) } };
const recentAssets = { response: { store_items: [asset(games[0].appid)] } };
const schema = { game: { gameName: 'Dota 2', availableGameStats: {
  achievements: [
    { name: 'FIRST', displayName: 'First Win', description: 'Win once', hidden: 0,
      icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/first.jpg',
      icongray: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/first_gray.jpg' },
    { name: 'SECRET', displayName: 'Spoiler', description: 'Secret description', hidden: 1,
      icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/secret.jpg',
      icongray: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/570/secret_gray.jpg' },
  ],
  stats: [{ name: 'kills', displayName: 'Kills' }],
} } };
const achievements = { playerstats: { steamID: steamId, gameName: 'Dota 2', success: true, achievements: [
  { apiname: 'FIRST', achieved: 1, unlocktime: 1700000000 },
  { apiname: 'SECRET', achieved: 0, unlocktime: 0 },
] } };
const stats = { playerstats: { steamID: steamId, gameName: 'Dota 2', success: true, stats: [{ name: 'kills', value: 99 }] } };
const globalAchievements = { achievementpercentages: { achievements: [
  { name: 'FIRST', percent: 12.5 }, { name: 'SECRET', percent: 0 },
] } };

module.exports = { steamId, profile, level, games, library, recent, asset, assets, recentAssets,
  schema, achievements, stats, globalAchievements };
