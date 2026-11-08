// Selection follows the captured game client's Ability.get_icon/get_elemental_icon.
// Public website assets were verified as PNGs on 2026-11-08. Do not construct
// arbitrary filenames from upstream values or copy the website's accuracy check.
const baseUrl = 'https://worldofmiscrits.com/';
const elements = ['Fire', 'Water', 'Nature', 'Earth', 'Lightning', 'Wind'];
const dualElements = ['FireEarth', 'FireLightning', 'FireWind', 'NatureEarth',
  'NatureLightning', 'NatureWind', 'WaterEarth', 'WaterLightning', 'WaterWind'];
const elementNames = new Set([...elements, ...dualElements]);
const dualNames = new Set(dualElements.map(name => name.toLowerCase()));
const assets = new Set([
  ...[...elementNames].map(name => name.toLowerCase()), 'physical',
  ...elements.map(name => name.toLowerCase() + '_physical'),
  ...[...elements, 'Physical'].map(name => name.toLowerCase() + '_poison'),
  ...['Fire', 'Lightning', 'Nature', 'Water', 'Wind'].map(name => 'bomb_' + name.toLowerCase()),
  'accuracy_buff', 'accuracy_debuff', 'buff', 'debuff', 'bot_buff', 'bot_debuff',
  'heal', 'confuse', 'truedamage', 'antiheal', 'barbed', 'bleed', 'block', 'ci',
  'cleanser', 'disease', 'ethereal', 'lifesteal', 'negate', 'paralyze', 'pi',
  'poison', 'si', 'sleep', 'special', 'switchcurse',
]);
const statusIcons = new Map(['Antiheal', 'Barbed', 'Bleed', 'Block', 'Buff', 'Heal', 'CI', 'Cleanser',
  'Confuse', 'Disease', 'Ethereal', 'LifeSteal', 'Negate', 'Paralyze', 'PI', 'Poison',
  'SI', 'Sleep', 'Special', 'SwitchCurse'].map(type => [type, type.toLowerCase()]));
const url = name => assets.has(name) ? baseUrl + name + '.png' : null;
const damageElement = name => elementNames.has(name) || name === 'Physical';

function elementIconUrl(element) {
  return elementNames.has(element) ? url(element.toLowerCase()) : null;
}
function attackIcon(ability) {
  const { element } = ability;
  if (!damageElement(element)) return null;
  // The game uses the physical icon immediately for physical-primary attacks,
  // even when their additional effects include elemental damage.
  if (element === 'Physical') return url('physical');
  const secondary = Array.isArray(ability.additional)
    ? ability.additional.find(effect => effect?.element && effect.element !== 'Misc')?.element : null;
  if (secondary === 'Physical') return url(element.toLowerCase() + '_physical');
  if (damageElement(secondary)) {
    for (const name of [element + secondary, secondary + element]) {
      if (dualNames.has(name.toLowerCase())) return url(name.toLowerCase());
    }
  }
  return elementIconUrl(element);
}
function abilityIconUrl(ability) {
  const { type, element, ap } = ability;
  if (type === 'Dot' && element !== 'Misc') {
    return damageElement(element) ? url(element.toLowerCase() + '_poison') : null;
  }
  if (type === 'TimeBomb') return damageElement(element) ? url('bomb_' + element.toLowerCase()) : null;
  if (type === 'Hot') return url('heal');
  if (type === 'ForceSwitch') return url('confuse');
  if (ability.true_dmg === true) return url('truedamage');
  if (element === 'Misc') {
    if (type === 'Buff') {
      if (!Number.isFinite(ap) || ap === 0) return null;
      const accuracy = Array.isArray(ability.keys) && ability.keys.includes('acc');
      return url((accuracy ? 'accuracy_' : '') + (ap > 0 ? 'buff' : 'debuff'));
    }
    if (type === 'Bot') return Number.isFinite(ap) ? url(ap > 0 ? 'bot_buff' : 'bot_debuff') : null;
    if (type === 'Heal') return url('heal');
  } else if (type === 'Attack') return attackIcon(ability);
  return url(statusIcons.get(type));
}
const withElementIcon = row => ({ ...row, elementIconUrl: elementIconUrl(row.element) });
const withCatalogIcons = row => ({ ...withElementIcon(row),
  abilities: row.abilities.map(ability => ({ ...ability, iconUrl: abilityIconUrl(ability) })) });

// Enrich old persisted snapshots on read too, including during upstream outages.
// This changes presentation only, without refreshing or relabeling snapshot age.
function withSnapshotIcons(payload) {
  return { ...payload, species: payload.species.map(withCatalogIcons),
    miscrits: payload.miscrits.map(withElementIcon), families: payload.families.map(withElementIcon) };
}
module.exports = { elementIconUrl, abilityIconUrl, withCatalogIcons, withSnapshotIcons };
