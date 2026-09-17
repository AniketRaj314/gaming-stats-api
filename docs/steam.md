# Steam provider

Steam was introduced in version 3.1.0 and is live in production. It remains opt-in for other
installations, with `ENABLE_STEAM=false` as the safe default. It uses Valve's
Steam Web API, a server-side user API key, an exact SteamID64, and sanitized JSON
snapshots. It does not require a database, Steam password, session cookie, OAuth
token, or a helper running on the gaming PC.

The production owner profile, owned library, recent activity, and one game's
achievement details were verified on September 16, 2026. Authentication rejects
missing read keys, snapshots survived the activation redeploy, and cached PSN
and Valorant health remained available. Numeric game stats remain title-specific;
the verified title exposed achievements but did not expose numeric stats.

The provider exposes the configured owner's public profile and presence, owned
games and playtime, Steam's recent two-week playtime, per-game achievements,
global achievement rarity, and numeric game stats where each title supports and
shares them. Steam privacy settings and per-game API support determine coverage.

## Official API scope

The implementation uses current official interfaces on
`https://api.steampowered.com`:

- `ISteamUser/GetPlayerSummaries/v2`
- `IPlayerService/GetSteamLevel/v1`
- `IPlayerService/GetOwnedGames/v1`
- `IPlayerService/GetRecentlyPlayedGames/v1`
- `ISteamUserStats/GetSchemaForGame/v2`
- `ISteamUserStats/GetPlayerAchievements/v1`
- `ISteamUserStats/GetUserStatsForGame/v2`
- `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2`

The private key is sent in the `x-webapi-key` header, never in the URL. Requests
use HTTPS, refuse redirects, have ten-second request and 45-second job deadlines,
a request budget, and a 4-MiB response limit.

Official references:

- [Web API key authentication](https://partner.steamgames.com/doc/webapi_overview/auth)
- [IPlayerService](https://partner.steamgames.com/doc/webapi/iplayerservice)
- [ISteamUser](https://partner.steamgames.com/doc/webapi/isteamuser)
- [ISteamUserStats](https://partner.steamgames.com/doc/webapi/isteamuserstats)
- [Steam Web API key registration](https://steamcommunity.com/dev/apikey)

## Requirements and privacy

1. Use Node 24 LTS.
2. Register a standard Steam user Web API key for the domain serving this app.
3. Obtain the owner's exact 17-digit SteamID64. Keep it as a string.
4. In Steam profile privacy settings, make the profile and **Game details**
   visible to the intended audience. Steam can otherwise omit the owned library,
   recent activity, achievements, current game, playtime, or level.
5. Keep `STEAM_WEB_API_KEY` in server/hosting secrets. Never put it in website
   JavaScript, request logs, Git, screenshots, or chat.

The API key is tied to the registered application and subject to Valve's Steam
Web API Terms of Use. If you expose nonpublic user data to other people, Valve's
terms require an appropriate privacy policy describing retrieval, storage, and
storage countries. This repository only reads the configured owner's data.

## Configuration

```env
ENABLE_STEAM=false
STEAM_ID=76561198000000000
STEAM_WEB_API_KEY=your-private-32-character-user-key
STEAM_LANGUAGE=english
GAMING_DATA_DIR=cache/gaming
STEAM_REFRESH_MINUTES=15
STEAM_DETAILS_MINUTES=720
STEAM_MAX_STALE_HOURS=24
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `ENABLE_STEAM` | No | Enables routes and the scheduler; defaults to `false` |
| `STEAM_ID` | Yes | Exact 17-digit owner SteamID64 |
| `STEAM_WEB_API_KEY` | Yes | Private 32-character hexadecimal Steam user Web API key |
| `STEAM_LANGUAGE` | No | Localized schema/achievement language; defaults to `english` |
| `GAMING_DATA_DIR` | No | Shared provider-data parent; defaults to `cache/gaming` |
| `STEAM_REFRESH_MINUTES` | No | Profile/library/recent cadence, `5–1440`; default `15` |
| `STEAM_DETAILS_MINUTES` | No | Per-game detail cadence, `30–10080`; default `720` |
| `STEAM_MAX_STALE_HOURS` | No | Bounded stale window, `1–168`; default `24` |

`API_KEYS` remains mandatory for the HTTP server. It protects all Steam data
routes and is separate from `STEAM_WEB_API_KEY`.

## Initial setup

Keep the provider disabled while creating its first snapshots:

```sh
export STEAM_ID=76561198000000000
export STEAM_WEB_API_KEY=your-private-key
export GAMING_DATA_DIR=cache/gaming
npm run steam:refresh
npm run steam:status
```

`steam:refresh` fetches profile, library, and recent activity independently. It
prints only job results, not account data or the Steam key. A successful status
shows all three resources as `ready`. Start the local service without Valorant
refreshes:

```sh
ENABLE_AUTO_REFRESH=false ENABLE_STEAM=true npm start
```

Per-game enrichment runs in the background for owned titles where Steam reports
community-visible stats. To populate one known owned app explicitly:

```sh
npm run steam:refresh-game -- 570
```

This is a private operator command. There is no HTTP refresh route.

## Railway setup

Use the existing persistent volume at `/app/cache`, one always-on replica, and:

```env
ENABLE_STEAM=false
STEAM_ID=your-17-digit-steamid64
STEAM_WEB_API_KEY=your-private-user-key
GAMING_DATA_DIR=/app/cache/gaming
```

Set the key in Railway's secret-variable interface, deploy while disabled, then
run the initial refresh inside the deployed service:

```sh
railway ssh -- npm run steam:refresh
railway ssh -- npm run steam:status
```

Unlike PSN's interactive secret prompt, these noninteractive Steam commands are
safe in Railway command mode because no credential is entered or passed in their
arguments. The key comes from the service environment and is never printed.

After all three resources are ready, set `ENABLE_STEAM=true` and allow Railway
to redeploy. Re-run `steam:status` after restart to prove the persistent snapshots
survived, then check the authenticated public routes. Steam failure is contained
and does not stop PSN or cached Valorant reads.

## Read endpoints

Base path: `/steam`. Human-readable documentation is public at `/steam/docs` and
the same contract is available at `/steam/llms.txt`. Every data route requires
the existing `X-API-Key` header and returns `Cache-Control: private, no-store`.

| Route | Data |
| --- | --- |
| `GET /steam/profile` | Profile, visibility, persona state, level, current game |
| `GET /steam/library` | Owned games, lifetime/platform playtime, aggregate totals |
| `GET /steam/recent` | Games and playtime in Steam's recent two-week window |
| `GET /steam/games/:appId` | Owned game, achievements, global rarity, exposed stats |

Use a numeric `appId`/`providerGameId` from the cached library. Malformed IDs
return 400. A valid app absent from the cached library returns 404. Known games
return 200 while details are `pending`, `not-supported`, `private`, or
`unavailable`; inspect `achievementStatus` and `statsStatus` separately.

## Data semantics

- SteamID64 stays a string to preserve 64-bit precision. AppIDs are safe unsigned
  32-bit numbers and also appear as string `providerGameId` values.
- Library playtime is stored in Steam's integer minutes. Missing fields are
  `null`; explicit zero remains `0`.
- Totals sum app records. They are not merged with Playnite, Epic, PSN, or other
  editions and stores.
- `include_played_free_games=true` includes played free titles, but upstream
  privacy and Steam's ownership semantics still define coverage.
- Recent activity uses Steam's two-week window and can be empty legitimately.
- Every game record keeps Steam's small `iconUrl` and a separate `coverUrl` for
  the full 600×900 library capsule. Published Steam apps are required to provide
  that capsule; unpublished or removed apps may not serve the derived URL.
- `hasCommunityVisibleStats` controls background detail enrichment. Many games
  expose no achievements or stats through the Web API.
- Locked hidden achievements conceal their name, description, and icon.
- `globalPercent=0` is known data. Rarest unlock compares only achievements that
  are unlocked and have a known global percentage.
- Game stats are title-defined numeric values. The API retains their stable name,
  optional display name, and value without inventing units or meaning.

## Cache, scheduling, and recovery

Snapshots live under `GAMING_DATA_DIR/steam` as mode-0600 JSON files in mode-0700
directories. Writes use a same-directory temporary file, filesystem sync, and an
atomic rename. No Steam API key or raw upstream response is written to snapshots.

Profile, library, and recent snapshots refresh every 15 minutes by default.
Eligible game details refresh every 12 hours, one game per 30-second scheduler
tick after core resources are current. Failures use bounded exponential backoff.
Old payloads can be served as `stale` for the configured window; expired or
privacy-suppressed data returns unavailable/private rather than an empty success.

Run only one scheduler against a snapshot directory. The static Steam key does
not need PSN's rotating-token database, but overlapping writers are unnecessary.
Back up the sanitized snapshots if useful; they can always be rebuilt with
`npm run steam:refresh`. If the API key is compromised, revoke/regenerate it in
Steam, update the hosting secret, and redeploy.

## Deployment gate

1. Configure the SteamID64, private user key, persistent path, and read API keys.
2. Deploy with `ENABLE_STEAM=false`.
3. Run `steam:refresh` and confirm profile, library, and recent are ready.
4. Check that Steam privacy exposes the intended data and nothing more.
5. Enable Steam, redeploy, and confirm status after restart.
6. Verify all four authenticated routes from the public origin.
7. Observe at least one background per-game enrichment before integrating the
   frontend achievement and stats views.
