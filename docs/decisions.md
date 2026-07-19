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

## Combat rework — decisions locked so far (2026-07-19)

From the user's answers to `docs/open/combat-aggro-targeting.md`:

- **Aggro has exactly TWO paths, nothing else:** (1) damage-aggro — a mob aggroes
  whoever damages it (applies to every mob; every mob retaliates when hit — NO
  pacifist/`retaliates` flag for now); (2) proximity-aggro — only mobs with
  `aggressive: true` self-aggro when the player enters their aggro radius. No aggro
  from ring presence, prompt completion, or walking near non-aggressive mobs.
- **Targeting system is core now** (promoted from `docs/future-target-indicators.md`),
  minimal version: `combat.targets` in state + a simple triangle indicator renderer.
  **Indicator colors must be config-driven and support different colors per state in
  the future** — never hardcoded.
- **Sword shows NO target triangles initially** (it hits everything in the ring). But
  a single "skill target" concept must exist in the design anyway: directed skills
  (coming later) need an indicator showing who the skill would hit — even with a
  sword equipped.
- **Bow target selection: automatic — nearest at acquisition — then PINNED until the
  target dies.** Manual switching via two rebindable combat actions: **switch target
  left = Alt+Q, switch target right = Alt+E** (defaults). To free Alt+Q, the
  **`exitFight` default moves to Alt+X** (decided 2026-07-19; code change lands with
  the targeting stage). NO mouse click-override. Left/right semantics: open question
  in `combat-aggro-targeting.md`.
- **Target recomputation is event-driven only** (target death, target left range,
  mode/weapon change, manual switch) — never per-frame; implementation kept
  configurable/open to future modification (design delegated to Claude Code, user
  approved the direction).
- **Target dies mid-word → indicator jumps to the next target, the prompt does NOT
  reset.**
- **Max simultaneous targets** resolved by one function
  `resolveMaxTargets(weapon, mode, passives)` — today returns a weapon/mode config
  constant; passives plug in later in that one place.
- **Candidate ordering:** each mode defines a sort function; take the first
  `maxTargets` (design delegated to Claude Code, user approved).

From the user's answers to `combat-ring-range.md` (all 9 answered 2026-07-19 — file
removed):

- **One range model for every weapon:** per-weapon `attackRange` (replaces "aoe"
  naming) with config rates `growth` / `decay` / `dropOnMiss`. The bow is simply a
  weapon with zero rates (static range) — no branching in code.
- **The ring is always drawn**; static ranges (bow) at lower alpha — configurable.
- **Ring growth is driven by an EXTENSIBLE per-source config** (user request): a rate
  per source, `0` = disabled — e.g. `onHit` (correct char that actually hit someone),
  `onCorrectType` (any correct char), `whileMoving`, `whileStationary`, … so any
  future idea is a config entry, not a code change. **Defaults: only `onHit` > 0** —
  typing into the air does not pump the ring, and skill-slot letters never do by
  default.
- **Idle decay:** starts after ~2.5–3 s without typing (not the originally planned
  1 s), then a slow decay — tuning constants.
- **Typo cuts the ring by 25%** as a starting value — flagged for live re-tuning:
  combined with the new on-miss volley model the total punishment may be too harsh,
  and the user explicitly does not want it too severe.
- **The ring survives clearing a pack** (subject only to decay) — you enter the next
  pack with earned range.
- **`attackRange` lives OUTSIDE the `combat` object** — per-weapon state on the
  player — so it survives leaving fight mode; only its own decay applies.
- **Weapon switch keeps per-weapon ranges:** each weapon retains its own
  `attackRange`, decaying in the background while unequipped; no reset on switch.

## Areas under re-decision (do not treat the above as final there)

The combat rework (`docs/open/combat-*.md`) is re-deciding: aggro rules, targeting
(triangles), ring semantics and placement, streak's purpose, the typo-punishment model
(on-miss instead of self-damage), mob configs (attack range/shapes/periods), weapon
styles and modes, skill-slot integration, and the ultimate. Until those questions are
answered and implemented, the Combat section above describes the current baseline
only.
