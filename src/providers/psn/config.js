const fs = require('node:fs');
const path = require('node:path');
const { keyFromHex } = require('../../storage/psnStore');
const { ProviderError } = require('../../shared/providerError');

const enabled = (value) => /^(true|1|yes|on)$/i.test(value || '');
function number(env, name, fallback, min, max) {
  const n = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(n) || n < min || n > max) throw new ProviderError(`invalid-${name.toLowerCase()}`, 'configuration');
  return n;
}

function config(env = process.env) {
  return {
    enabled: enabled(env.ENABLE_PSN),
    onlineId: env.PSN_ONLINE_ID || '',
    directory: path.resolve(env.GAMING_DATA_DIR || 'cache/gaming', 'psn'),
    keyValue: env.GAMING_ENCRYPTION_KEY,
    keyFile: env.GAMING_ENCRYPTION_KEY_FILE,
    libraryMs: number(env, 'PSN_REFRESH_MINUTES', 15, 5, 1440) * 60000,
    presenceMs: number(env, 'PSN_PRESENCE_SECONDS', 60, 30, 3600) * 1000,
    detailsMs: number(env, 'PSN_DETAILS_MINUTES', 60, 15, 1440) * 60000,
    maxStaleMs: number(env, 'PSN_MAX_STALE_HOURS', 24, 1, 168) * 3600000,
    jobMs: 45000,
  };
}

function encryptionKey(config) {
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(config.onlineId)) throw new ProviderError('configure-psn-online-id', 'configuration');
  if (config.keyValue) return keyFromHex(config.keyValue);
  if (config.keyFile) {
    const st = fs.lstatSync(config.keyFile);
    if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) || st.size > 128) throw new ProviderError('key-file-must-be-private', 'configuration');
    return keyFromHex(fs.readFileSync(config.keyFile, 'utf8').trim());
  }
  throw new ProviderError('configure-encryption-key', 'configuration');
}

module.exports = { config, encryptionKey, enabled };
