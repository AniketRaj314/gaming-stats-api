# Changelog

## 3.0.0 — 2026-09-16 (not deployed)

- Mark the Gaming Stats API rebrand and expansion from a Valorant-only backend
  to multiple providers as a major release. Include the PSN implementation
  developed locally under 2.3.0; retain the Valorant compatibility aliases.
- Preserve played-history records when Sony reports an `unknown` category, using
  `platform: null` and reporting `unknownPlatformRecords` instead of rejecting
  the entire library snapshot.
- Update provider status, setup guidance, and the historical Valorant migration
  guide; document Playnite feasibility without implementing another provider.
- Verification: 80 offline PSN tests passed. A fresh owner connection, live
  library/summary sync, offline presence, one game's trophy details, and all four
  authenticated cached PSN routes passed local checks. No live Valorant calls.
- Hosted deployment, real token renewal, restart recovery, and an idle-to-playing
  transition remain to be verified.

## 2.3.0 — 2026-09-16 (local implementation)

- Add opt-in PSN library, trophy summary, presence, and per-game trophy routes.
- Add owner-operated connection and refresh commands, encrypted SQLite sessions,
  cached reads, serialized background jobs, and bounded refresh/backoff behavior.
- Require Node 24 LTS for the pinned SQLite dependency.
- Preserve the existing Valorant routes and refresh behavior; contain PSN setup
  failures so they do not prevent Valorant reads.

## 2.2.0 — deployed

- Rename the project to Gaming Stats API.
- Introduce `/custom/valorant` with working `/valorant` compatibility aliases,
  shared API-key middleware, and `GET /health`.
