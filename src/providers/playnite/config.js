const path = require('node:path');
const { ProviderError } = require('../../shared/providerError');

const enabled = value => /^(true|1|yes|on)$/i.test(value || '');

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ProviderError(`invalid-${name.toLowerCase()}`, 'configuration');
  }
  return value;
}

function uploadKeys(value) {
  const keys = String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  if (!keys.length || keys.some(key => key.length < 32 || key.length > 512)) {
    throw new ProviderError('configure-playnite-upload-keys', 'configuration');
  }
  return keys;
}

function config(env = process.env) {
  return {
    enabled: enabled(env.ENABLE_PLAYNITE),
    uploadKeys: uploadKeys(env.PLAYNITE_UPLOAD_KEYS),
    directory: path.resolve(env.GAMING_DATA_DIR || 'cache/gaming', 'playnite'),
    libraryStaleMs: integer(env, 'PLAYNITE_LIBRARY_STALE_HOURS', 24, 1, 720) * 3600000,
    presenceTtlMs: integer(env, 'PLAYNITE_PRESENCE_TTL_SECONDS', 180, 30, 900) * 1000,
  };
}

module.exports = { config, enabled, uploadKeys };
