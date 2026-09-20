const SOURCE_RANK = { authoritative: 4, stats: 3, 'helper-mirror': 2, 'presence-helper': 1 };
const PROVIDER_RANK = { steam: 5, epic: 4, psn: 3, playnite: 2, valorant: 1 };

function shape(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  if (ratio > 1.15) return 'landscape';
  if (ratio < 0.87) return 'portrait';
  return 'square';
}

function selectArtwork(observations) {
  const byUrl = new Map();

  function metadata(item) {
    return Object.fromEntries(Object.entries({
      alt: item.alt,
      format: item.format,
      sizeBytes: item.sizeBytes,
      uploadedAt: item.uploadedAt,
      checksumMd5: item.checksumMd5,
      assetId: item.assetId,
      ordinal: item.ordinal,
      filename: item.filename,
      lastModifiedAt: item.lastModifiedAt,
    }).filter(([, value]) => value !== undefined && value !== null));
  }

  function add(item, observation) {
    if (!item || typeof item.url !== 'string' || !item.url) return;
    const roles = [...new Set((item.roles || []).filter(Boolean))];
    const source = {
      provider: observation.provider,
      providerGameId: observation.providerGameId,
      sourceRole: observation.role,
      type: item.type,
      metadata: metadata(item),
    };
    const score = (SOURCE_RANK[observation.role] || 0) * 1000000
      + (item.preference || 0) * 1000 + (PROVIDER_RANK[observation.provider] || 0) * 100;
    const existing = byUrl.get(item.url);
    if (existing) {
      existing.roles = [...new Set([...existing.roles, ...roles])];
      if (!existing.sources.some(value => value.provider === source.provider
        && value.providerGameId === source.providerGameId && value.type === source.type)) existing.sources.push(source);
      if (score > existing._score) {
        Object.assign(existing, { provider: source.provider, providerGameId: source.providerGameId,
          sourceRole: source.sourceRole, type: item.type, width: item.width ?? null, height: item.height ?? null,
          contentType: item.contentType || null, metadata: source.metadata,
          _score: score, _preference: item.preference || 0 });
      }
      return;
    }
    byUrl.set(item.url, {
      url: item.url,
      provider: source.provider,
      providerGameId: source.providerGameId,
      sourceRole: source.sourceRole,
      type: item.type,
      roles,
      width: item.width ?? null,
      height: item.height ?? null,
      contentType: item.contentType || null,
      metadata: source.metadata,
      sources: [source],
      _score: score,
      _preference: item.preference || 0,
    });
  }

  function playnite(game, observation) {
    const asset = (value, type, fallbackRoles, preference) => {
      if (!value?.path) return;
      const role = shape(value.width, value.height);
      add({ url: value.path, type, roles: [...fallbackRoles, role].filter(Boolean), width: value.width,
        height: value.height, contentType: value.contentType, assetId: value.assetId, preference }, observation);
    };
    asset(game.artwork?.icon, 'icon', ['icon', 'square'], 100);
    asset(game.artwork?.cover, 'cover', [], 90);
    asset(game.artwork?.background, 'background', ['background'], 90);
  }

  function steamSet(set, prefix, observation, adjustment = 0) {
    if (!set) return;
    const values = [
      ['verticalCapsule2xUrl', ['portrait'], 100], ['verticalCapsuleUrl', ['portrait'], 95],
      ['libraryCapsule2xUrl', ['portrait'], 90], ['libraryCapsuleUrl', ['portrait'], 85],
      ['libraryCapsule1xUrl', ['portrait'], 80], ['mainCapsule2xUrl', ['landscape'], 100],
      ['mainCapsuleUrl', ['landscape'], 95], ['heroCapsule2xUrl', ['landscape'], 94],
      ['heroCapsuleUrl', ['landscape'], 92], ['libraryHero2xUrl', ['landscape', 'background'], 90],
      ['libraryHeroUrl', ['landscape', 'background'], 88], ['header2xUrl', ['landscape'], 86],
      ['headerUrl', ['landscape'], 84], ['packageHeaderUrl', ['landscape'], 82],
      ['smallCapsule2xUrl', ['landscape'], 78], ['smallCapsuleUrl', ['landscape'], 76],
      ['libraryHeaderUrl', ['landscape'], 74], ['pageBackgroundUrl', ['landscape', 'background'], 72],
      ['rawPageBackgroundUrl', ['landscape', 'background'], 70], ['communityIconUrl', ['icon', 'square'], 98],
      ['libraryLogo2xUrl', ['logo'], 95], ['libraryLogoUrl', ['logo'], 90],
    ];
    for (const [key, roles, preference] of values) add({ url: set[key], type: `${prefix}${key}`,
      roles, lastModifiedAt: set.lastModifiedAt, preference: preference + adjustment }, observation);
  }

  function steam(game, observation) {
    add({ url: game.iconUrl, type: 'appIcon', roles: ['icon', 'square'], preference: 100 }, observation);
    add({ url: game.coverUrl, type: 'coverUrl', roles: ['portrait'], preference: 88 }, observation);
    steamSet(game.store?.artwork, '', observation);
    steamSet(game.store?.originalArtwork, 'original.', observation, -10);
    for (const screenshot of game.store?.screenshots?.allAges || []) add({ url: screenshot.url,
      type: 'screenshot.allAges', roles: ['screenshot', 'landscape'], ordinal: screenshot.ordinal,
      filename: screenshot.filename, preference: 40 }, observation);
    for (const screenshot of game.store?.screenshots?.matureContent || []) add({ url: screenshot.url,
      type: 'screenshot.matureContent', roles: ['screenshot', 'landscape'], ordinal: screenshot.ordinal,
      filename: screenshot.filename, preference: 35 }, observation);
  }

  function epic(game, observation) {
    for (const image of game.artwork?.images || []) {
      const dimensions = shape(image.width, image.height);
      let roles = dimensions ? [dimensions] : [];
      let preference = 60;
      if (image.type === 'DieselGameBoxTall') { roles = ['portrait']; preference = 100; }
      else if (image.type === 'DieselGameBox') { roles = ['landscape']; preference = 100; }
      else if (image.type === 'AndroidIcon') { roles = ['icon', 'square']; preference = 100; }
      else if (image.type === 'DieselGameBoxLogo') { roles = ['logo']; preference = 95; }
      else if (image.type === 'CodeRedemption_340x440') { roles = ['portrait']; preference = 80; }
      add({ url: image.url, type: image.type, roles, width: image.width, height: image.height,
        alt: image.alt, sizeBytes: image.sizeBytes, uploadedAt: image.uploadedAt,
        checksumMd5: image.checksumMd5, preference }, observation);
    }
    add({ url: game.artwork?.url || game.imageUrl, type: 'primary', roles: ['landscape'], preference: 90 }, observation);
  }

  function psn(game, observation) {
    const definitions = {
      GAMEHUB_COVER_ART: { roles: ['landscape'], preference: 90 },
      PORTRAIT_BANNER: { roles: ['portrait'], preference: 100 },
      SIXTEEN_BY_NINE_BANNER: { roles: ['landscape'], preference: 100 },
      FOUR_BY_THREE_BANNER: { roles: ['landscape'], preference: 95 },
      BACKGROUND_LAYER_ART: { roles: ['landscape', 'background'], preference: 85 },
      MASTER: { roles: ['square'], preference: 100 },
      LOGO: { roles: ['logo'], preference: 100 },
      HERO_CHARACTER: { roles: ['character'], preference: 90 },
      SCREENSHOT: { roles: ['screenshot', 'landscape'], preference: 50 },
    };
    for (const image of game.artwork?.images || []) {
      const definition = definitions[image.type] || { roles: [], preference: 50 };
      add({ url: image.url, type: image.type, roles: definition.roles, format: image.format,
        preference: definition.preference }, observation);
    }
    add({ url: game.artwork?.url, type: 'primary', roles: ['square'], preference: 90 }, observation);
    add({ url: game.artwork?.localizedUrl, type: 'localizedPrimary', roles: ['square'], preference: 88 }, observation);
  }

  for (const observation of observations) {
    const game = observation.data || {};
    if (observation.provider === 'playnite') playnite(game, observation);
    else if (observation.provider === 'steam') steam(game, observation);
    else if (observation.provider === 'epic') epic(game, observation);
    else if (observation.provider === 'psn') psn(game, observation);
  }

  const candidates = [...byUrl.values()];
  const selected = role => candidates.filter(item => item.roles.includes(role))
    .sort((a, b) => b._score - a._score || (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
      || a.url.localeCompare(b.url))[0]?.url || null;
  const portraitUrl = selected('portrait');
  const landscapeUrl = selected('landscape');
  const squareUrl = selected('square');
  const iconUrl = selected('icon');
  const all = candidates.sort((a, b) => b._score - a._score || a.url.localeCompare(b.url)).map(item => {
    const { _score, _preference, ...value } = item;
    return value;
  });
  return {
    portraitUrl,
    landscapeUrl,
    squareUrl,
    iconUrl,
    all,
  };
}

module.exports = { selectArtwork, shape };
