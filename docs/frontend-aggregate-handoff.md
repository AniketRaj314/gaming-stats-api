# Frontend handoff: aggregate gaming data

Use the aggregate API for cross-provider library presentation and live activity. Continue using raw provider endpoints for provider-specific screens such as Steam achievements, PSN trophies, Valorant competitive stats, or the complete provider metadata payload.

## Authentication

Call aggregate routes from the frontend service or another trusted server using the existing `X-API-Key`. Do not expose the key in browser JavaScript.

```http
GET https://api.aniketraj.me/aggregate/library
X-API-Key: <server-side key>
```

## Live activity

Call:

```http
GET /aggregate/now-playing
```

Render every element of `sessions`. The array can contain simultaneous activity, for example Miscrits on a Mac through Steam and VALORANT on the Windows gaming PC through Playnite.

Recommended behavior:

1. If `state` is `playing`, render every session.
2. Use `session.game.name`, `session.game.artwork`, `platform`, and `device` for the card.
3. Use `primarySource` for the main provider label.
4. Optionally use `detectedBy` for a detail such as "Detected by Steam and Playnite."
5. Use `startedAt` only when non-null.
6. Do not infer a Steam operating system when `platform` is `unknown`.
7. If `state` is `offline`, clear now-playing UI and show the owner as offline.
8. If the request is HTTP 503 or `state` is `unknown`, retain the last known display only according to the frontend's own short error policy. Do not label the user offline.

Provider availability is not owner availability. A Steam account being online, a PSN account being idle, or a Playnite extension sending heartbeats without a current game all resolve to aggregate `offline`. This avoids showing another Windows user's Playnite process as the owner's activity.

There is no single global winner. Provider priority only removes duplicate observations of the same session. Steam and Playnite reporting the same Steam game produce one session with `primarySource: "steam"`. Steam reporting Miscrits and Playnite reporting VALORANT produce two sessions.

## Library

Call:

```http
GET /aggregate/library
```

Use `games[].id` as the stable canonical key and route parameter. Each game contains:

- `editions`: Original, Remastered, Standard, or another confirmed edition.
- `copies`: independently tracked platform or storefront copies.
- `observations`: the source records that produced the copy.
- `playtime`: safely selected and deduplicated lifetime data.
- `artwork`: selected portrait, landscape, square, and icon assets plus every retained source image.

The frontend can choose one of these presentations:

- One card per canonical game, with edition and platform breakdown inside.
- One card per edition, while linking editions under the same canonical game.
- One card per copy for a storefront-focused library.

For Marvel's Spider-Man, the response is one canonical work. Original and Remastered remain separate editions. The two regional PS4 title IDs remain visible as observations under one PS4 copy and are not added together. PS5 Remastered and PC Remastered remain independent copies.

## Playtime display

Use `playtime.knownSeconds` at work and edition level and `playtime.seconds` at copy level.

- `known`: every included copy has a known value.
- `partial`: at least one copy is known and at least one is unknown.
- `unknown`: no copy has a usable value.
- `ambiguous`: the provider reported conflicting source data.

Never convert null or unknown playtime to zero. When showing a combined total from a partial result, label it as a known minimum, for example `12h+`, or show the copy breakdown without a combined number.

The backend already handles these overlap rules:

- Steam total versus its Windows, macOS, Linux, Deck, and disconnected fields.
- Direct Epic versus its Playnite mirror.
- Custom Valorant lifetime versus Playnite tracking.
- Regional PSN title records.

The frontend must not add `observations` itself. Use the computed playtime fields.

## Artwork

The aggregate artwork contract is role-based:

```ts
type AggregateArtwork = {
  portraitUrl: string | null;
  landscapeUrl: string | null;
  squareUrl: string | null;
  iconUrl: string | null;
  all: Array<{
    url: string;
    provider: "steam" | "psn" | "epic" | "playnite";
    providerGameId: string;
    sourceRole: "authoritative" | "helper-mirror" | "presence-helper";
    type: string;
    roles: string[];
    width: number | null;
    height: number | null;
    contentType: string | null;
    metadata: Record<string, unknown>;
    sources: Array<{
      provider: string;
      providerGameId: string;
      sourceRole: string;
      type: string;
      metadata: Record<string, unknown>;
    }>;
  }>;
};
```

Use the field that matches the component:

- `landscapeUrl` for wide cards, heroes, and banners.
- `portraitUrl` for poster cards.
- `squareUrl` for square tiles and avatars when an actual square asset exists.
- `iconUrl` for compact application icons.

Do not read `coverUrl` or `backgroundUrl`; those generic fields are not part of the contract. Do not reinterpret portrait artwork as landscape artwork. A role can be null because providers do not guarantee every shape for every game.

`all` contains every distinct safe image supplied by the contributing providers, including images not selected for the four primary roles. This includes alternate capsules, logos, backgrounds, character layers, and screenshots. Identical URLs appear once, with every contributing source listed under `sources`.

