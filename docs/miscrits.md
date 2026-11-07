# Miscrits core API

Version 3.10.0 provides a read-only custom integration at `/custom/miscrits`
with configurable refresh on data requests (five minutes by default).
It serves the configured owner's cached account data and the public species catalog.
It does not automate gameplay. Core refresh calls `get_player` once in the normal
case and joins owned species IDs to independently cached
https://worldofmiscrits.com/miscrits.json.

## Endpoints

All data endpoints require `X-API-Key` from a trusted backend.
Do not put read keys or game credentials in browser code.
Responses use `Cache-Control: private, no-store`.

| GET path under /custom/miscrits | data |
| --- | --- |
| /player | Safe account fields such as level, gold, platinum, gems, virtue, traits, tickets, location and progression; plus teamOrder |
| /player/snapshot | Allowlisted get_player fields and owned v2 records using original field names |
| /player/miscrits | All normalized PlayerMiscrits, without pagination |
| /player/miscrits/families | Catalog families with owned, ownedCount and playerMiscritIds; unresolved owned species are retained |
| /player/miscrits/:playerMiscritId | One owned individual |
| /player/team | Normalized individuals in active team order |
| /miscrits | Full cached species catalog with ordered abilities and evolution artwork |
| /miscrits/:miscritId | One catalog family |
| /health | Public integration status and package version, no account data |
| /docs | Public human documentation |
| /llms.txt | Public machine-readable documentation |

GET requests accept no query parameters or body. Unknown records return 404;
malformed IDs or unsupported query/body parameters return 400. Missing/invalid
read keys return 401. Disabled, unconfigured or pending snapshots return 503.
Ready and stale snapshots return 200. An empty owned array from a valid response
is legitimate, and is distinct from missing data.

## Response envelope

Every successful data response has this shape (timestamps are illustrative):

```json
{
  "schemaVersion": 1,
  "provider": "miscrits",
  "accountRef": "owner",
  "canonicalGameId": "steam-3628960",
  "status": "ready",
  "fetchedAt": "2026-11-07T12:43:15.938Z",
  "lastAttemptAt": "2026-11-07T12:43:15.938Z",
  "nextRefreshAt": "2026-11-07T12:48:15.938Z",
  "refreshMode": "startup-request-and-manual",
  "requestRefreshIntervalSeconds": 300,
  "refreshDue": false,
  "interpretationVersion": 1,
  "catalog": {
    "hash": "sha256-of-actual-public-catalog-bytes",
    "version": null,
    "fetchedAt": "2026-11-07T12:40:00.000Z"
  },
  "data": {}
}
```

`data` is an array for list/team endpoints and an object for player, snapshot
and individual detail. Catalog version is null because this implementation uses
the actual content hash and conditional ETag reads instead of claiming an
unverified version marker. Catalog and account fetch times differ.
Every successful refresh recalculates derived data. Failed refreshes keep the
previous snapshot with its original fetchedAt and status stale. Stale data also
remains readable after MISCRITS_STALE_HOURS. Requests never wait for upstream
data: they return the saved snapshot and may start a background refresh.

## Refresh on request

MISCRITS_REFRESH_MINUTES defaults to 5. It accepts whole minutes from 0 to 1440;
0 disables request-triggered refresh while retaining connection, startup and
manual refresh. Missing or empty configuration uses the default. Restart the
service after changing the variable.

An authenticated, valid data request returns the current cached response
immediately. If the last successful refresh or failed attempt is at least the
configured interval old, one background refresh is queued. All eight data routes
share one account snapshot and cooldown, so fetching player, team and collection
together does not cause separate upstream reads. A shared worker lock and an
eligibility check inside that lock prevent duplicate work across processes using
the same storage. A queued job is skipped if another worker already refreshed.

A failed refresh retains the last good snapshot and its original fetchedAt,
marks it stale, and waits the same configured interval before another request
can retry. Attempt timestamps are persisted, so the request cooldown survives a
process restart. Explicit startup and manual refreshes bypass this cooldown.
Failures are caught and logged as sanitized provider errors, without delaying
or failing the HTTP response that triggered them.

Health checks, docs, unauthenticated/invalid requests, unknown detail IDs and
unsupported routes never trigger refresh. Aggregate routes also do not trigger
Miscrits refresh: callers must request a custom Miscrits data route. When a
connected account has no snapshot yet, a valid data request can initiate recovery
but still returns 503 until data is available. An unconnected/disconnected account
never logs in automatically from a request.

There is no periodic scheduler. After startup, no further game calls happen merely
because five minutes passed. The next eligible data request starts the work.
The response that triggers it still contains the older snapshot; a later request
can see the completed update. Running background requests may renew the saved
session, using the same bounded authentication behavior as manual refresh.

