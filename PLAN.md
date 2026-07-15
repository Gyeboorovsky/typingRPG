# Plan promptów — Typing RPG: Ekwipunek, tryby sterowania, przebudowa walki

Dokument roboczy: sekwencja promptów do wykonania modelem **opus 4.8 (high)**.
Ramy i opisy po polsku, **treści promptów po angielsku** (do wklejenia 1:1).
Każdy prompt oznaczony trybem:

- **[PLAN]** — uruchom w trybie plan (model najpierw planuje, Ty zatwierdzasz). Dla zmian w rdzeniu/save.
- **[AUTO]** — uruchom w trybie auto (robi od razu). Dla UI, kontentu i testów.

Branch roboczy: `feat/inventory-equipment-combat-rebuild`.
Kolejność jest zależnościowa: **A → B → C → D**. Nie przeskakuj — walka (C) opiera się na broni/atrybutach (A) i trybach (B).

## Ustalenia bazowe (kontekst dla wszystkich promptów)

- **Sloty ekwipunku (6):** `weapon, armor, helmet, boots, necklace, ring`.
- **Waluta:** jedna — `gold`. Dotychczasowe dropy `copper_coin` konwertują się na złoto. Pasek złota na dole okna eq.
- **Item z poziomem:** ma `itemLevel` (poziom mocy skalujący jego statystyki) **oraz** `reqLevel` (wymagany poziom postaci do założenia).
- **Nowy atrybut `attackSpeed`** — rośnie z `DEX` i ekwipunku; steruje tempem łuku.
- **Atrybuty realnie liczą się w walce:** `physicalDamage`→obrażenia, `defense`→redukcja melee, `dodge`→szansa uniku melee, `movementSpeed`→prędkość gracza, `attackSpeed`→tempo łuku (`magicDamage` zarezerwowany pod przyszłe różdżki/grimuary).
- **Siatka ekwipunku w stylu Metin2:** przedmioty zajmują wiele kratek (`w×h`), pozycje zapamiętane, drag&drop z kolizją.
- **Ikony:** emoji (dopracowana spójność: tło, rozmiar, ramka wg tieru).
- **Tryby sterowania:** `` ` `` = podróż (WSAD + strzałki, skróty `i`/`c`), `1-4`/`spacja` = walka (pisanie). Prompt do pisania widoczny **tylko** w trybie walki. `Enter` dalej = ult/respawn.
- **Melee mobów:** zaagrowany mob w zasięgu ~1,3 kratki bije co ~1,5 s za `typoDamage` (boss ×1,5 w furii) — w OBU trybach (stąd „obrywasz w podróży"). Łagodzą to `defense`/`dodge`.
- **Life-leech:** miernik startuje pełny; **spada gdy obrywasz (tempo ∝ obrażeniom)**; rośnie od poprawnych liter; literówka = duży skokowy spadek (nie do zera); leczenie = aktualny leech% × zadane obrażenia (per trafiony mob). **Brak self-dmg za literówkę.** Zielony pasek pod paskiem many.
- **Style broni (ten etap):** `sword` = sformalizowane obecne AoE-pisanie; `bow` = tempo 1 strzała / 5 poprawnych liter (N skracane przez `attackSpeed`), zasięg 7 kratek, widoczne pociski, tryb ognia 1 (skup grupę, od najsłabszego) i 2 (zwab round-robin), obsługa backspace.
- **Zasady repo (przypominać w każdym promocie):** `src/game/` pozostaje czyste (bez DOM/canvas/`Date.now`, seeded RNG w stanie, wejście jako kolejka zdarzeń); kolory świata tylko w `render/palette.ts`, kolory UI tylko w `src/style.css`; liczby do strojenia w `src/game/constants.ts`; `npm test` (vitest) musi przechodzić; małe, wąsko nazwane moduły.

---

# Filar 0 — Start

## P0 · [AUTO] — Branch + baseline

```
We are starting a multi-step feature effort on this Typing RPG repo (read CLAUDE.md first for architecture and constraints). Do only this setup step, no gameplay changes:

