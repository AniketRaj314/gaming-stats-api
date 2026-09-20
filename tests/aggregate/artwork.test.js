const { selectArtwork, shape } = require('../../src/providers/aggregate/artwork');

const observation = (provider, role, providerGameId, data) => ({ provider, role, providerGameId, data });

test('classifies known image dimensions without guessing unknown shapes', () => {
  expect(shape(1920, 1080)).toBe('landscape');
  expect(shape(600, 900)).toBe('portrait');
  expect(shape(512, 512)).toBe('square');
  expect(shape(null, null)).toBeNull();
});

test('prefers authoritative Epic roles while retaining every Playnite helper image', () => {
  const epicLandscape = 'https://cdn1.epicgames.com/game/landscape.jpg';
  const epicPortrait = 'https://cdn1.epicgames.com/game/portrait.jpg';
  const playniteCover = '/playnite/assets/' + 'a'.repeat(64);
  const playniteBackground = '/playnite/assets/' + 'b'.repeat(64);
  const artwork = selectArtwork([
    observation('epic', 'authoritative', 'epic-id', {
      artwork: { url: epicLandscape, images: [
        { type: 'DieselGameBox', url: epicLandscape, width: 2560, height: 1440, alt: 'Landscape', sizeBytes: 100 },
        { type: 'DieselGameBoxTall', url: epicPortrait, width: 1200, height: 1600, alt: 'Portrait', sizeBytes: 200 },
      ] },
    }),
    observation('playnite', 'helper-mirror', 'playnite-id', { artwork: {
      cover: { path: playniteCover, assetId: 'a'.repeat(64), contentType: 'image/jpeg', width: 810, height: 1080 },
      background: { path: playniteBackground, assetId: 'b'.repeat(64), contentType: 'image/png', width: 1106, height: 956 },
    } }),
  ]);

  expect(artwork).toMatchObject({ landscapeUrl: epicLandscape, portraitUrl: epicPortrait,
    squareUrl: null, iconUrl: null });
  expect(artwork).not.toHaveProperty('coverUrl');
  expect(artwork).not.toHaveProperty('backgroundUrl');
  expect(new Set(artwork.all.map(item => item.url))).toEqual(new Set([
    epicLandscape, epicPortrait, playniteCover, playniteBackground,
  ]));
  expect(artwork.all.find(item => item.url === epicPortrait)).toMatchObject({
    provider: 'epic', type: 'DieselGameBoxTall', roles: ['portrait'], width: 1200, height: 1600,
    metadata: { alt: 'Portrait', sizeBytes: 200 },
  });
});

test('uses Playnite roles for a local game and keeps asset metadata', () => {
  const icon = '/playnite/assets/' + '1'.repeat(64);
  const cover = '/playnite/assets/' + '2'.repeat(64);
  const background = '/playnite/assets/' + '3'.repeat(64);
  const artwork = selectArtwork([observation('playnite', 'authoritative', 'local-id', { artwork: {
    icon: { path: icon, assetId: '1'.repeat(64), contentType: 'image/png', width: 256, height: 256 },
    cover: { path: cover, assetId: '2'.repeat(64), contentType: 'image/jpeg', width: 600, height: 800 },
    background: { path: background, assetId: '3'.repeat(64), contentType: 'image/jpeg', width: 1920, height: 620 },
  } })]);
  expect(artwork).toMatchObject({ iconUrl: icon, squareUrl: icon, portraitUrl: cover, landscapeUrl: background });
  expect(artwork.all.find(item => item.url === icon).metadata.assetId).toBe('1'.repeat(64));
});

test('maps Steam and PSN artwork types into explicit roles', () => {
  const steamIcon = 'https://media.steampowered.com/icon.jpg';
  const steamPortrait = 'https://shared.fastly.steamstatic.com/portrait.jpg';
  const steamLandscape = 'https://shared.fastly.steamstatic.com/landscape.jpg';
  const steamArtwork = selectArtwork([observation('steam', 'authoritative', '570', {
    iconUrl: steamIcon,
    store: { artwork: { verticalCapsule2xUrl: steamPortrait, mainCapsule2xUrl: steamLandscape }, screenshots: {} },
  })]);
  expect(steamArtwork).toMatchObject({ iconUrl: steamIcon, squareUrl: steamIcon,
    portraitUrl: steamPortrait, landscapeUrl: steamLandscape });

  const psnPortrait = 'https://image.api.playstation.com/portrait.jpg';
  const psnLandscape = 'https://image.api.playstation.com/landscape.jpg';
  const psnSquare = 'https://image.api.playstation.com/square.jpg';
  const psnArtwork = selectArtwork([observation('psn', 'authoritative', 'PPSA12345_00', {
    artwork: { url: psnSquare, images: [
      { type: 'PORTRAIT_BANNER', format: 'IMAGE', url: psnPortrait },
      { type: 'SIXTEEN_BY_NINE_BANNER', format: 'IMAGE', url: psnLandscape },
      { type: 'MASTER', format: 'IMAGE', url: psnSquare },
    ] },
  })]);
  expect(psnArtwork).toMatchObject({ portraitUrl: psnPortrait, landscapeUrl: psnLandscape,
    squareUrl: psnSquare, iconUrl: null });
});

test('deduplicates only identical URLs and retains every contributing source', () => {
  const shared = 'https://cdn.example.test/shared.jpg';
  const artwork = selectArtwork([
    observation('epic', 'authoritative', 'epic-id', { artwork: { images: [
      { type: 'DieselGameBox', url: shared, width: 1920, height: 1080 },
    ] } }),
    observation('playnite', 'helper-mirror', 'playnite-id', { artwork: { background: {
      path: shared, assetId: 'a'.repeat(64), contentType: 'image/jpeg', width: 1920, height: 1080,
    } } }),
  ]);
  expect(artwork.all).toHaveLength(1);
  expect(artwork.all[0].sources).toHaveLength(2);
  expect(artwork.all[0].provider).toBe('epic');
});