Envelope fields:
- refreshMode: startup-request-and-manual when request refresh is enabled;
  startup-and-manual when disabled.
- requestRefreshIntervalSeconds: configured minutes times 60; 0 when disabled.
- nextRefreshAt: earliest eligibility time for a subsequent request, not a promised
  scheduled fetch. Null when disabled or unconnected.
- refreshDue: true if request refresh is currently eligible. A refresh may already
  be running; this does not promise completion or indicate a separate job per request.
- fetchedAt: time of the last successful snapshot. Never advanced on failure.
- lastAttemptAt: time of the most recently completed refresh attempt.

The existing MISCRITS_STALE_HOURS threshold (default 24) controls the age-based
stale label, independently of request refresh. A response can be ready and
refreshDue=true between five minutes and that threshold. Any failed refresh
marks the saved snapshot stale immediately. Always show fetchedAt when freshness
matters; a due or stale snapshot is still usable data.

## Nomenclature and fields

A catalog Miscrit family has `miscritId` (and its original `id`).
An owned PlayerMiscrit has `playerMiscritId` and `miscritId`.
Evolution names and nicknames are never keys. Different catalog IDs remain
different families, including Dark, Light, Foil and Blighted variants.

Owned fields:
- Identity: playerMiscritId, miscritId, nickname, baseName, evolutionIndex,
  evolutionName, displayName, catalogStatus.
- State: level, xp, xpNeeded, maxLevel, readyToTrain, favorite, teamSlot,
  rarity, element, enchantedAbilityIds.
- Qualities and stats: qualities, qualityScore, rating, baseStats, bonusStats,
  activeRelicStatBonuses, totalStats, currentHp.
- Equipment/bonuses: activeRelics, altRelics, unlockedRelicSlots, bonusLevel,
  pendingRebonus, pendingBonus, missingBonusPoints.
- Presentation and evidence: artwork, anomalies, raw.

The six stat keys remain hp, spd, ea, ed, pa, pd. Qualities are 1..3; catalog
categories map Weak..Elite to 1..5. HP base is
floor((24 + 4*S + 3*Q)*level/10)+10. Other base stats use
floor((6 + 4*S + 3*Q)*level/12)+5. Total adds saved bonuses and only active relic
effects. Alternate and pending bonuses are retained but not applied twice.
currentHp contains raw, maximum and displayed; displayed caps raw HP at maximum,
including the client's full-health sentinel 969. These are persistent card
stats, not a battle simulation.

Rating derives from the six qualities. It is not a recommendation or ranking.
Evolution changes at levels 10, 20 and 30. At 35, maxLevel is true and
readyToTrain is false. Negative missingBonusPoints are preserved as anomalies.

An unknown species ID triggers one forced catalog fetch during refresh.
If unresolved, the individual remains with catalogStatus unresolved, null names,
artwork and derived species-dependent stats. Owned state and its raw record
remain available. Duplicate instance IDs, unsupported serialization versions,
invalid qualities/levels and invalid active team references reject the refresh,
preserving the previous snapshot. Only owned serialization v2 is supported.

Player fields preserve the original game field names except teamOrder.
The snapshot and raw individual objects use an allowlist; identity/account-link
fields (email, username, user_id, steam, google, avatar, active battle ID) are
not exposed. Nested player_id/user_id identity fields are also removed from
allowed account objects such as tickets and boss_achievements. Game-specific IDs
and progress are retained. Unknown new top-level fields require review before publication.
Raw snapshots are sanitized evidence, not unrestricted server-response dumps.

There are no target rules, qualifying IDs/counts, best-copy selections, or
recommendations. Family grouping is factual. No optional RPC modules (items,
saved teams, feats, seen progress, quests, arenas, battle logs) are polled.

## Artwork

Each catalog evolution has name, evolutionIndex and artwork with backUrl and
avatarUrl. Owned individuals and active team members use their current evolution.
Names are lowercased, spaces become underscores and hyphens remain:
Flue -> flue, Tide Gong -> tide_gong, Hop-Chi -> hop-chi.
Nicknames never determine asset filenames.

- https://cdn.worldofmiscrits.com/miscrits/flue_back.png
- https://cdn.worldofmiscrits.com/avatars/flue_avatar.png
- https://cdn.worldofmiscrits.com/avatars/tide_gong_avatar.png
- https://cdn.worldofmiscrits.com/avatars/hop-chi_avatar.png

These public URLs are derived from canonical names, not checked for existence
per request. Use image-error placeholders. Back art is explicitly back-facing
art; it is not a front sprite or a game cover.

