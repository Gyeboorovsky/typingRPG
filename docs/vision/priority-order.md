# Priority order — a recommended implementation sequence (PROPOSAL, open to discussion)

**Status: recommendation, not a decision.** This is one defensible ordering
with its reasoning shown; the user should challenge it in a planning session
before anything here enters `docs/PLAN.md`. Guiding biases: (1) finish what's
mid-flight before opening new fronts; (2) do rewrites at the moment they're
cheapest, not when they're forced; (3) keep the game playable/shippable after
every phase (vertical slices, `additional-ideas.md` §11); (4) don't write
server code before the sim is server-shaped.

---

## Phase 0 — finish the in-flight combat rebuild (already scheduled)
Group B (practice fight), C1 (leech), a **re-scoped** C2/C3 (weapon styles —
see the conflict note below), C4/D1 per `PLAN.md`.
- *Why first:* everything later (targeting, indicators, modes, PvP) builds on
  these; decisions are already locked; half-done combat is the worst base to
  refactor under.
- **⚠ Before running C2:** its prompt still specs the two-mode bow;
  `combat-modes.md` §4 explains why it must be rewritten for the four
  target-priority modes + style dispatch first. This is the one place Phase 0
  and the new vision touch.

## Phase 1 — combat modes + indicators + quick config wins (client-only)
Weapon-style dispatch and mode sets for sword/bow/wand (grimoire's ally-heal
waits for parties — solo-degraded modes only), target indicators (red ▽ /
yellow glow / green ▽ groundwork), sound design pass
(`additional-ideas.md` §2), and the user's "wanted soon" configs (window
size/opacity, camera zoom, settings v2 — `configs.md` §5).
- *Why now:* pure client value, playable immediately, zero server
  dependencies; sound + configs are cheap morale/feel wins that also derisk
  the options/settings plumbing later phases extend.

## Phase 2 — world pillar: MapDef, editor pipeline, multi-map, chunked rendering
`map.ts`/`SPOTS` → instanced `MapDef`; Tiled import script; elevation levels;
chunked terrain cache; 2–3 real maps + teleports; `mapId` in saves
(`maps-and-rendering.md`).
- *Why before multiplayer:* the map singleton refactor is ALSO a multiplayer
  prerequisite (zones) — doing it for content reasons first means the MMO
  refactor later touches an already-instanced world; and big maps are
  shippable single-player content that makes the game worth logging into
  while the server is being built.

## Phase 3 — sim multiplayer-readiness refactor (still single-player!)
`ZoneState`/`players: Map`, actor-tagged events, per-player fx/prompt/RNG
streams, per-player CombatState (`multiplayer-architecture.md` §2.2). N=1 in
production; the full test suite proves behavior unchanged.
- *Why its own phase:* this is the highest-risk pure refactor in the whole
  plan; doing it with no network variable isolates the risk completely. After
  it, the sim is server-shaped and every later phase stops paying the
  single-player-assumption tax.
- Also here: upgrade +0→+9 at an NPC (`progression.md`) — first real gold/
  material sink, pure sim, keeps content flowing during refactor-heavy weeks.

## Phase 4 — online alpha (scale stage S1: tens of players)
Auth/accounts, WebSocket gateway, one server process running `src/game/`
unmodified, Postgres persistence, client predict/reconcile, admin-gated
cheats (the mandated gate), anti-cheat Layer 0 + basic Layer 1 telemetry +
observability (`anti-cheat.md`, `additional-ideas.md` §5–6), protocol
versioning + reload banner, chat v1, GDPR basics.
- *Why anti-cheat here and not later:* per the user's priority — and because
  Layer 0 is free (it IS the architecture) while Layer 1's telemetry only
  works if it records from the first public day (baselines need clean data).
- Local single-player mode remains as offline sandbox (recommendation in
  `multiplayer-architecture.md` §3.2).

## Phase 5 — the social/economy layer (what makes it an MMO, not a co-op demo)
Parties (+ grimoire ally modes complete the priest — `combat-modes.md`),
trading, player shops v1 (fixed stalls), guilds v1, first group dungeon
(`endgame.md`), death-penalty decision, level cap decision.
- *Order within phase:* parties → trading → shops → guilds → dungeon; each is
  a retention multiplier for the previous.

## Phase 6 — Metin2 depth + scale stage S2/S3 as CCU demands
Guild wars, PvP zones + arenas, quests/story arc, mounts & pets, raids, solo
gauntlet, more maps/classes-actually-selectable, monetization v1 (prompt
themes, recolors, XP ring — `monetization.md` §4) once retention justifies
payment-provider setup. Infrastructure scales reactively per the S-stage
table (`multiplayer-architecture.md` §2.3) — thresholds are CPU/CCU driven,
not calendar driven.

## Continuous tracks (not phases)
- **Desktop parity:** CI `tauri build` from Phase 0/1 onward; updater +
  signing at Phase 4 (an online client needs updatable desktop builds);
  quality-profile high tier whenever the renderer work lands
  (`platform-strategy.md`).
- **decisions.md hygiene:** every ⚠ flag across these memos becomes an
  explicit user decision (recorded in `docs/decisions.md`) at the phase that
  first touches it. The
  running list: C2 re-scope (Phase 0), local-saves-vs-server-characters and
  megaserver-vs-shards and level cap (Phase 4), death penalty + loot rights
  (Phase 4/5), search-kiosk scope (Phase 5), bag-page monetization (Phase 6).

## What is deliberately DEFERRED (and safe to defer)
Multi-continent deployment; WebGL/WebGPU renderer (until profiling demands);
premium-currency exchange; non-consensual war declarations; housing
(**explicitly out of scope per the user — nothing in these memos designs
it**); native mobile/touch combat (locked keyboard-gated stance).

## The two decisions worth making EARLY even though their code comes late
1. **Megaserver vs named shards** (`multiplayer-architecture.md` §2.4) —
   it silently shapes economy, guilds, names, and account schema from the
   first Postgres migration onward.
2. **No-paid-randomness / monetization red lines** (`monetization.md` §2) —
   public trust positioning is cheaper to establish than to repair.
