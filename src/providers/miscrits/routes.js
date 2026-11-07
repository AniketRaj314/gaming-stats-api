const express = require('express');
const { version } = require('../../../package.json');
function createMiscritsRouter({ service, auth, unavailableStatus = 'disabled' }) {
  const router = express.Router();
  router.use((req,res,next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.get('/health', (req,res) => {
    try { return res.json({ version, provider: 'miscrits', status: service ? service.read().status : unavailableStatus }); }
    catch { return res.status(503).json({ version, provider: 'miscrits', status: 'unavailable' }); }
  });
  router.use(auth);
  const route = (path, fn) => router.get(path, (req,res) => {
    if (Object.keys(req.query).length || (req.body && Object.keys(req.body).length)) return res.status(400).json({ error: 'No query or body parameters supported' });
    if (req.params.id && (!/^[1-9][0-9]*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)))) {
      return res.status(400).json({ error: 'Invalid identifier' });
    }
    try {
      if (!service) return res.status(503).json({ provider: 'miscrits', status: unavailableStatus });
      const { data, ...envelope } = service.read();
      if (!data) return res.status(503).json(envelope);
      const value = fn(data, req);
      if (value === undefined) return res.status(404).json({ ...envelope, error: 'Not found' });
      return res.json({ ...envelope, data: value });
    } catch { return res.status(503).json({ provider: 'miscrits', status: 'unavailable' }); }
  });
  route('/player', d => d.player);
  route('/player/snapshot', d => d.snapshot);
  route('/player/miscrits', d => d.miscrits);
  route('/player/miscrits/families', d => d.families);
  route('/player/miscrits/:id', (d,req) => d.miscrits.find(m => m.playerMiscritId === Number(req.params.id)));
  route('/player/team', d => d.player.teamOrder.map(id => d.miscrits.find(m => m.playerMiscritId === id)));
  route('/miscrits', d => d.species);
  route('/miscrits/:id', (d,req) => d.species.find(m => m.id === Number(req.params.id)));
  return router;
}
module.exports = { createMiscritsRouter };