## Guided account setup

Use version 3.9.1 or later for guided setup. Version 3.9.0 could exit with
internal-error before displaying prompts when --log-file was omitted. No extra
environment flag fixes that failure; upgrade and reconnect to the new deployment.

Keep the existing GAMING_ENCRYPTION_KEY / GAMING_ENCRYPTION_KEY_FILE and persistent
GAMING_DATA_DIR configuration. Do not regenerate the encryption key on redeployment.
On Railway the data directory must be inside the mounted volume, for example
/app/cache/gaming. Fresh installations should first configure shared storage and
encryption using the repository setup instructions.

Then run this in a real interactive terminal:

```sh
npm run miscrits:connect
```

On a computer with an existing Miscrits login log, the command imports the game
application credential automatically, then prompts for username and password.
Username input is visible; password input is hidden. Enter one value per prompt;
Ctrl-C cancels. The command never writes login details to .env or shell history.

After login it verifies the returned username, discovers and binds the internal
account ID, saves the credentials encrypted, and fetches the first snapshot.
The identity-verification get_player response is reused, so a successful setup
normally needs only one account-data read. MISCRITS_ACCOUNT_ID is optional: use
it only to restrict the expected backend account ID, not a Steam ID.

Enable the cached API routes with:

```env
ENABLE_MISCRITS=true
```

Restart the server after changing that setting. Future starts reuse the saved
connection and refresh once. Starting an unconnected installation does not log in
or create an account; it reports that miscrits:connect must be run first.
Do not set MISCRITS_USERNAME or MISCRITS_PASSWORD. Login credentials are collected
by the connection command and stored encrypted. Nonempty login environment values
produce a setup error; remove them before running the command.

### Application credential and Railway

