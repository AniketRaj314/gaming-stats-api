# Frontend handoff: Miscrits core integration

Use /custom/miscrits for the collection experience under canonical game
steam-3628960. Continue using aggregate playtime, activity and Steam achievements.
A PlayerMiscrit is one owned individual; a Miscrit is its species family.
Inventory in game terminology means items, which are outside this core release.

## Fetching

All data calls go through your trusted backend with X-API-Key. Never expose
the read key or game credentials in browser code.

| Route | data shape and use |
| --- | --- |
| /custom/miscrits/player | Object: account level, balances, traits and teamOrder |
| /custom/miscrits/player/miscrits | Array: complete owned individuals |
| /custom/miscrits/player/miscrits/:playerMiscritId | Object: owned detail |
| /custom/miscrits/player/miscrits/families | Array: each family, ownedCount and playerMiscritIds |
| /custom/miscrits/player/team | Array: ordered active members, already included in the owned list |
| /custom/miscrits/miscrits | Array: catalog definitions with evolutions and ordered abilities |
| /custom/miscrits/miscrits/:miscritId | Object: one catalog family |
| /custom/miscrits/player/snapshot | Object: sanitized source data for diagnostics, not required for normal rendering |

Every response uses schemaVersion, provider, accountRef, canonicalGameId, status,
fetchedAt, lastAttemptAt, catalog, interpretationVersion, refreshMode,
requestRefreshIntervalSeconds, nextRefreshAt, refreshDue and data.
Read status before treating an empty list as zero ownership. HTTP 503 means
unavailable/pending/disabled, 401 means invalid authentication, 404 unknown ID,
400 invalid ID or unsupported parameters. Stale responses retain the last
successful data and its original fetchedAt. Label them as stale.
Account connection is an operator-only terminal flow using miscrits:connect.
Do not build a frontend login form or request game credentials.
The first snapshot is fetched during connection. Startup and manual refresh remain
available. From v3.10.0, valid authenticated Miscrits data requests also trigger a
background refresh when the cached snapshot is at least five minutes old by default.

## Refresh behavior for the frontend

Render the returned data immediately. The triggering response contains the saved
snapshot; it does not wait for the game API. All custom Miscrits endpoints share
one refresh, including concurrent page requests. There is no force-refresh query
parameter and no frontend need to perform credential/session management.

- refreshMode is startup-request-and-manual by default.
- requestRefreshIntervalSeconds is 300 by default, configurable by the operator
  with MISCRITS_REFRESH_MINUTES. Do not hardcode five minutes in client logic.
- refreshDue=true means the snapshot is eligible for an update, possibly already
  in progress. Keep showing the returned data and fetchedAt. A subsequent request
  can get the completed snapshot; compare fetchedAt to detect the update.
- nextRefreshAt is the earliest time a later request can trigger work, not an
  automatic schedule. There are no refreshes just because the page stays closed.
- If you want to update an open page, optionally re-fetch once after a short delay
  when refreshDue is true. Do not enter a tight polling loop awaiting a new timestamp.
- On failure, the old snapshot remains available with status stale and unchanged
  fetchedAt. Further request-triggered attempts wait the configured interval.
- status ready can coexist with refreshDue=true: the separate age-based stale
  threshold remains MISCRITS_STALE_HOURS (24 hours by default).
- With MISCRITS_REFRESH_MINUTES=0, refreshMode is startup-and-manual,
  requestRefreshIntervalSeconds is 0, nextRefreshAt is null and refreshDue is false.

A connected account without its first snapshot returns 503 while a request may
start background recovery. Keep the unavailable state and retry later. An
unconnected account needs operator setup; requests do not connect it.
Health/docs and aggregate endpoints never trigger Miscrits refresh. Fetch at least
one /custom/miscrits data route when rendering the collection page. The backend
continues to fetch get_player as a whole, not once per individual creature.

## Owned individual example

Illustrative, not a live account record:

```json
{
  "playerMiscritId": 101,
  "miscritId": 1,
  "nickname": "My Flue",
  "baseName": "Flue",
  "evolutionIndex": 0,
  "evolutionName": "Flue",
  "displayName": "My Flue",
  "catalogStatus": "resolved",
  "level": 1,
  "rating": "S+",
  "qualityScore": 18,
  "teamSlot": 1,
  "artwork": {
    "backUrl": "https://cdn.worldofmiscrits.com/miscrits/flue_back.png",
    "avatarUrl": "https://cdn.worldofmiscrits.com/avatars/flue_avatar.png"
  }
}
```

Use playerMiscritId as the owned-record key, miscritId to join catalog data.
Use displayName for the nickname-aware label and evolutionName for canonical
evolution identity. Variants with different miscritId values remain distinct.
Use totalStats for displayed persistent card stats. Each stat can be explained
through baseStats + bonusStats + activeRelicStatBonuses. The six keys are
hp, spd, ea, ed, pa, pd. Qualities are a separate 1..3 value for each stat.
currentHp.displayed and currentHp.maximum are display-ready. Do not render the
raw full-health sentinel as 969 HP. maxLevel means level 35; readyToTrain is
informational and there is no training action in this API.

Artwork uses canonical evolution names, never nicknames. Catalog evolutions
each have artwork; individual/team artwork selects the current form. Avatar art
is suitable for compact portraits. backUrl is a back-facing creature asset,
not a front-facing sprite. Both are public absolute CDN URLs needing no API key.
Provide error placeholders since derived filenames are not availability guarantees.

catalogStatus unresolved means new/unknown species metadata could not be resolved.
Keep the individual visible by its IDs, preserve owned state, and show placeholders
for null names, artwork and calculated stats. Do not fuzzy-match it to another species.

Families contain owned, ownedCount and playerMiscritIds, never a "best" copy.
Apply caller-defined filters, comparisons and goals locally. This API has no
targets, qualifying counts, readiness classifications for families, or rankings.

## Resources

- [API and operator guide](miscrits.md)
- Production docs after deployment: https://api.aniketraj.me/custom/miscrits/docs
- Machine-readable docs after deployment: https://api.aniketraj.me/custom/miscrits/llms.txt
- [Aggregate handoff](frontend-aggregate-handoff.md)

No special game page or separate ownership record is created for the custom
source. Enabled aggregate responses advertise specializedResources with provider
miscrits and basePath /custom/miscrits on steam-3628960.
