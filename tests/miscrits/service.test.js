const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const { MiscritsStore }=require('../../src/providers/miscrits/store');
const { createService }=require('../../src/providers/miscrits/service');
const { ProviderError }=require('../../src/shared/providerError');
const f=require('./fixtures');
const now=Date.parse('2026-11-07T00:00:00Z');
const jwt=exp=>'header.'+Buffer.from(JSON.stringify({exp:Math.floor(exp/1000),uid:'owner-id'})).toString('base64url')+'.signature';
let dir,store,service,client,settings;
const credentials={username:'owner',password:'private-password',applicationCredential:'YXBw'};
beforeEach(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'miscrits-test-'));
 store=new MiscritsStore(dir,Buffer.alloc(32,1));
 settings={accountId:'owner-id',catalogMs:86400000,staleMs:86400000};
 client={login:jest.fn().mockResolvedValue({token:jwt(now+7200000),refresh_token:jwt(now+86400000)}),
  refresh:jest.fn().mockResolvedValue({token:jwt(now+7200000),refresh_token:jwt(now+86400000)}),
  player:jest.fn().mockResolvedValue(f.player()),catalog:jest.fn().mockResolvedValue({rows:[f.species()],hash:'hash',
    etag:null,version:null,fetchedAt:new Date(now).toISOString(),checkedAt:now})};
 service=createService({store,client,settings,now:()=>now});
});
afterEach(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
test('adds icons to legacy cached snapshots during outages without new upstream reads or timestamp changes', async()=>{
 const definition=f.species();
 Object.assign(definition.abilities[0],{type:'Attack',element:'Physical'});
 client.catalog.mockResolvedValue({rows:[definition],hash:'hash',fetchedAt:new Date(now).toISOString(),checkedAt:now});
 await service.connect(credentials,{refresh:true});
 const snapshot=store.get('core');
 for(const row of [...snapshot.payload.species,...snapshot.payload.miscrits,...snapshot.payload.families]) delete row.elementIconUrl;
 for(const row of snapshot.payload.species) for(const ability of row.abilities) delete ability.iconUrl;
 store.publish('core',snapshot.payload,store.state().generation,now,0);
 store.fail('core',store.state().generation,'refresh-failed',now+1,0);
 client.player.mockClear();client.catalog.mockClear();
 const result=service.read();
 expect(result).toMatchObject({status:'stale',fetchedAt:new Date(now).toISOString()});
 expect(result.data.miscrits[0].elementIconUrl).toBe('https://worldofmiscrits.com/fire.png');
 expect(result.data.families[0].elementIconUrl).toBe('https://worldofmiscrits.com/fire.png');
 expect(result.data.species[0].abilities.find(a=>a.id===12).iconUrl).toBe('https://worldofmiscrits.com/physical.png');
 expect(store.get('core').payload.species[0]).not.toHaveProperty('elementIconUrl');
 expect(client.player).not.toHaveBeenCalled();expect(client.catalog).not.toHaveBeenCalled();
});
test('encrypts secrets, caches catalog, publishes one snapshot, and retains it on failed refresh', async()=>{
 await service.connect(credentials);
 expect(fs.readFileSync(path.join(dir,'credentials.sqlite')).includes(Buffer.from('private-password'))).toBe(false);
 client.player.mockClear();
 await service.run();
 expect(client.player).toHaveBeenCalledTimes(1);
 expect(service.read()).toMatchObject({status:'ready',fetchedAt:new Date(now).toISOString()});
 await service.run();
 expect(client.catalog).toHaveBeenCalledTimes(1);
 client.player.mockRejectedValue(new ProviderError('http-403','miscrits'));
 await expect(service.run()).rejects.toThrow('http-403');
 expect(service.read()).toMatchObject({status:'stale',fetchedAt:new Date(now).toISOString()});
 expect(service.read().data.miscrits).toHaveLength(1);
 expect(JSON.stringify(service.read())).not.toContain('private-password');
});
test('verifies configured account and username before storing any session', async()=>{
 client.player.mockResolvedValue(f.player({user_id:'other'}));
 await expect(service.connect(credentials)).rejects.toThrow('account-mismatch');
 expect(store.session()).toBeNull();
});
test('retries unauthorized reads once and prevents concurrent workers', async()=>{
 await service.connect(credentials);
 client.player.mockRejectedValue(new ProviderError('http-401','miscrits'));
 await expect(service.run()).rejects.toThrow('http-401');
 expect(client.refresh).toHaveBeenCalledTimes(1);
 const other=new MiscritsStore(dir,Buffer.alloc(32,1));
 try {await store.withLock(async()=>{await expect(other.withLock(async()=>{})).rejects.toThrow('busy');});}
 finally {other.close();}
});
test('refreshes expired access, reauthenticates expired refresh, and rejects changed owners', async()=>{
 await service.connect(credentials);
 const state=store.state();
 store.saveRotated({...store.session(),token:jwt(now-1000),refreshToken:jwt(now-1000)},state.generation,state.version);
 await service.run();
 expect(client.login).toHaveBeenCalledTimes(2);
 expect(client.refresh).not.toHaveBeenCalled();
 client.player.mockResolvedValue(f.player({username:'someone-else'}));
 await expect(service.run()).rejects.toThrow('account-mismatch');
 expect(service.read().status).toBe('stale');
});
test('refreshes catalog once for unknown species, preserves unresolved IDs and supports zero ownership', async()=>{
 await service.connect(credentials);
 client.player.mockResolvedValue(f.player({miscrits:[f.owned({m:999})]}));
 await service.run();
 expect(client.catalog).toHaveBeenCalledTimes(2);
 expect(service.read().data.miscrits[0].catalogStatus).toBe('unresolved');
 client.player.mockResolvedValue(f.player({miscrits:[],team_order:[]}));
 await service.run();
 expect(service.read().data.miscrits).toEqual([]);
});
test('disconnect removes local secrets and data',async()=>{
 await service.connect(credentials);await service.run();await service.disconnect();
 expect(store.session()).toBeNull();expect(store.get('core')).toBeNull();
 expect(service.read().status).toBe('unavailable');
});
test('does not repeat authentication after a freshly rotated token is rejected', async()=>{
 await service.connect(credentials);
 const state=store.state();
 store.saveRotated({...store.session(),token:jwt(now-1000)},state.generation,state.version);
 client.player.mockClear();
 client.player.mockRejectedValue(new ProviderError('http-401','miscrits'));
 await expect(service.run()).rejects.toThrow('http-401');
 expect(client.refresh).toHaveBeenCalledTimes(1);
 expect(client.player).toHaveBeenCalledTimes(1);
 expect(service.read()).toMatchObject({status:'unavailable',fetchedAt:null});
});

test('guided connection discovers the owner, fetches once and reuses the stored connection after restart', async()=>{
 settings.accountId='';
 expect(await service.connect(credentials,{refresh:true})).toMatchObject({connected:true,refreshed:true,playerMiscritCount:1});
 expect(store.state().accountId).toBe('owner-id');
 expect(client.login).toHaveBeenCalledTimes(1);
 expect(client.player).toHaveBeenCalledTimes(1);
 expect(service.read()).toMatchObject({status:'ready',refreshMode:'startup-request-and-manual'});
 const restarted=createService({store,client,settings,now:()=>now});
 await restarted.run();
 expect(client.login).toHaveBeenCalledTimes(1);
 expect(client.player).toHaveBeenCalledTimes(2);
});
test('rejects an optional account pin or returned username mismatch before binding', async()=>{
 client.player.mockResolvedValue(f.player({user_id:'other'}));
 await expect(service.connect(credentials,{refresh:true})).rejects.toThrow('account-mismatch');
 expect(store.session()).toBeNull();
 settings.accountId='';
 client.player.mockResolvedValue(f.player({username:'other'}));
 await expect(service.connect(credentials,{refresh:true})).rejects.toThrow('account-mismatch');
 expect(store.session()).toBeNull();
});
test('binds learned identity for subsequent reads and hides data if an optional account pin changes', async()=>{
 settings.accountId='';
 await service.connect(credentials,{refresh:true});
 client.player.mockResolvedValue(f.player({user_id:'other'}));
 await expect(service.run()).rejects.toThrow('account-mismatch');
 expect(store.state().accountId).toBe('owner-id');
 expect(service.read().status).toBe('stale');
 settings.accountId='other';
 expect(service.read()).toMatchObject({status:'unavailable'});
 expect(service.read()).not.toHaveProperty('data');
});
test('preserves a successful connection if the first catalog fetch fails, allowing refresh without login', async()=>{
 client.catalog.mockRejectedValueOnce(new ProviderError('http-503','miscrits'));
 expect(await service.connect(credentials,{refresh:true})).toEqual({connected:true,refreshed:false,error:'miscrits:http-503'});
 expect(store.session()).not.toBeNull();
 expect(service.read().status).toBe('unavailable');
 await service.run();
 expect(client.login).toHaveBeenCalledTimes(1);
 expect(service.read().status).toBe('ready');
});
test('startup never logs in without explicit connect and disconnect remains effective', async()=>{
 await expect(service.run()).rejects.toThrow('run-miscrits-connect-first');
 expect(client.login).not.toHaveBeenCalled();
 await service.connect(credentials,{refresh:true});
 await service.disconnect();
 await expect(service.run()).rejects.toThrow('run-miscrits-connect-first');
 expect(client.login).toHaveBeenCalledTimes(1);
 await service.connect(credentials,{refresh:true});
 expect(client.login).toHaveBeenCalledTimes(2);
});
