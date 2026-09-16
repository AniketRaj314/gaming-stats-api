# PSN provider

PSN is implemented locally for the 3.0.0 release, behind `ENABLE_PSN=false` by
default. A fresh owner connection, library/summary sync, offline presence, one
game's trophy details, and all four authenticated cached routes were verified
locally on September 16, 2026. Deployment, real token renewal, restart recovery,
and an idle-to-playing transition remain to be verified. Epic and Steam are
outside this implementation.

## Runtime and architecture

Use Node 24 LTS (`.node-version` and `engines.node`). SQLite uses the pinned
`better-sqlite3` dependency; run `npm ci` using Node 24 when switching runtimes
so its native binding matches your runtime.

The shared Express service serves snapshots only. PSN has its own scheduler;
requests from the website never call Sony or initiate token refresh. Optional
PSN setup errors are contained and do not stop Valorant reads. The HTTP listener
and PSN scheduler start before the existing Valorant static-asset initialization.

The Railway volume previously verified at `/app/cache` can hold the default
`cache/gaming/psn` directory. Use one service replica and keep app sleeping off.
These are deployment prerequisites; this branch does not change Railway settings.

## Owner connection: local verification first

Never paste NPSSO, access tokens, refresh tokens, or encryption keys into chat,
command arguments, Git, browser application code, or a public HTTP endpoint.
The CLI has no credential-upload API and has no dependency on the website.

Run these from the repository with Node 24 selected:

```sh
npm run psn:init-key
export PSN_ONLINE_ID=spider314159
export GAMING_ENCRYPTION_KEY_FILE=.private/psn.key
npm run psn:connect
```

`psn:init-key` creates a random encryption key in a mode-0600 file inside a
mode-0700 directory. It never prints the key and refuses to overwrite it.
If Node 24 is not your selected runtime, use `npm exec --yes --package=node@24 --
node scripts/psn/cli.js <command>` for `init-key`, `connect`, `refresh`, `status`,
or `disconnect` instead of the corresponding npm script.