The application credential identifies the game client, while username/password
identify your account. They are both needed for login. This is the game's Nakama
client/server key encoded as an HTTP Basic value, without the "Basic " prefix.
It is not Base64(username:password) or a player session token. See
[Nakama authentication](https://heroiclabs.com/docs/nakama/concepts/authentication/).
The helper extracts an existing value; it does not generate one.

No publisher-documented public configuration endpoint was found. The project does
not bundle the value recovered from private logs. The guided command tries the
local game log first. If the log is missing or has no unambiguous value, it prompts
for the application credential with input hidden, before prompting for your login.
An explicit MISCRITS_APPLICATION_CREDENTIAL or private
MISCRITS_APPLICATION_CREDENTIAL_FILE can optionally supply this value instead.
Neither is required after guided connection has saved it encrypted.

For Railway, first obtain the application value on your gaming computer:

```sh
npm run miscrits:import-application-credential
```

This optional export writes .private/miscrits-application.key, ignored by git,
and never prints its contents. Open that file privately in an editor. Then open
Railway's full interactive shell:

```sh
railway ssh
```

Wait for the remote shell prompt, then run inside it:

```sh
npm run miscrits:connect:production
```

Paste only the application value at its hidden prompt, then enter your username
and password. The command stores all three encrypted on the persistent volume
and fetches the first snapshot. No Miscrits login variables need to be added to
Railway. Enable ENABLE_MISCRITS=true and restart if it is not enabled already.

Do not use Railway command-mode SSH to collect credentials. In this project it
previously echoed secret input locally and failed to forward it correctly. The
production command requires the protected interactive-shell path. Its marker
is a guard, not a guarantee about an incorrectly opened terminal. Stop if input
is visible at a hidden prompt. Piped/non-TTY input is rejected.

### Application import behavior

Only POST login/session-refresh requests to the exact HTTPS game origin are
accepted. The helper extracts one unambiguous Basic authorization value and
never exports passwords or Bearer session tokens. It sends no requests and does
not modify the game. The macOS log format has been verified; Windows/Linux
paths follow [Godot data paths](https://docs.godotengine.org/en/stable/tutorials/io/data_paths.html),
but those game builds and their logging behavior have not been tested here.

Default logs:
- macOS: ~/Library/Application Support/Godot/app_userdata/Miscrits/logs/godot.log
- Windows: %APPDATA%\Godot\app_userdata\Miscrits\logs\godot.log
- Linux: ~/.local/share/godot/app_userdata/Miscrits/logs/godot.log (honors XDG_DATA_HOME)

A nonstandard or rotated log can be selected explicitly:

```sh
npm run miscrits:connect -- --log-file "/path/to/godot.log"
npm run miscrits:import-application-credential -- --log-file "/path/to/godot.log" --output "/private/path/application.key"
```

The export refuses to overwrite an existing file. Unix output permissions are
0600; Windows protection depends on the containing directory's ACL. Keep it
restricted to your OS user. Do not upload full game logs or paste credentials into
chat. Missing/ambiguous input never causes key guessing or scanning other accounts.
Use a recent login log or a verified value supplied by the game developer. Do not
enable verbose secret-bearing logs just to satisfy this importer.

### Storage, refresh and recovery

The miscrits subdirectory holds encrypted credentials and cached account snapshots.
Snapshots are not encrypted, but are restricted by private directory/file permissions.
The username, password, application credential and session token pair are encrypted
together using AES-256-GCM. The password is retained for bounded reauthentication
after refresh-token expiry. Keep private backups encrypted.

Refresh runs after connection, once at server startup, manually, and in the
background when an authenticated data request finds the snapshot due. There is
no periodic scheduler. Background work follows the same identity verification,
session management, and failure retention as manual refresh.

```sh
npm run miscrits:refresh
npm run miscrits:status
```

The first snapshot may fail after a successful account connection. In that case
the command explicitly reports that credentials were saved, exits with failure,
and tells you to run miscrits:refresh. Do not disconnect or log in again just to
retry a failed catalog/snapshot read. Failed login or identity verification does
not save a new connection.

A normal refresh performs one get_player read. At most one token rotation is
attempted per refresh. Expired refresh tokens cause one login attempt; a genuine
401 may trigger a bounded retry. HTTP 403, non-JSON responses and application
failures do not cause login loops. Token expiry is read locally but is not proof
of server acceptance. Every fetched player must match the persisted account ID
and login username. Concurrent workers serialize connection, refresh and disconnect.
Failed refreshes keep the previous snapshot and original fetchedAt, marked stale.

### Changing credentials, switching accounts or disconnecting

For a changed password/application credential or a deliberate account switch:

```sh
npm run miscrits:disconnect
npm run miscrits:connect
```

Use miscrits:connect:production inside the Railway interactive shell. Update or
remove an optional MISCRITS_ACCOUNT_ID pin when switching accounts. Disconnect
deletes local credentials, snapshots and catalog. It does not revoke remote
sessions. Restarting after disconnect cannot silently reconnect; another explicit
connect is required. Set ENABLE_MISCRITS=false to disable the routes as well.

For noninteractive operators, connect also accepts --input-file with a private
mode-0600 JSON file containing username, password and applicationCredential. It is
removed after the connection is durably saved, even if the first snapshot fails.
Authentication failures retain the file. Never put secrets in command arguments.

Configuration:
- ENABLE_MISCRITS: false by default; exposes cached routes and refreshes a saved connection at startup.
- GAMING_DATA_DIR and GAMING_ENCRYPTION_KEY / GAMING_ENCRYPTION_KEY_FILE: existing shared settings.
- MISCRITS_ACCOUNT_ID: optional expected-account restriction; otherwise learned on connection.
- MISCRITS_APPLICATION_CREDENTIAL: optional application Basic value for setup.
- MISCRITS_APPLICATION_CREDENTIAL_FILE: optional private-file alternative; inline value takes precedence.
- MISCRITS_REFRESH_MINUTES: request refresh and failure cooldown in whole minutes, default 5; 0 disables request refresh.
- MISCRITS_CATALOG_HOURS: catalog revalidation interval, default 24.
- MISCRITS_STALE_HOURS: snapshot stale threshold, default 24.

## Aggregate integration and verification

The canonical game remains steam-3628960. Steam remains responsible for its
playtime, achievements and live activity. When the Miscrits provider is enabled,
that aggregate game's specializedResources advertises /custom/miscrits. Owned
creatures are not embedded in aggregate library/game responses.

Interpretation version 1 is grounded in the inspected Godot client and dated
research fixtures, not a published stable game API. Formula/field changes require
revalidation. No historical inventory counts or target policies are configuration.

Local validation covered a real account connection and first snapshot, all eight
cached data routes, authentication, secret/identity filtering, and sample Flue,
Tide Gong and Hop-Chi avatar/back assets. Hidden input was also checked in a real
macOS pseudo-terminal. Railway login and its initial snapshot were subsequently
verified. Natural session expiry and concurrent game sessions are separate
operational checks. No private inventory fixtures are committed.

Request-refresh regression tests cover the five-minute boundary, immediate cached
HTTP responses, concurrent requests/workers, failure cooldown and recovery, missing
snapshots, disabling request refresh, and routes that must not trigger it.

Run `npm run test:miscrits` for synthetic normalization, protocol, encrypted
storage, retry and route tests without game access.
See [frontend handoff](frontend-miscrits-handoff.md).
