const { ProviderError } = require('../../shared/providerError');

const API = 'https://api.steampowered.com';

function createClient({ apiKey, fetchImpl = global.fetch, now = Date.now, requestMs = 10000, maxBytes = 4 * 1024 * 1024 } = {}) {
  const context = (jobMs = 45000) => ({ signal: AbortSignal.timeout(jobMs), remaining: 20 });

  async function request(path, query, ctx, stage, optional = false) {
    if (--ctx.remaining < 0) throw new ProviderError('request-budget-exhausted', stage);
    const url = new URL(path, API);
    for (const [name, value] of Object.entries({ ...query, format: 'json' })) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(requestMs)]);
    try {
      const response = await fetchImpl(url.toString(), {
        redirect: 'manual', signal,
        headers: { Accept: 'application/json', 'x-webapi-key': apiKey },
      });
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        await response.body?.cancel();
        if (response.status === 429) {
          const parsed = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now();
          throw new ProviderError('rate-limited', stage, Number.isFinite(parsed) ? Math.max(60000, Math.min(parsed, 86400000)) : 300000);
        }
        if (optional && [400, 404].includes(response.status)) throw new ProviderError('not-supported', stage);
        if ([401, 403].includes(response.status)) throw new ProviderError('forbidden', stage);
        throw new ProviderError(`upstream-${response.status}`, stage);
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new ProviderError('response-too-large', stage);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError('invalid-response', stage);
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new ProviderError('response-too-large', stage);
          }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new ProviderError('invalid-json', stage); }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(signal.aborted ? 'timeout' : 'network-error', stage);
    }
  }

  return {
    context,
    profile: (steamId, ctx) => request('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }, ctx, 'profile'),
    level: (steamId, ctx) => request('/IPlayerService/GetSteamLevel/v1/', { input_json: JSON.stringify({ steamid: exactSteamId(steamId) }) }, ctx, 'profile'),
    library: (steamId, ctx) => request('/IPlayerService/GetOwnedGames/v1/', {
      input_json: JSON.stringify({ steamid: exactSteamId(steamId), include_appinfo: true, include_played_free_games: true }),
    }, ctx, 'library'),
    recent: (steamId, ctx) => request('/IPlayerService/GetRecentlyPlayedGames/v1/', { input_json: JSON.stringify({ steamid: exactSteamId(steamId), count: 0 }) }, ctx, 'recent'),
    schema: (appId, language, ctx) => request('/ISteamUserStats/GetSchemaForGame/v2/', { appid: appId, l: language }, ctx, 'game-schema', true),
    achievements: (steamId, appId, language, ctx) => request('/ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: appId, l: language }, ctx, 'game-achievements', true),
    stats: (steamId, appId, ctx) => request('/ISteamUserStats/GetUserStatsForGame/v2/', { steamid: steamId, appid: appId }, ctx, 'game-stats', true),
    globalAchievements: (appId, ctx) => request('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appId }, ctx, 'game-rarity', true),
  };
}

function exactSteamId(value) {
  // JSON has no uint64. Steam service interfaces accept the decimal SteamID as
  // a string inside input_json, preserving exact precision.
  return value;
}

module.exports = { createClient };
