jest.mock('dotenv',()=>({config:jest.fn()}));
jest.mock('../../src/providers/miscrits',()=>({createMiscritsProvider:jest.fn()}));
jest.mock('../../scripts/miscrits/connect',()=>({guidedCredentials:jest.fn()}));
const { main } = require('../../scripts/miscrits/cli');
const { createMiscritsProvider } = require('../../src/providers/miscrits');
const { guidedCredentials } = require('../../scripts/miscrits/connect');
const { ProviderError } = require('../../src/shared/providerError');
const originalArgs=process.argv,originalExitCode=process.exitCode;
const ttyIn=Object.getOwnPropertyDescriptor(process.stdin,'isTTY');
const ttyOut=Object.getOwnPropertyDescriptor(process.stderr,'isTTY');
let service,store,log,error,oldRailway,oldSecure;
beforeEach(()=>{
 oldRailway=process.env.RAILWAY_ENVIRONMENT_ID;oldSecure=process.env.MISCRITS_SECURE_TTY;
 delete process.env.RAILWAY_ENVIRONMENT_ID;delete process.env.MISCRITS_SECURE_TTY;
 process.argv=['node','cli','connect'];
 Object.defineProperty(process.stdin,'isTTY',{configurable:true,value:true});
 Object.defineProperty(process.stderr,'isTTY',{configurable:true,value:true});
 log=jest.spyOn(console,'log').mockImplementation(()=>{});error=jest.spyOn(console,'error').mockImplementation(()=>{});
 service={connect:jest.fn().mockResolvedValue({connected:true,refreshed:true,fetchedAt:'date',playerMiscritCount:2})};
 store={state:jest.fn(()=>({sealed:null})),close:jest.fn()};
 createMiscritsProvider.mockReturnValue({service,store,settings:{applicationCredential:''}});
 guidedCredentials.mockResolvedValue({username:'owner',password:'synthetic-password',applicationCredential:'YXBwOg=='});
});
afterEach(()=>{
 process.argv=originalArgs;process.exitCode=originalExitCode;
 for(const [name,value] of [['RAILWAY_ENVIRONMENT_ID',oldRailway],['MISCRITS_SECURE_TTY',oldSecure]]) {
  if(value===undefined) delete process.env[name]; else process.env[name]=value;
 }
 if(ttyIn)Object.defineProperty(process.stdin,'isTTY',ttyIn);else delete process.stdin.isTTY;
 if(ttyOut)Object.defineProperty(process.stderr,'isTTY',ttyOut);else delete process.stderr.isTTY;
 log.mockRestore();error.mockRestore();
});
test('guided connect requests the initial snapshot and never prints the credentials',async()=>{
 await main();expect(service.connect).toHaveBeenCalledWith(expect.objectContaining({username:'owner'}),{refresh:true});
 expect(store.close).toHaveBeenCalled();
 expect(JSON.stringify([...log.mock.calls,...error.mock.calls])).not.toContain('synthetic-password');
});
test('cancelling setup does not authenticate and closes the store',async()=>{
 guidedCredentials.mockRejectedValueOnce(new ProviderError('cancelled','setup'));
 await expect(main()).rejects.toThrow('cancelled');
 expect(service.connect).not.toHaveBeenCalled();expect(store.close).toHaveBeenCalled();
});
test('initial snapshot failure is distinguished from authentication failure',async()=>{
 service.connect.mockResolvedValue({connected:true,refreshed:false,error:'miscrits:http-503'});
 await main();expect(process.exitCode).toBe(1);
 expect(error.mock.calls.flat().join('')).toContain('Account connected and credentials saved');
 expect(error.mock.calls.flat().join('')).toContain('miscrits:refresh');
});
test('Railway requires an explicitly opened interactive shell before prompting',async()=>{
 process.env.RAILWAY_ENVIRONMENT_ID='synthetic-environment';
 await expect(main()).rejects.toThrow('open-interactive-railway-ssh');
 expect(guidedCredentials).not.toHaveBeenCalled();
 process.env.MISCRITS_SECURE_TTY='1';
 await main();expect(guidedCredentials).toHaveBeenCalledTimes(1);
});
