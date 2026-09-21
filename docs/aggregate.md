# Aggregate API

The aggregate API gives a frontend one stable view over Steam, PSN, Epic, Playnite, and custom Valorant snapshots. It never contacts an upstream provider during a request. Provider routes remain the source of complete provider-specific data.

## Routes

All data routes require the shared `X-API-Key` header and return `Cache-Control: private, no-store`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/aggregate/library` | Canonical games with editions, copies, provider observations, artwork, and deduplicated playtime |
| `GET` | `/aggregate/games/:canonicalGameId` | Authoritative canonical game page with playtime, artwork, activity, and progress |
| `GET` | `/aggregate/now-playing` | All fresh current play sessions across devices |
| `GET` | `/aggregate/docs` | Public human-readable reference |
| `GET` | `/aggregate/llms.txt` | Public machine-readable reference |

Requests do not accept bodies, account selectors, refresh flags, or credentials.

## Identity model

The hierarchy is:

```text
canonical game
  edition
    independently played copy
      provider observations
```

For example:

```text
Marvel's Spider-Man
  Original
    PS4 copy
      US PSN title record
      EU PSN title record
  Remastered
    PS5 copy
    Playnite Windows copy
```

The frontend can show a single game, separate editions, or every copy. The API preserves the hierarchy and does not force a display choice.

Confirmed cross-provider relationships live in [`config/game-identities.json`](../config/game-identities.json). The canonical IDs in this file are stable frontend identifiers. Playnite games whose source is Epic or Steam are linked to the unique matching direct provider record when both the source and normalized title agree. Cosmetic trademark, registered-mark, copyright, service-mark, accent, punctuation, and capitalization differences do not prevent a match. Meaningful edition words remain part of the title. Other exact title matches remain separate and are returned in `possibleMatches` with `status: "unconfirmed"`.

A Playnite record sourced from Epic or Steam remains a helper mirror even when the direct provider snapshot has no unique match. Its observation exposes `helperFor` as `epic` or `steam`, its copy is classified under that storefront, and Playnite can provide its playtime and artwork. It is never mislabeled as a local Playnite game. A later unique direct-provider match becomes authoritative without adding the two playtime observations.

This avoids silently merging unrelated releases that share a title, such as the 2006 and 2017 games named *Prey*.

Set `AGGREGATE_IDENTITIES_FILE` to an absolute or working-directory-relative JSON path to use a deployment-specific registry. The file must use schema version 1 and the same shape as the bundled registry.

## Library contract

`GET /aggregate/library` returns:

- `status`: `ready`, `partial`, or `unavailable`.
- `sources`: availability and freshness for every source.
- `games`: canonical works.
- `games[].editions`: release or edition groupings.
- `games[].editions[].copies`: independently played platform or storefront copies.
- `copies[].observations`: normalized source records, retained so no non-sensitive provider fields are lost.
- `copies[].playtime`: the selected lifetime value, source, precision, selection rule, platform components, and excluded overlapping observations.
- `artwork`: explicit selected portrait, landscape, square, and icon assets plus every retained alternative.
- `possibleMatches`: exact normalized title candidates that have not been confirmed in the registry.

The route returns HTTP 200 if at least one source is usable. A partial provider failure does not hide healthy sources. It returns HTTP 503 only when no library source can be used.

## Playtime rules

The service only adds playtime observations that represent independent activity:

- Steam lifetime is authoritative for a Steam copy. Windows, macOS, and Linux are components of that total. Steam Deck and disconnected values overlap the lifetime and are not added.
- A Playnite Steam observation is a helper mirror and is not added to direct Steam lifetime.
- Direct Epic playtime is authoritative for an Epic copy. Its Playnite observation is retained but not added.
- When Epic playtime is unknown, a positive Playnite value can be used as a fallback. Playnite zero does not convert unknown Epic playtime into known zero.
- Custom Valorant lifetime is authoritative. Playnite can supply live activity, but its subset of tracked sessions is not added.
- Regional PSN title IDs grouped into one platform copy use the largest observed playtime. The raw records remain in `observations`.
- Independent storefront and platform copies can be summed inside an edition or work.

`playtime.status` distinguishes known, partial, ambiguous, and unknown values. Frontends must never render unknown as zero. `knownSeconds` is the sum of known independent copies, while `unknownCopyCount` records missing contributions.

## Artwork contract

Every canonical game and copy returns:

```json
{
  "artwork": {
    "portraitUrl": "https://cdn.example/game-portrait.jpg",
    "landscapeUrl": "https://cdn.example/game-landscape.jpg",
    "squareUrl": null,
    "iconUrl": null,
    "all": [
      {
        "url": "https://cdn.example/game-landscape.jpg",
        "provider": "epic",
        "providerGameId": "provider-id",
        "sourceRole": "authoritative",
        "type": "DieselGameBox",
        "roles": ["landscape"],
        "width": 2560,
        "height": 1440,
        "contentType": null,
        "metadata": {
          "sizeBytes": 941788,
          "uploadedAt": "2020-05-14T01:10:29.148Z",
          "checksumMd5": "79155f950f32c9790073feaccae570fb"
        },
        "sources": [
          {
            "provider": "epic",
            "providerGameId": "provider-id",
            "sourceRole": "authoritative",
            "type": "DieselGameBox",
            "metadata": {}
          }
        ]
      }
    ]
  }
}
```

The selected role fields are independent. A provider can supply landscape and portrait art without supplying a square image or icon, in which case the missing fields remain null. `all` retains every distinct safe artwork URL across authoritative and helper observations. It also includes non-selected logos, backgrounds, character layers, and screenshots. Identical URLs are deduplicated while `sources` preserves every contributing record.

Selection prefers an authoritative provider observation over a Playnite helper mirror. Within the same authority level, provider-specific semantic types are preferred, followed by their known role and resolution. For an Epic game mirrored in Playnite, Epic `DieselGameBox` becomes `landscapeUrl`, Epic `DieselGameBoxTall` becomes `portraitUrl`, and the Playnite cover and background remain in `all`. A local Playnite game uses its own icon, cover, and background according to their dimensions.

The aggregate contract does not return generic `coverUrl` or `backgroundUrl` aliases. Frontends must choose the field that matches the layout.

## Canonical game page

`GET /aggregate/games/:canonicalGameId` is the authoritative game-page response. It returns the existing canonical `game`, plus `activity` and `progress`.

Use `game.playtime` as the only canonical playtime value. Do not add copy observations or provider playtime in the frontend.

```json
{
  "status": "ready",
  "game": {
    "id": "brawlhalla",
    "name": "Brawlhalla",
    "playtime": { "status": "known", "knownSeconds": 36000, "unknownCopyCount": 0 },
    "artwork": {
      "portraitUrl": "https://cdn.example/portrait.jpg",
      "landscapeUrl": "https://cdn.example/landscape.jpg",
      "squareUrl": null,
      "iconUrl": "https://cdn.example/icon.jpg",
      "all": []
    },
    "editions": []
  },
  "activity": {
    "state": "offline",
    "sessionCount": 0,
    "sessions": []
  },
  "progress": {
    "status": "available",
    "completionCalculation": "reported-per-progress-set-no-cross-source-merge",
    "setCount": 2,
    "unlockCount": 103,
    "rarestUnlock": {
      "id": "psn:trophy2:NPWR12345_00:trophy:1",
      "setId": "psn:trophy2:NPWR12345_00",
      "source": "psn",
      "kind": "trophy",
      "grade": "gold",
      "name": "Rare trophy",
      "description": null,
      "imageUrl": "https://image.api.playstation.com/trophy.png",
      "unlocked": true,
      "unlockedAt": "2026-01-01T00:00:00.000Z",
      "rarityPercent": 2.5
    },
    "sets": [],
    "sources": []
  }
}
```

Achievements and trophies are normalized but remain in separate progress sets. The API does not merge similarly named Steam achievements and PlayStation trophies and does not return a combined completion percentage. Each set has its own summary:

```json
{
  "id": "steam:570:achievements",
  "source": "steam",
  "kind": "achievement",
  "name": "Steam achievements",
  "editionId": "standard",
  "copyId": "steam-570:standard:steam",
  "platform": "multi-platform",
  "providerGameIds": ["570"],
  "sourceRefs": [
    { "providerGameId": "570", "editionId": "standard", "copyId": "steam-570:standard:steam" }
  ],
  "status": "available",
  "summary": { "earned": 1, "available": 2, "known": 2, "completionPercent": 50 },
  "rarestUnlock": null,
  "unlocks": []
}
```

`unlocked` is `true`, `false`, or `null`. Null means the provider did not return a reliable player state, so the frontend must not treat it as locked. A set completion percentage is null until every unlock in that set has a known state.

Regional PSN title records are deduplicated by PSN service and trophy-set ID. The resulting set retains every contributing title ID in `providerGameIds` and every canonical copy reference in `sourceRefs`. Steam and PSN sets are never merged with each other.

`progress.rarestUnlock` compares earned unlocks with known rarity and selects the lowest reported percentage. Steam and PSN percentages describe different source populations, so this is a lowest reported provider rate rather than a statistical comparison of the two networks.

The five expected response cases are:

```json
[
  {
    "case": "steam-only",
    "progress": { "status": "available", "setCount": 1, "sets": [{ "source": "steam", "kind": "achievement" }] }
  },
  {
    "case": "psn-only",
    "progress": { "status": "available", "setCount": 1, "sets": [{ "source": "psn", "kind": "trophy" }] }
  },
  {
    "case": "matched-across-providers",
    "progress": {
      "status": "available",
      "setCount": 2,
      "sets": [
        { "source": "psn", "kind": "trophy", "summary": { "earned": 10, "available": 20, "known": 20, "completionPercent": 50 } },
        { "source": "steam", "kind": "achievement", "summary": { "earned": 30, "available": 50, "known": 50, "completionPercent": 60 } }
      ]
    }
  },
  {
    "case": "partial-provider-failure",
    "status": "partial",
    "progress": {
      "status": "partial",
      "sets": [{ "source": "steam", "kind": "achievement" }],
      "sources": [
        { "source": "steam", "providerGameIds": ["570"], "status": "available" },
        { "source": "psn", "providerGameIds": ["PPSA12345_00"], "status": "unavailable" }
      ]
    }
  },
  {
    "case": "no-unlock-data",
    "progress": {
      "status": "unsupported",
      "setCount": 0,
      "unlockCount": 0,
      "rarestUnlock": null,
      "sets": [],
      "sources": [{ "source": "epic", "providerGameIds": ["epic-id"], "status": "unsupported" }]
    }
  }
]
```

The route reads cached provider details only. It never contacts Steam or PlayStation during the request. A detail failure produces HTTP 200 with top-level `status: "partial"`, the healthy progress sets remain usable, and the failing source is described in `progress.sources`.
Failures from providers unrelated to the requested canonical game do not lower its status. A configured matched source that is missing because its library snapshot is unavailable is reported as unavailable for that game.

## Now playing contract

`GET /aggregate/now-playing` returns zero or more sessions:

```json
{
  "schemaVersion": 1,
  "provider": "aggregate",
  "accountRef": "owner",
  "state": "playing",
  "sessionCount": 2,
  "sessions": [
    {
      "id": "steam:3628960",
      "game": {
        "id": "steam-3628960",
        "name": "Miscrits: World of Creatures",
        "edition": { "id": "standard", "name": "Standard" },
        "artwork": {
          "portraitUrl": null,
          "landscapeUrl": null,
          "squareUrl": null,
          "iconUrl": null,
          "all": []
        }
      },
      "platform": "unknown",
      "device": null,
      "startedAt": null,
      "observedAt": "2026-09-20T12:29:30.000Z",
      "primarySource": "steam",
      "detectedBy": [
        {
          "source": "steam",
          "providerGameId": "3628960",
          "observedAt": "2026-09-20T12:29:30.000Z",
          "startedAt": null,
          "platform": "unknown",
          "device": null
        }
      ],
      "confidence": "single-source"
    },
    {
      "id": "playnite:e14e27a4-50fe-4d86-9c44-03a57e9c4f65",
      "game": {
        "id": "valorant",
        "name": "VALORANT",
        "edition": { "id": "standard", "name": "Standard" },
        "artwork": {
          "portraitUrl": "/playnite/assets/example-portrait",
          "landscapeUrl": "/playnite/assets/example-landscape",
          "squareUrl": null,
          "iconUrl": null,
          "all": []
        }
      },
      "platform": "windows",
      "device": { "id": "playnite-device-id", "name": "Gaming PC" },
      "startedAt": "2026-09-20T11:36:28.168Z",
      "observedAt": "2026-09-20T12:29:30.000Z",
      "primarySource": "playnite",
      "detectedBy": [
        {
          "source": "playnite",
          "providerGameId": "e14e27a4-50fe-4d86-9c44-03a57e9c4f65",
          "observedAt": "2026-09-20T12:29:30.000Z",
          "startedAt": "2026-09-20T11:36:28.168Z",
          "platform": "windows",
          "device": { "id": "playnite-device-id", "name": "Gaming PC" }
        }
      ],
      "confidence": "single-source"
    }
  ]
}
```

Different games on different devices remain separate sessions. There is no global primary game.

Provider priority is applied only when observations describe the same session. A direct Steam observation is primary over a Playnite game sourced from Steam, while both remain in `detectedBy`. Stale provider presence never creates a session. Steam does not reliably expose the operating system of the current session, so the platform is `unknown` unless a reliable source supplies it.

Top-level `state` is:

- `playing`: at least one fresh session exists.
- `offline`: at least one presence source is fresh but no game is running. Provider or extension availability by itself is not treated as owner activity.
- `unknown`: every presence source is disabled, stale, or unavailable. The endpoint returns HTTP 503 for this state.

The aggregate route deliberately does not return an `online` state. Steam persona availability, PSN idle presence, and a Playnite heartbeat can come from another logged-in operating-system user or simply show that a client is open. Only a reported current game establishes live owner activity.

## Errors and security

- HTTP 200: usable library, known game, or resolved playing/offline state.
- HTTP 401: missing or invalid shared read key.
- HTTP 404: unknown canonical game ID.
- HTTP 503: no usable library source or no fresh presence source.

The aggregate layer is read-only. It exposes no provider tokens, refresh controls, connection actions, file paths, launch commands, or Playnite upload key. It reads the same sanitized cached snapshots as the existing provider APIs.
