# Changelog

## 3.5.1 — 2026-09-17

- Repair Valorant Tracker extraction after Tracker replaced the generated CSS
  classes used by the agents, maps, and total-playtime pages.
- Read those modules from stable rendered labels and value patterns instead of
  generated class names.
- Treat empty or incomplete Apify datasets as refresh failures so stale values
  stay explicitly stale and do not receive a false successful-refresh timestamp.
- Manually verify and correct the production snapshot from the rendered public
  Tracker profile: 21 competitive agents, 12 competitive maps, 29 unrated
  agents, 13 unrated maps, and 2,103 total hours. Preserve the enriched artwork
  fields and keep the overall Tracker snapshot marked stale until a successful
  automated refresh updates every module.

## 3.5.0 — 2026-09-17

- Preserve PSN concept cover art, logos, master art, backgrounds, hero art,
  portrait and landscape banners, and screenshots as typed per-game media.
- Preserve every safe Epic catalog image with its type, dimensions, byte size,
  alt text, upload time, and MD5 checksum while retaining `imageUrl`.
- Refresh legacy Epic catalog cache rows once so the expanded artwork contract
  becomes available immediately after deployment.
- Expand Valorant agent and map enrichment with the official static artwork
  variants and ability/role icons without consuming a live Valorant run.
- Audit current production source shapes for all four providers; Steam's
  observed StoreBrowse artwork and screenshot fields were already retained.
- Verification: all 276 offline tests passed; no live Valorant refresh was run.

## 3.4.1 — 2026-09-17

- Complete Steam StoreBrowse artwork coverage with 2× header/main/small
  capsules, raw page backgrounds, and the correct source modification time.
- Preserve Steam's non-override artwork separately from temporary artwork and
  expose ordered all-ages and mature-content screenshot lists.

## 3.4.0 — 2026-09-17

- Expand the Steam library request to include free subscriptions, extended app
  information, unvetted apps, and Steam Deck playtime.
- Preserve safe StoreBrowse catalog facts, review summaries, compatibility data,
  content descriptors, game capability flags, and recognized artwork variants.
- Add `GET /steam/badges` with Steam XP/level thresholds, owned badges, and
  Community badge quest completion.
- Preserve all three Steam avatar sizes and public profile-state fields.
- Enrich per-game details with schema version/default values, both achievement
  icon states, and Steam's observed current-player count.
- Add a provider data-coverage policy that records the source-data contract,
  review status, and intentional privacy/security exclusions.

## 3.3.1 — 2026-09-17

- Resolve Steam library-capsule paths from batched StoreBrowse asset metadata so
  newer content-hashed covers work; return `null` rather than a broken URL when
  Steam publishes no capsule.

## 3.3.0 — 2026-09-17

- Add a full Steam library-capsule `coverUrl` to every normalized game record
  while retaining the existing compact `iconUrl`.
- Document the two distinct Steam image assets in the human and machine-readable
  API guides.

## 3.2.1 — 2026-09-17

- Preserve the display name from Epic's token response when the subsequent
  account verification response contains only the verified account ID.
- Distinguish a verified but unexpected display name from an account-ID mismatch
  during the private owner connection flow.

## 3.2.0 — 2026-09-17 (implementation)

- Add an opt-in Epic provider at `/epic` with cached claimed PC base games,
  catalog artwork, Epic-reported playtime, and automatic discovery on refresh.
- Add encrypted rotating-session storage, account-bound renewal, complete library
  pagination, catalog classification/cache, persistent scheduling, backoff, and
  remote session revocation through private operator commands.
- Preserve explicit zero, missing, ambiguous, and unavailable playtime states;
  exclude add-ons, private sandboxes, engine assets, records without app
  artifacts, and unknown classifications with coverage counts.
- Add public human and machine-readable Epic documentation plus a full security,
  setup, recovery, storage, and disconnect guide.
- Keep Epic disabled until the owner connection and live production verification
  complete. Epic-specific tests use fixtures and make no live provider calls.
- Update vulnerable Express transitive dependencies; the production dependency
  audit reports no known vulnerabilities.
- Verification: all 263 offline tests passed under Node 24 with Epic, Steam, PSN,
  Valorant, upstream HTTP, credential storage, and CLI interactions mocked.

## 3.1.0 — 2026-09-16

- Add an opt-in Steam provider at `/steam` with cached profile, owned library,
  recent playtime, per-game achievements, global rarity, and exposed game stats.
- Keep the Steam user Web API key server-side and send it only through the
  `x-webapi-key` header; never persist it in snapshots or expose refresh routes.
- Add atomic JSON snapshots, bounded stale reads, backoff, background enrichment,
  private operator refresh/status commands, and provider-isolated startup.
- Add shared human and machine-readable Steam documentation plus the complete
  setup, privacy, storage, and deployment guide.
- Deploy and activate Steam on Railway after the owner configuration and initial
  snapshot refresh. Verify the profile, owned library, recent window, and
  achievement details for an owned title through the authenticated routes.
- Confirm missing read keys return 401, PSN remains ready, and cached Valorant
  health remains available. No live Valorant refresh was used.
- Verification: all 222 offline tests passed under Node 24 with Steam, PSN,
  Valorant, upstream HTTP, and CLI interactions mocked.

## 3.0.0 — 2026-09-16

- Mark the Gaming Stats API rebrand and expansion from a Valorant-only backend
  to multiple providers as a major release. Include the PSN implementation
  developed locally under 2.3.0; retain the Valorant compatibility aliases.
- Add public `/docs` and `/llms.txt` provider indexes plus `/psn/docs` and
  `/psn/llms.txt` with shared endpoint schemas, examples, authentication,
  availability, freshness, privacy, and setup documentation.
- Preserve played-history records when Sony reports an `unknown` category, using
  `platform: null` and reporting `unknownPlatformRecords` instead of rejecting
  the entire library snapshot.
- Update provider status, setup guidance, and the historical Valorant migration
  guide; document Playnite feasibility without implementing another provider.
- Verification: 80 offline PSN tests passed. A fresh owner connection, live
  library/summary sync, offline presence, one game's trophy details, and all four
  authenticated cached PSN routes passed local checks. No live Valorant calls.
- Deployed to Railway with Node 24 and the existing persistent volume. Public
  documentation, PSN authentication boundaries, SQLite support, and cached
  Valorant reads were verified. The production owner connection, initial sync,
  all four authenticated routes, and persistence across a restart were verified.
  Real token renewal and an idle-to-playing transition remain to be observed.
- Require Railway owner connections to use its full interactive shell. Railway's
  command-mode SSH can echo credential input locally without forwarding it; the
  documented production path now guards against that unsafe invocation.
- Align the README, environment example, detailed PSN guide, human docs, and
  `llms.txt` with the verified local and Railway setup, activation, revocation,
  refresh, restart, and persistent-storage flow.

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
