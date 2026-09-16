# Epic provider

Epic is implemented in version 3.2.0 behind `ENABLE_EPIC=false` by default. It
uses Epic launcher service protocols to synchronize the configured owner's
claimed PC base games, including uninstalled games, catalog artwork, and
Epic-reported playtime. It is an unofficial integration and may require
maintenance or reconnection when Epic changes its services.

The gaming PC does not run a helper and does not need to stay on. Railway owns
the encrypted Epic session and performs scheduled refreshes. Playnite remains a
separate future source for local games.

## Initial scope

The first release provides:

- complete paginated Epic library reads before publication;
- catalog-based base-game classification and artwork;
- Epic playtime with explicit known, unknown, ambiguous, and unavailable states;
- cached `GET /epic/library` and `GET /epic/games/:gameId` routes;
- encrypted session renewal, persistent scheduling, backoff, and disconnect;
- no browser-facing account or administration endpoints.

Achievements, current presence, installation state, and reliable last-played
timestamps are not included. Epic achievement support needs separate account
verification before it can become part of the contract.

## Security model

The owner signs in only on an official `epicgames.com` page. The private CLI
accepts Epic's one-time `authorizationCode` through a hidden terminal prompt,
exchanges it directly with Epic, verifies the returned account, and stores only
an encrypted rotating session.

The session is AES-256-GCM encrypted with a fresh nonce and account, generation,
and version-bound authenticated data. Credentials, sanitized snapshots, and the
worker lock use separate mode-0600 SQLite files under a mode-0700 directory.
`GAMING_ENCRYPTION_KEY` remains a Railway secret and is never written to the
volume. A token replacement is persisted before data requests continue.

Epic's launcher session is broader than a read-only Steam API key. Never place
authorization codes, access tokens, refresh tokens, the encryption key, or raw
Epic responses in chat, screenshots, Git, command arguments, website code, or
public HTTP routes. The website read key cannot connect or disconnect Epic.

## Configuration

```env
ENABLE_EPIC=false
EPIC_EXPECTED_DISPLAY_NAME=your-epic-display-name
GAMING_DATA_DIR=cache/gaming
GAMING_ENCRYPTION_KEY=your-private-64-character-hex-key
EPIC_REFRESH_MINUTES=15
EPIC_CATALOG_HOURS=24
EPIC_MAX_STALE_HOURS=24
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `ENABLE_EPIC` | No | Enables the cached routes and scheduler; defaults to `false` |
| `EPIC_EXPECTED_DISPLAY_NAME` | Recommended for first connection | Refuses an unintended Epic account during setup |
| `GAMING_DATA_DIR` | No | Shared provider-data parent; defaults to `cache/gaming` |
| `GAMING_ENCRYPTION_KEY` | Hosted Epic | Existing private 64-character hex gaming-state key |
| `GAMING_ENCRYPTION_KEY_FILE` | Local alternative | Private mode-0600 key file; do not set both key sources |
| `EPIC_REFRESH_MINUTES` | No | Library/playtime cadence, `5–1440`; default `15` |
| `EPIC_CATALOG_HOURS` | No | Catalog metadata cadence, `1–168`; default `24` |
| `EPIC_MAX_STALE_HOURS` | No | Bounded stale window, `1–168`; default `24` |

`API_KEYS` remains mandatory for HTTP reads. It is unrelated to the Epic
session. No Supabase project or additional external database is required.

## Railway owner connection

Use the existing volume mounted at `/app/cache`, set
`GAMING_DATA_DIR=/app/cache/gaming`, retain one always-on replica, and deploy
with `ENABLE_EPIC=false`.

Open a full interactive Railway shell:

```sh
railway ssh
```

After the remote `root@...:/app#` prompt appears, run:

```sh
npm run epic:connect:production
```

The CLI prints an official Epic sign-in URL. Open it in your own browser, sign
in to the intended account, complete 2FA, and paste only the returned
`authorizationCode` or Epic JSON into the hidden prompt. The terminal displays
no pasted characters. Do not use Railway command-mode SSH for this interactive
step.

