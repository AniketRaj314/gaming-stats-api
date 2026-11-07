const https = require('node:https');
const { ProviderError } = require('../../shared/providerError');
const origin = 'https://worldofmiscrits.com';
const catalogUrl = origin + '/miscrits.json';
const userAgent = 'GodotEngine/4.6.stable.custom_build.661f2621f (macOS)';

// Native HTTPS uses HTTP/1.1. No redirects, insecure TLS, or credential-bearing command lines.
function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const req = https.request(url, { method, headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) req.destroy(new Error('limit'));
        else chunks.push(chunk);
      });
      res.on('error', () => reject(new ProviderError('transport-failed', 'miscrits')));
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('deadline')), 25000);
    req.on('error', () => { clearTimeout(timer); reject(new ProviderError('transport-failed', 'miscrits')); });
    req.end(body);
  });
}
function json(response) {
  if (response.status < 200 || response.status >= 300) throw new ProviderError('http-' + response.status, 'miscrits');
  if (!/application\/json/i.test(response.headers['content-type'] || '')) throw new ProviderError('non-json-response', 'miscrits');
  try { return JSON.parse(response.text); }
  catch { throw new ProviderError('invalid-json', 'miscrits'); }
}
function createClient({ transport = request } = {}) {
  const post = async (path, authorization, data) => json(await transport(origin + path, {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }));
  return {
    login: credentials => post('/v2/account/authenticate/email?create=false&username=' + encodeURIComponent(credentials.username),
      'Basic ' + credentials.applicationCredential, { email: '', password: credentials.password }),
    refresh: (credentials, token) => post('/v2/account/session/refresh', 'Basic ' + credentials.applicationCredential, { token }),
    async player(token) {
      const outer = await post('/v2/rpc/get_player', 'Bearer ' + token, JSON.stringify({}));
      try {
        const payload = JSON.parse(outer.payload);
        if (payload.success !== true) throw new Error('application');
        const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : null;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('shape');
        return data;
      } catch { throw new ProviderError('invalid-player-payload', 'miscrits'); }
    },
    async catalog(previous, force = false) {
      const headers = !force && previous?.etag ? { 'If-None-Match': previous.etag } : {};
      const response = await transport(catalogUrl, { headers });
      if (response.status === 304 && previous) return { ...previous, checkedAt: Date.now() };
      const rows = json(response);
      return { rows, hash: require('node:crypto').createHash('sha256').update(response.text).digest('hex'),
        etag: response.headers.etag || null, version: null, fetchedAt: new Date().toISOString(), checkedAt: Date.now() };
    },
  };
}
module.exports = { createClient, request, json, catalogUrl };
