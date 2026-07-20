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
  target dies.** Manual switching via FOUR rebindable combat actions (defaults):
  **left/right = Alt+Q / Alt+E**, **up/down = Alt+R / Alt+F**. Semantics:
  **screen-axis cyclic** — candidates sorted by screen X (Q/E) or screen Y (R/F);
  each press steps to the neighbor along that axis, wrapping at the edges, so every
  target is always reachable. To free Alt+Q, the **`exitFight` default moves to
  Alt+X** (code change lands with the targeting stage). Browser Alt+E/Alt+F menu
  shortcuts are swallowed by the existing fight-mode Alt-combo handling (same
  mechanism as Alt+D, `ed5b911`). NO mouse click-override.
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
  player — persisting across pack clears and weapon switches WITHIN a fight session;
  only its own decay applies while fighting.
- **Weapon switch keeps per-weapon ranges** (within a fight): each weapon retains its
  own `attackRange`, decaying in the background while unequipped; no reset on switch.
- **Explicit fight exit resets ALL in-combat meters (conflict resolved 2026-07-19):**
  leaving fight mode — the `exitFight` action (Alt+X), the Esc hold-to-confirm, or
  death — resets the streak, every weapon's `attackRange`, and any future
  combat-grown meter to baseline. While you STAY in fight mode, everything persists
  as decided above.

From the user's answers to `combat-streak.md` (all answered 2026-07-19 — file
removed):

- **When the streak grows is a CONFIG choice:** `onAttempt` (a correct char triggered
  at least one attack attempt — blocks/evades still count) vs `onHit` (only when
  damage actually landed). **Default: `onAttempt`.** One config entry flips it.
- **No target → the streak FREEZES** (it never hard-resets just because the field is
  empty). Additionally an **idle time decay** (config: delay + rate) shrinks it when
  nothing is typed for a while. A typo resets it to zero.
