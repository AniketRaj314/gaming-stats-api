# Provider data coverage policy

Gaming Stats API is a source-data service. Its provider layer should retain every
useful, stable, non-sensitive fact returned by the supported upstream interfaces.
Consumers can choose which fields to display. Computed insights belong in a
separate aggregate layer and must not replace the source facts used to calculate
them.

## Contract rules

- Preserve explicit zero, false, empty arrays, and unknown/null as different
  states.
- Keep provider identifiers and provider-specific records separate. Cross-store
  relationships must be explicit in the aggregate layer and must retain source
  observations.
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
| Steam | Profile/presence, all API-visible owned and free-subscription games, recent games, platform and Deck playtime, safe store/catalog metadata, current/original artwork and screenshots, badges/XP/community quests, achievements/schema/global rarity, title-defined stats, current players | Artwork audited through 3.5.0 against the current owner response; all observed asset and screenshot fields are retained |
| PSN | Played history with typed concept media, trophy summary, presence, trophy sets and trophies | Artwork audited through 3.5.0 against the current owner response; broader non-media field review remains open |
| Epic | Claimed PC base-game library, complete safe typed catalog artwork metadata, playtime | Artwork audited through 3.5.0 against the current owner response; broader non-media catalog field review remains open |
| Valorant | Profile/card art, rank icons, agent/map performance with official static artwork, and total playtime | Artwork audited through 3.5.0 from the public static-data schemas without a live player refresh |
| Playnite | Complete selected Playnite library, source identifiers, tracked playtime, launch count, install/activity state, catalog metadata, local icon/cover/background files, and short-lived now-playing presence | Implemented in 3.6.0 and verified against the first owner snapshots in 3.7.0 |
| Aggregate | Canonical games, editions, independently played copies, playtime selection provenance, selected artwork, source freshness, and concurrent current sessions | Implemented and checked against the live owner snapshot shapes in 3.7.0 |

## Aggregate 3.7.0 coverage

The aggregate layer reads sanitized cached provider records only. It retains the
normalized source game object in every copy observation and exposes the rule,
selected source, precision, and excluded overlaps for computed playtime.

The current rules cover Steam operating-system components and overlapping Deck
or disconnected totals, direct Epic records mirrored through Playnite, custom
Valorant lifetime mirrored by Playnite sessions, regional PSN title records,
independent platform/storefront copies, zero versus unknown values, partial
provider availability, and stale presence. Now playing returns an array because
the owner can play different games on different devices concurrently.

Confirmed cross-provider relationships are curated in
`config/game-identities.json`. Unique Epic or Steam library records can absorb a
Playnite helper record only when Playnite identifies that source and the title
matches. Other exact normalized title matches remain separate suggestions.

## Playnite 3.6.0 coverage

Playnite uploads the complete selected library rather than an incremental or
paginated subset. Each record retains the safe fields listed in the Playnite
setup guide, including source identifiers, local tracking data, descriptive
metadata, scores, and three local artwork roles. Presence is a separate,
short-lived snapshot so an interrupted Windows session cannot remain playing
indefinitely.

Executable paths, install directories, ROM paths, launch actions and arguments,
scripts, notes, credentials, cookies, and extension settings are intentionally
excluded. Hidden games are excluded by default. Direct Epic and Playnite records
remain separate because Playnite's local tracked time and Epic's upstream time
can describe overlapping activity.

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

## Artwork audit 3.5.0

- **Steam:** the current 21-game owner response was checked against every
  `assets`, `assets_without_overrides`, and screenshot key. The normalized
  `store.artwork`, `store.originalArtwork`, and `store.screenshots` structures
  already retain every observed image field.
- **PSN:** 46 played records currently supply 406 distinct concept images:
  cover art, logos, master art, background layers, hero characters, portrait,
  4:3 and 16:9 banners, and screenshots. They are now returned under each
  game's `artwork.images` as typed records. Duplicate record/concept copies are
  collapsed by type, format, and URL.
- **Epic:** 26 catalog records currently supply 62 safe key images. Each game's
  `artwork.images` now retains the type, URL, alt text, width, height, byte size,
  upload timestamp, and MD5 checksum when supplied. `imageUrl` and
  `artwork.url` remain the preferred compatibility image.
- **Valorant:** player cards already retained every image variant. Agent rows
  now include small/display icons, portrait variants, bust, killfeed and minimap
  portraits, background and promo art, plus role and ability icons. Map rows now
  include list-view variants and standard, stylized, and Premier backgrounds in
  addition to the existing display icon and splash.
