const { createHash, timingSafeEqual } = require('node:crypto');

function requireHeaderKey(keys, header = 'x-api-key', message = 'Invalid or missing API key') {
  const hashes = keys.map((key) => key.trim()).filter(Boolean)
    .map((key) => createHash('sha256').update(key).digest());
  return (req, res, next) => {
    const key = req.get(header);
    if (typeof key !== 'string' || key.length > 4096) {
      return res.status(401).json({ error: message });
    }
    const candidate = createHash('sha256').update(key).digest();
    if (!hashes.some((hash) => timingSafeEqual(hash, candidate))) {
      return res.status(401).json({ error: message });
    }
    next();
  };
}

const requireApiKey = keys => requireHeaderKey(keys);

module.exports = { requireApiKey, requireHeaderKey };