- **Terminology + display (user's naming): `miss`** = the player typed a wrong
  letter; **`block`** = the mob defended the attack (no damage, no penalty). `block`
  is shown as floating text over the mob, in the same spot damage numbers appear.
- **The streak deliberately has NO consumer for now** (user choice): a bare counter
  awaiting a future role. The current ultimate keeps consuming it (streak ≥
  threshold) until the planned per-class ult rebuild. Tests must not invent gameplay
  effects for it.

Skill slots — flow locked 2026-07-19 (NOT implemented yet; recorded for the future
stage):

- **Modal skill flow:** press a skill-slot key → the prompt window switches to that
  skill's loading prompt → typing there charges the skill → pressing the slot key
  AGAIN activates it (consumes mana; starts its cooldown if any) → the window
  returns to the normal combat prompt.
- **Typing in the skill window counts exactly like normal prompt typing** for
  streak/combo and related meters. (Ring growth still follows the per-source growth
  config — with only `onHit` enabled by default, skill typing doesn't pump the ring,
  because it hits nobody.)
- This **supersedes the older inline-slot model** ("a letter of a dimmed slot = a
  typo") — those questions were dropped as obsolete.

From the user's answers to `combat-damage-dot.md` (all 13 answered 2026-07-19 — file
removed):

- **A typo triggers an on-miss attack from every mob that has the player inside its
  own attack range** (not from everything aggroed). A typo in an empty field is free.
  The abstract typo self-damage is REMOVED.
- **Mob attack-range visualization:** faint, highly transparent rings drawn around
  mobs showing their attack range; radius/appearance from each mob's config
  (placeholder values fine for now).
- **Mob timed attacks: TWO configurable periodic attacks per mob** — physical and
  magical (period + damage each; either may be absent). The earlier "third period"
  idea is dropped. **On-miss = a special attack** (e.g. ranged mobs fire an arrow =
  physical, or a magic bolt) — placeholder now, refined later.
- **Jitter** (delegated): random per-mob phase offset at aggro for periodic attacks +
  random 50–200 ms delay on each on-miss — so volleys never land in one frame.
- **Per-mob on-miss cooldown** (config per mob). Not tuned for perfection now — built
  to be easy to change. Subsequent typos inside the jitter window are absorbed by the
  cooldown (delegated).
- **`attackRange` is independent of `aggroRadius`; ranged mobs approach only to
  their attack range** (Metin2 archers). One pack may mix melee and ranged mobs.
  Details delegated; refine later.
- **Defense: percentage formula** `dmg * k/(k+def)` with a config constant
  (delegated). **Dodge:** derived from the defense/attack relation for now, config
  room reserved for a separate `evasion` stat; any mob may have some dodge
  (delegated).
- **DoT = periodic blows**, not a continuous trickle (a rare trickle mob possible
  later).
- **Mob attacks run in real time, independent of typing** — standing idle in a pack
  kills you; a slow typist is genuinely punished. Deliberate.
- **On player death, all scheduled attacks against them are cancelled** (no
  post-respawn ghost volleys).
- **ALL player damage flows through `hurtPlayer`** — one choke point (godmode keeps
  working, RNG stays deterministic).
- **Damage display: each attack shows its own floating number** (NO visual
  aggregation for now — refine later); `block` appears as floating text in the same
  spot.

Delegated decisions adopted by Claude Code (user mandate 2026-07-19: "implement it
as you understand it, make the remaining calls yourself" — from
`combat-mob-attacks.md` and `combat-weapons-modes.md`, files removed):

- **Explicit `mob.target` field now** (always the player in single-player) — one
  field today, saves rewriting the damage path for multiplayer.
- **`attackShape: 'single' | 'aoe' | 'projectileAoe'` as mob-config DATA now; only
  `single` implemented.** No flight-time projectiles (attacks resolve instantly with
  range); dodging = leaving range before the blow, no real-time dodge mechanics.
  Mob target-choice rules for multiplayer NOT decided now. Aggro rules independent
  of `attackShape` (aggro ← damage stands regardless of who a mob hits).
- **Weapon modes:** switching modes mid-fight recomputes targets but never resets
  ring/streak/prompt. Range config per weapon with an optional per-mode override.
  **Sword mode-set design DEFERRED** — the sword keeps its single current behavior
  until modes are designed. Wand/grimoire deferred; the targeting system will be
  built hostile+friendly-capable from day one (grimoire heals need green targets).
- **ONE targeting system for everything** — weapons, skills, healing (from
  `combat-skill-slots.md`; skill slots themselves remain a future stage).

**Stage split (adopted 2026-07-19)** — working file `docs/open/combat-rework-scope.md`:
Stage A: mob damage model + aggro rework (first). Stage B: ring & streak dynamics +
exit-reset + exitFight→Alt+X. Stage C: targeting system (lands together with the
bow). Stage D: weapon styles (bow first). Skill slots after. Ult: minimal
keep-it-compiling patch only (temporary, per-class rebuild later).

## Second map & portals — experiment, all decisions delegated (2026-07-19)

User mandate: "build a much bigger second map with a portal behind the boss; decide
everything yourself; I'll review live and revert if I dislike it." Delegated
decisions taken (revertible as one commit):

- **Maps are data:** `MapDef` (terrain/blocked grids, props, spawn, spots, portals)
  in `src/game/map.ts`; `GameState.mapId` + `SaveData.mapId` (optional — old saves
  land on the meadow). Map queries are map-explicit (no hidden current-map global).
- **Map 1 "Whispering Meadow"** = the original 48×48, feature-identical. **Map 2
  "The Elderwood"** = 152×152 (~10× the area), generated deterministically at load
  (fixed local seed, never touches game RNG): moss clearings joined by tree-walled
  corridors, a sinus river with three sand bridges, a lake, and the Rootfather's
  basin at the far north. A flood-fill unit test guarantees every spot/portal is
  reachable from spawn on every map.
- **Portals:** walk-up, 3 s channel (`PORTAL_CHANNEL_SECONDS`), leaving the 1.3-tile
  radius cancels; completing teleports, exits any fight (meters reset), and
  REPOPULATES the destination map (visits are ephemeral — only player + mapId
  persist; a future server owns zones instead). The meadow portal sits BEHIND
  Typhon's arena, inside his aggro radius — a guarded portal, by design. Arrivals
  land beside the twin portal (outside its trigger) so you never bounce straight
  back.
- **Death respawns at the CURRENT map's spawn** (each map has a safe glade).
- **New mobs** (Elderwood natives, reuse the Stage-A damage model): Elderwood Wolf
  (fast pack melee), Sporeling (docile, pull-only), Thornspitter (ranged magical),
  Gnarled Treant (armored tank), **The Rootfather** (tier-4 boss, shield phases like
  Typhon). New materials: wolf_pelt, spore_dust, ancient_bark, rootfather_heart.
- **Chunked terrain rendering** (`src/render/terrain.ts`): the ground pre-render is
  split into 24-tile chunks built lazily on first visibility, LRU-capped at 16 —
  ground cost is now independent of map size (measured ~1.4 ms/frame on the 152×152
  map). Portal swirl + teal channel arc around the player; camera snaps on map
  switch.

## World expansion — three open-world maps (experiment round 2, 2026-07-19)

User feedback on the Elderwood: too dense — Metin2 philosophy wanted (MOST of the map
is open hunting ground with many BIG spots; forests/ridges are only boundaries you
route around) + scroll stutter. Delegated decisions:

- **One parametric generator** (`buildOpenWorld(cfg)`) + a reusable structure library
  (border, ridge chains with passes, forest patches, oval lakes, sinus rivers with
  bridges, boss arenas, cleared roads, scatter) — mobs and structures are fully
  map-independent. A unit test asserts every open world is **>80% walkable**.
- **Three new maps**, edge 5×/10×/20× the Elderwood's 152 (user's spec):
  `Sunfall Steppes` 760² (grass/sand, entry tier), `Ashen Highlands` 1520² (ash/moss,
  golems + cultists), `Frostreach Frontier` 3040² (snow, wolf packs, both bosses —
  Typhon AND the Rootfather in far-north arenas). New reusable mob: **Stone Golem**
  (def 30 tank). New terrains: ash + snow.
