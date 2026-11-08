const request=require('supertest');
const {createApp}=require('../../src/app');
const n=require('../../src/providers/miscrits/normalize');
const f=require('./fixtures');
const species=n.catalog([f.species()]);
const data={...n.player(f.player(),species),species};
data.families=n.families(species,data.miscrits);
const read=jest.fn(()=>({schemaVersion:1,provider:'miscrits',status:'ready',data}));
const app=createApp({validKeys:['test'],miscritsService:{read}});
const paths=['/player','/player/snapshot','/player/miscrits','/player/miscrits/101',
 '/player/miscrits/families','/player/team','/miscrits','/miscrits/1'];
test('all core reads are authenticated, cached and sanitized',async()=>{
 for(const path of paths){
  expect((await request(app).get('/custom/miscrits'+path)).status).toBe(401);
  const r=await request(app).get('/custom/miscrits'+path).set('X-API-Key','test');
  expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('private, no-store');
  expect(r.text).not.toContain('private@example.com');
 }
 expect((await request(app).get('/custom/miscrits/player/team').set('X-API-Key','test')).body.data[0].playerMiscritId).toBe(101);
});
test('handles disabled, missing, malformed and unsupported requests',async()=>{
 expect((await request(createApp({validKeys:['test']})).get('/custom/miscrits/player').set('X-API-Key','test')).status).toBe(503);
 expect((await request(app).get('/custom/miscrits/miscrits/900').set('X-API-Key','test')).status).toBe(404);
 expect((await request(app).get('/custom/miscrits/miscrits/no').set('X-API-Key','test')).status).toBe(400);
 expect((await request(app).get('/custom/miscrits/player?refresh=true').set('X-API-Key','test')).status).toBe(400);
 expect((await request(app).post('/custom/miscrits/refresh').set('X-API-Key','test')).status).toBe(404);
});
test('exposes no owned data in health',async()=>{
 const r=await request(app).get('/custom/miscrits/health');
 expect(r.status).toBe(200);expect(r.body).not.toHaveProperty('data');
});
test('returns element icons consistently in catalog, owned detail, families and active team',async()=>{
 for(const path of ['/miscrits/1','/player/miscrits/101','/player/miscrits/families','/player/team']){
  const r=await request(app).get('/custom/miscrits'+path).set('X-API-Key','test');
  expect(r.status).toBe(200);
  const row=Array.isArray(r.body.data)?r.body.data[0]:r.body.data;
  expect(row.elementIconUrl).toBe('https://worldofmiscrits.com/fire.png');
  if(path==='/miscrits/1') expect(row.abilities[0]).toHaveProperty('iconUrl',null);
 }
});
