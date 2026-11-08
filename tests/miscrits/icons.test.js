const { elementIconUrl, abilityIconUrl } = require('../../src/providers/miscrits/icons');
const n = require('../../src/providers/miscrits/normalize');
const f = require('./fixtures');
const url = name => 'https://worldofmiscrits.com/' + name + '.png';

test.each(['Fire', 'Water', 'Nature', 'Earth', 'Lightning', 'Wind', 'FireEarth',
  'FireLightning', 'FireWind', 'NatureEarth', 'NatureLightning', 'NatureWind',
  'WaterEarth', 'WaterLightning', 'WaterWind'])('maps the %s species element', element => {
  expect(elementIconUrl(element)).toBe(url(element.toLowerCase()));
});
test.each([
  // Real public catalog shapes. Hit accuracy is not an affected stat.
  [{ name: 'Laser Focus', type: 'Buff', element: 'Misc', ap: 20, keys: ['acc'] }, 'accuracy_buff'],
  [{ name: 'Well Rounded', type: 'Buff', element: 'Misc', ap: 8, accuracy: 90, keys: ['ea', 'pa', 'ed', 'pd'] }, 'buff'],
  [{ name: 'Sprint', type: 'Buff', element: 'Physical', ap: 25, accuracy: 95, keys: ['spd'], additional: [{ type: 'Heal' }] }, 'buff'],
  [{ name: 'Supersonic Sprint', type: 'Buff', element: 'Physical', ap: 100, keys: ['spd'] }, 'buff'],
  [{ name: 'Glare', type: 'Buff', element: 'Misc', ap: -25, accuracy: 95, keys: ['spd'] }, 'debuff'],
  [{ type: 'Buff', element: 'Misc', ap: -10, keys: ['acc'] }, 'accuracy_debuff'],
  [{ type: 'Attack', element: 'Fire' }, 'fire'],
  [{ type: 'Attack', element: 'Physical', additional: [{ type: 'Heal' }] }, 'physical'],
  [{ type: 'Attack', element: 'Earth', additional: [{ element: 'Misc' }, { element: 'Fire' }] }, 'fireearth'],
  [{ type: 'Attack', element: 'Fire', additional: [{ element: 'Earth' }] }, 'fireearth'],
  [{ type: 'Attack', element: 'Fire', additional: [{ element: 'Physical' }] }, 'fire_physical'],
  [{ type: 'Attack', element: 'Physical', additional: [{ element: 'Fire' }] }, 'physical'],
  [{ type: 'Attack', element: 'Fire', additional: [{ element: 'Water' }] }, 'fire'],
  [{ type: 'Attack', element: 'Fire', true_dmg: true }, 'truedamage'],
  [{ type: 'Dot', element: 'Fire', true_dmg: true }, 'fire_poison'],
  [{ type: 'Dot', element: 'Physical' }, 'physical_poison'],
  [{ type: 'TimeBomb', element: 'Water', true_dmg: true }, 'bomb_water'],
  [{ type: 'Hot', element: 'Misc' }, 'heal'],
  [{ type: 'Heal', element: 'Misc' }, 'heal'],
  [{ type: 'ForceSwitch', element: 'Misc' }, 'confuse'],
  [{ type: 'Bot', element: 'Misc', ap: 5 }, 'bot_buff'],
  [{ type: 'Bot', element: 'Misc', ap: -5 }, 'bot_debuff'],
  [{ type: 'Bot', element: 'Misc', ap: 0 }, 'bot_debuff'],
  ...['Antiheal', 'Barbed', 'Bleed', 'Block', 'CI', 'Cleanser', 'Confuse', 'Disease',
    'Ethereal', 'LifeSteal', 'Negate', 'Paralyze', 'PI', 'Poison', 'SI', 'Sleep',
    'Special', 'SwitchCurse'].map(type => [{ type, element: 'Misc' }, type.toLowerCase()]),
])('selects the game icon for %j', (ability, expected) => {
  expect(abilityIconUrl(ability)).toBe(url(expected));
});
test.each([
  {}, { type: 'NewType', element: 'Fire' }, { type: '../fire', element: 'Misc' },
  { type: 'Attack', element: 'Unknown' }, { type: 'Attack', element: '../fire' },
  { type: 'TimeBomb', element: 'Earth' }, // No verified public bomb_earth asset.
  { type: 'Dot', element: 'Unknown' }, { type: 'Buff', element: 'Misc', ap: 0 },
  { type: 'Buff', element: 'Misc', ap: NaN }, { type: 'Buff', element: 'Misc', ap: '5' },
])('returns null for unsupported or unverified mappings %j', ability => {
  expect(abilityIconUrl(ability)).toBeNull();
});
test('unknown elements do not generate guessed URLs', () => {
  for (const element of [undefined, null, 'Physical', 'Misc', 'Unknown', '../fire']) {
    expect(elementIconUrl(element)).toBeNull();
  }
});
test('catalog, owned individuals and families expose icons without modifying evidence', () => {
  const source = f.species();
  const ability = source.abilities.find(a => a.id === 1);
  Object.assign(ability, { type: 'Attack', element: 'Fire', additional: [{ type: 'Heal' }],
    enchant: { additional: [{ type: 'Buff', ap: 5, keys: ['ea'] }] } });
  const original = JSON.stringify(source);
  const catalog = n.catalog([source]);
  expect(catalog[0].elementIconUrl).toBe(url('fire'));
  expect(catalog[0].abilities[0]).toEqual({ ...ability, unlockLevel: 0, iconUrl: url('fire') });
  expect(JSON.stringify(source)).toBe(original);
  const player = n.player(f.player({ miscrits: [f.owned(), f.owned({ id: 102, m: 999 })] }), catalog);
  expect(player.miscrits.map(row => row.elementIconUrl)).toEqual([url('fire'), null]);
  expect(n.families(catalog, player.miscrits).map(row => row.elementIconUrl)).toEqual([url('fire'), null]);
  expect(player.snapshot.miscrits[0]).not.toHaveProperty('elementIconUrl');
});
