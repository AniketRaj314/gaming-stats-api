const path = require('node:path');
const { ProviderError } = require('../../shared/providerError');

const enabled = (value) => /^(true|1|yes|on)$/i.test(value || '');

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ProviderError(`invalid-${name.toLowerCase()}`, 'configuration');
  }
  return value;
}

function steamId(value) {
  if (typeof value !== 'string' || !/^\d{17}$/.test(value)) {
    throw new ProviderError('configure-steam-id', 'configuration');
  }
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > 18446744073709551615n) {
    throw new ProviderError('configure-steam-id', 'configuration');
  }
  return value;
}

function apiKey(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{32}$/i.test(value)) {
    throw new ProviderError('configure-steam-web-api-key', 'configuration');
  }
  return value;
}

function config(env = process.env) {
  const language = env.STEAM_LANGUAGE || 'english';
  if (!/^[a-z]{2,32}$/i.test(language)) throw new ProviderError('invalid-steam-language', 'configuration');
  return {
    enabled: enabled(env.ENABLE_STEAM),
    steamId: steamId(env.STEAM_ID),
    apiKey: apiKey(env.STEAM_WEB_API_KEY),
    language: language.toLowerCase(),
    directory: path.resolve(env.GAMING_DATA_DIR || 'cache/gaming', 'steam'),
    refreshMs: integer(env, 'STEAM_REFRESH_MINUTES', 15, 5, 1440) * 60000,
    detailsMs: integer(env, 'STEAM_DETAILS_MINUTES', 720, 30, 10080) * 60000,
    maxStaleMs: integer(env, 'STEAM_MAX_STALE_HOURS', 24, 1, 168) * 3600000,
    jobMs: 45000,
  };
}

module.exports = { config, enabled, steamId, apiKey };
