const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const request = require('supertest');
const { MiscritsStore } = require('../../src/providers/miscrits/store');
const { createService } = require('../../src/providers/miscrits/service');
const { createApp } = require('../../src/app');
const { ProviderError } = require('../../src/shared/providerError');
const f = require('./fixtures');
const initial = Date.parse('2026-11-07T00:00:00Z');
const credentials = { username: 'owner', password: 'synthetic-password', applicationCredential: 'YXBwOg==' };
const jwt = exp => 'h.' + Buffer.from(JSON.stringify({exp:exp/1000})).toString('base64url') + '.s';
let directory, store, service, client, settings, now, report;
beforeEach(async()=>{
 now = initial;directory=fs.mkdtempSync(path.join(os.tmpdir(),'miscrits-refresh-'));
 store=new MiscritsStore(directory,Buffer.alloc(32,1));
 settings={accountId:'owner-id',catalogMs:86400000,staleMs:86400000,refreshMs:300000};
 client={login:jest.fn().mockResolvedValue({token:jwt(initial+7200000),refresh_token:jwt(initial+86400000)}),
  refresh:jest.fn(),player:jest.fn().mockResolvedValue(f.player()),catalog:jest.fn().mockResolvedValue({rows:[f.species()],hash:'hash',version:null,fetchedAt:new Date(now).toISOString(),checkedAt:now})};
 report=jest.fn();service=createService({store,client,settings,now:()=>now,report});
 await service.connect(credentials,{refresh:true});client.player.mockClear();
});
afterEach(()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});});
function app(){return createApp({validKeys:['test'],miscritsService:service,trackedUsernames:[]});}
const get=(app,path='/custom/miscrits/player')=>request(app).get(path).set('X-API-Key','test');
test('does not refresh below the interval and becomes eligible exactly at the boundary',async()=>{
 now+=299999;
 expect(service.read()).toMatchObject({refreshDue:false,requestRefreshIntervalSeconds:300,nextRefreshAt:new Date(initial+300000).toISOString()});
 expect(await service.refreshIfDue()).toEqual({skipped:true});expect(client.player).not.toHaveBeenCalled();
 now++;
 expect(service.read().refreshDue).toBe(true);
 await service.refreshIfDue();expect(client.player).toHaveBeenCalledTimes(1);
 expect(service.read()).toMatchObject({refreshDue:false,fetchedAt:new Date(now).toISOString()});
});
test('concurrent HTTP reads return saved data before the single pending upstream read finishes',async()=>{
 now+=300000;let release;
 client.player.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
 const server=app();
 const responses=await Promise.all(Array.from({length:8},()=>get(server).timeout({response:1000,deadline:1500})));
 try {
  expect(responses.every(r=>r.status===200&&r.body.fetchedAt===new Date(initial).toISOString()&&r.body.refreshDue===true)).toBe(true);
  expect(client.player).toHaveBeenCalledTimes(1);
 } finally {
  const pending=service.refreshIfDue();release(f.player({gold:999}));await pending;
 }
 const updated=await get(server);
 expect(updated.body).toMatchObject({refreshDue:false,fetchedAt:new Date(now).toISOString(),data:{gold:999}});
 expect(client.player).toHaveBeenCalledTimes(1);
});
test('failed background refresh preserves data and cooldown across a new service instance',async()=>{
 now+=300000;client.player.mockRejectedValueOnce(new ProviderError('http-503','miscrits'));
 expect(await service.refreshIfDue()).toMatchObject({ok:false});
 expect(service.read()).toMatchObject({status:'stale',fetchedAt:new Date(initial).toISOString(),refreshDue:false,nextRefreshAt:new Date(now+300000).toISOString()});
 expect(report).toHaveBeenCalledWith('miscrits:http-503');
 const restarted=createService({store,client,settings,now:()=>now});now+=299999;
 await restarted.refreshIfDue();expect(client.player).toHaveBeenCalledTimes(1);
 now++;await restarted.refreshIfDue();expect(client.player).toHaveBeenCalledTimes(2);
 expect(restarted.read().status).toBe('ready');
});
test('two workers sharing storage perform only one upstream refresh',async()=>{
 const secondStore=new MiscritsStore(directory,Buffer.alloc(32,1));
 const second=createService({store:secondStore,client,settings,now:()=>now});
 now+=300000;let release;client.player.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
 const first=service.refreshIfDue();
 await new Promise(resolve=>setImmediate(resolve));
 try {
  expect(await second.refreshIfDue()).toEqual({skipped:true});
  expect(client.player).toHaveBeenCalledTimes(1);
 } finally {release(f.player());await first;}
 try {await second.refreshIfDue();expect(client.player).toHaveBeenCalledTimes(1);}
 finally {secondStore.close();}
});
test('rechecks eligibility if a manual refresh finishes before the queued request job starts',async()=>{
 now+=300000;const pending=service.refreshIfDue();
 await service.run();expect(await pending).toEqual({skipped:true});expect(client.player).toHaveBeenCalledTimes(1);
});
test('zero disables request refresh while retaining explicit manual refresh',async()=>{
 service=createService({store,client,settings:{...settings,refreshMs:0},now:()=>now});now+=300000;
 await service.refreshIfDue();expect(client.player).not.toHaveBeenCalled();
 expect(service.read()).toMatchObject({refreshDue:false,nextRefreshAt:null,requestRefreshIntervalSeconds:0,refreshMode:'startup-and-manual'});
 await service.run();expect(client.player).toHaveBeenCalledTimes(1);
});
test('health, docs, unauthenticated, invalid, unknown, and unsupported routes never trigger refresh',async()=>{
 now+=300000;const server=app();
 await request(server).get('/custom/miscrits/health');await request(server).get('/custom/miscrits/docs');
 await request(server).get('/custom/miscrits/player');
 await get(server,'/custom/miscrits/player?refresh=true');await get(server,'/custom/miscrits/player/miscrits/no');
 await get(server,'/custom/miscrits/player/miscrits/999');await get(server,'/custom/miscrits/not-a-route');
 await request(server).post('/custom/miscrits/player').set('X-API-Key','test');
 await new Promise(resolve=>setImmediate(resolve));expect(client.player).not.toHaveBeenCalled();
});
test('a connected account without a snapshot can recover in the background; disconnected accounts cannot',async()=>{
 store.publicDb.prepare('DELETE FROM snapshots').run();const server=app();
 const pending=await get(server);expect(pending.status).toBe(503);expect(pending.body.refreshDue).toBe(true);
 await service.refreshIfDue();expect((await get(server)).status).toBe(200);
 await service.disconnect();client.player.mockClear();await get(server);await service.refreshIfDue();
 expect(client.player).not.toHaveBeenCalled();expect(client.login).toHaveBeenCalledTimes(1);
});
test('a disconnect between queueing and lock acquisition cancels the queued refresh',async()=>{
 now+=300000;const pending=service.refreshIfDue();await service.disconnect();
 expect(await pending).toEqual({skipped:true});expect(client.player).not.toHaveBeenCalled();
});
