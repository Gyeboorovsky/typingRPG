# Typing RPG — isometric RPG where you fight by typing

## What this repo is

A standalone hobby game that appears as one **tile** on the Gyeboorovsky
portfolio hub (https://gyeboorovsky.github.io/). The hub is a separate repo
(`Gyeboorovsky/Gyeboorovsky.github.io`) that renders a grid of tiles from a
JSON config — it does **not** import or build this app. Apps are fully
independent; the hub just links to this app's live URL with a plain `<a href>`.

This repo owns everything about the app. It has no dependency on the hub.

## Long-term vision

The end goal is a **massively multiplayer online RPG** in the spirit of
Metin2 — but the current version is a single-player, local-save prototype.
Every architectural choice should keep that door open without paying its
cost now:

- **Cheap to host**: static-first as long as possible; if/when a server is
  needed (auth, shared world state), favor the smallest/cheapest option
  (serverless functions, a single small VM, managed DB free tier) over
  anything requiring dedicated ops.
- **Cheap to develop with AI**: small, well-named modules with narrow
  responsibilities are easier for an LLM to load into context and edit
  correctly — prefer that over clever abstractions that save lines but cost
  comprehension.
- **Easy for humans to maintain**: no framework magic, no hidden state,
  README-able folder structure — a human should be able to find "where does
  X happen" by folder name alone.
- **Build the basic version first.** Don't add multiplayer/server code
  speculatively — just keep `src/game/` pure (see Architecture) so it *can*
  later run authoritatively on a server without a rewrite.

See "Multiplayer readiness" below for the concrete gaps between this
prototype and that end goal.

## The game

Isometric vector-graphics action RPG (Tibia-like view, Metin2-like mechanics).
Arrow keys move the hero tile-to-tile; **combat is typing**: each correctly
typed character damages all aggroed mobs within a radius that grows with your
correct-typing streak; each typo damages YOU (harder mobs hit harder). Streak
≥ 30 + enough mana unlocks the class ultimate (Enter). Mobs spawn in Metin2
exp-spot clusters, drop materials/gear; one boss (Typhon) with flawless-typing
shield phases. Progress autosaves to a real file on disk.

- **Architecture — module map** (keep each folder's job narrow; a change to
  one concern should touch one folder):
  - `src/game/` — PURE simulation, zero DOM/canvas/`Date.now`, seeded PRNG
    lives in state, input consumed as a plain event queue. This is the seam
    for the future server-authoritative/multiplayer version, so it must stay
    swappable onto a server unmodified. Split further by concern, not by
    convenience: `sim.ts` (tick/reducer), `combat.ts` (typing↔damage rules),
    `types.ts` (shared state shapes), `constants.ts` (tuning, see below),
    `classes.ts`, `items.ts`, `loot.ts`, `map.ts`, `mobs.ts`, `words.ts`,
    `rng.ts`.
  - `src/render/` — Canvas 2D drawing only, programmatic vector shapes, no
    asset files. `renderer.ts` (draw loop), `sprites.ts` (shape defs),
    `palette.ts` (all world-render colors — never hardcode a color outside
    this file).
  - `src/ui/` — DOM HUD only (`hud.ts`); no game logic, no canvas drawing.
  - `src/save/` — persistence only. `save.ts` is the platform-agnostic API;
    `backends.ts` picks Tauri fs / File System Access / localStorage at
    runtime. New platforms add a backend here, not branches elsewhere.
  - `src/input.ts` — raw keyboard → event queue for `src/game/`; no game
    rules here.
  - `src/main.ts` — wiring only (construct state, start loop, connect
    render/ui/save); if it grows logic, that logic belongs in one of the
    folders above instead.
  - When a new concern doesn't fit an existing folder, give it its own file
    (or subfolder) named for what it does rather than growing an unrelated
    module.
- **Targets**: web (GitHub Pages) and desktop (Tauri v2 in `src-tauri/`). Save
  backend picked at runtime: Tauri fs plugin → `%APPDATA%\com.gyeboorovsky.typingrpg\save.json`;
  browser → localStorage baseline + File System Access API (Chromium).
- **Tuning**: all gameplay numbers live in `src/game/constants.ts`.
- **Commands**: `npm run dev` (web dev), `npm test` (vitest, pure core),
  `npm run build`, `npx tauri dev` / `npx tauri build` (desktop).

## Metin2 inspiration (roadmap — not built yet)

Mechanics, maps, and professions should draw from Metin2's model rather than
be invented from scratch. Nothing below exists in code yet; land the basic
single-player version first (see Long-term vision).

- **Classes**: `classes.ts` defines Warrior, Ninja, Wizard, Priest; only Warrior
  is playable so far (selection UI is a future feature).
- **Stat points**: `Player` gains an allocatable stat point every **25% of
  the XP needed for the next level** (4 points per level), spent on
  Metin2-style attributes — **STR, VIT, INT, DEX** — each nudging derived
  stats (STR→attack, VIT→HP/defense, INT→mana/magic power, DEX→attack
  speed/typing radius or crit, tbd per class). Fields go on `Player` in
  `src/game/types.ts`; the XP-fraction check lives next to the existing
  level-up logic in `sim.ts`, threshold derived from `XP_CURVE` in
  `constants.ts`.
- **Item upgrading** +0→+9 and crafting (fields already reserved on
  `ItemDef`), merchants/NPC shops.
- **Maps**: more Metin2-style zones beyond the current one — exp-spot mob
  clusters, tiered zones gated by level, a dungeon-style instance for the
  boss (or bosses).
- **Multiplayer**: shared world, other players visible, per the Long-term
  vision above — the reason `src/game/` must stay a pure, server-portable
  simulation.

## Multiplayer readiness (not built yet)

The gap between this single-player prototype and the MMO end goal, so future
sessions don't have to rediscover it. Nothing below exists in code yet —
documentation only, no server code should land speculatively.

- **Authoritative server**: `src/game/sim.ts` is meant to be lifted onto a
  Node/Bun process unmodified and run as the server tick, receiving player
  inputs over WebSocket and broadcasting state deltas to clients. This is
  *why* `src/game/` must stay pure (no DOM/canvas/`Date.now`, seeded RNG in
  state, event-queue input) — that purity is what makes this lift possible
  without a rewrite. This is the payoff the architecture has been paying for.
- **Networking**: a WebSocket layer, snapshot/delta compression so clients
  aren't sent full state every tick, and client-side interpolation for
  rendering other players smoothly between server updates. Typing-combat hit
  detection needs its own lag compensation — unlike turn-based or
  tick-based combat, typing is latency-sensitive at the keystroke level, so
  naive "wait for server ack" input handling will feel bad.
- **Persistence**: move off local file/localStorage (see `src/save/`) onto a
  real database — Postgres, or SQLite behind the server process — for
  accounts, inventories, and shared world state. The current `src/save/`
  backend split (Tauri fs / File System Access / localStorage) is a
  single-player concern and doesn't carry over to server-side persistence.
- **Auth**: none exists yet. Minimum viable: email/password or OAuth, plus
  session tokens for the WebSocket connection.
- **Anti-cheat**: the client currently trusts itself entirely (it computes
  its own damage and reports it). Typing-speed combat is trivially bottable
  client-side, so the server must independently validate input timing/rate
  and compute damage itself — never just accept client-reported outcomes.
- **Hosting**: GitHub Pages (static, free) stops being sufficient once a
  persistent server is needed — see "Hosting" below, which only covers the
  static client. The smallest realistic jump is a small VM (~$5–6/mo) or a
  serverless WebSocket platform (Cloudflare Durable Objects, Fly.io) plus a
  managed Postgres free tier. This breaks the "cheap to host" constraint in
  Long-term vision and should be a deliberate, later decision — not
  something that creeps in incidentally while building a feature.
- **World scaling**: Metin2-style shared zones need spatial partitioning /
  interest management (only sending players updates about nearby entities)
  once player count per zone is non-trivial, or every client gets flooded
  with irrelevant updates from the whole map.

## FIRST-RUN TASK — keep the `io_typingRPG/` handoff folder

**Ensure a folder named `io_typingRPG/` exists at the repo root.** It's the
self-contained bundle the portfolio hub needs; the hub owner drops it into the
hub's `APPS/` folder. Keep it in sync whenever title/description/links/status
change. It contains exactly two things:

- **`app.json`** — content metadata, strict JSON (no comments): title,
  description, repoUrl `https://github.com/Gyeboorovsky/typingRPG`, demoUrl
  `https://gyeboorovsky.github.io/typingRPG/`, tags `["game"]`, status
  `live|wip|archived`, added date, year, role.
- **`grid-thumbnail.png`** — ~1200×900 cover image matching the game's bold
  character; regenerate via `node scripts/thumb.mjs` (SVG → PNG).

## Hosting (must respect — this is what keeps it free)

- **GitHub Pages, public repo, static only.** No server code, no secrets.
- **Base path**: deploys to `https://gyeboorovsky.github.io/typingRPG/`, so Vite
  `base` MUST be `/typingRPG/` (already handled in `vite.config.ts`; the Tauri
  build uses `/` via `TAURI_ENV_PLATFORM`). Never hardcode absolute asset paths.
- **Deploy** via `.github/workflows/deploy.yml` on push to `main`. Deploys take
  ~1–2 min; the CDN caches ~10 min, so hard-refresh when verifying.
- Keep it small: site < 1 GB, ~100 GB/month bandwidth (soft caps).

## Security

Everything in the shipped bundle is public (view-source). **Never commit
secrets.** This app uses no backend — saves are local-only.

## ⚠️ Dev cheat codes — MUST be admin-gated before multiplayer

There is a hidden, GTA-style keyboard cheat system (type `hesoyam` to set level —
optional numeric prefix like `50hesoyam`, bare = max level `MAX_LEVEL`; type
`baguvix` to toggle godmode). It is a passive keyboard observer that recognizes
codes and pushes a `devCheat` `InputEvent` through the normal `update()` reducer.
Every cheat affects only the local player's own state.

- **Code lives in**: `src/keystroke-buffer.ts` (generic ring buffer),
  `src/cheats.ts` (the pure, editable code registry + `recognize()`),
  `src/cheat-listener.ts` (the passive `window` keydown listener, wired in
  `src/main.ts`), and the effect logic in `src/game/sim.ts` (`applyCheat` /
  `setLevel`) with the godmode guard in `src/game/combat.ts` (`hurtPlayer`).
  Full reference: `docs/cheats.md`.

- **THE REQUIREMENT (do not remove):** before this game is ever exposed
  online/multiplayer in any form, cheat-code execution MUST be restricted to
  authenticated admin users and MUST be validated server-side. The current
  implementation is a local, single-player, fully-trusted-client dev tool with
  zero authorization and is **NOT safe to ship as-is**. The `devCheat` event
  flows through the same pure `update()` queue that a future authoritative
  server would run (see "Multiplayer readiness" › Anti-cheat) — that server must
  reject `devCheat` events from non-admin senders.

## Design / code style

All UI colors are CSS variables in `src/style.css`; world-render colors live in
`src/render/palette.ts` — never hardcode a color elsewhere. Responsive from
~360px up (small screens get a "best with keyboard" note). Human-readable, few
files, no dead code; keep this CLAUDE.md lean.

## How this app shows up on the hub

Content → `io_typingRPG/` (above). Presentation → one entry in the hub's
`grid-config.json`, added by the hub owner. Do not edit hub files from this
repo; when something changes, print a fresh ready-to-paste snippet in chat.

## Orchestration folder — do not commit

`orchestration/` and `.claude/skills/gp/` are a local agent-coordination
layer (prompts, state handoffs, decision log, the `/gp` skill) that must
NEVER be committed or pushed — they're gitignored, future sessions must not
`git add` them or remove them from `.gitignore`, and their absence from the
repo is correct.