Authoritative provider artwork wins over a helper mirror for the selected fields. An Epic game mirrored through Playnite therefore uses Epic landscape and portrait art while retaining the Playnite images in `all`. Local Playnite games use their Playnite artwork directly.

Playnite artwork paths are relative to the API origin and require the same `X-API-Key`. Remote Steam, Epic, and PSN URLs are absolute.

## Suggested TypeScript shape

```ts
type AggregateNowPlaying = {
  schemaVersion: 1;
  provider: "aggregate";
  state: "playing" | "offline" | "unknown";
  sessionCount: number;
  sessions: Array<{
    id: string;
    game: {
      id: string;
      name: string;
      edition: { id: string; name: string };
      artwork: AggregateArtwork;
    };
    platform: string;
    device: { id: string | null; name: string | null } | null;
    startedAt: string | null;
    observedAt: string | null;
    primarySource: "steam" | "psn" | "epic" | "playnite";
    detectedBy: Array<{
      source: string;
      providerGameId: string;
      observedAt: string | null;
      startedAt: string | null;
      platform: string;
      device: { id: string | null; name: string | null } | null;
    }>;
    confidence: "single-source" | "confirmed";
  }>;
  sources: Record<string, {
    status: string;
    stale: boolean;
    lastSuccessAt: string | null;
  }>;
};
```

## Detail route

Use the canonical ID from the library or now-playing response for every game page:

```http
GET /aggregate/games/marvels-spider-man
```

This is the authoritative page response. It includes canonical `game.playtime`, aggregate artwork, game-specific `activity`, and normalized `progress`. Never add provider playtime observations in frontend code.

Keep progress sets separate:

```ts
type AggregateUnlock = {
  id: string;
  setId: string;
  providerUnlockId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  unlocked: boolean | null;
  unlockedAt: string | null;
  rarityPercent: number | null;
  kind: "achievement" | "trophy";
  grade: "bronze" | "silver" | "gold" | "platinum" | null;
  source: "steam" | "psn";
  hidden: boolean;
};

type AggregateProgress = {
  status: "available" | "partial" | "pending" | "unsupported" | "unavailable";
  completionCalculation: "reported-per-progress-set-no-cross-source-merge";
  setCount: number;
  unlockCount: number;
  rarestUnlock: AggregateUnlock | null;
  sets: Array<{
    id: string;
    source: "steam" | "psn";
    kind: "achievement" | "trophy";
    name: string;
    editionId: string;
    copyId: string;
    platform: string;
    providerGameIds: string[];
    sourceRefs: Array<{ providerGameId: string; editionId: string; copyId: string }>;
    status: "available" | "stale";
    summary: {
      earned: number;
      available: number;
      known: number;
      completionPercent: number | null;
    };
    rarestUnlock: AggregateUnlock | null;
    unlocks: AggregateUnlock[];
  }>;
  sources: Array<{
    source: "steam" | "psn" | "epic" | "playnite" | "valorant";
    providerGameIds: string[];
    editionId: string;
    copyId: string;
    status: "available" | "stale" | "pending" | "private" | "unsupported" | "unavailable" | "error";
    reason: string | null;
    lastSuccessAt: string | null;
  }>;
};
```

Render one progress block for every item in `progress.sets`. Steam achievements and PlayStation trophies use the same unlock fields, but remain separate sets. There is deliberately no combined completion percentage. Regional PSN title records that resolve to the same trophy set appear once.

Use `progress.rarestUnlock` for the page-level rarest section. It is the lowest reported source-population percentage among earned unlocks. Use each set's `summary.completionPercent` for progress display. If it is null, some unlock states are unknown.

If top-level `status` or `progress.status` is `partial`, render the healthy sets and use `progress.sources` to identify unavailable data. Epic, Playnite, and Valorant normally report `unsupported` for unlocks rather than an error.
An unrelated provider failure does not make this game partial. A configured provider match that belongs to this canonical game does.

A missing canonical ID returns HTTP 404. Provider game IDs are not substitutes for the canonical route ID.

## Migration sequence

1. Add a server-side client for `/aggregate/now-playing`.
2. Replace provider-by-provider live checks with the returned `sessions` array.
3. Use `artwork.landscapeUrl` for the existing wide game cards. Do not use `coverUrl` or `backgroundUrl`.
4. Route every library card to `/gaming/games/:canonicalGameId`.
5. Fetch `/aggregate/games/:canonicalGameId` for canonical playtime, artwork, activity, and progress.
6. Remove provider-specific game detail buttons and Editions and Copies navigation. Editions and copies remain provenance within the response.
7. Render each `progress.sets` item separately and use `progress.rarestUnlock` for the page-level rarest section.
8. Keep raw provider calls only for specialized data that is not yet represented by the aggregate contract, such as Valorant competitive statistics.
9. Report an unconfirmed match for backend curation instead of merging titles in frontend code.
