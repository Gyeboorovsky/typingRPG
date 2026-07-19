# Decisions — the project's source of truth

> Locked design decisions live here. **This file changes ONLY when the user clearly
> changes their mind and explicitly confirms it** — never speculatively, never as a
> side effect. When code and this file disagree, that's a bug in one of them: flag it
> loudly instead of silently "fixing" either side. Status/progress does NOT live here —
> see `docs/PLAN.md`. Architecture description lives in `docs/architecture.md`.

Facts verified against code at HEAD `689ee28` (2026-07-19).

---

## Controls / input

- **Movement default = WSAD** (`KeyW/A/S/D`); arrows are freely rebindable but unbound
  by default. ONE key slot per direction. Movement is continuous (not tile-to-tile).
- **Control modes are explicit:** `GameState.mode: 'travel' | 'fight'`, manual entry
  (Space / digits) and manual exit; mode is fully decoupled from aggro (a mob attacking
  you does NOT force you into a typing prompt).
- **Fight-mode key reservation:** while in fight, unmodified printable keys (a–z, 0–9,
  Shift-combos, Space) ALWAYS resolve as typed combat input — UNLESS the
  combat-modifier is held. A hard invariant.
- **Combat-modifier = Alt only** (for now). Held, it temporarily unlocks ALL travel
  actions (movement, inventory, character) without leaving fight, live-derived
  (releasing re-locks the same tick). Alt+WSAD movement works in BOTH modes
  (`ed5b911`), and other Alt combos are swallowed so the browser can't steal them
  (Alt+D address bar). **Ctrl is intentionally removed as a selectable option**
  (browsers steal Ctrl+W/T/N…); the router still fully supports Ctrl end-to-end —
  re-enabling on the Tauri desktop build is a one-line change
  (`SELECTABLE_COMBAT_MODIFIERS` in `keybinds.ts`). Right Alt / AltGr normalizes to
  plain Alt. (⚠ AltGr vs Polish typists is an open question —
  `docs/open/accessibility.md` #1.)
- **Two action classes:** travel actions (fire in travel, or in fight only while the
  combat-modifier is held) and combat actions (exit fight, fire modes — fight-only,
  never bound to plain letters/digits). Enforced at bind-capture time.
- **Backspace** = typo-correction feel; NOT bindable, effectively inert in fight (the
  typing model is streak-forward-only — a wrong char is punished instantly, never
  buffered; there is nothing to erase).
- **Tab** = hardcoded inventory toggle in both modes (fixed system key,
  non-rebindable); inventory also has a rebindable slot (`I`).

## Esc ladder (fixed system key, non-rebindable)

Checked in order:
1. Any window open → close the topmost. **Options is ALWAYS topmost** (visually AND in
   close-priority); after options, plain LIFO. Windows are NOT mutually exclusive.
   Fires only on a FRESH keydown (`!e.repeat`) — holding Esc never machine-guns closes.
2. No window + fight → **hold-to-confirm exit** (~1s = `ESC_HOLD_EXIT_FIGHT_MS`, red
   ring filling around the player; releasing early cancels). A window-closing keydown
   does NOT roll into a hold.
3. No window + travel → open options (fresh press only).
- Options is also openable via the always-visible gear icon (any mode).

## Keybinding system

- **Single global binding set**, device-wide, shared by every character; NO
  per-character override. Stored OUTSIDE character saves
  (`localStorage['typingRPG.settings']`), no SaveData version coupling.
- Rebind capture hard-blocks conflicts (no two actions share a key) and
  browser-reserved combos (Ctrl+W/T/N/Q…, Alt+F4/arrows).
- Restore-defaults resets the one global set. No scope selector.

## Combat (current locked baseline — large parts UNDER RE-DECISION, see below)

- **Unified combat mode** (`826653f`, 2026-07-19): combat exists whenever
  `mode === 'fight'` and the player is alive — one persistent combat object. The
  Chill/Warning/Combat framing is a HUD-derived display state (CSS vars
  `--chill-marker/--warning-marker/--combat-marker`), not sim state.
  **This superseded the earlier Group-B "practice mode" design**: there is no
  `practice` flag, no auto-exit, no `nearestPullTarget`, no `--practice-marker` in the
  current code.
- **Dynamic AoE ring**: driven by typing + config (`AOE_MIN/MAX`, growth per correct
  char, idle decay after a delay, % drop on miss) — decoupled from streak. Each
  correct char damages every mob within the ring and aggro-pulls hit mobs (+ pack).
- **Streak** currently only gates the ultimate (threshold + mana → Enter). ⚠ Streak's
  role and the whole targeting/aggro/damage model are being re-decided in
  `docs/open/combat-*.md`; the ultimate is slated for a per-class rebuild.
- **Prompt completion** rewards MP (`PROMPT_MP_REWARD`) and HP
  (tier × `PROMPT_HP_REWARD_PER_TIER`), in all fights. Word tier = highest aggroed
  mob's tier (never downgrades mid-prompt), else `CHILL_FALLBACK_TIER`.
- **Non-aggression = `aggressive: false` flag on MobDef** (NOT `aggroRadius: 0`);
  `aggroRadius` doubles as the pull range. Permanent training dummy in `MOBS`: tier 1,
  no XP, no loot, never self-aggroes.
- **Boss (Typhon)**: shield phases at HP fractions (flawless prompt breaks), enrage
  below half HP (typo damage ×1.5).

## Cheat codes (dev tool, GTA-style, invisible)

- Two-layer: pure input-agnostic registry (`src/cheats.ts`) + passive keyboard listener
  (`src/cheat-listener.ts`, second window listener, never preventDefaults). Effects
  flow through the normal `devCheat` InputEvent → `update()` reducer. A future
  console/chat frontend can call the registry directly.
- Reusable FIFO keystroke ring buffer (cap 20, lowercase-normalized, no timing) —
  `src/keystroke-buffer.ts`, a generic primitive.
- Codes: `hesoyam` = set level to MAX; `[N]hesoyam` (digit PREFIX) = set level to N
  clamped [1, MAX]; `0hesoyam` → level 1; `baguvix` = toggle godmode. Level-set REUSES
  the real stat-point-grant logic (`recomputeStatPoints`) — never a parallel formula.
  De-leveling below spent points triggers a full respec. `hesoyam` also revives.
- **`MAX_LEVEL = 120`** (Metin2's cap), cheat-clamp only; natural leveling stays
  unbounded. (May become 99 later — one-constant change.)
- godmode guard sits INSIDE `hurtPlayer` (after the rng-consuming mitigation argument)
  so loot RNG stays seed-deterministic. godmode is transient (not saved).
- **Runs in ALL builds** (public site included) — deliberate: single-player, so a
  stranger typing a code only affects their own local save. A chosen product decision,
  NOT a security oversight.
- **⚠ ADMIN-GATING REQUIRED BEFORE MULTIPLAYER** — before the game is ever
  online/multiplayer, cheat execution MUST be admin-only and server-validated. The
  `devCheat` event flows through the same `update()` queue a future authoritative
  server would run — that server must reject `devCheat` from non-admin senders. Full
  reference: `docs/cheats.md`.

## Save format

- SaveData **v2** (positioned 10-wide inventory grid — 3 pages × 6 rows = 180 cells —
  equipment, gold, overflow); v1 saves migrate on load (flat bag re-placed row-major,
  copper_coin → gold). Transient fields (mode, fireMode, travelUnlocked, godmode,
  leech, combat state) are NOT persisted.
- Backends: Tauri fs (`save-{slot}.json` in AppData, per-slot) / File System Access
  (Chromium, single user-picked file) / localStorage (`typingRPG.save.{slot}`,
  per-slot). Settings live separately (`typingRPG.settings`).

## Data model foundations

- Attributes STR/VIT/INT/DEX with derived stats incl. `attackSpeed` (DEX-derived;
  ninja fastest); 4 stat points per level (every 25% of the XP to next level).
- All four classes (warrior/ninja/wizard/priest) are selectable at character creation.
  All four ults currently resolve to the same Whirlwind effect (per-class ults are a
  stubbed seam — part of the planned ult rebuild).
- Equipment slots, weapon types, sizable items (grid footprint), item levels,
  req level/class, flat bonuses, gold currency.
- `Player.leech` + `LEECH_*` constants exist as UNWIRED stubs (dead until a leech
  stage lands — see `docs/open/code-hygiene.md`).
- Test suite: 130 pure vitest cases (`src/game/game.test.ts`), no jsdom — DOM/visual
  behavior is NOT auto-testable and always needs a manual `[V]` check.

## Areas under re-decision (do not treat the above as final there)

The combat rework (`docs/open/combat-*.md`) is re-deciding: aggro rules, targeting
(triangles), ring semantics and placement, streak's purpose, the typo-punishment model
(on-miss instead of self-damage), mob configs (attack range/shapes/periods), weapon
styles and modes, skill-slot integration, and the ultimate. Until those questions are
answered and implemented, the Combat section above describes the current baseline
only.
