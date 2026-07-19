# Architecture — current state (+ target where it differs)

Verified against code at HEAD `689ee28` (2026-07-19). Convention: each area has
**Current**; a **Target** subsection exists only while it differs from Current — once
they converge, the Target subsection is deleted. Long-range proposals live in
`docs/vision/`; locked decisions in `docs/decisions.md`.

---

## Modules

### Current

Layering rule: `src/game/` is a PURE simulation — zero DOM/canvas/`Date.now`, seeded
PRNG in state, input consumed as a plain event queue. Game logic never imports
outward. This purity is the seam for the future server-authoritative version.

Root `src/`:
- `main.ts` — wiring only: canvas/DPR sizing, fixed-timestep loop (60 Hz accumulator),
  char-select + save wiring, options/keymap source of truth, DEV-only `window.__game`
  scripting hook.
- `input.ts` — keyboard → sim event queue. Pure `routeKeydown` router + `Input` DOM
  adapter; combat-modifier tracking; Esc hold-to-exit timer (pure, testable).
- `keybinds.ts` — keybinding config/validation (pure): action registry,
  `DEFAULT_KEYMAP`, combo matching, capture validation, reserved-combo rules,
  `normalizeModifiers` (AltGr folding).
- `keystroke-buffer.ts` — generic FIFO ring buffer of recent lowercased chars.
- `cheats.ts` — pure cheat-code registry (buffer tail → `CheatCode` + numeric prefix).
- `cheat-listener.ts` — passive second `window` keydown observer → `devCheat` events;
  never preventDefaults.

`src/game/` (pure sim): `types.ts` (all shared shapes), `constants.ts` (ALL gameplay
tuning), `sim.ts` (tick/reducer `update()`: events, movement, inventory/equip, cheats,
save serialization + migration), `combat.ts` (per-keystroke combat: AoE ring,
aggro-on-hit, boss, ultimate), `attributes.ts` (stat derivation, memoized
`playerAttributes`, stat-point progression), `classes.ts` (four-class registry),
`mobs.ts` (defs, exp-spot clusters, aggro/chase/leash AI, respawns), `map.ts` (static
48×48 authored map + queries), `items.ts` (item catalog + inventory-grid helpers),
`loot.ts` (seeded drop rolls), `rng.ts` (mulberry32 over state), `words.ts` (per-tier
word pools + prompt generation), `game.test.ts` (130 pure vitest cases).

`src/render/` (Canvas 2D only, programmatic vector shapes, no asset files):
`renderer.ts` (isometric projection/culling/depth-sort, AoE + Esc rings, particles),
`sprites.ts` (shape defs incl. per-class player + mobs + dummy), `terrain.ts`
(offscreen pre-rendered ground, DPR-capped), `palette.ts` (ALL world-render colors —
never hardcode a color outside it; UI colors are CSS vars in `style.css`).

`src/ui/` (DOM HUD only, no game logic): `hud.ts` (bars, prompt + Chill/Warning/Combat
tag, boss bar, toasts, inventory grid with drag + click-to-carry, character window,
death screen), `charselect.ts` (create/delete/switch, class pick), `options.ts`
(keybind rows + capture flow), `windows.ts` (pure Esc-precedence helper).

`src/save/`: `save.ts` (platform-agnostic `SaveManager`: backend selection, per-slot
roster, autosave throttle, unload flush), `backends.ts` (tauri fs / File System
Access / localStorage + IndexedDB kv for the picked-file handle), `settings.ts`
(device-wide keymap persistence).

`src-tauri/` — Tauri v2 desktop shell. `index.html` + `src/style.css` — DOM skeleton +
all UI styling with `:root` design tokens (~50 tokens in 12 groups: surfaces, borders,
text, accent, combat-state markers, resource bars, rarity/status, item tiers, radii,
shadows, fonts, control-bar sizing).

### Target

- New concerns get their own narrowly-named file/folder — never grown onto an
  unrelated module. No speculative server code; the sim's purity IS the multiplayer
  preparation (see `docs/vision/multiplayer-architecture.md`).

## Data model

### Current

- `GameState`: `tick, rng, player, mobs[], drops[], spots[], combat: CombatState|null,
  mode: 'travel'|'fight', fireMode + travelUnlocked (transient), held[], fx[],
  bossKilled, dirty, nextId`. No projectiles.
- `Player`: pos/dir/hp/mp/level/xp, `stats` (STR/VIT/INT/DEX) + `statPoints`,
  `equipment` (slot record), `gold`, `leech` (transient stub, unwired), positioned
  `inventory` grid + `overflow`, `dead`, `godmode` (transient), `ultCooldown`.
- `CombatState`: `prompt, typed, streak, tier, errorFlash, aoe` (live ring radius),
  `idleTime`. No practice flag.
- `Mob`: id/defId/pos/hp/state (`idle|aggro|leash`)/spotIdx/home/shield fields;
  `aggressive?: boolean` lives on **MobDef** (false = pull-only, e.g. training dummy).
- `InputEvent` (14 variants): char, move, setMode, setFireMode, setTravelUnlocked,
  devCheat, ult, respawn, allocateStat, equip, unequip, moveItem, useItem, dropItem.
