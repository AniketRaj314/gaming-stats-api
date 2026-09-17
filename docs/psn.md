# PSN provider

PSN is live in the deployed 3.0.0 release. It remains opt-in for other
installations because each one requires its own owner connection and activation.
A fresh owner connection, library/summary sync, offline presence, one game's
trophy details, all four authenticated cached routes, and persistence across a
production restart were verified on September 16, 2026. The Node 24 runtime,
SQLite binding, public documentation, and cached Valorant reads were also
verified on Railway. Real token renewal and an idle-to-playing transition remain
to be observed. Steam has its own independent provider and storage documented in
[`docs/steam.md`](steam.md); Epic remains outside the PSN implementation.

## Runtime and architecture

Use Node 24 LTS (`.node-version` and `engines.node`). SQLite uses the pinned
`better-sqlite3` dependency; run `npm ci` using Node 24 when switching runtimes
so its native binding matches your runtime.

The shared Express service serves snapshots only. PSN has its own scheduler;
requests from the website never call Sony or initiate token refresh. Optional
PSN setup errors are contained and do not stop Valorant reads. The HTTP listener
and PSN scheduler start before the existing Valorant static-asset initialization.

The production Railway volume is mounted at `/app/cache`, with PSN state under
`/app/cache/gaming/psn`. Use one service replica and keep app sleeping off.
Other hosts need an equivalent persistent writable path.

## Owner connection: local verification first

Never paste NPSSO, access tokens, refresh tokens, or encryption keys into chat,
command arguments, Git, browser application code, or a public HTTP endpoint.
The CLI has no credential-upload API and has no dependency on the website.

Run these from the repository with Node 24 selected:

```sh
npm run psn:init-key
export PSN_ONLINE_ID=your-psn-online-id
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

For the linked Railway production service, open Railway's interactive shell and
then run the protected production command inside it:

```sh
railway ssh
```

```sh
npm run psn:connect:production
```

The second command is entered after the remote `root@...:/app#` prompt appears.
Railway's command-mode SSH can echo input locally and fail to forward it, so do
not use `railway ssh -- node scripts/psn/cli.js connect`. The full interactive
shell correctly hides and forwards the NPSSO. The production CLI refuses a
connection that is not marked as using this protected path. Keep the remote
shell open after the connection succeeds for the initial checks below.

Inside the same Railway shell, verify and populate the initial snapshots before
activation:

```sh
npm run psn:status
npm run psn:refresh
exit
```

The first status can show connected with not-configured snapshots until refresh
finishes. A successful refresh returns PSN job results and does not call Valorant.

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

Base path: `/psn` (production origin: `https://api.aniketraj.me`). Human-readable
API contracts and complete illustrative responses are at `/psn/docs`; the same
content is available to machine consumers at `/psn/llms.txt`. Both are public,
as is the `/psn` documentation landing page. `/docs` and `/llms.txt` index all
implemented providers.

Every PSN data route requires the existing `X-API-Key` header. Call them from the
website's server-side proxy. Responses use `Cache-Control: private, no-store`.

| Route | Data |
| --- | --- |
| `GET /psn/library` | PS4/PS5 played records, concept grouping IDs, typed artwork/screenshots, times and coverage |
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
- `artwork.url` retains the existing primary title image and
  `artwork.localizedUrl` retains Sony's localized variant. `artwork.images`
  keeps every safe typed image from the record and concept media, including
  cover, logo, master, background, hero, banner, portrait, and screenshot
  records. Exact record/concept duplicates are collapsed without selecting an
  arbitrary subset. Sony does not supply dimensions in this response.
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
2. Deploy Node 24 and this release with `ENABLE_PSN=false`; verify health and any
   existing providers through cached routes. A normal deployment can run the
   Valorant scheduler if its snapshot is due—do not use a live refresh as a test.
3. Configure the account ID alias, encryption key, and persistent data path privately.
4. Connect from a private full interactive shell on the destination service with
   the owner-operated CLI. Do not copy the locally rotating session to production.
5. Verify one library sync, then set `ENABLE_PSN=true` and redeploy. Check restart recovery,
   real token renewal and a real idle-to-playing transition before calling it proven.
6. Integrate the portfolio as a consumer after the backend contract is verified.

For the repository's linked Railway production service, configure a persistent
volume mounted at `/app/cache`, one always-on replica, and these variables before
the initial deployment:

```sh
ENABLE_PSN=false
PSN_ONLINE_ID=your-psn-online-id
GAMING_DATA_DIR=/app/cache/gaming
GAMING_ENCRYPTION_KEY=<64-character-random-hex-secret>
```

Generate and send the hosted encryption key without printing it or placing it in
shell history:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | railway variable set GAMING_ENCRYPTION_KEY --stdin --skip-deploys
```

After the disabled deployment is running, use Railway's full interactive shell:

```sh
railway ssh
```

At the remote `root@...:/app#` prompt, run:

```sh
npm run psn:connect:production
npm run psn:status
npm run psn:refresh
exit
```

Paste a fresh owner NPSSO only into that hidden prompt. Do **not** use
`railway ssh -- node scripts/psn/cli.js connect`: Railway command-mode SSH can
echo the credential locally and fail to forward it, and the production CLI now
rejects that path. `railway run` also executes locally and must not establish the
hosted session. If an NPSSO is displayed or shared, cancel and follow
[PlayStation's Sign Out on All Devices instructions](https://www.playstation.com/en-in/support/account/sign-in/),
then sign in again and get a fresh value.

After the initial refresh, set `ENABLE_PSN=true` and allow Railway to redeploy.
Run `railway ssh -- node scripts/psn/cli.js status` after restart; connection,
library, and presence should report `connected`/`ready`. Then verify the four
authenticated routes through the public origin. Public docs work before
activation; authenticated data routes return 503 while disabled.

The old prototype's observed counts are historical context, not an assertion
about the current live results.

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
