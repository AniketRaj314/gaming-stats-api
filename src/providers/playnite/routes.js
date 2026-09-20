const express = require('express');
const { ProviderError } = require('../../shared/providerError');

const ASSET_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

function createPlayniteRouter({ service, readAuth, uploadAuth, unavailableStatus = 'disabled' } = {}) {
  const router = express.Router();
  const unavailable = res => res.status(503).json({ schemaVersion: 1, provider: 'playnite', accountRef: 'owner', status: unavailableStatus });
  const fail = (res, error) => {
    const bad = error instanceof ProviderError && error.stage === 'schema';
    return res.status(bad ? 400 : 503).json({ provider: 'playnite', status: bad ? 'invalid-request' : 'unavailable', error: bad ? error.code : undefined });
  };
  const read = fn => [readAuth, (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!service) return unavailable(res);
    try { return fn(req, res); } catch (error) { return fail(res, error); }
  }];
  const upload = fn => [uploadAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!service) return unavailable(res);
    try { return fn(req, res); } catch (error) { return fail(res, error); }
  }];

  router.get('/library', ...read((req, res) => {
    const body = service.library();
    return res.status(['ready', 'stale'].includes(body.status) ? 200 : 503).json(body);
  }));
  router.get('/presence', ...read((req, res) => {
    const body = service.presence();
    return res.status(['ready', 'stale'].includes(body.status) ? 200 : 503).json(body);
  }));
  router.get('/games/:playniteId', ...read((req, res) => {
    const result = service.game(req.params.playniteId);
    return res.status(result.httpStatus).json(result.body);
  }));
  router.get('/assets/:assetId', ...read((req, res) => {
    const asset = service.asset(req.params.assetId);
    if (!asset) return res.status(404).json({ error: 'Artwork asset not found' });
    res.set({ 'Content-Type': asset.contentType, 'Content-Length': String(asset.size),
      'Content-Security-Policy': "default-src 'none'", 'X-Content-Type-Options': 'nosniff' });
    return res.sendFile(asset.file);
  }));

  router.post('/sync/library', ...upload((req, res) => res.status(202).json(service.ingestLibrary(req.body))));
  router.post('/sync/presence', ...upload((req, res) => res.status(202).json(service.ingestPresence(req.body))));
  router.head('/sync/assets/:assetId', ...upload((req, res) => res.sendStatus(service.asset(req.params.assetId) ? 204 : 404)));
  router.put('/sync/assets/:assetId', uploadAuth,
    express.raw({ type: ASSET_TYPES, limit: '12mb' }), (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!service) return unavailable(res);
      try {
        if (!ASSET_TYPES.includes(req.get('content-type'))) throw new ProviderError('invalid-asset-type', 'schema');
        return res.status(201).json(service.writeAsset(req.params.assetId, req.get('content-type'), req.body));
      } catch (error) { return fail(res, error); }
    });
  return router;
}

module.exports = { createPlayniteRouter };