- `ItemDef`: kind/tier/maxStack, `weapon?{dmgPerChar, range?}`, `consumable?`,
  slot/weaponType/size/reqLevel/itemLevel/reqClass/bonuses, reserved `upgradable?`,
  `upgradeMats?`, `recipe?`.

### Target

- Combat rework will reshape CombatState/Mob (targets, mob.target, attackRange,
  attackShape, per-weapon ring) — under decision in `docs/open/combat-*.md`.
- Reserved `ItemDef` fields feed the future +0→+9 upgrading/crafting
  (`docs/vision/progression.md`).
- Multiplayer needs `ZoneState`/actor-tagged events/per-player combat & RNG streams
  (`docs/vision/multiplayer-architecture.md` §2.2) — deliberately NOT built yet.

## Combat (behavior summary)

### Current

Unified combat mode: combat exists whenever `mode==='fight'` and player alive.
Typing damage per correct char = scaled physical damage; each correct char damages
every mob within the dynamic AoE ring (`aoe`), aggro-pulling hit mobs + pack. Ring:
grows per correct char, capped; idle decay after a delay; % drop on miss — all
config-driven, decoupled from streak. Streak only gates the ultimate (Enter,
threshold + mana; 5s cooldown; all four class ults currently resolve to the same
Whirlwind effect). Prompt completion rewards MP + tier-scaled HP; tier = highest
aggroed mob (never downgrades mid-prompt). Typos damage the player via the aggroed
set (defense + dodge mitigate; godmode guard inside `hurtPlayer`). Boss: 2 shield
phases broken by flawless prompts; enrage at half HP. Chill/Warning/Combat is a
HUD-derived display state.

### Target

Full re-decision in progress — aggro←damage rule, triangle targeting, per-weapon
range, on-miss punishment model, mob attack configs, weapon modes, per-class ults:
`docs/open/combat-*.md` (entry: `combat-rework-scope.md`).

## Save & persistence

### Current

- Backend picked at boot: Tauri → `save-{slot}.json` in
  `%APPDATA%\com.gyeboorovsky.typingrpg\` (per-slot); browser → localStorage
  `typingRPG.save.{slot}` (per-slot baseline) + optional File System Access single
  file (Chromium; handle kept in IndexedDB `typingRPG/kv/save-handle`).
- SaveData v2; v1 migrates on load (flat bag → paged grid, copper_coin → gold).
  Transients excluded: mode, fireMode, travelUnlocked, godmode, leech, combat.
- Autosave: 10s throttle on dirty; immediate on levelup; synchronous localStorage
  flush on tab hide/unload. Settings separate: `typingRPG.settings` (keymap +
  combat-modifier, device-wide).
- ⚠ The whole load path trusts the JSON — hardening backlog in
  `docs/open/security-hardening.md`.

### Target

- Server-side: accounts + Postgres replace local saves for the MMO
  (`docs/vision/multiplayer-architecture.md`); the local backend split stays for the
  offline sandbox.

## Input

### Current

Two modes (travel/fight) with an Alt-only combat-modifier unlock; WSAD default
movement (single slot per direction, rebindable); fight-mode printables always type;
Esc ladder (close topmost window → hold-to-confirm fight exit → open options); fixed
system keys Esc/Enter/Tab; action classes enforced at capture; bindings device-wide in
`typingRPG.settings`. Details locked in `docs/decisions.md`.

### Target

- Typing-combat hit detection needs its own lag compensation for multiplayer
  (keystroke-level latency sensitivity) — `docs/vision/multiplayer-architecture.md`.

## Config surface

### Current

- ALL gameplay numbers in `src/game/constants.ts`, grouped: sim step, world/movement,
  AoE ring + typing combat, Esc hold, ultimate, player/XP, mobs, loot,
  inventory/currency, save. Unwired stubs: `RESPAWN_FULL`, `LEECH_*`,
  `BOW_BASE_CHARS_PER_ARROW`, `ATK_PER_POINT` (see `docs/open/code-hygiene.md`).
- ALL UI colors/design tokens as CSS custom properties in `src/style.css` `:root`;
  world-render colors only in `src/render/palette.ts`.
- Maximum-configurability rule: see CLAUDE.md — new tunables get named constants,
  never inline magic numbers, one source of truth.

### Target

- User-facing options (window opacity, zoom, audio…) per
  `docs/vision/configs.md` as those features land.

## Hosting & deploy

### Current

- GitHub Pages (public repo, static only, no secrets). Vite `base = '/typingRPG/'`
  (web) vs `'/'` (Tauri build via `TAURI_ENV_PLATFORM`). Deploy:
  `.github/workflows/deploy.yml` on push to `main` (npm ci → test → build → Pages);
  ~1–2 min + ~10 min CDN cache. Desktop: Tauri v2 (`npx tauri dev` / `build`).
- Commands: `npm run dev` · `npm test` (vitest, pure core) · `npm run build`.

### Target

- A server (auth, shared world) breaks the free-static model — smallest realistic
  jump: small VM or serverless WebSockets + managed Postgres free tier. A deliberate,
  later decision — must never creep in incidentally
  (`docs/vision/multiplayer-architecture.md`, `platform-strategy.md`).
