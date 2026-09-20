# Playnite sync

Playnite is the Windows-side source for local games and launcher-observed PC
activity. The Gaming Stats Sync extension uploads a complete, sanitized Playnite
library snapshot, local artwork, and short-lived presence to Gaming Stats API.
The API then serves those cached snapshots even while the gaming PC is off.

This provider complements the direct integrations. An Epic game can appear in
both `/epic` and `/playnite`: `/epic` is the authoritative claimed-library
record, while `/playnite` supplies local installation state, Playnite-tracked
playtime, launch count, metadata, artwork, and now-playing activity. Consumers
must not add the two playtime totals together.

## What is uploaded

Each Playnite game can include:

- Playnite ID, source ID/name, provider game ID, and library plugin ID
- name and sorting name
- playtime in seconds, derived whole minutes, play count, and last activity
- added and modified timestamps
- installed, running, hidden, favorite, and custom-game flags
- install size and release date
- completion status, platforms, genres, categories, tags, features, age ratings,
  regions, series, developers, publishers, and scores
- safe HTTPS links
- locally stored icon, cover, and background artwork

The extension never uploads executable paths, install directories, ROM paths,
launch arguments, scripts, notes, cookies, launcher credentials, or Playnite
settings. The API accepts only bounded, explicitly normalized fields. Hidden
games are excluded by default and can be enabled in the extension settings.

## Public read contract

Documentation is public. Every data or artwork request requires an existing
`X-API-Key` read key from `API_KEYS` and should be made by a trusted backend.

- `GET /playnite/library` returns the complete latest Playnite snapshot and
  totals.
- `GET /playnite/presence` returns `online`, `playing`, or `offline` and a current
  game when Playnite reports one.
- `GET /playnite/games/:playniteId` returns one cached game by Playnite GUID.
- `GET /playnite/assets/:assetId` returns a cached content-addressed image.

A library older than `PLAYNITE_LIBRARY_STALE_HOURS` is returned with
`status: stale`. Presence older than `PLAYNITE_PRESENCE_TTL_SECONDS` becomes
`offline` with `currentGame: null`; it is not left indefinitely as playing.

## Private sync contract

The extension uses a separate `X-Playnite-Key` upload credential. It cannot be
used to read the other provider routes. Keep it only in Railway secrets and the
Playnite extension settings.

- `POST /playnite/sync/library` replaces the cached complete snapshot.
- `POST /playnite/sync/presence` updates short-lived presence.
- `HEAD /playnite/sync/assets/:assetId` checks whether artwork already exists.
- `PUT /playnite/sync/assets/:assetId` uploads JPEG, PNG, WebP, or AVIF artwork,
  up to 12 MB, whose URL ID must equal the file's SHA-256 digest.

Every snapshot has a persistent device ID and monotonically increasing sequence.
Older or replayed snapshots from the same device are rejected. The server writes
snapshots and artwork atomically into `GAMING_DATA_DIR/playnite`.

## Server setup

Create a random upload key that is independent from `API_KEYS`:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set these Railway variables and redeploy:

```env
ENABLE_PLAYNITE=true
PLAYNITE_UPLOAD_KEYS=the-random-key
GAMING_DATA_DIR=/app/cache/gaming
PLAYNITE_LIBRARY_STALE_HOURS=24
PLAYNITE_PRESENCE_TTL_SECONDS=180
```

Use the existing persistent Railway volume. `PLAYNITE_UPLOAD_KEYS` accepts a
comma-separated list to support credential rotation. Keep the old and new keys
briefly during rotation, update Playnite, verify a sync, and then remove the old
key.

## Build and install the Windows extension

The extension source is in `playnite-extension/GamingStatsSync`. The repository's
Playnite extension workflow builds the Windows package. Download the
`GamingStatsSync-1.0.0` workflow artifact, extract it if GitHub supplied an outer
artifact zip, and open `GamingStatsSync-1.0.0.pext` on the gaming PC. Playnite
will install it and request a restart.

In Playnite, open `Add-ons > Extension settings > Generic > Gaming Stats Sync`:

1. Set the API URL to `https://api.aniketraj.me`.
2. Give the PC a recognizable device name.
3. Paste the dedicated Playnite upload key.
4. Keep artwork upload enabled.
5. Leave hidden games excluded unless they should be published.
6. Save, then use `Main menu > Extensions > Gaming Stats Sync > Sync now`.

The key is protected with Windows Data Protection API for the current Windows
user. It is not stored as plain text in the Playnite settings file.

## Automatic behavior

The extension sends a full library snapshot when Playnite starts, after library
updates, after install/uninstall events, and when a game stops. It sends presence
when Playnite starts or stops and when a game starts or stops. While a game is
running, a heartbeat is sent every 60 seconds.

For reliable playtime and now-playing data, launch the game through Playnite and
leave Playnite running during the session. The PC does not need to remain on
between sessions. The last library snapshot remains available from the API, and
presence expires to offline if the PC shuts down or loses connectivity.

## Verification

After `Sync now`, check from a trusted machine:

```sh
curl --fail-with-body "https://api.aniketraj.me/playnite/library" \
  -H "X-API-Key: $GAMING_API_KEY"

curl --fail-with-body "https://api.aniketraj.me/playnite/presence" \
  -H "X-API-Key: $GAMING_API_KEY"
```

Start an Epic or local game through Playnite, then repeat the presence request.
It should report `state: playing` with the Playnite game ID, source, name, and
session start time. Stop the game and use `Sync now` if needed; its updated
Playnite playtime should then appear in `/playnite/library`.

## Recovery

If sync fails, confirm that the server has `ENABLE_PLAYNITE=true`, the same
upload key exists on both sides, the API URL contains only the HTTPS origin, and
Playnite can reach it. Use the extension's `Connection status` menu item and the
Playnite log for details. A lost key can be replaced without reconnecting Steam,
Epic, or PSN. Removing the extension or disabling this provider does not delete
Playnite's local library.
