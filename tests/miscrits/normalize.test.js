const n = require('../../src/providers/miscrits/normalize');
const f = require('./fixtures');
const cat = () => n.catalog([f.species()]);
test('removes nested player identity from tickets and boss progression while retaining game state', () => {
  const data = n.player(f.player({ tickets: { player_id: 'private-id', available: 3 },
    boss_achievements: { player_id: 'private-id', progress: [{ user_id: 'private-id', boss_id: 7, count: 2 }] } }), cat());
  expect(data.player.tickets).toEqual({ available: 3 });
  expect(data.player.boss_achievements).toEqual({ progress: [{ boss_id: 7, count: 2 }] });
  expect(JSON.stringify(data)).not.toContain('private-id');
});
test('calculates documented card stats, health and rating, retaining only active relic bonuses', () => {
  const data = n.player(f.player({miscrits:[f.owned({r1:{id:1,effect:{hp:5,spd:-2,SI:true}},ar1:{id:2,effect:{hp:100}}})]}),cat());
  const row = data.miscrits[0];
  expect(row).toMatchObject({ rating:'A+',qualityScore:16,baseStats:{hp:167,spd:42,ea:60,ed:83,pa:95,pd:83},
    totalStats:{hp:198,spd:58,ea:80,ed:98,pa:132,pd:103},currentHp:{raw:969,maximum:198,displayed:198},
    missingBonusPoints:0,readyToTrain:false,teamSlot:1 });
  expect(data.snapshot).not.toHaveProperty('email');
  expect(data.snapshot).not.toHaveProperty('user_id');
  expect(data.snapshot).not.toHaveProperty('steam');
  expect(data.player).not.toHaveProperty('battle');
});
test.each([[9,0],[10,1],[19,1],[20,2],[29,2],[30,3],[35,3]])('level %s selects evolution %s and ignores nickname for artwork', (l,index) => {
  const row = n.player(f.player({miscrits:[f.owned({l,n:'My nickname'})]}),cat()).miscrits[0];
  expect(row.evolutionIndex).toBe(index);
  expect(row.displayName).toBe('My nickname');
  expect(row.artwork).toEqual(n.artwork(f.species().names[index]));
});
test('uses CDN naming, orders abilities by ability_order, and keeps distinct variants', () => {
  expect(n.artwork('Tide Gong').avatarUrl).toBe('https://cdn.worldofmiscrits.com/avatars/tide_gong_avatar.png');
  expect(n.artwork('Hop-Chi').avatarUrl).toBe('https://cdn.worldofmiscrits.com/avatars/hop-chi_avatar.png');
  const defs=n.catalog([f.species(),f.species(2,'Dark Flue')]);
  expect(defs[0].abilities[0]).toMatchObject({id:1,unlockLevel:0});
  const rows=n.player(f.player({miscrits:[f.owned(),f.owned({id:102,m:2})]}),defs).miscrits;
  expect(n.families(defs,rows).map(x=>x.playerMiscritIds)).toEqual([[101],[102]]);
  expect(n.families(defs,rows)[0]).not.toHaveProperty('bestCopy');
});
test('preserves unresolved species and negative bonus anomalies without guessing stats', () => {
  const row=n.player(f.player({miscrits:[f.owned({m:999,l:1})]}),cat()).miscrits[0];
  expect(row).toMatchObject({catalogStatus:'unresolved',baseStats:null,totalStats:null,evolutionName:null});
  expect(row.anomalies).toEqual(['negative-missing-bonus-points','unresolved-miscrit-id']);
});
test.each([{v:3},{h:0},{l:36},{x:-1}])('rejects invalid owned data %j', overrides => {
  expect(()=>n.player(f.player({miscrits:[f.owned(overrides)]}),cat())).toThrow();
});
test('rejects duplicate individuals and unresolved party members', () => {
  expect(()=>n.player(f.player({miscrits:[f.owned(),f.owned()]}),cat())).toThrow();
  expect(()=>n.player(f.player({team_order:[999]}),cat())).toThrow();
});
