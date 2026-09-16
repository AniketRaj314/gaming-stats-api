# Snapshot Modules Reference

This page is for contributors working on the scraper, snapshot format, or API module behavior.

If you are only consuming the API, use the public docs page instead:

- `/custom/valorant/docs`
- `/custom/valorant/llms.txt`

## What a module means in this project

A module is a requestable piece of cached Valorant data exposed by:

- `POST /custom/valorant/stats/:username`

Today, the supported modules are:

- `rank`
- `profile`
- `agents`
- `maps`
- `totalPlaytime`

Each module has three layers:

1. how it is refreshed from tracker.gg or HenrikDev
2. where it is stored inside the snapshot JSON
3. how `src/routes/valorant.js` resolves it for API responses

## Current snapshot layout

```json
{
  "username": "Spider31415#6921",
  "status": "ok",
  "lastRefreshedAt": "2026-05-21T07:41:27.572Z",
  "sources": {
    "tracker": {
      "status": "ok",
      "lastRefreshedAt": "2026-05-21T07:41:27.572Z"
    },
    "henrik": {
      "status": "ok",
      "lastRefreshedAt": "2026-05-23T18:05:10.932Z"
    }
  },
  "data": {
    "profile": {
      "accountLevel": 514,
      "region": "ap",
      "card": {},
      "title": {}
    },
    "competitive": {
      "rank": {},
      "agents": [],
      "maps": []
    },
    "unrated": {
      "agents": [],
      "maps": []
    },
    "shared": {
      "totalPlaytime": {}
    }
  }
}
```

## Refresh Flow

There are two refresh paths because the underlying sources have different cost and timing characteristics.

### Tracker Stats Refresh

`src/refreshSnapshot.js` refreshes one user in five ordered steps:

1. competitive `agents`
2. competitive `maps`
3. shared `totalPlaytime`
4. unrated `agents`
5. unrated `maps`

The step list currently lives in `REFRESH_STEPS` inside `src/refreshSnapshot.js`.

This command is comparatively slow because it calls the Apify/Playwright scraper:

```bash
npm run refresh:snapshots
```

### Henrik Profile And Rank Refresh

`src/refreshHenrikProfiles.js` refreshes Henrik-backed profile and rank data separately with:

```bash
npm run refresh:profiles
```

That command merges `data.profile` and `data.competitive.rank` into the same snapshot file without rerunning the tracker.gg/Apify refresh.

The Henrik refresh uses:

- HenrikDev `/valorant/v2/account/{name}/{tag}` for account level, region, card ID, and title ID
- HenrikDev `/valorant/v3/mmr/{region}/{platform}/{name}/{tag}` for current and peak rank
- Valorant API `/v1/playercards` to resolve card images
- Valorant API `/v1/playertitles` to resolve title display text
- Valorant API `/v1/competitivetiers` to resolve rank icons

## Module source map

| Module | Source | Playlist used | Stored under | Route resolution |
| --- | --- | --- | --- | --- |
| `profile` | HenrikDev `/valorant/v2/account`, enriched with Valorant API cards/titles | not playlist-scoped | `data.profile` | always read from `profile` |
| `rank` | HenrikDev `/valorant/v3/mmr`, enriched with Valorant API rank icons | `competitive` response branch | `data.competitive.rank` | always read from `competitive` |
| `agents` | tracker.gg `/agents` | `competitive` or `unrated` | `data.competitive.agents` or `data.unrated.agents` | read from requested playlist |
| `maps` | tracker.gg `/maps` | `competitive` or `unrated` | `data.competitive.maps` or `data.unrated.maps` | read from requested playlist |
| `totalPlaytime` | tracker.gg `/performance` | fetched during competitive refresh step | `data.shared.totalPlaytime` | always read from `shared` |

## Scraper behavior

The module definitions live in `src/scraper.js` under `MODULE_DEFINITIONS`.

Each entry defines:

- `page`: tracker.gg route segment like `overview`, `agents`, `maps`, or `performance`
- `playlist`: optional fixed playlist override
- `waitFor`: Playwright selector used before extraction
- `waitForState`: optional selector state, defaults to `visible`
- `readyCheck`: optional `page.waitForFunction()` predicate
- `extract`: browser-side DOM extraction logic

Current readiness rules:

| Module | waitFor | Notes |
| --- | --- | --- |
| `agents` | `.st-content__item` | uses `attached` plus a `readyCheck` for non-empty agent names |
| `maps` | `.st-content__item` | waits for map rows before extraction |
| `totalPlaytime` | `.playtime-summary .value` | single-value summary extraction |

## API resolution rules

The request handler logic lives in `src/routes/valorant.js`.

Important rules:

- top-level `playlist` defaults to `competitive`
- `profile` always resolves from `data.profile`
- `rank` always resolves from `data.competitive.rank`
- `totalPlaytime` always resolves from `data.shared.totalPlaytime`
- `agents` and `maps` resolve from either `competitive` or `unrated`
- per-module `playlist` overrides the top-level playlist
- `limit` is only applied after snapshot data is read, inside `applyModuleLimits()`

Examples:

- `{"modules":{"rank":{}}}` reads from `data.competitive.rank`
- `{"modules":{"profile":{}}}` reads from `data.profile`
- `{"playlist":"unrated","modules":{"agents":{}}}` reads from `data.unrated.agents`
- `{"playlist":"competitive","modules":{"agents":{"playlist":"unrated"}}}` reads from `data.unrated.agents`
- `{"modules":{"totalPlaytime":{}}}` reads from `data.shared.totalPlaytime`

## Module shapes

### `profile`

Stored once under `data.profile`.

```json
{
  "accountLevel": 514,
  "region": "ap",
  "card": {
    "id": "67d7faa4-4b40-e16a-1c54-0f9b41919849",
    "name": "VCT x SEN Card",
    "displayIcon": "https://media.valorant-api.com/playercards/.../displayicon.png",
    "smallArt": "https://media.valorant-api.com/playercards/.../smallart.png",
    "wideArt": "https://media.valorant-api.com/playercards/.../wideart.png",
    "largeArt": "https://media.valorant-api.com/playercards/.../largeart.png"
  },
  "title": {
    "id": "ae54c1ce-42b9-3dc1-5e91-6c9e9161b01a",
    "name": "Gnarly Title",
    "displayText": "Gnarly"
  }
}
```

### `rank`

Stored under `data.competitive.rank` for API compatibility. The values are refreshed from HenrikDev MMR data and enriched with Valorant API rank icons.

```json
{
  "current": {
    "rank": "Gold 2",
    "icon": "https://media.valorant-api.com/..."
  },
  "peak": {
    "rank": "Platinum 1",
    "act": "Episode 8 Act 1",
    "icon": "https://media.valorant-api.com/..."
  }
}
```

### `agents`

Stored separately for `competitive` and `unrated`, then enriched with static agent metadata.

```json
[
  {
    "agent": "Omen",
    "role": "Controller",
    "timePlayed": "58 hrs",
    "matches": "98",
    "winRate": "53.1%",
    "kd": "1.05",
    "adr": "143.3",
    "acs": "222.3",
    "ddDelta": "+8",
    "hsPercent": "17.8%",
    "kast": "71.7%",
    "icon": "https://media.valorant-api.com/agents/.../displayicon.png",
    "portrait": "https://media.valorant-api.com/agents/.../fullportrait.png",
    "killfeedPortrait": "https://media.valorant-api.com/agents/.../killfeedportrait.png"
  }
]
```

### `maps`

Stored separately for `competitive` and `unrated`, then enriched with static map metadata and top-agent metadata.

```json
[
  {
    "map": "Sunset",
    "topAgents": [
      {
        "agent": "Omen",
        "winRate": "65%",
        "icon": "https://...",
        "portrait": "https://...",
        "killfeedPortrait": "https://...",
        "role": "Controller"
      }
    ],
    "winRate": "62.8%",
    "wins": "86",
    "losses": "51",
    "kd": "1.43",
    "adr": "145.2",
    "acs": "228.1",
    "displayIcon": "https://media.valorant-api.com/maps/.../displayicon.png",
    "splash": "https://media.valorant-api.com/maps/.../splash.png"
  }
]
```

### `totalPlaytime`

Stored once under `data.shared.totalPlaytime`.

```json
{
  "total": "2,018 hrs"
}
```

## Adding a new module

If you want to expose another piece of cached Valorant data:

1. Add or extend the module entry in `src/scraper.js`
2. Decide which snapshot branch should own the data:
   - `competitive`
   - `unrated`
   - `shared`
3. Update `src/refreshSnapshot.js` so the refresh result is persisted
4. Update `src/routes/valorant.js` so the API can resolve it correctly
5. Add or update tests for:
   - scraper extraction if needed
   - snapshot persistence
   - route behavior

## Contributor notes

- `profile`, `rank`, and `totalPlaytime` are special-case modules and should not be treated like playlist-scoped arrays
- Henrik-backed modules should merge into existing snapshots rather than replace unrelated Tracker-backed branches
- `agents` is the most timing-sensitive table on tracker.gg and currently uses the loosest safe readiness strategy
- `snapshotStore.js` now writes collision-safe base64url filenames, while still reading legacy snapshot filenames for compatibility