- **Portal chain**: meadow → elderwood → steppes → highlands → frontier, every onward
  portal boss-guarded or far-field; return portals by each arrival. The Elderwood
  gained an onward portal behind the Rootfather. (The Elderwood itself otherwise
  untouched, per the user.)
- **Maps build LAZILY on first access** (~50 ms even for the 3040² map) — boot cost
  unchanged. Generator computes a reachability flood and places spots ONLY on tiles
  reachable from spawn; roads guarantee spawn→portal/arena corridors structurally.
- **Renderer scaling** (the stutter fix): chunk builds prefetch one ring beyond the
  view at 1 background build/frame (visible builds immediate); chunk lookup is
  O(visible) via inverse projection; props/water are bucketed (`WorldIndex`, 32-tile
  buckets) so per-frame iteration is O(visible), not O(map); water tiles precomputed
  at map build. Measured on the 3040² map: median 0.1 ms, p95 0.5 ms, zero >16 ms
  frames at 3× sprint speed; ~300 mobs sim tick 0.25 ms.

## Painted maps — the map-making pipeline (locked 2026-07-20)

User's design, refined together; implementation delegated:

- **Maps are painted in MS Paint: 1 pixel = 1 tile**, image size = map size, any
  shape — **RGB(0,0,0) = void** (rendered black, absolutely impassable → dungeons).
  Painting space is the flat top-down grid; the renderer supplies the isometric view
  (no data rotation). **PNG only** (lossless); JPG rejected (lossy re-encoding breaks
  exact color matching).
- **Layers as separate files, one folder per map** — `paintings/<id>/` holding
  `terrain.png` + `markers.png` (black = nothing; markers never destroy terrain
  info) + optional `regions.png` + `config.json` (id must equal the folder name).
