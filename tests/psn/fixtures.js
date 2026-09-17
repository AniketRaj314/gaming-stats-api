const media = { images: [
  { type: 'GAMEHUB_COVER_ART', format: 'IMAGE', url: 'https://image.api.playstation.com/cover.png' },
  { type: 'SCREENSHOT', format: 'IMAGE', url: 'https://image.api.playstation.com/screenshot.png' },
] };
const games = [{ titleId: 'PPSA12345_00', name: 'Fixture Game', imageUrl: 'https://image.api.playstation.com/game.png',
  localizedImageUrl: 'https://image.api.playstation.com/game-localized.png', category: 'ps5_native_game',
  playDuration: 'PT2H3M4.5S', playCount: 2, media, concept: { id: '12345', media: { images: [
    ...media.images, { type: 'LOGO', format: 'IMAGE', url: 'https://image.api.playstation.com/logo.png' },
  ] } } }];
const lists = [{ npCommunicationId: 'NPWR12345_00', npServiceName: 'trophy2', trophyTitleName: 'Fixture Trophies', trophyTitlePlatform: 'PS5', hiddenFlag: false, progress: 25, earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 }, definedTrophies: { bronze: 3, silver: 0, gold: 0, platinum: 1 } }];
const summary = { accountId: '12345678901234567890', trophyLevel: '105', earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 } };
const playing = { basicPresence: { primaryPlatformInfo: { onlineStatus: 'online', platform: 'PS5' }, gameTitleInfoList: [{ npTitleId: games[0].titleId, titleName: games[0].name, format: 'PS5' }] } };
const definitions = [{ trophyId: 1, trophyName: 'A Secret', trophyDetail: 'Spoiler', trophyHidden: true, trophyType: 'bronze', trophyIconUrl: 'https://image.api.playstation.com/trophy.png' }];
const session = { accessToken: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token', accessExpiresAt: 1900000000000, refreshExpiresAt: 1901000000000, accountId: summary.accountId };
module.exports = { games, media, lists, summary, playing, definitions, session };
