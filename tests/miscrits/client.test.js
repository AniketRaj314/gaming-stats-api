const { createClient, json } = require('../../src/providers/miscrits/client');
const response = body => ({status:200,headers:{'content-type':'application/json'},text:JSON.stringify(body)});
test('encodes only RPC parameters twice and uses verified auth/refresh paths', async () => {
  const transport=jest.fn().mockResolvedValue(response({payload:JSON.stringify({success:true,data:JSON.stringify({miscrits:[]})})}));
  const c=createClient({transport});
  await c.player('access');
  expect(transport.mock.calls[0][0]).toBe('https://worldofmiscrits.com/v2/rpc/get_player');
  expect(transport.mock.calls[0][1].body).toBe('"{}"');
  await c.login({username:'user name',password:'secret',applicationCredential:'app'});
  expect(transport.mock.calls[1][0]).toContain('create=false&username=user%20name');
  expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({email:'',password:'secret'});
  await c.refresh({applicationCredential:'app'},'refresh');
  expect(transport.mock.calls[2][0]).toBe('https://worldofmiscrits.com/v2/account/session/refresh');
  expect(JSON.parse(transport.mock.calls[2][1].body)).toEqual({token:'refresh'});
});
test('rejects HTTP and nested failures without echoing response bodies', async () => {
  expect(()=>json({status:403,headers:{},text:'secret challenge'})).toThrow('http-403');
  expect(()=>json({status:200,headers:{'content-type':'text/html'},text:'secret'})).toThrow('non-json-response');
  const client=createClient({transport:jest.fn().mockResolvedValue(response({payload:JSON.stringify({success:false,error:'private'})}))});
  await expect(client.player('token')).rejects.toThrow('invalid-player-payload');
});
test('catalog honors conditional requests and a forced unknown-ID refresh', async () => {
  const transport=jest.fn().mockResolvedValueOnce({status:304,headers:{},text:''}).mockResolvedValue(response([]));
  const client=createClient({transport});const previous={etag:'etag',rows:[1],hash:'hash'};
  expect((await client.catalog(previous)).rows).toEqual([1]);
  await client.catalog(previous,true);
  expect(transport.mock.calls[0][1].headers).toEqual({'If-None-Match':'etag'});
  expect(transport.mock.calls[1][1].headers).toEqual({});
});
