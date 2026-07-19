# Vision memos — long-range design (MMO scale-up + desktop port)

## What this folder is

A set of **design/architecture memos** produced by a read-only analysis session
(2026-07-18) covering the whole codebase. It maps the road from the current
single-player prototype to the stated end goal: a Metin2-scale, server-authoritative
MMO with full browser/desktop (Tauri) feature parity.

**Everything in here is a PROPOSAL.** Nothing in this folder is a decision, an
authorization, or an implementation instruction. The files deliberately present
options with tradeoffs and recommendations open to discussion.

## The files

| File | Topic |
|---|---|
| `multiplayer-architecture.md` | Server-authoritative sim, shards, universal accounts, scaling stages |
| `platform-strategy.md` | Browser vs desktop (Tauri) parity, one codebase serving both |
| `combat-modes.md` | Weapon mode sets (sword/bow/wand/grimoire + more), targeting |
| `maps-and-rendering.md` | Map editor pipeline, elevation, large-map rendering, LOD, teleports |
| `economy.md` | Trading, player shops (no auction house), currency sinks, item identity |
| `guilds-and-pvp.md` | Guild systems, guild wars, open-world PvP, arenas |
| `progression.md` | Crafting, quests, mounts/pets and how they interconnect |
| `endgame.md` | Group dungeons / instances / raids |
| `monetization.md` | Cosmetic-first model, time-limited boosts, additional ideas |
| `configs.md` | User-facing + server-facing configuration (window opacity, zoom, …) |
| `anti-cheat.md` | Anti-bot/anti-cheat for a typing MMO — high priority from the start |
| `additional-ideas.md` | Things the vision brief did NOT mention but that matter |
| `priority-order.md` | A recommended implementation sequence — explicitly a proposal |

## How to use this folder

- Read `priority-order.md` first for the shape of the whole road, then dive into topic
  files as each phase approaches.
- Most topic files have three parts: **current-state assessment** (with file
  citations), **options with tradeoffs**, and **what would need to change**.
- Anything marked **⚠ decision-log conflict** would require walking back something
  locked in `docs/decisions.md`. Decide those consciously — never let them slide in
  silently.
- When a topic here becomes active work, spawn a planning file in `docs/open/` (per
  the workflow in `CLAUDE.md`); when a proposal is accepted, the decision belongs in
  `docs/decisions.md`. This folder is upstream of both, never a replacement.
- **Treat every recommendation as an argument, not a green light** — implementation
  requires the user's explicit approval through the normal workflow.
- Code citations were accurate as of 2026-07-18 (commit `7f97746`). **Verify against
  the live code before relying on line-level details** — the project moves fast.
- References to `PLAN.md` (its `C2`/`v3-*` tags etc.) mean the OLD root `PLAN.md`,
  deleted in the 2026-07-19 docs restructure — full text in git history; its Pillar C
  prompts are preserved in `docs/open/combat-rework-scope.md` (appendix).
- If a memo contradicts `docs/decisions.md`, **decisions.md wins** until the user
  explicitly changes it. The memos flag these conflicts; they do not resolve them.
