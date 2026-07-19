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
   Stage A (mob damage model + aggro) and Stage B (ring + streak + exit-reset)
   being implemented now; Stage C (targeting, with bow) and Stage D (weapon
   styles) later.

## Backlog (suggested order)

2. **Security hardening** — `planning` — `docs/open/security-hardening.md`.
   requires: —
   better-after: the combat rework's damage-model stage (`applySave` grows new fields
   there; validating once after the shape settles avoids doing it twice).

3. **Accessibility** — `planning` — `docs/open/accessibility.md`.
   requires: — (one open question: AltGr for Polish typists)
   better-after: — (independent; all items need manual [V] checks)

4. **Code hygiene** — `planning` — `docs/open/code-hygiene.md`.
   requires: —
   better-after: combat rework, for the dead-constants section only (LEECH_* may be
   revived there) — the rest can go any time.

## Parked / future

- Everything in `docs/vision/` (multiplayer, maps, economy, guilds, endgame,
  monetization…) — spawn a `docs/open/` file when a topic becomes active. Read
  `docs/vision/priority-order.md` for the proposed long-range sequence.
- `docs/future-target-indicators.md` — spec-for-later that the combat rework's
  targeting stage will consume (triangles become core there).
