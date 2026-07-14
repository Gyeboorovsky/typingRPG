# Typing RPG — isometric RPG where you fight by typing

## What this repo is

A standalone hobby game that appears as one **tile** on the Gyeboorovsky
portfolio hub (https://gyeboorovsky.github.io/). The hub is a separate repo
(`Gyeboorovsky/Gyeboorovsky.github.io`) that renders a grid of tiles from a
JSON config — it does **not** import or build this app. Apps are fully
independent; the hub just links to this app's live URL with a plain `<a href>`.

This repo owns everything about the app. It has no dependency on the hub.

## The game

Isometric vector-graphics action RPG (Tibia-like view, Metin2-like mechanics).
Arrow keys move the hero tile-to-tile; **combat is typing**: each correctly
typed character damages all aggroed mobs within a radius that grows with your
correct-typing streak; each typo damages YOU (harder mobs hit harder). Streak
≥ 30 + enough mana unlocks the class ultimate (Enter). Mobs spawn in Metin2
exp-spot clusters, drop materials/gear; one boss (Typhon) with flawless-typing
shield phases. Progress autosaves to a real file on disk.

- **Architecture**: `src/game/` is PURE simulation (no DOM/canvas/Date.now, seeded
  PRNG in state, input as plain event queue) — keep it that way; it is the seam
  for the future online/multiplayer version. `src/render/` (Canvas 2D, programmatic
  vector shapes, no assets), `src/ui/` (DOM HUD), `src/save/` (backend per platform).
- **Targets**: web (GitHub Pages) and desktop (Tauri v2 in `src-tauri/`). Save
  backend picked at runtime: Tauri fs plugin → `%APPDATA%\com.gyeboorovsky.typingrpg\save.json`;
  browser → localStorage baseline + File System Access API (Chromium).
- **Tuning**: all gameplay numbers live in `src/game/constants.ts`.
- **Roadmap seams (not built yet)**: 3 more classes in `classes.ts` (ninja/sura/shaman),
  item upgrading +0→+9 / crafting (fields already on `ItemDef`), merchants,
  more maps, dungeon instances, multiplayer.
- **Commands**: `npm run dev` (web dev), `npm test` (vitest, pure core),
  `npm run build`, `npx tauri dev` / `npx tauri build` (desktop).

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

## Design / code style

All UI colors are CSS variables in `src/style.css`; world-render colors live in
`src/render/palette.ts` — never hardcode a color elsewhere. Responsive from
~360px up (small screens get a "best with keyboard" note). Human-readable, few
files, no dead code; keep this CLAUDE.md lean.

## How this app shows up on the hub

Content → `io_typingRPG/` (above). Presentation → one entry in the hub's
`grid-config.json`, added by the hub owner. Do not edit hub files from this
repo; when something changes, print a fresh ready-to-paste snippet in chat.