- **Ink registry** (`src/mapkit/inks.ts`) = the global config: every current and
  future element has an exact color, namespaced by CHANNEL rules (portals R=255
  B=200 w/ G=entry index; groups B=255 w/ G=group index; structures R=255 B=0;
  fixed spots R=200 B=50; spawn 255,255,0). **PORTAL_INKS is the global portal
  section**: each entry = one concrete destination (map + landing + name).
  A generated **palette card** (`npm run maps:palette`) is the eyedropper source.
- **Mob groups:** painted pixels are POSSIBLE spawn sites; composition lives in the
  global `GROUPS` registry; per-map sidecar sets `respawnSeconds` + `maxAlive`;
  a new instance spawns at a random FREE site (an instance holds its site until its
  last member dies). Groups may wander later (bounded by regions).
- **Structures:** paint a footprint rectangle of a structure ink → the compiler
  stamps the real thing (bridge, arena ring) from the reusable `STRUCTURES`
  registry. Map-independent by construction.
- **Terrain classes over binary blocked:** water/mountain/void are movement classes;
  today everything treats them as blocked, but the data model reserves per-entity
  passability (swimming mobs at per-mob speeds, flying over mountains with a visual
  size-up, player mount states). Runtime for that is future work.
- **Compilation happens OUTSIDE the game** (`npm run maps:compile`): linter (unknown
  colors with coordinates + nearest-ink suggestion, `errors.png` overlay with magenta
  offenders, reachability flood from spawn, sidecar validation) → on success a
  compiled JSON (RLE grids + source hash) in `src/game/maps-compiled/`, which the
  game (and a future server, at ITS start) loads directly. **PNGs need not be kept**
  — the exporter (`npm run maps:export -- <id>`) regenerates them from any map;
  edit loop = export → paint → compile. Meadow round-trips byte-for-byte (test).
- **Regions:** painted zones; SAFE (no mob self-aggro while the player stands
  inside; attacking from safety still answers) implemented; level/PvP/music zones
  reserved.
- **Preview tool** (`preview.html`): the REAL renderer with no player/sim — map
  picker, drag-pan, wheel-zoom, labels, mobs shown on every possible spawn site.
- **Rejected:** hot-reload of maps (MMO: maps load at server start); minimap derived
  from the painted PNG (ugly + marker colors ≠ game colors — a real minimap comes
  later from game data).
- Demo map: **The Painted Cellar** (portal south of the meadow plaza) — the living
  example of every feature; `paintings/cellar/` holds the reference files.
- **Paintings of every current map are committed** (`paintings/<id>/`, ~670 KB
  total) as editable references; `maps:compile` SKIPS code-built ids so an export
  can't shadow its generator — fork by renaming the folder + config id.
- **2026-07-20: the user hand-edited `paintings/meadow/` and asked to rebuild it
  from the PNG** — a deliberate tree-wall corridor redesign (254 px) flanking the
  arena→spawn path. Compiled directly (bypassing the CLI's shadow-guard, which
  exists for accidental cases only). **`meadow` now loads from the compiled JSON,
  not `buildMeadow()`** — permanent; the code builder is kept only as history/
  fallback. The edit also buried the `boar` spot's exact tile; user chose to
  relocate the spot marker (36,21 → 37,21) over carving a gap in the wall. Full
  incident + recovery notes (an accidental `git checkout` briefly discarded the
  edit, recovered from the linter's own errors.png): `docs/open/map-pipeline.md`.

## Still open / deferred (everything else combat-related is decided above)

- Sword mode-set design (4 slots, one behavior today), wand & grimoire specifics,
  and the bow's firing spec (tempo, arrows, projectile representation) — designed at
  their stages.
- The ultimate's per-class rebuild (current ult = temporary, minimal patches only).
- Skill-slot stage details beyond the locked modal flow.
- Multiplayer-only rules (mob target choice between players, AoE shapes behavior).
- The "Combat (current locked baseline)" section above describes pre-rework code and
  is superseded by "Combat rework" decisions as stages A–D land.