1. Create and switch to a new git branch: `feat/inventory-equipment-combat-rebuild`.
2. Run `npm test` and `npm run build` and confirm both pass on a clean tree. If anything fails on the untouched baseline, report it and stop.
3. Print a short summary of the current combat/inventory-relevant modules (`src/game/{types,sim,combat,items,attributes,mobs,constants}.ts`, `src/input.ts`, `src/ui/hud.ts`, `index.html`) as a shared mental map for the following prompts.

Do not modify any source files in this step.
```

---

# Filar A — Ekwipunek + Equipment (okno w stylu Metin2)

## A1 · [PLAN] — Model danych (types / items / attributes / save)

```
PLAN MODE. Extend the pure data model for equipment, currency, item levels, a Metin2-style sizable inventory grid, and a new attackSpeed attribute. Keep `src/game/` pure. Do NOT build any UI or combat behavior yet — data shapes, catalog, and save migration only.

Requirements:
- `src/game/attributes.ts`: add a new `AttributeId` `attackSpeed`. Give each class a sensible base value. Make `DEX` also contribute to `attackSpeed` in `STAT_EFFECTS` (and class modifiers). Keep existing attributes intact.
- `src/game/types.ts`:
  - New `EquipSlot = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring'`.
  - New `WeaponType = 'sword' | 'greatsword' | 'daggers' | 'bow' | 'staff' | 'wand' | 'grimoire'`.
  - Extend `ItemDef` with optional: `slot?: EquipSlot`, `weaponType?: WeaponType`, `size?: { w: number; h: number }` (default 1x1 when absent), `reqLevel?: number`, `itemLevel?: number`, and `bonuses?: Partial<Record<AttributeId, number>>` (flat attribute bonuses granted while equipped). Extend weapon data with `range?` (tiles) and any per-style fields the bow will need later (document them, don't implement behavior).
  - `Player`: add `equipment: Record<EquipSlot, ItemStack | null>`, `gold: number`. Change inventory to a positioned grid model: add `invW`/`invH` grid dimensions in constants, and store item positions. Prefer `inventory: (ItemStack & { x: number; y: number })[]` OR a documented cell model — pick the simplest that supports multi-cell items and stable positions, and explain the choice in a comment.
- `src/game/items.ts`: give existing gear real `slot`/`weaponType`/`size`/`reqLevel`/`itemLevel`/`bonuses`. Keep `copper_coin` for now but mark it for gold conversion in A2.
- `src/game/constants.ts`: add `INV_W`, `INV_H` (grid dimensions), and any leech/attack-speed tuning stubs you introduce as named constants (values can be provisional).
- Save migration: bump `SaveData` to `v: 2`. Persist `equipment`, `gold`, and inventory positions. Write a migration that upgrades a `v:1` save (flat inventory, no equipment/gold) into `v:2` (auto-place items into the grid top-left, empty equipment, gold 0). `applySave` must accept both versions. Keep `makeSave` emitting v2.

Deliver a plan covering exact type changes, the inventory-position representation decision, the migration algorithm, and which unit tests you'll add (round-trip save v1→v2, grid placement, attribute derivation with attackSpeed). Then implement after approval and make `npm test` pass.
```

## A2 · [PLAN] — Logika eq + atrybuty w walce

```
PLAN MODE. Wire equipment into the simulation and make attributes actually drive combat. Keep `src/game/` pure. No UI yet.

Requirements:
- New input events (in `types.ts` `InputEvent`) and handlers in `sim.ts`: `equip` (inventory item -> its slot, respecting `reqLevel` vs player level; reject silently if too low), `unequip` (slot -> first free grid cell; reject if no room), `moveItem` (grid reposition with collision check against item sizes), `dropItem` optional. All mutate state, bump `invRev`, set `dirty`.
- Replace `weaponBonus()` auto-best-weapon logic: damage/derived stats now come from the EQUIPPED weapon only. Fold equipped gear `bonuses` and `itemLevel`-scaled weapon stats into `effectiveAttributes` (extend it to take equipment, or add an `equipmentAttributes(player)` combiner used everywhere `effectiveAttributes` is used today — update `hud.ts` callers accordingly in a later UI prompt; here keep the pure API correct).
- Make attributes affect the sim:
  - `physicalDamage` scales per-hit typing damage (replace the flat `baseDamage + weaponBonus`).
  - `defense` reduces incoming melee (mitigation formula in constants; document it).
  - `dodge` gives a seeded chance (via state RNG) to avoid a melee hit.
  - `movementSpeed` scales `PLAYER_SPEED` (base + attribute).
  - `attackSpeed` reserved for bow tempo (C2) — expose a helper `arrowsPerCharsInterval(player)` returning the "N correct letters per arrow" derived from base 5 reduced by attackSpeed, clamped to a min; don't call it yet.
- Currency: `copper_coin` drops convert to `gold` on pickup (in `sim.ts` pickup path or `items.ts`), so `copper_coin` no longer enters the bag. Add a `GOLD_PER_COIN` constant.
- Tests: equip/unequip/move with size collisions and reqLevel gating; gold accrual; physicalDamage affecting damage; defense/dodge affecting melee (seed-deterministic).

Deliver the plan (formulas, event handling, RNG usage for dodge, which callers change), implement after approval, keep `npm test` green.
```

## A3 · [AUTO] — Okno Inventory + Equipment (UI)

```
AUTO MODE. Build the combined Inventory + Equipment window (Metin2 style). DOM HUD only — no game logic in `src/ui`. Read state, dispatch the input events added in A2.

Requirements:
- `index.html`: replace the current simple `#inventory` with a two-pane panel: left = character paperdoll with the 6 equip slots (weapon, armor, helmet, boots, necklace, ring), right = the sizable inventory grid (INV_W×INV_H cells). Add a bottom bar showing gold with the 💰 icon.
- `src/ui/hud.ts`: render the grid from the positioned inventory, drawing multi-cell items across their `w×h` footprint; render equipped items in their slots; refined emoji icons (consistent cell size, tier-colored border/background, quantity badge, `+plus` badge if present). Show gold value; update only on change (keep the existing `set()` diffing pattern and `invRev` gate).
- `src/style.css`: all new colors as CSS variables; responsive; keep the existing visual language (Nunito, rounded, tier colors). No world-render colors here.
- Open/close: keep it working with the current toggle wiring for now (the `i` shortcut arrives in B1). Empty slots and empty cells must render cleanly.

No drag yet (A4). Verify visually that equipped items and multi-cell items display correctly. `npm run build` must pass.
```

## A4 · [AUTO] — Drag & drop + tooltipy

```
AUTO MODE. Add drag & drop and tooltips to the Inventory+Equipment window. DOM only; all state changes go through the A2 input events (`moveItem`, `equip`, `unequip`).

Requirements:
- Drag an item within the grid to reposition it; respect multi-cell size and reject drops that collide or go out of bounds (snap back). Use pointer events; show a drag ghost.
- Drag from grid onto a matching equip slot to equip (reject wrong slot / too-low `reqLevel`, with a brief visual shake or toast). Drag from a slot back to a free grid cell to unequip.
- Right-click an item = quick-equip (gear) or use (consumable) — reuse existing right-click-reserved handling from `main.ts`.
- Tooltip on hover: name, tier, weaponType/slot, itemLevel, reqLevel (red if player too low), attribute bonuses, weapon range/dmg. Position-clamped to stay on screen.

Keep everything keyboard-safe (no dialogs). `npm run build` passes; manually confirm move/equip/unequip/collision all behave.
```

## A5 · [AUTO] — Kontent: bronie i przedmioty

```
AUTO MODE. Expand the item catalog with the 7 weapon types and a spread of armor pieces, plus drop tables. Pure data in `src/game/items.ts` and drop wiring in `mobs.ts` — no new mechanics.

Requirements:
- One weapon per `WeaponType` (sword, greatsword, daggers, bow, staff, wand, grimoire), each with `slot:'weapon'`, sensible `size`, `reqLevel`, `itemLevel`, per-type `bonuses` (e.g. greatsword high physicalDamage/low attackSpeed; daggers low dmg/high attackSpeed; bow with `range:7`; staff/wand/grimoire lean magicDamage), and tier-appropriate icons. Keep the existing `iron_sword`/`claymore` or fold them in as the sword-type entries.
- A few pieces per non-weapon slot (armor, helmet, boots, necklace, ring) across tiers with `bonuses` (defense/health/dodge/movementSpeed/attackSpeed) and `reqLevel`.
- Update mob `drops` so these appear at appropriate tiers; ensure the bow drops somewhere reachable early-ish so the C2 bow can be tested. Keep drop rates balanced.
- Add/adjust unit tests only if drop/catalog invariants are worth locking (e.g. every weapon has a weaponType, every equippable has a slot).

`npm test` and `npm run build` pass.
```

---

# Filar B — Tryby sterowania

## B1 · [PLAN] — System trybów podróż/walka + WSAD + skróty

```
PLAN MODE. Introduce explicit control modes and rebind input. Touches `src/input.ts`, `src/main.ts`, and adds a mode field to state — keep `src/game/` pure (mode lives in `GameState`, input stays an event queue).

Requirements:
- `GameState`: add `mode: 'travel' | 'fight'` (default 'travel'). Add an `InputEvent` `{ type: 'setMode'; mode }` and, for fight, `{ type: 'setFireMode'; fireMode: number }`.
- Key bindings in `input.ts`:
  - Backtick `` ` `` -> travel mode.
  - Digits `1`-`4` and Space -> fight mode; the digit selects the weapon fire mode (Space = mode 1 default). 
  - Movement: WSAD **and** arrow keys both move (map to the existing Dir system). Movement only takes effect in travel mode.
  - Travel-mode shortcuts: `i` = toggle inventory, `c` = toggle character window. (These letters must NOT type — they only act in travel mode.)
  - In fight mode: printable characters feed the typing/combat resolver (as today), WSAD does nothing (you're typing), backtick exits to travel.
  - `Enter` unchanged (ult / respawn). `Tab`/`Esc` may stay as aliases for inventory/close.
- Decouple typing-combat from aggro: `syncCombat` / combat state should only present a typing prompt when `mode === 'fight'`. Aggro + mob melee (B2) happen regardless of mode. Entering fight mode with mobs in range starts the combat prompt; leaving it hides the prompt but does NOT drop aggro (mobs keep attacking).
- `main.ts`: wire new callbacks; ensure `combatActive()` (for preventDefault) reflects fight mode.

Deliver the plan (exact keymap, how mode gates movement vs typing, how combat prompt visibility is driven, edge cases like held WSAD when switching to fight). Implement after approval. Add tests for mode transitions and that typing does nothing in travel mode. `npm test` green.
```

## B2 · [AUTO] — Melee mobów (obrażenia w obu trybach)

```
AUTO MODE. Give aggroed mobs an active melee attack so the player takes damage while traveling and while fighting. Pure sim change in `src/game/` + constants + tests.

Requirements:
- Add a per-mob attack cooldown (field on `Mob`, timer in seconds). An aggroed mob within melee range (~1.3 tiles, constant `MOB_MELEE_RANGE`) attacks every `MOB_MELEE_INTERVAL` (~1.5s), dealing `typoDamage` (repurposed as melee damage), boss ×`BOSS_ENRAGE_TYPO_MULT` when enraged.
- Route damage through the existing `hurtPlayer`, but apply `defense` mitigation and `dodge` avoidance from A2 (seeded RNG for dodge). Emit the existing `hurt` fx so numbers float.
- This runs in `mobStep`/a new `mobAttackStep` every tick regardless of `state.mode`. Aggro/leash logic unchanged.
- Remove the old assumption that typos are the only damage source (typo self-damage is fully removed in C1; here just add melee and don't rely on typos).
- Tests: a mob in range drains player HP over time deterministically; defense reduces it; dodge (seeded) sometimes avoids; out-of-range mobs don't hit.

`npm test` and `npm run build` pass.
```

---

# Filar C — Przebudowa walki (leech + style broni)

## C1 · [PLAN] — Life-leech + zielony pasek

```
PLAN MODE. Replace typo-punishment with the life-leech system. Core change in `src/game/combat.ts` (+ types/constants); green bar in the HUD. Keep sim pure.

Model (agreed):
- A leech meter `leech` in [0..1] (fraction of a cap). Represents current leech strength; `LEECH_CAP` (e.g. 0.10) is the max fraction of dealt damage returned as HP.
- Starts FULL (1.0) when combat begins.
- Drains when the player takes damage: draining rate scales with the amount of HP lost (bigger hits drain more/faster) — define a `LEECH_DRAIN_PER_HP` and apply on each `hurtPlayer`. This is what makes tougher mobs harder.
- Rises with each correct keystroke by `LEECH_GAIN_PER_CHAR` (clamped to 1.0).
- On a typo: a large single step down `LEECH_TYPO_PENALTY` (e.g. -0.5), never below 0. NO self-damage from typos anymore.
- Healing: on each mob hit, heal the player `leech * LEECH_CAP-scaled fraction * damageDealt` (per hit, so multi-target = more healing), capped at max HP. Document the exact formula.
- Keep streak / AoE-radius mechanics for the sword style (streak still grows radius). Leech and streak are separate meters.

HUD:
- Add a green leech bar directly under the mana bar in `index.html`, styled in `style.css` (green CSS var). `hud.ts` reads `state.combat` (or player) leech and updates width only on change. Hide it outside fight/combat.

Deliver the plan (exact formulas, where leech lives — CombatState vs Player, drain on hurt, interaction with the existing streak), implement after approval, add deterministic tests (correct chars raise leech, typo drops it, damage taken drains it, leech heals proportional to dealt damage). `npm test` green.
```

## C2 · [PLAN] — Style broni: miecz + łuk (pociski, tryby ognia)

```
PLAN MODE. Add a weapon-style layer so combat resolves per the equipped weapon. Implement `sword` (formalize current behavior) and `bow` (new). This is the largest change — keep `src/game/` pure; projectiles live in state; rendering comes in C3.

Requirements:
- A `weaponStyle` dispatch in `combat.ts` keyed off the equipped weapon's `weaponType` (fallback `sword` when unarmed). Sword = today's AoE typing: each correct char damages all aggroed mobs within the streak radius; keep streak→radius and the ultimate.
- Bow:
  - Tempo: fire 1 arrow every N correct letters, where N = `arrowsPerCharsInterval(player)` (base 5, reduced by attackSpeed, min clamp). Track a correct-letter counter that resets appropriately; typos do NOT count and interact with leech per C1 (no self-damage).
  - Backspace: handle a `backspace` input event so the player can correct mistakes; corrected input counts as clean for tempo (the "corrected mistakes are ok" intent).
  - Range: arrows only hit mobs within the weapon `range` (default 7 tiles).
  - Projectiles: represent arrows as entities in `GameState` (origin, target/direction, speed, damage) advanced each tick until they hit or expire. Damage on hit uses `physicalDamage`. Emit `dmg` fx on impact and leech per C1.
  - Fire modes (selected by digit / `setFireMode`):
    - Mode 1 (default): focus a single GROUP (a pack aggroed from one spawn spot / pack-link, keyed by `spotIdx`), targeting the lowest-current-HP mob first, killing them one by one.
    - Mode 2: lure — fire one arrow at each not-yet-aggroed GROUP in range to pull it (one shot per group). When nothing new is left to lure, keep firing at all engaged targets one at a time round-robin. No auto-switch to mode 1.
  - Define "group" via existing spot/pack-link data; add a helper to enumerate groups and pick targets.
- Constants: bow base interval, arrow speed, range default, fire-mode params — all in `constants.ts`.

Deliver a detailed plan (style dispatch, projectile lifecycle in the pure sim, group/target selection for both modes, backspace handling, how attackSpeed maps to N). Implement after approval. Tests: bow tempo vs attackSpeed, range gating, mode 1 focus-lowest-HP, mode 2 luring then round-robin, backspace correction. `npm test` green.
```

## C3 · [AUTO] — Render: strzały, zasięg, wskaźnik trybu

```
AUTO MODE. Visualize the new combat. Rendering only (`src/render/*`, `palette.ts` for colors) and HUD indicators — no sim logic.

Requirements:
- Draw flying arrows from the C2 projectile list (small oriented shafts), with a subtle trail; colors from `palette.ts`.
- Draw a bow range indicator (7-tile ring, like the streak ring but distinct) when the bow is equipped in fight mode.
- HUD: show current mode (travel/fight) and, in fight, the active weapon + fire mode (e.g. "Bow · Mode 1 — Focus"). Polish the green leech bar visuals.
- Keep the isometric projection helpers; respect existing culling and depth sort.

`npm run build` passes; visually confirm arrows, range ring, and indicators.
```

## C4 · [AUTO] — Strojenie + test integracyjny

```
AUTO MODE. Balance pass and an end-to-end test.

Requirements:
- Tune constants for a good feel: melee interval/damage, leech cap/gain/drain/typo-penalty, bow tempo/range, attackSpeed scaling, defense/dodge curves. Document each in `constants.ts`.
- Add one integration-style vitest that drives the full loop deterministically: travel → walk into aggro → take melee damage → enter fight mode → type correctly (leech rises, mobs die, HP leeches back) → typo (leech drops) → kill a pack → loot drops → gold increments. Assert the key transitions.
- Ensure sword and bow paths are both covered.

`npm test` and `npm run build` pass.
```

---

# Filar D — Domknięcie

## D1 · [AUTO] — Dokumentacja + QA + weryfikacja

```
AUTO MODE. Finalize the branch.

Requirements:
- Update `CLAUDE.md` to describe the now-implemented systems (equipment/attributes-in-combat, control modes, mob melee, life-leech, weapon styles/bow) and move them out of the "not built yet" sections. Keep it lean.
- If title/description/links/status changed, sync `io_typingRPG/app.json`.
- Write a short manual-QA checklist (travel/fight switching, WSAD+arrows, i/c shortcuts, drag&drop/equip, reqLevel gating, gold, leech bar, sword vs bow, bow fire modes, save v1→v2 load).
- Run `npm test` and `npm run build`; confirm green. Summarize what changed and any follow-ups (remaining weapon styles: daggers/staff/wand/grimoire/greatsword behaviors; multiplayer seams untouched).
```

---

## Podsumowanie kolejności i trybów

| # | Prompt | Tryb |
|---|--------|------|
| P0 | Branch + baseline | AUTO |
| A1 | Model danych (types/items/attributes/save v2) | PLAN |
| A2 | Logika eq + atrybuty w walce | PLAN |
| A3 | Okno Inventory+Equipment (UI) | AUTO |
| A4 | Drag & drop + tooltipy | AUTO |
| A5 | Kontent: bronie i przedmioty | AUTO |
| B1 | Tryby podróż/walka + WSAD + skróty | PLAN |
| B2 | Melee mobów | AUTO |
| C1 | Life-leech + zielony pasek | PLAN |
| C2 | Style broni: miecz + łuk | PLAN |
| C3 | Render: strzały/zasięg/wskaźniki | AUTO |
| C4 | Strojenie + test integracyjny | AUTO |
| D1 | Dokumentacja + QA + weryfikacja | AUTO |

**5× PLAN** (rdzeń/save), **8× AUTO** (UI/kontent/testy). Po każdym promocie: `npm test` + szybki rzut oka w grze przed przejściem dalej.
