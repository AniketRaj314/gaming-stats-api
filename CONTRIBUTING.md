# Contributing

Thanks for taking an interest in this project.

Forks, experiments, and small focused contributions are all welcome. If you are using this as a base for your own stats site, feel free to adapt it aggressively.

## Before You Start

- use Node.js 24 LTS
- create a local `.env` from `.env.example`
- set a valid `APIFY_TOKEN`
- set at least one `API_KEYS` value
- set `TRACKED_USERNAMES` with one or more public tracker.gg Riot IDs

## Local Workflow

Install dependencies:

```bash
npm install
```

Run the API locally:

```bash
npm run dev
```

Run a manual snapshot refresh:

```bash
npm run refresh:snapshots
```

Run tests:

```bash
npm test
```

## What to Keep in Mind

- live API requests should stay snapshot-only
- do not introduce request-time scraping into the API path
- keep API key protection enabled by default
- keep docs and examples aligned with the real request/response shape
- avoid breaking existing snapshot compatibility without a migration path

## Pull Requests

For larger changes, it helps if your PR includes:

- what changed
- why it changed
- how it was tested
- whether any deployment or env changes are required

## Security

If you find a security issue, please avoid opening a public issue with exploit details right away. Reach out privately first if possible.

- Email: `dev@aniketraj.me`
- Telegram: `@AniketRaj314`

## Provider work

PSN setup, storage, API contracts, and offline test commands are documented in
[`docs/psn.md`](docs/psn.md). Steam has a separate provider guide in
[`docs/steam.md`](docs/steam.md), and Epic operations are documented in
[`docs/epic.md`](docs/epic.md). Keep provider storage and refresh jobs isolated.
Public provider routes must stay snapshot-only. Run provider-specific tests
during provider work and a combined regression when shared routing or startup
changes. Never use live Valorant refresh commands as ordinary tests.
