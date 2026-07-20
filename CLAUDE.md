# Typing RPG — isometric RPG where you fight by typing

## What this repo is

A standalone hobby game that appears as one **tile** on the Gyeboorovsky portfolio hub
(https://gyeboorovsky.github.io/ — separate repo; it only links to this app's live
URL). This repo owns everything about the app and has no dependency on the hub.

Long-term goal: a Metin2-inspired MMO — but the current version is a single-player,
local-save prototype, and it must stay **cheap to host** (static-first), **cheap to
develop with AI** (small, well-named modules over clever abstractions), and **easy for
humans to maintain** (no framework magic, README-able folders). Never add
multiplayer/server code speculatively — keeping `src/game/` pure is the whole
preparation. Long-range design lives in `docs/vision/`.

## The game

Isometric vector-graphics action RPG (Tibia-like view, Metin2-like mechanics).
**WSAD** moves the hero continuously (rebindable; arrows unbound by default); the game
has explicit travel/fight modes. **Combat is typing**: each correctly typed character
damages every mob inside a dynamic AoE ring that grows with correct typing; typos are
punished. Streak + mana gate the class ultimate (Enter). All four classes
(warrior/ninja/wizard/priest) are selectable; STR/VIT/INT/DEX stat points, Metin2-style
equipment/inventory, gold, mob exp-spots, one boss (Typhon) with flawless-typing
shield phases. Progress autosaves (real file on desktop). Combat is keyboard-gated —
no touch combat (deliberate, not a regression vs the ~360px responsive promise).

## Where truth lives (read before working)

- `docs/PLAN.md` — what's active + backlog with dependencies. **Start here.**
- `docs/decisions.md` — locked decisions, the source of truth.
- `docs/architecture.md` — modules/data model/save/input/config, Current vs Target.
- `docs/open/` — one file per isolated change: open questions → decisions → prompts.
- `docs/vision/` — long-range proposals (NOT decisions, NOT authorization).
- `docs/done.md` — one line per finished piece of work.
- `docs/bugs.md` — known bugs (add on report, delete on verified fix).
- `docs/cheats.md` — dev cheat-code system reference.

## Workflow (docs-driven) — follow this exactly

**Lifecycle of a change:** idea → file in `docs/open/<change>.md` (one file per
isolated change — every user idea gets one) → numbered questions → answers in chat →
decisions recorded in `docs/decisions.md` IMMEDIATELY, answered questions removed
(an open file only ever contains what is still open) → staged prompts written into the
same file (`[PLAN]` = design pass + user approval before implementing, for
load-bearing changes; `[AUTO]` = fully specified, implement directly) → an executed
prompt is DELETED from the file in the same commit as its implementation → when
everything is verified, the file is deleted and one line goes to `docs/done.md`.

**Questions format:** numbered continuously 1..N through the whole file (never
restarting per section), each with lettered options (a/b/c/d…) and a recommendation
WITH reasoning — options with consequences, never rubber-stamp picks. NEVER use the
interactive question picker — always plain text (in the file or chat, same format).
The user answers by number (`1a, 2c`); an answer like `4 something-else` or `4a but …`
means NO listed option was chosen — ask, don't assume.

**Status markers** (lightweight, per task, inside the feature file):
`- [ ]` todo → `- [I]` implemented → `- [V]` user-verified. Per-feature rollup
(`planning`/`ready`/`in-progress`) lives in `docs/PLAN.md`. STRICT rule: pure-logic
work gets vitest coverage and may rest at `[I]`; DOM / keyboard / visual / render
behavior CANNOT be auto-tested (the suite is pure node, no jsdom) — it stays `[I]`
until the USER manually confirms; never mark `[V]` yourself, never treat green tests
as proof of DOM/visual correctness.

