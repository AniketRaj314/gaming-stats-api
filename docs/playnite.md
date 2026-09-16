# Playnite feasibility

Research only, September 16, 2026. The direct Epic provider is implemented
separately; no Playnite extension, ingestion endpoint, or local-game provider has
been implemented.

## What it can provide

[Playnite](https://playnite.link/) combines store libraries and manually added
games on a Windows PC. Its [Epic integration source](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/EpicLibrary/EpicLibrary.cs)
imports installed games and authenticated account-library entries, including
Epic-reported playtime when available. Importing uninstalled entries depends on
the integration settings. Playtime import also depends on Playnite's
[import settings](https://api.playnite.link/docs/manual/gettingStarted/configuringPlaynite.html).

[Local games](https://api.playnite.link/docs/manual/library/games/addingGames.html)
can be added by executable/shortcut, directory scan, or manual configuration.
Correct launch/tracking settings are needed for local playtime; this does not
reconstruct historical playtime that was never recorded.

The [SDK library API](https://api.playnite.link/docs/tutorials/extensions/library.html)
lets an extension enumerate game records and react to library updates. The
[game model](https://api.playnite.link/docs/api/Playnite.SDK.Models.Game.html)
exposes identifiers, source, name, playtime in seconds, last activity, and
installation state. This makes a custom stats exporter feasible; it is not an
existing connection to Gaming Stats API.

## Proposed integration

1. Playnite on the gaming PC tracks manually added and other approved local games.
2. A small extension reads approved game fields through the SDK and sends a
   versioned snapshot over HTTPS to a dedicated authenticated ingestion endpoint.
3. Gaming Stats API validates and stores the snapshot; the website reads cached
   data even when the PC is off, with the last successful sync time displayed.

Keep store credentials inside their existing local integrations. Give the
exporter its own revocable upload credential, separate from website read keys. Export an
explicit allowlist of game fields, excluding tokens, launch commands, executable
paths, and private/hidden entries unless explicitly selected for publication.
The PC only needs outbound HTTPS; the proposal requires no publicly reachable
local server. These are design requirements, not implemented guarantees.

Keep `source: playnite` separate from `store: epic` or a manually assigned local
origin. Use stable source IDs rather than names for matching. Do not sum imported
Epic totals and locally tracked totals as independent playtime. A Playnite entry
or install flag is not proof of a purchase or current entitlement. Missing data
must stay unknown rather than becoming a claimed zero.

The `/epic` namespace uses direct Epic snapshots. Choose a separate local-games
namespace when implementing Playnite ingestion; do not place non-Epic records
under `/epic`. Route names are not finalized here.

## Limits and next check

- Playnite's [supported platform](https://github.com/JosefNemec/Playnite) is Windows;
  there is no native macOS build for the Mac hosting this repository.
- Sync only advances while the PC, Playnite, and exporter are running and online.
- Launch local games through Playnite with working tracking to capture sessions.
  Imported store totals depend on upstream availability and plugin settings.
- Achievements and game-specific stats are outside this initial library/playtime
  proposal and need separate verification.
- Before building, inspect one explicitly selected, sanitized Epic record and
  one local-game record from the user's Windows Playnite installation. Verify
  stable IDs, playtime units, import settings, privacy selection, and sync timing.
