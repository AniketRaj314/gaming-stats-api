# Aggregate API

The aggregate API gives a frontend one stable view over Steam, PSN, Epic, Playnite, and custom Valorant snapshots. It never contacts an upstream provider during a request. Provider routes remain the source of complete provider-specific data.

## Routes

All data routes require the shared `X-API-Key` header and return `Cache-Control: private, no-store`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/aggregate/library` | Canonical games with editions, copies, provider observations, artwork, and deduplicated playtime |
| `GET` | `/aggregate/games/:canonicalGameId` | One canonical game from the current aggregate library |
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

Confirmed cross-provider relationships live in [`config/game-identities.json`](../config/game-identities.json). The canonical IDs in this file are stable frontend identifiers. Playnite games whose source is Epic or Steam are linked to the unique matching direct provider record when both the source and normalized title agree. Other exact title matches remain separate and are returned in `possibleMatches` with `status: "unconfirmed"`.

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
          "iconUrl": null,
          "coverUrl": null,
          "backgroundUrl": null
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
          "iconUrl": null,
          "coverUrl": "/playnite/assets/example",
          "backgroundUrl": "/playnite/assets/example"
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
- `online`: a fresh provider reports online but no game.
- `offline`: at least one presence source is fresh and none reports online or playing.
- `unknown`: every presence source is disabled, stale, or unavailable. The endpoint returns HTTP 503 for this state.

## Errors and security

- HTTP 200: usable library, known game, or resolved playing/online/offline state.
- HTTP 401: missing or invalid shared read key.
- HTTP 404: unknown canonical game ID.
- HTTP 503: no usable library source or no fresh presence source.

The aggregate layer is read-only. It exposes no provider tokens, refresh controls, connection actions, file paths, launch commands, or Playnite upload key. It reads the same sanitized cached snapshots as the existing provider APIs.
