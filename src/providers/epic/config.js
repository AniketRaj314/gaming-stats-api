const fs = require('node:fs');
const path = require('node:path');
const { keyFromHex } = require('../../storage/psnStore');
const { ProviderError } = require('../../shared/providerError');

const enabled = value => /^(true|1|yes|on)$/i.test(value || '');

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ProviderError(`invalid-${name.toLowerCase()}`, 'configuration');
  }
  return value;
}

function config(env = process.env) {
  const expectedDisplayName = env.EPIC_EXPECTED_DISPLAY_NAME || '';
  if (expectedDisplayName && (!/^[\p{L}\p{N}_. -]{3,64}$/u.test(expectedDisplayName) || /[\r\n]/.test(expectedDisplayName))) {
    throw new ProviderError('invalid-epic-expected-display-name', 'configuration');
  }
  return {
    enabled: enabled(env.ENABLE_EPIC),
    expectedDisplayName,
    directory: path.resolve(env.GAMING_DATA_DIR || 'cache/gaming', 'epic'),
    keyValue: env.GAMING_ENCRYPTION_KEY,
    keyFile: env.GAMING_ENCRYPTION_KEY_FILE,
    refreshMs: integer(env, 'EPIC_REFRESH_MINUTES', 15, 5, 1440) * 60000,
    catalogMs: integer(env, 'EPIC_CATALOG_HOURS', 24, 1, 168) * 3600000,
    maxStaleMs: integer(env, 'EPIC_MAX_STALE_HOURS', 24, 1, 168) * 3600000,
    jobMs: 120000,
  };
}

function encryptionKey(settings) {
  if (settings.keyValue) return keyFromHex(settings.keyValue);
  if (settings.keyFile) {
    const stat = fs.lstatSync(settings.keyFile);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 128) {
      throw new ProviderError('key-file-must-be-private', 'configuration');
    }
    return keyFromHex(fs.readFileSync(settings.keyFile, 'utf8').trim());
  }
  throw new ProviderError('configure-encryption-key', 'configuration');
}

module.exports = { config, encryptionKey, enabled };