After a successful connection:

```sh
npm run epic:status
npm run epic:refresh
npm run epic:status
exit
```

All three results must show the expected account and a ready library before
activation. Then set `ENABLE_EPIC=true`, allow Railway to redeploy, run status
again to prove persistence, and test both authenticated routes.

## Local connection

Local development can reuse the private key file created for PSN or another
mode-0600 file containing a 32-byte key as 64 hex characters:

```sh
export EPIC_EXPECTED_DISPLAY_NAME=your-epic-display-name
export GAMING_ENCRYPTION_KEY_FILE=.private/psn.key
npm run epic:connect
npm run epic:refresh
npm run epic:status
ENABLE_AUTO_REFRESH=false ENABLE_EPIC=true npm start
```

Do not run local and production refresh loops against copies of the same
rotating session. Connect production independently and let one Railway writer
own that session.

## Read endpoints

Documentation is public at `/epic/docs` and `/epic/llms.txt`. Data requires the
existing `X-API-Key` header and returns `Cache-Control: private, no-store`.

| Route | Data |
| --- | --- |
| `GET /epic/library` | Owned PC base games, catalog coverage, playtime and totals |
| `GET /epic/games/:gameId` | One normalized game from the same cached snapshot |

Use the opaque `providerGameId` returned by the library. Malformed IDs return
400, valid IDs absent from the current library return 404, and an unavailable
library returns 503.

## Data semantics

- The published collection is an Epic entitlement/library view, not installed
  software on the current computer.
- Add-ons, private sandboxes, Unreal Engine assets, records without an app
  artifact, and unknown classifications are excluded and counted in coverage.
- Epic reports time in integer seconds. The API exposes fractional
  `playtimeMinutes` without early rounding.
- `playtimeStatus: known` includes explicit zero. `unknown` means Epic returned
  no matching record. `ambiguous` means conflicting aliases were observed.
  `unavailable` means the playtime capability failed during the first import.
- Total playtime sums only known Epic records. It is not merged with Steam,
  Playnite, PSN, other editions, or similarly named games.
- `lastPlayedAt` is `null` because the verified playtime response did not provide
  a reliable last-played timestamp.
- Artwork accepts only allowlisted HTTPS Epic/Unreal CDN URLs without credentials,
  custom ports, query strings, or fragments.

## Refresh and recovery

The scheduler targets a 15-minute library/playtime cadence and a 24-hour catalog
cadence. Complete previous snapshots can remain stale for up to 24 hours after a
transient failure. A failed middle library page never publishes a partial
inventory. Stale catalog metadata can support a refresh when every item already
has validated cached metadata; newly discovered items require successful
classification before publication.

Access-token rejection permits one controlled refresh-token recovery. Definite
credential rejection becomes `reconnect-required`. An uncertain interruption
during rotating-token replacement also requires reconnection rather than risking
reuse of an invalidated token.

## Disconnect

Run this in a private operator shell:

```sh
npm run epic:disconnect
```

The command revokes the current Epic session first, then removes local
credentials, catalog cache, and snapshots. If remote revocation cannot complete,
the default command retains local state so it can be retried. The explicit
recovery command below deletes local state without proving remote revocation:

```sh
npm run epic:disconnect -- --local-only
```

After local-only removal, use Epic account security controls to revoke sessions.

## References and compatibility

The protocol behavior is independently implemented from observed service
requests. Current compatibility is cross-checked against:

- [Legendary Epic API client](https://github.com/legendary-gl/legendary/blob/master/legendary/api/egs.py)
- [Playnite Legendary integration](https://github.com/hawkeye116477/playnite-legendary-plugin)
- [Railway persistent services](https://docs.railway.com/services)

Legendary is GPL-3.0-or-later and is used as protocol evidence, not copied into
this MIT repository. The Playnite Legendary integration is MIT-licensed.
