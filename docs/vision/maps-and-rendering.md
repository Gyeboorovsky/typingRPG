# Maps & rendering — editor pipeline, elevation, large worlds, LOD, teleports

Vision (user): replace the placeholder test map with a large open world,
authored in an **external map editor** (not Claude Code). Cover: import
format/pipeline; how elevation works given the vector art style; rendering
limits for LARGE maps + many enemies (does the browser need a lower-fidelity
tier than desktop, and what would that split look like); multi-map structure
with teleports that load fast.

---

## 1. Current-state assessment

- **The map is code, not data.** `src/game/map.ts` authors one 48×48 map
  imperatively at module load (`tree()`/`rock()`/`water()`/`sand()` calls into
  module-scope `terrain`/`blocked` arrays + `PROPS`/`SPAWN` consts). Its own
  header says: "Future maps: turn this into a MapDef." Spawn spots live
  separately as `SPOTS` in `src/game/mobs.ts`. Queries are clean
  (`terrainAt`/`isBlocked`/`circleBlocked`) — consumers won't care where the
  data comes from, which makes the refactor mostly mechanical.
- **Mob AI assumes open terrain.** No pathfinding; straight-line chase + axis
  slide (`mobs.ts` header documents this as a deliberate authoring
  constraint). Big maps can keep this IF the authoring rule "no mazes, no
  concave pockets around spawn spots" survives into the editor pipeline —
  cheaper than shipping pathfinding.
- **Terrain rendering pre-renders the ENTIRE map once** to an offscreen canvas
  (`src/render/terrain.ts`) and blits it per frame. At 48×48 the layer is
  3072×1536 logical px (~4.7M) and already needs a DPR cap for iOS Safari's
  ~16.7M-px canvas limit. This approach dies quadratically: a 256×256 map is
  ~134M logical px — far beyond any canvas cap. **The whole-map layer is the
  hardest rendering blocker for large maps.**
- Entity pass is healthy for growth: per-entity screen-rect culling + one
  depth sort per frame with reused arrays (`renderer.ts`); mob `separate()` is
  O(n²) with an explicit note to swap in a spatial hash at MMO mob counts.
- Vector sprites (`sprites.ts`) are resolution-independent — a genuine asset
  for zoom (`configs.md`) and for high-DPI desktop; their per-frame path cost
  is the thing LOD tiers will trade against.

## 2. Editor & pipeline (options)

The user will author maps externally; the repo needs an import format + a
converter. Candidates:

- **Tiled (recommended):** industry-default, free, actively maintained, first-
  class isometric mode, JSON export, custom properties on tiles/objects,
  object layers (spawn spots, teleports, props as point objects). Tradeoff:
  its iso preview assumes tile *images* — the vector game would use a simple
  placeholder tileset for authoring visuals (one colored diamond per terrain
  id), which is mildly ugly in-editor but fully functional.
- **LDtk:** nicer UX, great JSON, but isometric support is second-class
  (grid-based with visual offsets) — friction for this projection.
- **Custom in-game editor:** best fidelity (edit with real renderer), highest
  cost; also the only option that could later become a *player-facing* or
  GM-facing tool. Not now.

