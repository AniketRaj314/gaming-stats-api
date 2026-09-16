# Gaming Stats API

A reusable, self-hostable gaming stats API, evolving from Valorant Stats API to support multiple games and platforms.

Version **3.0.0** adds the PSN integration and fixes handling of Sony's unknown platform categories. PSN is live on the Railway deployment; other installations require their own owner connection and explicit activation. See the [release notes](CHANGELOG.md) and [PSN setup and API guide](docs/psn.md). Steam and Epic Games integrations are planned. Valorant uses `/custom/valorant`; the original `/valorant` endpoints remain working aliases during frontend migration.

| Provider | Routes | Status |
| --- | --- | --- |
| Valorant | `/custom/valorant/*`, compatibility alias `/valorant/*` | Live |
| PSN | `/psn/library`, `/psn/summary`, `/psn/presence`, `/psn/games/:titleId` | Live; opt-in for other installations |
| Steam / Epic | Planned | Not implemented |

Playnite is being evaluated as a source for Epic and local PC games; see the
[feasibility notes](docs/playnite.md). No Playnite sync or ingestion route exists yet.

The setup and API behavior documented below apply to the Valorant integration. PSN has separate setup, storage and refresh jobs. See the [frontend migration guide](docs/valorant-route-migration.md) for the base URL change. The shared service health endpoint is `GET /health`.

Public documentation is available at `/docs` and `/llms.txt` for the provider
index, `/psn/docs` and `/psn/llms.txt` for PSN, and `/custom/valorant/docs` and
`/custom/valorant/llms.txt` for Valorant. PSN data uses the same existing
`X-API-Key` header as Valorant stats; only the documentation is public.

This project serves provider data from stored snapshots through a small
authenticated Express API. Valorant snapshots are refreshed from tracker.gg and
Henrik-backed profile data; PSN uses a separately scheduled, encrypted owner
connection. It is designed for personal sites, side projects, dashboards, and
self-hosted community tools where requests should never scrape an upstream
service directly.

If you want to fork this for your own player page, use it as a base for a custom stats backend, or contribute improvements back upstream, that is exactly the kind of usage this repo is meant to support.

For request examples and API usage, open the built-in docs page after the server starts:

- local: `http://localhost:3000/custom/valorant/docs`
- deployed: `https://your-domain.example/custom/valorant/docs`

## What You Get

- Snapshot-backed API for tracked Riot IDs
- Competitive and unrated agent/map stats
- Player profile data: account level, region, player card, and title
- Current and peak rank data
- Total playtime across all modes
- API key protection by default
- Optional built-in auto-refresh scheduler
- File snapshots for Valorant; optional encrypted SQLite session storage and cached snapshots for PSN
- PSN played history, trophy summary, current presence, and per-game trophy details

## Requirements

Before you run this project, you need:

- Node.js 24 LTS
- at least one self-generated API key in `API_KEYS`

