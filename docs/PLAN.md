# Plan — active work tracker

> What is being worked on NOW and what comes next. Feature planning lives in
> `docs/open/` (one file per isolated change); locked decisions in
> `docs/decisions.md`; finished work gets one line in `docs/done.md`. Workflow rules
> (status markers, hard-refusal on unsaved state, dependencies) are in `CLAUDE.md`.

Status legend — per feature: `planning` (questions open) → `ready` (decided, prompts
written) → `in-progress` → done (file deleted, line in done.md). Per task inside a
feature file: `[ ]` todo → `[I]` implemented → `[V]` user-verified.

---

## Active

1. **Combat rework** — `in-progress` — `docs/open/combat-rework-scope.md`.
   ALL questions answered 2026-07-19; decisions locked in `docs/decisions.md`.
   **Stage A (mob damage model + aggro) and Stage B (ring + streak + exit-reset)
   are `[I]` implemented (commits `fcd361e`, `4e97010`; tests green) —
   awaiting the user's manual `[V]` pass** (checklist in the scope file).
   Stage C (targeting, with bow) and Stage D (weapon styles) later.

2. **World expansion (experiment)** — `[I]` implemented 2026-07-19/20, awaiting
   the user's live review/`[V]`. Three rounds: (1) the Elderwood (152×152, 5 new
   mobs, Rootfather boss) + walk-up portals + chunked terrain; (2) user feedback
   → open-world generator with reusable structures + three Metin2-style maps
   (Sunfall Steppes 760², Ashen Highlands 1520², Frostreach Frontier 3040² with
   BOTH bosses), Stone Golem, portal chain, renderer scaling (prefetch + bucketing
   — the original stutter fix); (3) the **painted-map pipeline** — paint maps in
   MS Paint (1 px = 1 tile, PNG layers) → linter + compiler → the game auto-loads
   compiled JSON; exporter, palette card, mob GROUPS with rotating spawns, safe
   zones, structures, demo dungeon (The Painted Cellar), preview tool
   (`preview.html`); **meadow now hand-edited and rebuilt from its painting**
   (commit `34ca63a`) — it loads from the compiled JSON, not the code generator.
   Decisions: `docs/decisions.md` → "Second map & portals", "World expansion",
   "Painted maps". How-to + status: `docs/open/map-pipeline.md`.
   ⚠ Known issue on the three big open-world maps: micro-stutter, parked with a
   diagnosis in `docs/bugs.md` (LRU thrash at `MAX_CHUNKS`) — not yet fixed.

## Backlog (suggested order)

3. **Security hardening** — `planning` — `docs/open/security-hardening.md`.
   requires: —
   better-after: the combat rework's damage-model stage (`applySave` grows new fields
   there; validating once after the shape settles avoids doing it twice).

4. **Accessibility** — `planning` — `docs/open/accessibility.md`.
   requires: — (one open question: AltGr for Polish typists)
   better-after: — (independent; all items need manual [V] checks)

5. **Code hygiene** — `planning` — `docs/open/code-hygiene.md`.
   requires: —
   better-after: combat rework, for the dead-constants section only (LEECH_* may be
   revived there) — the rest can go any time.

## Parked / future

- Everything in `docs/vision/` (multiplayer, maps, economy, guilds, endgame,
  monetization…) — spawn a `docs/open/` file when a topic becomes active. Read
  `docs/vision/priority-order.md` for the proposed long-range sequence.
- `docs/future-target-indicators.md` — spec-for-later that the combat rework's
  targeting stage will consume (triangles become core there).
