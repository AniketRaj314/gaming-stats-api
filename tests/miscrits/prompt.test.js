const { EventEmitter } = require('node:events');
const { prompt } = require('../../scripts/miscrits/prompt');
const { guidedCredentials } = require('../../scripts/miscrits/connect');
const { ProviderError } = require('../../src/shared/providerError');
const key = Buffer.from('synthetic:').toString('base64');
function terminal() {
  const input = new EventEmitter();
  Object.assign(input, {isTTY:true,isRaw:false,setRawMode:jest.fn(),resume:jest.fn(),pause:jest.fn()});
  return {input,output:{isTTY:true,write:jest.fn()}};
}
test('disables echo before readiness and handles Unicode and bracketed paste without printing secrets',async()=>{
 const io=terminal();const result=prompt('Password',io);
 io.input.emit('data',Buffer.from('\x1b[20'));
 io.input.emit('data',Buffer.from('0~  sécret🔒  \x1b[201~\r'));
 expect(await result).toBe('  sécret🔒  ');
 expect(io.output.write.mock.calls.flat().join('')).not.toContain('sécret');
 expect(io.input.setRawMode.mock.invocationCallOrder[0]).toBeLessThan(io.output.write.mock.invocationCallOrder[0]);
 expect(io.input.setRawMode).toHaveBeenLastCalledWith(false);
 expect(io.input.listenerCount('data')).toBe(0);
 expect(io.input.listenerCount('error')).toBe(0);
});
test('preserves UTF-8 split across chunks and permits correcting a character',async()=>{
 const io=terminal();const result=prompt('Password',io);const value=Buffer.from('é');
 io.input.emit('data',value.subarray(0,1));io.input.emit('data',value.subarray(1));
 io.input.emit('data',Buffer.from('x\x7f\r'));expect(await result).toBe('é');
});
test.each(['\x03','\x04'])('cancellation restores raw mode and removes listeners',async(ch)=>{
 const io=terminal();const result=prompt('Password',io);io.input.emit('data',Buffer.from(ch));
 await expect(result).rejects.toThrow('cancelled');
 expect(io.input.setRawMode).toHaveBeenLastCalledWith(false);expect(io.input.pause).toHaveBeenCalled();
});
test('rejects piped input and multi-field pastes',async()=>{
 await expect(prompt('Password',{input:{isTTY:false},output:{isTTY:false}})).rejects.toThrow('interactive-terminal-required');
 const io=terminal();const result=prompt('Password',io);
 io.input.emit('data',Buffer.from('first\nsecond\n'));await expect(result).rejects.toThrow('one-value-per-prompt');
 expect(io.output.write.mock.calls.flat().join('')).not.toContain('second');
});
test('a local game log reduces guided connection to username and hidden password',async()=>{
 const ask=jest.fn().mockResolvedValueOnce(' owner ').mockResolvedValueOnce(' password ');
 const output={write:jest.fn()};const readApplication=jest.fn(()=>key);
 expect(await guidedCredentials({ask,output,readApplication})).toEqual({username:'owner',password:' password ',applicationCredential:key});
 expect(ask.mock.calls).toEqual([['Miscrits username',{hidden:false}],['Miscrits password']]);
 expect(output.write.mock.calls.flat().join('')).not.toContain(key);
});
test('a cloud installation prompts for the application credential once before username and password',async()=>{
 const ask=jest.fn().mockResolvedValueOnce(key).mockResolvedValueOnce('owner').mockResolvedValueOnce('password');
 const readApplication=()=>{throw Object.assign(new Error(),{code:'ENOENT'});};
 expect(await guidedCredentials({ask,readApplication,output:{write:jest.fn()}})).toMatchObject({applicationCredential:key});
 expect(ask).toHaveBeenCalledWith('Application credential');
});
test('configured application values avoid log reads and cancellation performs no login',async()=>{
 const readApplication=jest.fn();const ask=jest.fn().mockRejectedValue(new ProviderError('cancelled','setup'));
 await expect(guidedCredentials({applicationCredential:key,ask,readApplication})).rejects.toThrow('cancelled');
 expect(readApplication).not.toHaveBeenCalled();expect(ask).toHaveBeenCalledTimes(1);
});
