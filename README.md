# Gaming Stats API

A reusable, self-hostable gaming stats API, evolving from Valorant Stats API to support multiple games and platforms.

Valorant is currently implemented. Steam, Epic Games, and PlayStation Network (PSN) integrations are planned; their implementation will follow the platform research handoffs. Valorant now uses `/custom/valorant`; the original `/valorant` endpoints remain working aliases during frontend migration.

The setup and API behavior documented below currently apply to the Valorant integration. See the [frontend migration guide](docs/valorant-route-migration.md) for the base URL change. The shared service health endpoint is `GET /health`.

This project refreshes player data from tracker.gg through Apify, stores snapshot files on disk, and serves those cached snapshots through a small authenticated Express API. It is designed for personal sites, side projects, dashboards, and self-hosted community tools where you want predictable API responses without scraping on every request.

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
- Simple file-based storage with no database requirement

## Requirements

Before you run this project, you need:

- Node.js 18+
- an [Apify](https://apify.com/) account and `APIFY_TOKEN`
- a [HenrikDev](https://docs.henrikdev.xyz/valorant/) API key if you want profile data
- at least one self-generated API key in `API_KEYS`
- one or more Riot IDs in `TRACKED_USERNAMES`
- tracker.gg profiles set to public for the players you want to track

## Quick Start

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

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `APIFY_TOKEN` | Yes | Apify token used for tracker.gg scraping runs |
| `APIFY_MEMORY_MB` | No | Memory assigned to each Apify actor run. Defaults to `2048` |
| `HENRIK_API_KEY` | Yes for `refresh:profiles` | HenrikDev API key used for account profile data |
| `API_KEYS` | Yes | Comma-separated API keys accepted by `/custom/valorant/stats/*` routes |
| `TRACKED_USERNAMES` | Yes | Comma-separated Riot IDs to support in this API |
| `PORT` | No | Port the server listens on. Defaults to `3000` |
| `ENABLE_AUTO_REFRESH` | No | Set to `true` to enable the built-in scheduler |
| `REFRESH_INTERVAL_HOURS` | No | Refresh cadence for auto-refresh and `nextRefreshAt`. Defaults to `48` |
| `REFRESH_STAGGER_MS` | No | Delay between scrape steps during snapshot refresh. Defaults to `5000` |
| `APIFY_TIMEOUT_MS` | No | Timeout for an individual Apify call. Defaults to `420000` |

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

- snapshots are written to `cache/snapshots/`
- if you delete that directory, the API will need to refresh snapshots again

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

For a simple single-service deployment, the built-in scheduler is the easiest path.

### Docker / Generic Self-Hosting

This project works fine behind any process manager or container runtime, as long as you:

- expose the same `PORT` your app listens on
- mount persistent storage for `cache/snapshots/`
- provide `APIFY_TOKEN`, `API_KEYS`, and `TRACKED_USERNAMES`
- provide `HENRIK_API_KEY` if you use `profile`
- decide whether auto-refresh should run inside the app process

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
npm test
npm run test:coverage
```

## API Docs

After the server is running, see:

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