**Hard refusal:** never start work on a different feature while the current state is
unsaved. Saved = clean working tree AND docs updated **in the same commit** as the
code (that's what makes `git revert` restore both). Mid-task `WIP:` commits are valid
savepoints. If the user asks to switch with unsaved state — refuse and offer to save
first.

**Dependencies** (in `docs/PLAN.md`): `requires:` = hard — refuse to start until met;
`better-after:` = soft — warn once, the user may override.

**decisions.md discipline:** it changes ONLY when the user clearly changes their mind
and explicitly confirms. Cross-check new decisions against it; if something
contradicts a locked decision, say so loudly before proceeding.

**Doc freshness:** keeping every `docs/` file current is part of every change, not a
separate task. If docs look stale, REMIND the user proactively. English only, in every
repo file.

**Explore before planning:** for non-trivial `[PLAN]` stages, read the actual current
code (Explore subagents welcome) before writing the plan — never trust a prompt's or
doc's assumptions about file/line state.

**Git:** NEVER push unless the user explicitly asks (push deploys to Pages). Code +
its doc updates are one atomic commit. GitHub Desktop must be CLOSED while an agent
works (it once caused a detached-HEAD / lost-edits incident).

## Hard rules (code)

- `src/game/` is a PURE simulation — zero DOM/canvas/`Date.now`, seeded PRNG in
  state, input as an event queue. Game logic never imports outward. This is the seam
  for the future server and it must stay lift-able unmodified.
- All world-render colors live in `src/render/palette.ts`; all UI colors are CSS
  variables in `src/style.css`. Never hardcode a color anywhere else.
- New concerns get their own narrowly-named file/folder (see `docs/architecture.md`
  for the module map) — don't grow unrelated modules.
- Responsive from ~360px up (small screens get a "best with keyboard" note).
- Human-readable, few files, no dead code; keep this CLAUDE.md lean.

## Configurability — default to config, not hardcoded values

This project aims for maximum configurability. When implementing ANY new feature, or
whenever you encounter a hardcoded value while working in existing code, extract it
into the appropriate config layer instead of leaving it inline. Do this proactively —
you don't need to be asked.

**Rules:**
- Name constants explicitly and descriptively (e.g. `ESC_HOLD_EXIT_FIGHT_MS`, not
  `TIMEOUT`), matching the existing naming style.
- Never duplicate a tunable in two places — one source of truth, imported.
- If you spot a hardcoded value while doing unrelated work, extract it and mention it
  in your report (don't silently expand scope beyond that).
- Keep `src/game/` pure: config values are imported into it, never read from
  DOM/localStorage inside it.

## Commands

`npm run dev` (web dev) · `npm test` (vitest, pure core) · `npm run build` ·
`npx tauri dev` / `npx tauri build` (desktop, Tauri v2 in `src-tauri/`) ·
painted maps: `npm run maps:compile` / `maps:export -- <id>` / `maps:palette`
(see `docs/open/map-pipeline.md`; preview tool at `/typingRPG/preview.html` in dev).

## Hosting (must respect — this is what keeps it free)

- **GitHub Pages, public repo, static only.** No server code, no secrets. Everything
  committed is public — including `docs/` planning (a deliberate decision).
- Vite `base` MUST be `/typingRPG/` (already handled in `vite.config.ts`; the Tauri
  build uses `/`). Never hardcode absolute asset paths.
- Deploy via `.github/workflows/deploy.yml` on push to `main` (~1–2 min + ~10 min CDN
  cache — hard-refresh when verifying). Keep the site small.

## Security

Everything in the shipped bundle is public (view-source). **Never commit secrets.**
No backend — saves are local-only. Save-data trust-boundary hardening backlog:
`docs/open/security-hardening.md`.

**⚠ Dev cheat codes (do not remove this requirement):** a hidden GTA-style cheat
system ships in ALL builds (`hesoyam`, `baguvix` — see `docs/cheats.md`); that is a
deliberate single-player decision. Before this game is EVER exposed
online/multiplayer, cheat execution MUST be admin-gated and server-validated — the
`devCheat` event flows through the same `update()` queue a future authoritative
server would run, so the server must reject it from non-admin senders.

## `io_typingRPG/` handoff folder (keep in sync)

`io_typingRPG/` at the repo root is the self-contained bundle for the portfolio hub:
`app.json` (title, description, repoUrl, demoUrl
`https://gyeboorovsky.github.io/typingRPG/`, tags `["game"]`, status, dates) +
`grid-thumbnail.png` (~1200×900; regenerate via `node scripts/thumb.mjs`). Update it
whenever title/description/links/status change. Never edit hub files from this repo —
print a ready-to-paste `grid-config.json` snippet in chat instead.
