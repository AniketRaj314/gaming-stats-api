const { ProviderError } = require('../../shared/providerError');
const { elementIconUrl, withCatalogIcons } = require('./icons');
const stats = ['hp', 'spd', 'ea', 'ed', 'pa', 'pd'];
const qualityKeys = ['h', 's', 'e', 'd', 'p', 'pd'];
const bonusKeys = ['hb', 'sb', 'eb', 'db', 'pb', 'pdb'];
const categories = { Weak: 1, Moderate: 2, Strong: 3, Max: 4, Elite: 5 };
const ratings = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F+', 'F', 'F-'];
const xp = [0,10,14,20,29,39,51,64,80,97,115,135,157,180,205,231,258,287,317,349,382,416,451,488,527,566,607,649,692,737,783,830,878,928,979,1031];
const abilityLevels = [0,1,4,7,10,13,16,19,22,25,28,30];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = code => { throw new ProviderError(code, 'schema'); };
const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail('invalid-integer');
  return v;
};
const pick = (v, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(v, k)).map(k => [k, v[k]]));
const identityKeys = new Set(['player_id', 'user_id', 'account_id', 'username', 'email', 'steam', 'google', 'avatar', 'battle']);
function withoutIdentity(value) {
  if (Array.isArray(value)) return value.map(withoutIdentity);
  if (object(value)) return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !identityKeys.has(key)).map(([key, item]) => [key, withoutIdentity(item)]));
  return value;
}
function artwork(name) {
  const slug = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '_'));
  return { backUrl: 'https://cdn.worldofmiscrits.com/miscrits/' + slug + '_back.png',
    avatarUrl: 'https://cdn.worldofmiscrits.com/avatars/' + slug + '_avatar.png' };
}
function catalog(rows) {
  if (!Array.isArray(rows) || !rows.length) fail('invalid-catalog');
  const ids = new Set();
  return rows.map(row => {
    if (!object(row)) fail('invalid-species');
    integer(row.id, 1);
    if (ids.has(row.id)) fail('duplicate-species');
    ids.add(row.id);
    if (!Array.isArray(row.names) || row.names.length !== 4
      || row.names.some(n => typeof n !== 'string' || !n.trim())
      || stats.some(s => !categories[row[s]])
      || !Array.isArray(row.abilities) || !Array.isArray(row.ability_order)) fail('invalid-species');
    const abilities = new Map(row.abilities.map(a => [a.id, a]));
    if (row.ability_order.length !== 12 || new Set(row.ability_order).size !== 12
      || row.ability_order.some(id => !abilities.has(id))) fail('invalid-ability-order');
    return withCatalogIcons({ ...row, miscritId: row.id,
      evolutions: row.names.map((name, evolutionIndex) => ({ name, evolutionIndex, artwork: artwork(name) })),
      abilities: row.ability_order.map((id, index) => ({ ...abilities.get(id), unlockLevel: abilityLevels[index] })) });
  });
}
function relic(value) {
  if (value == null) return null;
  if (!object(value) || !object(value.effect)) fail('invalid-relic');
  for (const s of stats) if (value.effect[s] !== undefined && !Number.isFinite(value.effect[s])) fail('invalid-relic-effect');
  return pick(value, ['id','name','desc','effect','cost','currency','cost_gems','level','special']);
}
function player(raw, species) {
  if (!object(raw) || !Array.isArray(raw.miscrits) || !Array.isArray(raw.team_order)) fail('invalid-player');
  const catalogById = new Map(species.map(s => [s.id, s]));
  const ids = new Set();
  const rawRows = [];
  const miscrits = raw.miscrits.map(row => {
    if (!object(row) || row.v !== 2) fail('unsupported-player-miscrit-version');
    integer(row.id, 1); integer(row.m, 1); integer(row.l, 1, 35); integer(row.x); integer(row.c);
    if (ids.has(row.id)) fail('duplicate-player-miscrit');
    ids.add(row.id);
    if (row.n !== undefined && typeof row.n !== 'string') fail('invalid-nickname');
    const qualities = Object.fromEntries(stats.map((s, i) => [s, integer(row[qualityKeys[i]], 1, 3)]));
    const bonusStats = Object.fromEntries(stats.map((s, i) => [s, integer(row[bonusKeys[i]])]));
    const activeRelics = [1,2,3,4].map(i => relic(row['r' + i]));
    const altRelics = [1,2,3,4].map(i => relic(row['ar' + i]));
    const activeRelicStatBonuses = Object.fromEntries(stats.map(s => [s,
      activeRelics.reduce((n, r) => n + Math.trunc(r?.effect[s] || 0), 0)]));
    const definition = catalogById.get(row.m);
    const evolutionIndex = Math.min(Math.floor(row.l / 10), 3);
    const qualityScore = Object.values(qualities).reduce((a,b) => a+b, 0);
    const baseStats = definition ? Object.fromEntries(stats.map(s => [s, s === 'hp'
      ? Math.floor((24 + 4 * categories[definition[s]] + 3 * qualities[s]) * row.l / 10) + 10
      : Math.floor((6 + 4 * categories[definition[s]] + 3 * qualities[s]) * row.l / 12) + 5])) : null;
    const totalStats = baseStats ? Object.fromEntries(stats.map(s => [s, baseStats[s] + bonusStats[s] + activeRelicStatBonuses[s]])) : null;
    const safeRaw = pick(row, ['v','id','m','n','x','l','f','c',...qualityKeys,...bonusKeys,'bl','tr','temp_bonus','en']);
    for (let i=1; i<=4; i++) { safeRaw['r'+i] = activeRelics[i-1]; safeRaw['ar'+i] = altRelics[i-1]; }
    rawRows.push(safeRaw);
    const missingBonusPoints = 4 * (row.l - 1) - Object.values(bonusStats).reduce((a,b) => a+b, 0);
    return { playerMiscritId: row.id, miscritId: row.m, nickname: row.n || null,
      baseName: definition?.names[0] ?? null, evolutionIndex,
      evolutionName: definition?.names[evolutionIndex] ?? null,
      displayName: row.n || definition?.names[evolutionIndex] || null,
      catalogStatus: definition ? 'resolved' : 'unresolved',
      level: row.l, xp: row.x, xpNeeded: xp[row.l], maxLevel: row.l === 35,
      readyToTrain: row.l < 35 && row.x >= xp[row.l], favorite: row.f === true,
      rating: ratings[18-qualityScore], qualityScore, qualities, bonusStats, baseStats, totalStats,
      activeRelicStatBonuses, activeRelics, altRelics, unlockedRelicSlots: row.l === 35 ? 4 : Math.floor(row.l / 10),
      currentHp: { raw: row.c, maximum: totalStats?.hp ?? null, displayed: totalStats ? Math.min(row.c, totalStats.hp) : null },
      bonusLevel: row.bl ?? null, pendingRebonus: row.tr ?? null, pendingBonus: row.temp_bonus ?? null,
      missingBonusPoints, enchantedAbilityIds: row.en ?? [],
      rarity: definition?.rarity ?? null, element: definition?.element ?? null,
      elementIconUrl: elementIconUrl(definition?.element),
      artwork: definition?.evolutions[evolutionIndex].artwork ?? { backUrl: null, avatarUrl: null },
      teamSlot: raw.team_order.includes(row.id) ? raw.team_order.indexOf(row.id)+1 : null,
      anomalies: [...(missingBonusPoints < 0 ? ['negative-missing-bonus-points'] : []),
        ...(!definition ? ['unresolved-miscrit-id'] : [])], raw: safeRaw };
  });
  if (new Set(raw.team_order).size !== raw.team_order.length || raw.team_order.some(id => !ids.has(id))) fail('invalid-team-order');
  const profile = withoutIdentity(pick(raw, ['gold','platinum','gems','virtue','event','level','tutorial','last_heal','last_wish_SK',
    'last_wish_VI','last_xmas','left_traits','right_traits','trait_reset','last_spin','tickets',
    'boss_achievements','daily_quest_day','daily_quest_progress','last_claimed_chapter','version']));
  if (object(raw.area)) profile.area = { ...pick(raw.area, ['area_id','name']),
    ...(object(raw.area.location) ? { location: pick(raw.area.location, ['id','name']) } : {}) };
  return { player: { ...profile, teamOrder: raw.team_order }, miscrits,
    snapshot: { ...profile, team_order: raw.team_order, miscrits: rawRows } };
}
function families(species, miscrits) {
  const grouped = new Map(species.map(s => [s.id, { miscritId: s.id, names: s.names, rarity: s.rarity,
    element: s.element, elementIconUrl: elementIconUrl(s.element), catalogStatus: 'resolved', owned: false, ownedCount: 0, playerMiscritIds: [] }]));
  for (const m of miscrits) {
    if (!grouped.has(m.miscritId)) grouped.set(m.miscritId, { miscritId: m.miscritId, names: null,
      rarity: null, element: null, elementIconUrl: null, catalogStatus: 'unresolved', owned: false, ownedCount: 0, playerMiscritIds: [] });
    const family = grouped.get(m.miscritId);
    family.owned = true; family.ownedCount++; family.playerMiscritIds.push(m.playerMiscritId);
  }
  return [...grouped.values()].sort((a,b) => a.miscritId-b.miscritId);
}
module.exports = { artwork, catalog, player, families };
