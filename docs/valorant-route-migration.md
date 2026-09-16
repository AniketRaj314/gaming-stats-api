# Valorant route migration

Gaming Stats API now uses `/custom/valorant` as the canonical Valorant namespace.
The existing `/valorant` routes remain working aliases until consumers migrate.
Release 2.2.0 introduces these routes. Deploy the backend before switching consumers.

## Frontend change

Update the server-side API base URL:

```text
Before: https://api.aniketraj.me/valorant
After:  https://api.aniketraj.me/custom/valorant
```

| Endpoint | Canonical route | Compatibility alias |
| --- | --- | --- |
| Stats | `POST /custom/valorant/stats/:username` | `POST /valorant/stats/:username` |
| Health | `GET /custom/valorant/health` | `GET /valorant/health` |
| API docs | `GET /custom/valorant/docs` | `GET /valorant/docs` |
| Machine-readable docs | `GET /custom/valorant/llms.txt` | `GET /valorant/llms.txt` |

Continue sending `X-API-Key` from the frontend's server-side proxy. Keep the
Riot ID URL-encoded and leave request bodies and response handling unchanged.
Both routes read the same snapshot files; neither causes a refresh or a redirect.
The website's page URL (for example `/gaming/valorant`) is independent of this
backend route change and does not need to move.

## Release order

1. Deploy the backend with both namespaces.
2. Check `/health` and `/custom/valorant/health` and make one authenticated cached
   stats request. These checks do not run Apify or Henrik refreshes.
3. Deploy the frontend's API base URL change.
4. Confirm the frontend uses the canonical route before separately removing the alias.

Existing automatic refresh settings remain unchanged. Starting or redeploying
the service can trigger the existing scheduler when enabled and snapshots are
due. Account for this separately from testing the cached HTTP endpoints.

## Scope of the original 2.2.0 routing release

- Shared `GET /health` for the running backend.
- Shared API-key middleware and a Valorant router mounted at both namespaces.
- Existing snapshot storage, refresh schedules, scraper, and module contracts retained.
- Steam, Epic, and PSN were not implemented or mounted in 2.2.0.
- Railway service, GitHub repository, local folder, runtime, and database setup
  are unchanged in this routing phase.

The subsequent 3.0.0 release adds the opt-in `/psn` routes, Node 24, and PSN-only
SQLite storage. Version 3.1.0 adds the independent `/steam` provider with JSON
snapshots. Version 3.2.0 adds the independent `/epic` provider with an encrypted
rotating owner session and cached snapshots. See the [PSN guide](psn.md),
[Steam guide](steam.md), and [Epic guide](epic.md) for their separate setup and
verification status. The Valorant route migration and compatibility aliases
above still apply.

Run `npm test -- --runInBand --silent` for offline unit and route tests. The
provider calls in this suite are mocked; do not use the refresh scripts as tests.