Proposed pipeline (fits the repo's style): Tiled `.tmj` → a small
`scripts/import-map.mjs` (same pattern as `scripts/thumb.mjs`) → a compact
generated `MapDef` JSON committed under `src/game/maps/` (or `public/maps/`
fetched at runtime — see teleports below). The sim consumes ONLY `MapDef`;
Tiled files are authoring sources. Conventions to define once: terrain layer
(tile ids ↔ `T_GRASS/T_SAND/T_WATER/…`), collision layer, elevation layer
(§3), object layers `spawns` (defId/count/radius — replaces `SPOTS`),
`teleports` (target map + entry point), `props`.

`MapDef` refactor (shared prerequisite with `multiplayer-architecture.md`
§2.2): `map.ts` singletons become a `WorldMap` instance held on
`GameState`/`ZoneState`; `SPOTS` moves into the map's data; `newGame` takes a
map id. This is the same change the server needs to run multiple zones — do it
once, for both reasons.

## 3. Elevation with vector graphics (what's realistically possible)

Honest framing: smooth 3D-ish terrain is off the table without abandoning the
art style; **discrete height *levels*** are very achievable and read great in
isometric vector art:

- Each tile gets `elevation: 0..N` (small N, e.g. 0–3). Rendering offsets the
  tile's `projY` by `-elevation * STEP_PX` and draws a darker "cliff face"
  polygon on south/east edges where a neighbor is lower — flat-color polygons,
  exactly the existing aesthetic (cf. `rockB` shaded facet in `sprites.ts`).
- Movement: crossing between tiles whose elevation differs by ≥1 is blocked
  unless the edge is a ramp tile (authored in the editor). This is pure
  `isBlocked`-style data — no physics.
- Entities standing on a tile inherit its render offset; depth sort stays
  `x+y` within a level with elevation as a secondary key (needs care at cliff
  edges — the one genuinely fiddly rendering bit; prototype early).
- What to explicitly NOT attempt: smooth slopes, jumping/falling, projectiles
  arcing over cliffs (bow line-of-sight across elevation can be a simple
  "same-or-adjacent level" rule at first).
- Cheapest alternative if even this feels heavy: *visual-only* elevation
  (render offset + cliff faces, collision authored separately as plain blocked
  tiles). Loses gameplay meaning, keeps the look. Recommendation: full
  discrete levels — the movement rule is a few lines once the data exists.

## 4. Large maps + many mobs: rendering strategy and the browser/desktop split

- **Terrain: replace the whole-map layer with chunked caching.** Pre-render
  ~16×16-tile chunks to small offscreen canvases on demand, LRU-cap the cache
  (e.g. 64 chunks ≈ a few screens), blit visible chunks per frame. Unbounded
  map size, bounded memory; the existing `drawTileBase` code is reused
  verbatim. This one change removes the size ceiling entirely.
- **Mobs:** spatial hash (~1-tile buckets) for `separate()` AND for aggro
  scans once zones hold hundreds of mobs — `mobs.ts` already documents the
  plan. Server-side interest management (multiplayer memo) independently caps
  how many entities a client even knows about, which bounds client rendering
  more than any LOD trick.
- **Does the browser need a lower-fidelity tier than desktop?** Probably not a
  *structurally* different renderer for a long time — Canvas 2D with culling +
  chunks + capped particles comfortably draws a few hundred on-screen vector
  entities at 60fps on mid hardware. The realistic split is a **quality
  profile** (shared design with `platform-strategy.md` §2):
  - `low` (weak browser/laptop): DPR cap 1, no water shimmer, no glow pulses,
    damage-number cap, simplified mob sprites beyond ~40 on screen (pre-bake
    each mob's idle frame to a tiny cached bitmap and blit — "impostor" LOD;
    full vector path only for nearby/animated ones).
  - `medium` (default browser): today's visuals + chunked terrain.
  - `high` (default desktop / opt-in browser): uncapped DPR, all effects,
    higher particle budgets.
  Desktop "better graphics, never fewer features" is thus a *default profile
  difference*, satisfying the parity requirement by construction. If a real
  ceiling is ever hit, the escape hatch is a WebGL/WebGPU sprite-batcher
  behind the same draw interface — available in browsers too, so still not a
  platform fork; defer until profiling demands it.

## 5. Multi-map structure + fast teleports

- Client: `MapDef`s as static JSON fetched on demand and cached (service
  worker or plain HTTP cache — Pages CDN handles it). A teleport = fade out →
  ensure target `MapDef` + its terrain chunks near the entry point exist →
  swap `state` world refs → fade in. Prefetch `MapDef`s for teleports the
  player walks near, and the entry-area chunks, so the common case is a
  <300 ms transition with zero network wait. Single-player: mob/spot state
  per map either resets on entry (Metin2-like, simplest) or persists in a
  per-map state table on `GameState` (bigger saves) — recommend reset except
  boss timers.
- Multiplayer: teleport = zone handoff (leave zone A's interest set, join
  zone B's, receive B's snapshot). The client-side prefetch above hides most
  of it; "players already on it" arrive in the join snapshot by design — no
  extra mechanism needed. Cross-zone-process teleports at scale stage S3 go
  through the message bus (multiplayer memo §2.3).
- Save format: `SaveData.player` gains `mapId` next to `pos` (soft-optional
  field, absent = the starter map — same soft-migration precedent as
  `stats?`/`statPoints?`; no version bump forced).

## 6. ⚠ Decision-log cross-checks

- No locked decision opposes any of this. Relevant guardrails to respect:
  world colors only in `render/palette.ts` (cliff-face colors, new terrain
  types go there); tuning in `constants.ts` (chunk size, LOD thresholds,
  elevation step px); `src/game/` purity (elevation/collision data pure,
  chunk canvases strictly in `src/render/`).
- The no-pathfinding assumption becomes an **authoring convention** that must
  be written into the map-pipeline docs when they land, or the first
  maze-like map silently breaks mob AI. Worth logging as a decision when the
  pipeline is approved.
- `RESPAWN_MIN_PLAYER_DIST`-style spot logic and `SPOTS` move into map data —
  touches the same code Group B/C2 touch; sequencing note in
  `priority-order.md`.

## 7. What would need to change (summary)

`map.ts` → instanced `MapDef` (with elevation + teleports); `mobs.ts` SPOTS →
map data; `terrain.ts` → chunk cache; `renderer.ts` → chunk blits + elevation
offsets + profile-gated effects; new `scripts/import-map.mjs` + authoring
conventions doc; `SaveData` + `mapId`; `constants.ts` additions. PLAN.md gains
a "world pillar" — none of its current stages conflict, but C3 (arrow
rendering) and the indicators work would ideally land after or alongside the
chunk refactor to avoid double-touching the renderer.
