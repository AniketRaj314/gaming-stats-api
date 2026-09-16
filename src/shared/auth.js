const { createHash, timingSafeEqual } = require('node:crypto');

function requireApiKey(keys) {
  const hashes = keys.map((key) => key.trim()).filter(Boolean)
    .map((key) => createHash('sha256').update(key).digest());
  return (req, res, next) => {
    const key = req.get('x-api-key');
    if (typeof key !== 'string' || key.length > 4096) {
      return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    const candidate = createHash('sha256').update(key).digest();
    if (!hashes.some((hash) => timingSafeEqual(hash, candidate))) {
      return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    next();
  };
}

module.exports = { requireApiKey };
