# Provider data coverage policy

Gaming Stats API is a source-data service. Its provider layer should retain every
useful, stable, non-sensitive fact returned by the supported upstream interfaces.
Consumers can choose which fields to display. Computed insights belong in a
separate, later layer and must not replace the source facts used to calculate
them.

## Contract rules

- Preserve explicit zero, false, empty arrays, and unknown/null as different
  states.
- Keep provider identifiers and provider-specific records separate. Cross-store
  merging is a future derived-data concern.
- Normalize field names, timestamps, URLs, and enumerations, but do not publish
  full upstream response blobs. Raw blobs are unstable contracts and can acquire
  sensitive fields without review.
- Publish a field only after bounding its type and size and validating external
  URLs against known provider hosts or URL formats.
- Never publish credentials, authorization codes, access/refresh tokens,
  cookies, encryption material, request headers, or private storage records.
- Do not publish a real name, exact location, social graph, group/clan
  membership, account moderation/security status, server address, wishlist,
  followed-game list, or commerce/payment information. These are personal,
  security-sensitive, social, or purchase-preference data rather than gameplay
  facts needed by this service.
- Retain privacy and availability states. Private or unavailable upstream data
  must not become an empty successful result.

## Provider review status

| Provider | Current source-data surface | Coverage review |
| --- | --- | --- |
| Steam | Profile/presence, all API-visible owned and free-subscription games, recent games, platform and Deck playtime, safe store/catalog metadata, current/original artwork and screenshots, badges/XP/community quests, achievements/schema/global rarity, title-defined stats, current players | Audited through 3.4.1 against the owner-key interface list and observed response shapes |
| PSN | Played history, trophy summary, presence, trophy sets and trophies | Implemented; the next provider pass will audit the already-fetched profile response and every safe field in the current library/trophy/presence payloads |
| Epic | Claimed PC base-game library, catalog artwork, playtime | Implemented; the detailed field audit will follow a successful owner reconnection so real catalog and account response shapes can be checked safely |
| Valorant | Profile, rank, agent/map performance and total playtime | Implemented; review will use fixtures and documented schemas without consuming live Valorant runs |

## Steam 3.4.1 coverage

Steam now uses these read interfaces:

- `ISteamUser/GetPlayerSummaries/v2`
- `IPlayerService/GetSteamLevel/v1`
- `IPlayerService/GetOwnedGames/v1`
- `IPlayerService/GetRecentlyPlayedGames/v1`
- `IPlayerService/GetBadges/v1`
- `IPlayerService/GetCommunityBadgeProgress/v1` for Community badge ID 2
- `IStoreBrowseService/GetItems/v1`
- `ISteamUserStats/GetSchemaForGame/v2`
- `ISteamUserStats/GetPlayerAchievements/v1`
- `ISteamUserStats/GetUserStatsForGame/v2`
- `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2`
- `ISteamUserStats/GetNumberOfCurrentPlayers/v1`

The library request includes played free games, free subscriptions, extended app
information, and unvetted apps. Each game retains lifetime/recent Windows, macOS,
Linux, Steam Deck, and disconnected playtime when Steam supplies it; workshop,
market, DLC, leaderboard, community-stat, and content-descriptor facts; icon and
available StoreBrowse artwork; and safe catalog metadata such as description,
  developers, publishers, tags, categories, review summaries, release time,
  platform compatibility, store path, type, visibility, and free status. Current
  and non-override artwork sets plus ordered all-ages/mature screenshot lists are
  retained separately.

`GET /steam/badges` retains Steam level/XP thresholds, owned badge records, and
Community badge quest completion. `GET /steam/games/:appId` retains achievement
schema defaults and both icon states (except locked hidden-achievement details),
game schema version, title-defined numeric stats and defaults, global unlock
percentages, and the observed current-player count.

Steam interfaces intentionally not exposed are friends, groups/clans, bans,
wishlists, followed games, shared-library lender identity, real name, exact
location, and game-server addresses. Publisher-only write/admin methods and
publisher-only global stats are also outside an owner user-key integration.