Sign in yourself on [PlayStation](https://www.playstation.com/), then visit
[Sony's session-cookie endpoint](https://ca.account.sony.com/api/v1/ssocookie)
in the same browser. Paste the NPSSO or its JSON into the CLI's **hidden terminal
prompt**. Ctrl-C cancels and restores the terminal. The helper verifies Sony's
numeric account ID, top-level `isMe`, and the configured online ID before saving.
It stores only the access/refresh session, not NPSSO or the rest of the profile.

An alternative is `npm run psn:connect -- --input-file /absolute/private/file`.
The input must be a regular, non-symlink file with no group/other permissions and
at most 1 KiB. It is removed only after a verified session is durably saved;
failure leaves it available for retry. Keep it outside source and upload paths.

After connecting:

```sh
npm run psn:status
npm run psn:refresh
```

The refresh command makes real **PSN** requests for presence and library/summary.
It never invokes Valorant. Detailed trophies are populated by the background
scheduler, one owned title per job.

For a local server check without starting Valorant's automatic scraping:

```sh
ENABLE_AUTO_REFRESH=false ENABLE_PSN=true npm start
```

The existing `API_KEYS` configuration still applies. `psn:connect` and `psn:refresh`
can be used with the server's PSN flag disabled; they are explicit owner actions.
Do not run the local and hosted workers against copies of the same session.

## Read endpoints

Every `/psn` route requires the existing `X-API-Key` header. Call them from the
website's server-side proxy. Responses use `Cache-Control: private, no-store`.

| Route | Data |
| --- | --- |
| `GET /psn/library` | PS4/PS5 played records, concept grouping IDs, times and coverage |
| `GET /psn/summary` | Trophy level, grade counts, visible-set count |
| `GET /psn/presence` | Observed activity and reported games |
| `GET /psn/games/:titleId` | One owned played record, related editions, visible trophy details |

The owner is configured server-side. Visitors cannot select an upstream account,
request arbitrary Sony URLs, connect/disconnect accounts, or trigger refreshes.
Unknown game IDs return 404 after the cached library is available; malformed IDs
return 400. An unavailable library returns 503 rather than implying the game is
unowned. A recognized game can have `trophyStatus: pending` until enrichment runs.

Common response metadata:

```json
{
  "schemaVersion": 1,
  "provider": "psn",
  "accountRef": "owner",
  "status": "ready",
  "lastAttemptAt": "2026-09-16T12:00:00.000Z",
  "lastSuccessAt": "2026-09-16T12:00:00.000Z",
  "nextRefreshAt": "2026-09-16T12:15:00.000Z",
  "stale": false
}
```

This is an illustrative shape, not a live observation from this implementation.
Library responses add `games`, `coverage`, and `totals`. Summary responses add
`trophyLevel` and `earnedTrophies`. Presence adds `activity`, `online`, `platform`,
and `games`. Game details include `game`, `relatedEditions`, `trophyStatus`,
`trophySets`, and `rarestUnlock` over known rarity in visible cached sets.

`ready` and bounded `stale` reads return 200. `disabled`, `not-configured`,
`reconnect-required`, `private`, and `unavailable` return 503 for the main resources.
Detail responses can return the known game with trophy availability reported
separately. A failed detail crawl is `unavailable` or `private`, never a successful
empty set. Successful empty mapping is `no-visible-synced-set`.

## Data semantics and privacy

- This is **played history**, not a purchase inventory or an unplayed backlog.
- `playtimeMinutes` retains fractional precision. Missing/malformed duration is
  `null`; explicit zero is `0`. Totals report known record time and unknown count.
- Sony can return `category: unknown` even with the PS4/PS5 history filter. These
  records retain their playtime and use `platform: null`; totals include
  `unknownPlatformRecords`. Coverage platforms describe the requested filter,
  not a guaranteed platform classification for every returned record.
- Record totals are not deduplicated cross-platform lifetime hours. Concepts are
  grouping hints; source title/platform records remain separate. No fuzzy merges
  or automatic Steam/Epic cross-store links are implemented.
- `hiddenFlag: true` trophy lists are excluded. Mapping uses exact title IDs and
  intersects only visible sets. Read-time visibility checks also filter cached details.
- A trophy without a matching player row has unknown earned state; locked or
  unknown secret trophies have their name, description and image concealed.
- Only earned trophies with known rarity can be selected as the rarest unlock.
  Each set reports rarity coverage. Imported/edition trophy counts are not summed
  into a supposedly deduplicated achievement total.
- Trophy summary totals may include hidden titles. Authenticated game-history
  publication is intentionally separate from trophy-list visibility. If the owner
  does not want played-history or presence shared with the website, keep PSN disabled.
- Offline discards leftover game fields. Missing status is unavailable. Failed or
  expired presence never returns an old playing payload.
- Image URLs are allowlisted HTTPS Sony hosts. No image proxy or account headers
  are sent to image hosts. Unsupported image URLs become `null`.

## Refresh and recovery

| Setting | Default |
| --- | --- |
| `PSN_REFRESH_MINUTES` | 15: library, visible sets, summary |
| `PSN_PRESENCE_SECONDS` | 60 |
| `PSN_DETAILS_MINUTES` | 60 per game after successful enrichment |
| `PSN_MAX_STALE_HOURS` | 24 for non-presence snapshots |

These are tunable operational defaults, not Sony rate-limit guarantees. Presence
expires after twice its interval (at least 90 seconds). No current-state SLA is
promised. There is a five-second scheduler tick, a 45-second per-job deadline,
10-second per-request deadline, 60-request job budget, bounded pagination, and a
4-MiB response limit. Library, lists, and summary publish together only after all
three succeed. Detail scheduling chooses the earliest due record so later games
are not permanently starved. Presence has priority between jobs.

Only one job can own the session at a time, using an OS-released SQLite write
lock in a dedicated lock database. Cached reads use separate databases and stay
available during the network job. There is **no expiring lease takeover** while
an old process could still be rotating a token. Jobs sharing this disk serialize;
independent disks do not. This is deliberately a single-instance design.

Tokens use returned expiry metadata and renew shortly before expiration.
Before renewal a durable marker is saved; replacement tokens are encrypted and
committed before subsequent verification or reads. If renewal is interrupted or
its persistence fails, automatic reuse of the old token is blocked and a new
connection is required. A definite 429 does not discard the saved connection;
retry timing persists and applies to all PSN jobs. Unexpected authentication
rejection does not start a repeated login loop.

Run `npm run psn:disconnect` to withdraw local snapshots immediately and invalidate
in-flight jobs. This removes local credentials but **does not revoke the session
at Sony**. Use Sony's account-security session controls when remote revocation is
needed. Reconnecting requires this explicit local disconnect first.

## Storage, keys and backups

`GAMING_DATA_DIR` defaults to `cache/gaming`. Its `psn` subdirectory contains:

- `credentials.sqlite`: encrypted session and private connection state.
- `snapshots.sqlite`: sanitized snapshots and their freshness metadata.
- `worker-lock.sqlite`: process-coordination lock only.

The directory is mode 0700 and database files mode 0600. AES-256-GCM uses a fresh
random nonce per write and associated data bound to provider, configured account,
connection generation, and token version. Keep `GAMING_ENCRYPTION_KEY` in Railway
secrets, separate from volume snapshots. Local setup can use the private key file.
Neither encryption nor a separate database protects credentials from a compromise
of the running process that already holds the key.

Back up snapshots separately from credential material. Use SQLite's backup API
or stop all writers before copying database files. Do not distribute credential
backups to the website or developers. Restored refresh tokens may already have
rotated; recovery should use a fresh login rather than automatically replaying an
old session. Losing the encryption key also requires a new login.

Initial key rotation procedure: stop the PSN worker, disconnect using the old key,
replace the key through the private configuration path, and reconnect. No key is
printed or passed in command arguments. The local `init-key` refuses overwrites;
archive/remove an old key deliberately only after the old connection is withdrawn.

`.gitignore`, `.railwayignore`, and `.dockerignore` exclude keys, private files,
SQLite databases, environment files, and the default cache. A custom data directory
must live outside source/upload paths or be added to all exclusions. Deploy source
from Git; never upload a local session as part of the application image.

## Deployment gate

1. Validate the local adapter and owner identity using a fresh intentional login.
2. Deploy Node 24 and this release with `ENABLE_PSN=false`; verify Valorant using
   cached routes. A normal deployment can run the existing Valorant scheduler if
   its snapshot is due—do not use that as a test.
3. Configure the account ID alias, encryption key, and persistent data path privately.
4. Connect directly in a private terminal on the destination service with the
   owner-operated CLI. Do not copy the locally rotating session to production.
5. Verify one library sync, then enable the scheduler. Check restart recovery,
   real token renewal and a real idle-to-playing transition before calling it proven.
6. Integrate the portfolio as a consumer after the backend contract is verified.

No hosted credentials, configuration or production deployment are created by the
local build. The old prototype's observed counts are historical context, not an
assertion about this branch's live results.

## Tests and references

`npm run test:psn` runs mocked protocol, data, storage, concurrency, and route tests.
No test calls Sony, Apify, or Henrik. Use the combined test suite when shared
startup/routing changes; do not repeatedly run live Valorant refreshes.

The client is a narrow independent implementation of the documented protocol so
timeouts, redirect refusal, response limits and injectable requests apply to auth
as well as gaming calls. Reference: [psn-api](https://github.com/achievements-app/psn-api),
version 2.18.1 inspected during implementation, and the owner's PSN handoff.
See [authentication](https://psn-api.achievements.app/authentication/authenticating-manually),
[users](https://psn-api.achievements.app/api-docs/users), and
[trophies](https://psn-api.achievements.app/api-docs/user-trophies).
This is an unofficial Sony integration; the session is broader than a read-only
stats key. The implementation only performs authentication and gaming reads.
