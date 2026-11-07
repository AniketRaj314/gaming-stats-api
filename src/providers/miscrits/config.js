const path = require('node:path');
const fs = require('node:fs');
const { encryptionKey, enabled } = require('../epic/config');
const { ProviderError } = require('../../shared/providerError');
function config(env = process.env) {
  const hours = (name, fallback) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isFinite(value) || value < 1 || value > 720) throw new ProviderError('invalid-' + name.toLowerCase(), 'configuration');
    return value * 3600000;
  };
  let applicationCredential = env.MISCRITS_APPLICATION_CREDENTIAL || '';
  if (!applicationCredential && env.MISCRITS_APPLICATION_CREDENTIAL_FILE) {
    const fd = fs.openSync(env.MISCRITS_APPLICATION_CREDENTIAL_FILE, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 4096) throw new ProviderError('application-credential-file-must-be-private', 'configuration');
      applicationCredential = fs.readFileSync(fd, 'utf8').trim();
    } finally { fs.closeSync(fd); }
  }
  if (env.MISCRITS_USERNAME || env.MISCRITS_PASSWORD) {
    throw new ProviderError('remove-login-env-and-use-miscrits-connect', 'configuration');
  }
  if (applicationCredential && !/^[A-Za-z0-9+/]+={0,2}$/.test(applicationCredential)) throw new ProviderError('invalid-application-credential', 'configuration');
  const refreshMinutes = env.MISCRITS_REFRESH_MINUTES === undefined || env.MISCRITS_REFRESH_MINUTES === ''
    ? 5 : Number(env.MISCRITS_REFRESH_MINUTES);
  if (!Number.isInteger(refreshMinutes) || refreshMinutes < 0 || refreshMinutes > 1440) {
    throw new ProviderError('invalid-miscrits-refresh-minutes', 'configuration');
  }
  return { enabled: enabled(env.ENABLE_MISCRITS), accountId: env.MISCRITS_ACCOUNT_ID || '',
    applicationCredential,
    directory: path.resolve(env.GAMING_DATA_DIR || 'cache/gaming', 'miscrits'),
    keyValue: env.GAMING_ENCRYPTION_KEY, keyFile: env.GAMING_ENCRYPTION_KEY_FILE,
    refreshMs: refreshMinutes * 60000,
    catalogMs: hours('MISCRITS_CATALOG_HOURS', 24), staleMs: hours('MISCRITS_STALE_HOURS', 24) };
}
module.exports = { config, encryptionKey };
