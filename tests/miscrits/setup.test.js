const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { config } = require('../../src/providers/miscrits/config');
const { extractApplicationCredential, importCredential, defaultLogPath } = require('../../scripts/miscrits/import-application-credential');
const key = Buffer.from('synthetic-client-key:').toString('base64');
const line = (url = 'https://worldofmiscrits.com:443/v2/account/authenticate/email?create=false&username=owner', value = key) =>
  `=== Nakama : DEBUG === Sending request [ID: 1, Method: POST, Uri: ${url}, Headers: { "Authorization": "Basic ${value}" }, Body: {"password":"must-not-export"}, Timeout: 10]`;
let directory;
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'miscrits-setup-'));});
afterEach(()=>{fs.rmSync(directory,{recursive:true,force:true});});
test('interactive setup needs no login env and supports an optional account pin',()=>{
 expect(config({})).toMatchObject({accountId:'',applicationCredential:''});
 expect(config({MISCRITS_ACCOUNT_ID:'pin'}).accountId).toBe('pin');
 expect(()=>config({MISCRITS_USERNAME:'owner'})).toThrow('remove-login-env-and-use-miscrits-connect');
 expect(()=>config({MISCRITS_PASSWORD:'password'})).toThrow('remove-login-env-and-use-miscrits-connect');
 expect(()=>config({MISCRITS_APPLICATION_CREDENTIAL:'Basic '+key})).toThrow('invalid-application-credential');
});
test('supports a private credential file and prefers an explicit env value',()=>{
 const file=path.join(directory,'application.key');
 fs.writeFileSync(file,key+'\n',{mode:0o600});
 const env={MISCRITS_APPLICATION_CREDENTIAL_FILE:file};
 expect(config(env).applicationCredential).toBe(key);
 expect(config({...env,MISCRITS_APPLICATION_CREDENTIAL:'b3ZlcnJpZGU6'}).applicationCredential).toBe('b3ZlcnJpZGU6');
 fs.chmodSync(file,0o644);
 expect(()=>config(env)).toThrow('application-credential-file-must-be-private');
});
test('imports only the application credential from the exact authenticated origin',()=>{
 const log=path.join(directory,'godot.log'),output=path.join(directory,'private','application.key');
 fs.writeFileSync(log,line()+'\nBearer private-session-token');
 importCredential(log,output);
 expect(fs.readFileSync(output,'utf8')).toBe(key+'\n');
 expect(fs.statSync(output).mode & 0o077).toBe(0);
 expect(()=>importCredential(log,output)).toThrow();
 expect(config({MISCRITS_APPLICATION_CREDENTIAL_FILE:output}).applicationCredential).toBe(key);
});
test.each([
 'http://worldofmiscrits.com/v2/account/authenticate/email',
 'https://worldofmiscrits.com.evil.example/v2/account/authenticate/email',
 'https://worldofmiscrits.com:444/v2/account/authenticate/email',
 'https://worldofmiscrits.com/v2/rpc/get_player',
 'https://user@worldofmiscrits.com/v2/account/authenticate/email',
])('rejects unrelated or untrusted log requests %s',url=>{
 expect(()=>extractApplicationCredential(line(url))).toThrow('application-credential-not-found');
});
test('does not export bearer tokens, body text, ambiguous keys or response headers',()=>{
 expect(()=>extractApplicationCredential(line().replace('Basic ','Bearer '))).toThrow();
 expect(()=>extractApplicationCredential(line().replace('Sending request','Received response'))).toThrow();
 expect(()=>extractApplicationCredential(line().replace('"Authorization"','"X-Unrelated"'))).toThrow();
 expect(()=>extractApplicationCredential(line()+ '\n' + line(undefined,Buffer.from('different:').toString('base64')))).toThrow('ambiguous-application-credential');
 expect(extractApplicationCredential(line()+'\n'+line())).toBe(key);
 expect(()=>extractApplicationCredential(line().replace('"Authorization": "Basic '+key+'"',''))).toThrow();
});
test('uses documented Godot data directories and allows log path overrides through the CLI',()=>{
 expect(defaultLogPath('darwin','/home/owner',{})).toBe('/home/owner/Library/Application Support/Godot/app_userdata/Miscrits/logs/godot.log');
 expect(defaultLogPath('linux','/home/owner',{})).toBe('/home/owner/.local/share/godot/app_userdata/Miscrits/logs/godot.log');
 expect(defaultLogPath('linux','/home/owner',{XDG_DATA_HOME:'/data'})).toBe('/data/godot/app_userdata/Miscrits/logs/godot.log');
});

test('request refresh defaults to five minutes, accepts disable/custom values and rejects malformed intervals',()=>{
 expect(config({}).refreshMs).toBe(300000);
 expect(config({MISCRITS_REFRESH_MINUTES:''}).refreshMs).toBe(300000);
 expect(config({MISCRITS_REFRESH_MINUTES:'10'}).refreshMs).toBe(600000);
 expect(config({MISCRITS_REFRESH_MINUTES:'0'}).refreshMs).toBe(0);
 for(const value of ['-1','1.5','1441','Infinity','no'])expect(()=>config({MISCRITS_REFRESH_MINUTES:value})).toThrow('invalid-miscrits-refresh-minutes');
});
