const species = (id = 1, name = 'Flue') => ({
  id, names: [name, 'Chimnay', 'Firebrawl', 'Afterburn'], element: 'Fire', rarity: 'Common',
  hp: 'Strong', spd: 'Weak', ea: 'Weak', ed: 'Strong', pa: 'Max', pd: 'Strong',
  abilities: Array.from({length:12}, (_,i) => ({id:i+1,name:'Ability '+i})).reverse(),
  ability_order: Array.from({length:12},(_,i)=>i+1), descriptions: [], locations: {},
});
const owned = overrides => ({
  v:2,id:101,m:1,n:'',x:0,l:35,f:false,c:969,h:3,s:1,e:3,d:3,p:3,pd:3,
  hb:26,sb:18,eb:20,db:15,pb:37,pdb:20,bl:35,tr:null,en:[1],
  r1:null,r2:null,r3:null,r4:null,ar1:null,ar2:null,ar3:null,ar4:null,...overrides,
});
const player = overrides => ({ user_id:'owner-id',username:'owner',email:'private@example.com',
  steam:'private-steam',avatar:'private-avatar',battle:'private-battle',
  gold:10,level:40,team_order:[101],miscrits:[owned()],...overrides });
module.exports = { species, owned, player };