Valorant additionally needs an [Apify](https://apify.com/) account and
`APIFY_TOKEN`, one or more Riot IDs in `TRACKED_USERNAMES`, public tracker.gg
profiles, and a [HenrikDev](https://docs.henrikdev.xyz/valorant/) API key if you
want profile data. A PSN-only deployment can leave Valorant refresh disabled.

PSN is optional. Enabling it additionally requires a PSN online ID, a private
32-byte encryption key, persistent storage, and an owner-generated NPSSO used
once by the private connection CLI. The NPSSO is never an API or website value.

## Valorant Quick Start

1. Install dependencies

   ```bash
   npm install
   ```

2. Create your local env file

   ```bash
   cp .env.example .env
   ```

3. Fill in the required values

   ```env
   APIFY_TOKEN=your_apify_api_token
   APIFY_MEMORY_MB=2048
   HENRIK_API_KEY=your_henrikdev_api_key
   PORT=3000
   API_KEYS=local-dev-key
   TRACKED_USERNAMES="Spider31415#6921"
   ENABLE_AUTO_REFRESH=true
   REFRESH_INTERVAL_HOURS=48
   ```

   Notes:

   - `API_KEYS` is mandatory. The server refuses to start without at least one key.
   - `TRACKED_USERNAMES` must be quoted in `.env` files because Riot IDs contain `#`.
   - Multiple usernames are supported:

     ```env
     TRACKED_USERNAMES="PlayerOne#1111,PlayerTwo#2222"
     ```

4. Start the API

   ```bash
   npm start
   ```

5. Refresh tracker.gg snapshots

   ```bash
   npm run refresh:snapshots
   ```

6. Refresh Henrik-backed profile and rank data

   ```bash
   npm run refresh:profiles
   ```

If `ENABLE_AUTO_REFRESH=true`, the server can also refresh missing or due snapshots automatically in-process.

## PSN Setup

The complete security, recovery, and data-contract guide is in
[docs/psn.md](docs/psn.md). For local setup with Node 24:

```bash
npm run psn:init-key
export PSN_ONLINE_ID=your-psn-online-id
export GAMING_ENCRYPTION_KEY_FILE=.private/psn.key
npm run psn:connect
npm run psn:refresh
ENABLE_AUTO_REFRESH=false ENABLE_PSN=true npm start
```

The connection prompt accepts the NPSSO value or Sony's JSON response. Get it by
signing in to PlayStation and opening Sony's session-cookie endpoint in that same
browser. Never put NPSSO, access/refresh tokens, or encryption keys in chat,
screenshots, Git, command arguments, browser code, or public HTTP routes.

For Railway, attach a persistent volume at `/app/cache`, use one always-on
replica, set `GAMING_DATA_DIR=/app/cache/gaming`, and deploy initially with
`ENABLE_PSN=false`. Open a full interactive shell with `railway ssh`; after the
remote prompt appears, run `npm run psn:connect:production`, followed by
`npm run psn:status` and `npm run psn:refresh`. Exit the shell, set
`ENABLE_PSN=true`, redeploy, and verify the status again after restart.

Do not use `railway ssh -- node scripts/psn/cli.js connect`: Railway command-mode
SSH can echo the secret locally without forwarding it. Production rejects that
unsafe flow. If an NPSSO is ever displayed or shared, cancel, use PlayStation's
[**Sign Out on All Devices**](https://www.playstation.com/en-in/support/account/sign-in/),
and generate a fresh value before reconnecting.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `APIFY_TOKEN` | Yes | Apify token used for tracker.gg scraping runs |
| `APIFY_MEMORY_MB` | No | Memory assigned to each Apify actor run. Defaults to `2048` |
| `HENRIK_API_KEY` | Yes for `refresh:profiles` | HenrikDev API key used for account profile data |
| `API_KEYS` | Yes | Comma-separated read keys accepted by Valorant stats and PSN data routes; documentation stays public |
| `TRACKED_USERNAMES` | Yes for Valorant | Comma-separated Riot IDs to support in this API |
| `PORT` | No | Port the server listens on. Defaults to `3000` |
| `ENABLE_AUTO_REFRESH` | No | Set to `true` to enable the built-in scheduler |
| `REFRESH_INTERVAL_HOURS` | No | Refresh cadence for auto-refresh and `nextRefreshAt`. Defaults to `48` |
| `REFRESH_STAGGER_MS` | No | Delay between scrape steps during snapshot refresh. Defaults to `5000` |
| `APIFY_TIMEOUT_MS` | No | Timeout for an individual Apify call. Defaults to `420000` |
| `ENABLE_PSN` | No | Enables PSN cached routes and its scheduler. Defaults to `false`; connect and refresh before enabling |
| `PSN_ONLINE_ID` | Yes for PSN | Expected owner online ID, 3–32 letters, numbers, `_`, or `-`; verified during connection |
| `GAMING_DATA_DIR` | No | Parent directory for provider state. Defaults to `cache/gaming`; use `/app/cache/gaming` with the Railway volume |
| `GAMING_ENCRYPTION_KEY` | Yes for hosted PSN | Private 64-character hex key used to encrypt the stored Sony session |
| `GAMING_ENCRYPTION_KEY_FILE` | Local alternative | Private mode-0600 file containing the encryption key; do not set both key options |
| `PSN_REFRESH_MINUTES` | No | Library, visible trophy sets, and summary cadence. Defaults to `15`; allowed `5–1440` |
| `PSN_PRESENCE_SECONDS` | No | Presence cadence. Defaults to `60`; allowed `30–3600` |
| `PSN_DETAILS_MINUTES` | No | Per-game trophy-detail cadence. Defaults to `60`; allowed `15–1440` |
| `PSN_MAX_STALE_HOURS` | No | Maximum non-presence stale serving window. Defaults to `24`; allowed `1–168` |

## How Refreshing Works

Each tracked Riot ID gets one snapshot file on disk. The tracker.gg refresh collects:

- competitive agents
- competitive maps
- total playtime across modes
- unrated agents
- unrated maps

Henrik-backed data is refreshed separately with `npm run refresh:profiles`. It collects:

- account level
- region
- player card assets
- player title display text
- current rank
- peak rank

The API only reads those snapshots. It does not scrape tracker.gg during request handling.

## tracker.gg Profile Visibility

The Riot ID you want to track must be public on tracker.gg, or the scraper will not be able to collect the data your API serves.

Based on Tracker Network support guidance, the most reliable way to make your own profile public is:

1. Open an incognito/private browser window.
2. Sign in to the correct Riot account, and if needed the correct Tracker Network account.
3. Open your Valorant profile page on tracker.gg.
4. Check the box that says `I acknowledge signing in makes my profile public to all users`.
5. Click `Sign in with Riot`.
6. Enter your Riot credentials manually rather than relying on browser auto sign-in.
7. Finish the sign-in flow and return to the profile page.

Common gotchas:

- multiple Riot accounts in the same browser session
- browser auto sign-in picking the wrong account
- assuming signing into your own account will reveal someone else's private profile

Tracker support threads I used to verify the current flow:

- [Cant make my account public - Tracker Network](https://feedback.tracker.gg/t/cant-make-my-account-public/59367/2)
- [Cannot link Valorant account - Tracker Network](https://feedback.tracker.gg/t/cannot-link-valorant-account/57359)

## Deployment

### Local

The local setup above is enough. Keep in mind:

- Valorant snapshots are written to `cache/snapshots/`; deleting them requires a refresh
- PSN credentials and snapshots default to `cache/gaming/psn/`; keep the encryption key with that state
- use `npm run psn:disconnect` before deliberately replacing PSN state or its key

### Railway

Recommended setup:

1. Deploy the app as a normal web service.
2. Set the required environment variables.
3. Attach persistent storage so `cache/snapshots/` survives restarts.
4. Make sure Railway public networking points to the same port your app listens on.
   - for example, if `PORT=3000`, the public domain must target `3000`
5. Decide whether to use:
   - built-in refresh with `ENABLE_AUTO_REFRESH=true`, or
   - an external Railway cron service that runs `npm run refresh:snapshots`
6. Run `npm run refresh:profiles` as a separate lightweight job for profile and rank data.

When PSN is enabled, mount the volume at `/app/cache`, set
`GAMING_DATA_DIR=/app/cache/gaming`, use one replica with sleeping disabled, and
follow the interactive owner-connection sequence in [PSN Setup](#psn-setup).
Keep `GAMING_ENCRYPTION_KEY` in Railway secrets rather than on the volume.

For a simple single-service deployment, the built-in scheduler is the easiest path.

### Docker / Generic Self-Hosting

This project works fine behind any process manager or container runtime, as long as you:

- expose the same `PORT` your app listens on
- mount persistent storage for Valorant snapshots and `GAMING_DATA_DIR` when using PSN
- always provide `API_KEYS`
- provide `APIFY_TOKEN` and `TRACKED_USERNAMES` when using Valorant
- provide `HENRIK_API_KEY` when using Valorant profile data
- provide the PSN variables and private owner connection when using PSN
- run only one PSN writer/replica for each encrypted session
- decide whether each provider's scheduler should run inside the app process

Self-hosting checklist:

- persistent writable volume
- reverse proxy or public port mapping
- secret management for env vars
- backup plan for snapshots if you care about long-lived cache history

## Scripts

```bash
npm start
npm run dev
npm run refresh:snapshots
npm run refresh:profiles
npm run psn:init-key
npm run psn:connect
npm run psn:connect:production
npm run psn:status
npm run psn:refresh
npm run psn:disconnect
npm test
npm run test:coverage
```

## API Docs

After the server is running, see:

- `/docs` and `/llms.txt` for the provider index
- `/psn/docs` and `/psn/llms.txt` for PSN
- `/custom/valorant/docs` for human-friendly usage docs
- `/custom/valorant/llms.txt` for a compact machine-readable summary

## Forking and Contributing

This project is intentionally small, hackable, and friendly to self-hosting.

You can:

- fork it and track your own Riot IDs
- adapt the response shape for your own frontend
- swap the storage layer later if you outgrow file-based snapshots
- contribute fixes, docs improvements, or new modules

If you want to contribute, start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).

Questions, ideas, or responsible security reports:

- Email: `dev@aniketraj.me`
- Telegram: `@AniketRaj314`

## Security Defaults

- API keys are required
- tracked usernames must be explicitly configured
- snapshots are served from local cache only
- malformed module payloads are rejected with `400`

## License

MIT
