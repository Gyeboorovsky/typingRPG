# Plan promptów — Typing RPG: Ekwipunek, tryby sterowania, przebudowa walki

Dokument roboczy: sekwencja promptów do wykonania modelem **opus 4.8 (high)**.
Ramy i opisy po polsku, **treści promptów po angielsku** (do wklejenia 1:1).
Każdy prompt oznaczony trybem:

- **[PLAN]** — uruchom w trybie plan (model najpierw planuje, Ty zatwierdzasz). Dla zmian w rdzeniu/save.
- **[AUTO]** — uruchom w trybie auto (robi od razu). Dla UI, kontentu i testów.

Branch roboczy: `feat/inventory-equipment-combat-rebuild`.
Kolejność jest zależnościowa: **A → B → C → D**. Nie przeskakuj — walka (C) opiera się na broni/atrybutach (A) i trybach (B).

---

## Zmiany w v2 (po review kodu) — mapa „punkt → gdzie naprawione"

Wersja 2 wpina 10 uwag z przeglądu repo. Ściągawka, gdzie każda została zaadresowana:

| # | Uwaga z review | Gdzie w planie |
|---|----------------|----------------|
| 1 | Spacja nie może być i znakiem, i przełącznikiem trybu (prompty mają spacje) | Ustalenia bazowe → „Klawisze"; prompt **B1** (reguła spacji/cyfr) |
| 2 | `leech` musi żyć na `Player`, nie na `CombatState` | Ustalenia bazowe → „Life-leech"; **C1** (decyzja wpisana, nie otwarta) |
| 3 | `save.ts` ma `d?.v === 1` w l.39 i l.52 — bump zabije nowe zapisy | **A1** (jawnie: aktualizacja obu guardów + `SaveData.v: 1\|2` + `makeSave`) |
| 4 | Istniejące testy padną (nie „zostają zielone") | **A1/A2/B2/C1** — każdy ma punkt „zaktualizuj istniejące testy" z numerami linii |
| 5 | Okno podwójnych obrażeń między B2 a C1 | **B2** neutralizuje self-dmg za typo od razu; **C1** dokłada karę leecha |
| 6 | C1 musi zachować restart frazy przy tarczy bossa; wygaszenie ścieżki enrage-na-typo | **B2/C1** (jawnie: zachować `shield` restart, wygasić enrage-typo) |
| 7 | Jednostki `movementSpeed` niejasne | **A2** (wzór + docelowa skala wpisane) |
| 8 | Zmiana sygnatury `effectiveAttributes` uderza w HUD (`hud.ts` l.205) | **A2** (aktualizuje callera w tym samym kroku — brak rozjazdu) |
| 9 | Stare `copper_coin` w zapisach = martwa waluta | **A1** (migracja konwertuje trzymane coiny → gold) |
| 10 | Model siatki: stackowanie + przepełnienie przy migracji | **A1** (reguły stacków 1×1, pojemność ≥ stara, zdefiniowany overflow) |
| + | Commit po każdym kroku / touch-gating / cleanup `TYPO_DAMAGE` / thumbnail / brak projektili w save | Ustalenia bazowe + **C1/C2/D1** |

---

## Zmiany w v3 (własny przegląd luk + decyzje) — mapa

Wersja 3 domyka 12 luk wykrytych poza audytem. Cztery decyzje właściciela + osiem defaultów.

| # | Luka | Decyzja | Gdzie |
|---|------|---------|-------|
| 1 | `maxHp()` ignoruje atrybut `health`; VIT nie zwiększa realnego HP | **Ujednolicić** — max HP/MP = klasa+poziom + `health`/`energy` (VIT+gear realnie dają HP/MP), z przeskalowaniem baz | **A2** |
| 2 | Bronie bez stylu + martwy `magicDamage` | **Fallback: styl miecza** dla wszystkich nie-łukowych; `magicDamage` na razie nieaktywny | **C2**, ustalenia |
| 3 | Użycie mikstur w walce (klawisze zajęte) | **Tylko w podróży** (klik/prawy w eq; zablokowane w `fight`) | **A4**, ustalenia |
| 4 | Zmiana trybu ognia w walce + wyjście z walki | **Alt(lewy/prawy)+cyfra** = tryb ognia w walce; **Backspace/Esc** = wyjście z walki | **B1**, ustalenia |
| 5 | `addToInventory` w siatce; pełny plecak | Item zostaje na ziemi + toast „bag full" (nie znika) | **A2**, ustalenia |
| 6 | Ult (Enter) przy łuku | Streak rośnie od poprawnych liter niezależnie od stylu → Whirlwind dalej działa | **C2** |
| 7 | Łuk poza zasięgiem | Licznik tempa czeka aż cel w 7 kratkach — zero strzał w próżnię | **C2** |
| 8 | Nowy `attackSpeed` niewidoczny w oknie postaci | Dopisać wiersz do `hud.ts` ATTR_IDS + `index.html` | **A2/A3** |
| 9 | Inicjalizacja nowych pól / serializacja | `newGame` init `equipment/gold/leech/overflow`; `makeSave` NIE zapisuje `leech` (reset do pełna); `mode` startuje `travel` | **A1** |
| 10 | Restrykcje klasa↔broń | Brak teraz (każda klasa każdą bronią); dodać `reqClass?` jako seam | **A1/A5** |
| 11 | Regeneracja leecha poza walką | W walce tylko z liter; **po walce, po ~10 s bez obrażeń, powoli regeneruje do pełna** | **C1**, ustalenia |
| 12 | Brak sinka na złoto (sklep) | Poza zakresem — follow-up | **D1** |
| + | Backspace-do-poprawiania w łuku (pierwotny pomysł) | **Usunięty** — silnik pisze znak-po-znaku, brak bufora złych liter; backspace = wyjście z walki | **C2/B1** |

---

## Zmiany w v4 (drugi audyt planu) — doprecyzowania

Cztery dziury proceduralne wykryte w audycie planu (nie kodu). Wszystkie zaadresowane:

| # | Dziura | Poprawka | Gdzie |
|---|--------|----------|-------|
| v4-1 | `addToInventory` (żywe dropy w `stepDrops`) nadal robi płaski `push` — żaden prompt nie przepisuje go pod siatkę; decyzja „pełny plecak → na ziemię + toast" była tylko w tabelach, nie w treści promptu | Dodany jawny task: przepisać `addToInventory` na umieszczanie w wolnej komórce wg `size`; brak miejsca → item zostaje dropem na ziemi + toast | **A2** |
| v4-2 | Sprzeczność: A2 „reject silently", a A4 obiecuje shake/toast na odrzucenie (skąd UI wie?) | UI (A4) pre-sprawdza `reqLevel`/wolne miejsce PRZED dispatchem i daje feedback; sim dalej waliduje defensywnie i po cichu | **A2/A4** |
| v4-3 | `MOVE_BASELINE` jako jedna stała, mimo że bazy klas to 4/6/5/4 — ninja przekroczyłby PLAYER_SPEED przy zerowej inwestycji | Baseline = **własna baza `movementSpeed` klasy**, nie globalna stała → każda klasa startuje z PLAYER_SPEED | **A2** |
| v4-4 | Leech rośnie na poprawną literę niezależnie od tego, czy `damageMob` trafił (mały AoE / łuk poza zasięgiem) — nie zapisane jako decyzja | Świadomy default: leech rośnie za każdą POPRAWNĄ literę (zgodnie z „poprawne literki → pasek rośnie"), NIE bramkowane trafieniem | **C1/C2** |

---

## Ustalenia bazowe (kontekst dla wszystkich promptów)

- **Sloty ekwipunku (6):** `weapon, armor, helmet, boots, necklace, ring`.
- **Waluta:** jedna — `gold`. Dropy `copper_coin` konwertują się na złoto (przy podnoszeniu **oraz** w migracji starych zapisów). Pasek złota na dole okna eq.
- **Item z poziomem:** ma `itemLevel` (poziom mocy skalujący jego statystyki) **oraz** `reqLevel` (wymagany poziom postaci do założenia).
- **Nowy atrybut `attackSpeed`** — rośnie z `DEX` i ekwipunku; steruje tempem łuku.
- **Atrybuty realnie liczą się w walce:** `physicalDamage`→obrażenia, `defense`→redukcja melee, `dodge`→szansa uniku melee, `movementSpeed`→prędkość gracza, `attackSpeed`→tempo łuku (`magicDamage` na razie NIEAKTYWNY — zarezerwowany pod przyszłe różdżki/grimuary).
- **Max HP/MP ujednolicone (decyzja v3-1):** `maxHp`/`maxMp` liczą się z atrybutów `health`/`energy` (klasa + poziom + VIT/INT + ekwipunek), a nie tylko z klasy+poziomu jak dziś. VIT i gear realnie podnoszą pasek. Bazy przeskalowane, żeby przy 0 statów i bez gearu HP/MP było jak dotąd.
- **Siatka ekwipunku w stylu Metin2:** przedmioty zajmują wiele kratek (`w×h`), pozycje zapamiętane, drag&drop z kolizją. Stackowalne itemy są 1×1 i dalej stackują do `maxStack`.
- **Ikony:** emoji (dopracowana spójność: tło, rozmiar, ramka wg tieru).
- **Klawisze (rozstrzygnięcie kolizji — patrz uwagi 1):**
  - `` ` `` → tryb podróży. `1-4`/`spacja` → tryb walki (cyfra = tryb ognia, spacja = tryb 1).
  - **Spacja i cyfry przełączają tryb TYLKO gdy `mode==='travel'`.** Gdy `mode==='fight'`, spacja i cyfry są zwykłymi znakami do pisania (prompty zawierają spacje: `words.ts` skleja słowa `' '`, tier-4 to całe zdania). Bez tej reguły prompt miecza jest nie do napisania.
  - Ruch: **WSAD i strzałki** (tylko w podróży). Skróty w podróży: `i` = ekwipunek, `c` = postać (te litery nie piszą się w promptach). `Enter` = ult/respawn (bez zmian).
  - **W trybie walki (decyzja v3-4):** `Alt`(lewy lub prawy)`+cyfra` = zmiana trybu ognia (nie „pisze", nie koliduje z promptem). **`Backspace` lub `Esc` = wyjście z walki** (→ podróż; aggro zostaje, moby dalej biją). `Esc` z otwartym oknem (eq/postać) najpierw zamyka okno, dopiero potem wychodzi z walki. Backspace NIE służy do poprawiania liter — silnik pisze znak-po-znaku, więc nie ma czego kasować.
  - **Mikstury (decyzja v3-3):** używane klikiem/prawym w oknie eq, **tylko w trybie podróży**; w walce leczy wyłącznie leech.
- **Life-leech (rozstrzygnięcie — patrz uwaga 2):** pole `leech` żyje na **`Player`** (nie na `CombatState`), bo melee rani też w podróży, gdy `combat===null`, a przy re-agro nie chcemy resetu miernika. Miernik startuje pełny; **spada gdy obrywasz (tempo ∝ obrażeniom)**; rośnie od poprawnych liter; literówka = duży skokowy spadek (nie do zera); leczenie = aktualny leech% × zadane obrażenia (per trafiony mob). **Brak self-dmg za literówkę.** Zielony pasek pod paskiem many.
- **Melee mobów:** zaagrowany mob w zasięgu ~1,3 kratki bije co ~1,5 s za `typoDamage` (boss ×`BOSS_ENRAGE_TYPO_MULT` w furii) — w OBU trybach. Łagodzą to `defense`/`dodge`.
- **Style broni (ten etap):** `sword` = sformalizowane obecne AoE-pisanie; `bow` = tempo 1 strzała / 5 poprawnych liter (N skracane przez `attackSpeed`), zasięg 7 kratek, widoczne pociski, tryb ognia 1 (skup grupę, od najsłabszego) i 2 (zwab round-robin). **Każda inna broń (greatsword/daggers/staff/wand/grimoire) używa na razie stylu `sword`** (fallback), do czasu własnych stylów.
- **Rozstrzygnięcia dodatkowe (v3):**
  - **Pełny plecak przy podnoszeniu:** item zostaje na ziemi + toast „bag full" (nie znika). `addToInventory` musi znaleźć wolną komórkę siatki.
  - **Ult (Enter):** streak rośnie od poprawnych liter niezależnie od stylu, więc Whirlwind ładuje się i działa też przy łuku (łuk dzieli ult klasy).
  - **Łuk poza zasięgiem:** licznik tempa czeka, aż cel wejdzie w zasięg — brak strzał w próżnię.
  - **Leech po walce (v3-11):** w walce rośnie tylko z poprawnych liter; **po zakończeniu walki, po ~10 s bez obrażeń, powoli regeneruje do pełna** (`LEECH_REGEN_DELAY`, `LEECH_REGEN_PER_S`).
  - **Klasa↔broń:** brak restrykcji teraz; pole `reqClass?` dodane jako seam na przyszłość.
  - `attackSpeed` dostaje wiersz w oknie postaci; `newGame` inicjalizuje nowe pola gracza; `makeSave` nie serializuje `leech` (reset do pełna przy wczytaniu); `mode` startuje `travel`.
- **Higiena procesu:** po każdym promocie **zrób commit** na branchu (punkt rollbacku) + `npm test` + szybki rzut oka w grze. Nie kumuluj kroków w jednym commicie.
- **Zasady repo (przypominać w każdym promocie):** `src/game/` czyste (bez DOM/canvas/`Date.now`, seeded RNG w stanie, wejście jako kolejka zdarzeń); kolory świata tylko w `render/palette.ts`, kolory UI tylko w `src/style.css`; liczby do strojenia w `src/game/constants.ts`; `npm test` (vitest) musi przechodzić; małe, wąsko nazwane moduły. Sterowanie walką jest **klawiaturowe** — na dotyku pozostaje niedostępne (CLAUDE.md obiecuje responsywność od ~360px z notką „best with keyboard"; to świadome ograniczenie, nie regresja).

---

# Filar 0 — Start

## P0 · [AUTO] — Branch + baseline

```
We are starting a multi-step feature effort on this Typing RPG repo (read CLAUDE.md first for architecture and constraints). Do only this setup step, no gameplay changes:

1. Create and switch to a new git branch: `feat/inventory-equipment-combat-rebuild`.
2. Run `npm test` and `npm run build` and confirm both pass on a clean tree. If anything fails on the untouched baseline, report it and stop.
3. Print a short map of the modules the following prompts will touch: `src/game/{types,sim,combat,items,attributes,mobs,constants,words}.ts`, `src/input.ts`, `src/main.ts`, `src/ui/hud.ts`, `src/save/save.ts`, `src/game/game.test.ts`, `index.html`. For each, note in one line what it currently owns.

Do not modify any source files in this step. Commit nothing (nothing changed).
```

---

# Filar A — Ekwipunek + Equipment (okno w stylu Metin2)

## A1 · [PLAN] — Model danych (types / items / attributes / save v2 + migracja)

```
PLAN MODE. Extend the pure data model for equipment, currency, item levels, a Metin2-style sizable inventory grid, and a new attackSpeed attribute — and migrate the save format to v2. Keep `src/game/` pure. No UI or combat behavior yet — data shapes, catalog, and migration only.

Data model:
- `src/game/attributes.ts`: add `AttributeId` `attackSpeed`. Give each class a base value. Make `DEX` also contribute to `attackSpeed` in `STAT_EFFECTS` (and reflect in `CLASS_STAT_MODIFIERS`). Keep existing attributes intact.
- `src/game/types.ts`:
  - `EquipSlot = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring'`.
  - `WeaponType = 'sword' | 'greatsword' | 'daggers' | 'bow' | 'staff' | 'wand' | 'grimoire'`.
  - Extend `ItemDef` with optional: `slot?: EquipSlot`, `weaponType?: WeaponType`, `size?: { w: number; h: number }` (absent = 1x1), `reqLevel?: number`, `itemLevel?: number`, `reqClass?: ClassId[]` (class gate — a seam only; leave unset = usable by all, decyzja v3-10), `bonuses?: Partial<Record<AttributeId, number>>` (flat attribute bonuses while equipped). Extend weapon data with `range?` (tiles) for the bow (behavior later).
  - `Player`: add `equipment: Record<EquipSlot, ItemStack | null>`, `gold: number`, and `leech: number` (0..1, the life-leech meter — it lives on Player, NOT CombatState; see combat prompts). Change inventory to a POSITIONED grid: `inventory: (ItemStack & { x: number; y: number })[]` (stackables are 1x1 and still stack to `maxStack`). Add `overflow: ItemStack[]` for items that don't fit the grid (see migration fallback).
- `src/game/constants.ts`: add `INV_W = 10`, `INV_H = 6` (60 cells — comfortably larger than the old flat 30, so v1 bags always fit), `GOLD_PER_COIN`, and named stubs for leech/attack-speed tuning you introduce (provisional values ok).
- `src/game/items.ts`: give existing gear real `slot`/`weaponType`/`size`/`reqLevel`/`itemLevel`/`bonuses`. Keep `copper_coin` defined (still a drop) but it will convert to gold, not sit in the bag.

Save v1 → v2 (this is load-bearing — do all of it):
- `types.ts`: change `SaveData.v` from the literal `1` to `1 | 2`. Persist `equipment`, `gold`, positioned `inventory` (with x/y), and `overflow`. Do NOT persist any transient combat/projectile state.
- `sim.ts`: `newGame` must initialize the new Player fields (`equipment` all-null, `gold: 0`, `leech: 1`, `overflow: []`, positioned empty inventory). `makeSave` must emit `v: 2` (currently emits `v: 1` at ~line 117) and must NOT serialize `leech` (it's transient — `applySave` re-inits it to full 1.0 on load; `mode` is GameState, always starts `travel`). `applySave` must accept BOTH v1 and v2:
  - v1 → v2 upgrade: auto-place the old flat `inventory` items row-major into the INV_W×INV_H grid (skip cells already taken by multi-cell items); set empty `equipment`; **convert any held `copper_coin` stacks into `gold` (qty × GOLD_PER_COIN) instead of placing them** (so returning players don't keep dead currency); anything that still doesn't fit goes into `overflow` (shouldn't happen at 60 cells vs old ≤30, but define it).
  - v2 → load as-is.
- `src/save/save.ts`: the roster/load guards currently filter `d?.v === 1` in TWO places — `listSlots` (~line 39) and `loadSlot` (~line 52). Change both to accept `d?.v === 1 || d?.v === 2`, otherwise every newly written v2 save is silently dropped from character-select and never loads.

Tests (update existing, add new):
- Update the save-roundtrip test in `game.test.ts` (~lines 157–176): it builds a flat `inventory: [{defId,qty}]` and asserts `b.player.inventory` deep-equals it — rewrite for the positioned grid, and add a dedicated v1→v2 migration test (flat bag with a `copper_coin` stack → grid placement + gold conversion + empty equipment).
- Add tests: grid placement/overflow, attribute derivation including `attackSpeed`, DEX→attackSpeed.

Deliver a plan (exact type changes, the positioned-inventory representation, migration algorithm incl. coin conversion and overflow, the two save.ts guard edits, which tests change). Implement after approval; `npm test` green. Commit.
```

## A2 · [PLAN] — Logika eq + atrybuty w walce

```
PLAN MODE. Wire equipment into the simulation and make attributes actually drive combat. Keep `src/game/` pure. Minimal HUD caller update is allowed here (see below) to avoid a stats mismatch.

Events + logic (in `types.ts` `InputEvent` and `sim.ts`):
- `equip` (inventory item → its slot; reject silently if `player.level < reqLevel`), `unequip` (slot → first free grid cell; reject if no room), `moveItem` (grid reposition with collision against item `size`). All bump `invRev`, set `dirty`. FEEDBACK (v4-2): rejections are SILENT in the sim (no state change, no fx). User feedback is A4's job — the UI pre-checks reqLevel / free-cell before dispatching so it can show the shake/toast, while the sim still validates defensively. Do not add reject-fx to the sim.
- PICKUPS INTO THE GRID (v4-1): rewrite `items.ts` `addToInventory` (called from `sim.ts` `stepDrops` on every live drop) — it currently does a flat `push`. New behavior: stack into an existing non-full stack if present, else place a new 1×1 (or `size`d) item at the first free grid cell; if the bag is full, DO NOT push — leave the drop on the ground (skip the pickup this frame) and emit a `pickup`/toast-style fx like "Bag full". This is the concrete home of decision v3-5 (the tables mention it; here it becomes a task).
- Replace `weaponBonus()` auto-best-weapon logic (`items.ts`): damage/derived stats now come from the EQUIPPED weapon only.
- Extend `effectiveAttributes` to fold in equipped gear `bonuses` and `itemLevel`-scaled weapon stats. IMPORTANT (uwaga 8): `hud.ts` calls `effectiveAttributes(p.classId, p.stats)` (~line 205). Update the signature AND that caller in THIS step (pass equipment) so the Character panel and combat agree — do not defer the caller to A3, or the panel shows attributes without gear while combat uses them. Also add an `attackSpeed` row to the Character panel (`ATTR_IDS` in `hud.ts` and `#attr-rows` in `index.html`) so the new attribute is visible.
- UNIFY max HP/MP with attributes (decyzja v3-1 — this fixes a real pre-existing disconnect: `classes.ts` `maxHp` = base+level only, while the `health` attribute from VIT is a separate display-only number, so VIT never actually raised HP): make `maxHp(p)`/`maxMp(p)` derive from the effective `health`/`energy` attributes (which already include class base + VIT/INT + now gear) PLUS the level scaling, as the single source of truth. Avoid double-counting the class base (it lives in the attribute already — fold `hpPerLevel*(level-1)`/`mpPerLevel*(level-1)` into the derivation, don't add baseHp twice). RESCALE bases so that at level L with 0 stat points and no gear the numbers match today's values (add a test asserting parity at a few levels). Callers to check: `combat.ts` (heal/leech clamps, level-up), `sim.ts` (regen, respawn, level-up), `hud.ts` (bars). On equip/unequip that changes max, keep current hp/mp but clamp to the new max.

Attributes affecting the sim (define each formula in constants, document magnitude):
- `physicalDamage` scales per-correct-char typing damage (replaces the flat `baseDamage + weaponBonus`).
- `defense` reduces incoming melee (e.g. `dmg * 100/(100+defense)` — pick and document).
- `dodge` = seeded chance (via `state.rng`) to avoid a melee hit.
- `movementSpeed` (uwaga 7 — pin the formula, it's currently ambiguous): treat the attribute as a % bonus over the class's OWN baseline, NOT as raw tiles/s. `effectiveSpeed = PLAYER_SPEED * clamp(1 + (movementSpeed - classBaseMovementSpeed) * MOVE_PER_POINT, 0.6, 1.8)`, with `MOVE_PER_POINT` ≈ 0.02 (2%/point). IMPORTANT (v4-3): the baseline is the class's own base `movementSpeed` attribute (warrior 4 / ninja 6 / wizard 5 / priest 4 in `attributes.ts`), NOT a single global constant — otherwise a Ninja passively exceeds PLAYER_SPEED at zero investment. Derive the baseline from `baseAttributes(classId).movementSpeed` so every class moves at ≈ PLAYER_SPEED (4.5 t/s) with default gear; only stat/gear investment beyond the class base changes it (heavy DEX/boots ≈ +30–40%). Constants in `constants.ts`.
- `attackSpeed`: expose a pure helper `arrowsPerCharsInterval(player)` returning the "N correct letters per arrow" — base `BOW_BASE_CHARS_PER_ARROW = 5` reduced by attackSpeed over a baseline, clamped to `[2, 5]`. Don't call it yet (bow is C2).

Currency: `copper_coin` drops convert to `gold` on pickup (in the `sim.ts` pickup path), so coins never enter the bag. Use `GOLD_PER_COIN`.

Tests (update existing, add new):
- Update `game.test.ts` ~lines 40–50 ("a correct key damages only aggroed mobs"): it asserts `hp - classOf(...).baseDamage`; rewrite against the new `physicalDamage`-based damage.
- Add: equip/unequip/move with size collisions and reqLevel gating; gold accrual and coin→gold; defense/dodge affecting melee (seed-deterministic); movementSpeed formula.

Deliver the plan (formulas, RNG usage for dodge, the `effectiveAttributes` signature change + HUD caller edit, which tests change). Implement after approval; `npm test` green. Commit.
```

## A3 · [AUTO] — Okno Inventory + Equipment (UI)

```
AUTO MODE. Build the combined Inventory + Equipment window (Metin2 style). DOM HUD only — no game logic in `src/ui`. Read state, dispatch the A2 input events.

- `index.html`: replace the simple `#inventory` with a two-pane panel: left = paperdoll with the 6 equip slots (weapon, armor, helmet, boots, necklace, ring), right = the sizable inventory grid (INV_W×INV_H). Bottom bar shows gold (💰).
- `src/ui/hud.ts`: render the grid from the positioned inventory, drawing multi-cell items across their `w×h` footprint; render equipped items in their slots; refined emoji icons (consistent cell size, tier-colored border/background, quantity badge, `+plus` badge). Show gold; update only on change (keep the `set()` diffing + `invRev` gate). If `player.overflow` is non-empty, show a small "N items didn't fit" note.
- `src/style.css`: all new colors as CSS variables; keep the Nunito/rounded/tier-color language; responsive from ~360px (combat is keyboard-only — that's expected on touch). No world-render colors here.
- Keep current open/close wiring for now (the `i`/`c` shortcuts arrive in B1).

No drag yet (A4). `npm run build` passes; commit.
```

## A4 · [AUTO] — Drag & drop + tooltipy

```
AUTO MODE. Add drag & drop and tooltips to the Inventory+Equipment window. DOM only; all state changes go through A2 events (`moveItem`, `equip`, `unequip`).

- Drag within the grid to reposition; respect multi-cell size; reject collisions/out-of-bounds (snap back). Pointer events; drag ghost.
- Drag grid → matching equip slot to equip (reject wrong slot / too-low reqLevel with a shake or toast). Drag slot → free grid cell to unequip.
- REJECTION FEEDBACK (v4-2): the UI owns user feedback for failed equips. Before dispatching `equip`/`unequip`/`moveItem`, pre-check reqLevel and free-cell/collision against state; on failure show the shake/toast here and don't dispatch (or dispatch and let the silent sim no-op — but the UI must not rely on the sim to signal the failure).
- Right-click = quick-equip (gear) or use (consumable); reuse the existing right-click-reserved handling from `main.ts`. CONSUMABLES ONLY IN TRAVEL (decyzja v3-3): using a consumable (e.g. HP potion) is allowed only when `state.mode === 'travel'`; in fight mode it's blocked (healing there comes from leech). Wire the consume through a sim input event (`useItem`) with a mode guard, or gate the UI action — either way it must not fire in fight.
- Hover tooltip: name, tier, weaponType/slot, itemLevel, reqLevel (red if player too low), attribute bonuses, weapon range/dmg. Clamp on-screen.

No dialogs (keep the session responsive). `npm run build` passes; commit. Manually confirm move/equip/unequip/collision.
```

## A5 · [AUTO] — Kontent: bronie i przedmioty

```
AUTO MODE. Expand the item catalog with the 7 weapon types and a spread of armor, plus drop tables. Pure data in `items.ts` and drop wiring in `mobs.ts` — no new mechanics.

- One weapon per `WeaponType` with `slot:'weapon'`, sensible `size`, `reqLevel`, `itemLevel`, per-type `bonuses` (greatsword: high physicalDamage/low attackSpeed; daggers: low dmg/high attackSpeed; bow: `range:7`; staff/wand/grimoire: lean magicDamage), tier-appropriate icons. Fold existing `iron_sword`/`claymore` in as sword-type entries.
- A few pieces per non-weapon slot (armor/helmet/boots/necklace/ring) across tiers with `bonuses` (defense/health/dodge/movementSpeed/attackSpeed) and `reqLevel`.
- Update mob `drops` so gear appears at appropriate tiers; ensure the bow drops early-ish so C2 is testable. Keep rates balanced. NOTE: `game.test.ts` (~lines 113–119) asserts the exact Typhon boss drop table — if you change Typhon's drops, update that test; otherwise leave it.
- Optional invariant tests (every weapon has a weaponType, every equippable has a slot).

`npm test` + `npm run build` pass; commit.
```

---

# Filar B — Tryby sterowania

## B1 · [PLAN] — System trybów podróż/walka + WSAD + skróty

```
PLAN MODE. Introduce explicit control modes and rebind input. Touches `src/input.ts`, `src/main.ts`, and adds a mode field to state — keep `src/game/` pure (mode lives in `GameState`, input stays an event queue).

- `GameState`: add `mode: 'travel' | 'fight'` (default 'travel'). Add `InputEvent` `{ type: 'setMode'; mode }` and `{ type: 'setFireMode'; fireMode: number }`.
- Key bindings in `input.ts`:
  - Backtick `` ` `` → travel.
  - Digits `1`-`4` and Space → fight; digit selects fire mode, Space = mode 1. CRITICAL COLLISION RULE (uwaga 1): Space/digits switch mode ONLY when `state.mode === 'travel'`. Once `mode === 'fight'`, Space and digits are normal typed characters — combat prompts contain spaces (`words.ts` joins words with `' '`; tier-4 lines are full sentences), so without this the sword prompt is untypeable. (Digits don't appear in prompts today, but apply the same rule for future-proofing.)
  - Movement: WSAD AND arrows both move; effective only in travel mode.
  - Travel-mode shortcuts: `i` = toggle inventory, `c` = toggle character. These letters must NOT type (they only act in travel).
  - Fight mode: printable chars feed the combat resolver; WSAD does nothing (you're typing); backtick exits to travel. `Alt`(left OR right)`+digit` switches the bow fire mode WITHOUT typing (decyzja v3-4) — check `e.altKey` and `e.code`/`e.key` for the digit, `preventDefault`. Plain digits still type in fight (per the collision rule above).
  - Exit fight: `Backspace` OR `Esc` returns to travel (aggro persists; mobs keep attacking). Backspace is NOT a typing-correction key (the resolver advances only on correct chars, so there's no wrong-char buffer to erase). Esc precedence: if the inventory/character window is open, Esc closes it first; only if no window is open does Esc exit fight.
  - `Enter` unchanged (ult/respawn). `Tab` may remain an inventory alias.
- Decouple typing-combat from aggro: the typing prompt / `state.combat` is presented only when `mode === 'fight'`. Aggro + mob melee (B2) happen regardless of mode. Entering fight with mobs in range starts the prompt; leaving hides the prompt but does NOT drop aggro (mobs keep attacking). NOTE the dependency: `leech` lives on `Player` (A1) precisely so it survives this travel/fight boundary.
- `main.ts`: wire callbacks; `combatActive()` (for preventDefault) reflects fight mode. Handle held WSAD when switching to fight (clear held movement).

Deliver the plan (exact keymap incl. Alt+digit and Backspace/Esc exit, the Space/digit gating, how mode gates movement vs typing, prompt visibility, Esc precedence, edge cases). Implement after approval. Tests: mode transitions; typing does nothing in travel; Space types a space in fight; Alt+digit switches fire mode without emitting a char; Backspace/Esc exits fight; Esc closes an open window before exiting fight. `npm test` green. Commit.
```

## B2 · [AUTO] — Melee mobów + wygaszenie self-dmg za typo

```
AUTO MODE. Give aggroed mobs an active melee attack, and retire typo self-damage now (so the intermediate build isn't double-punishing — uwaga 5). Pure sim change + constants + tests.

- Add a per-mob attack cooldown (field on `Mob`, timer in seconds). An aggroed mob within `MOB_MELEE_RANGE` (~1.3 tiles) attacks every `MOB_MELEE_INTERVAL` (~1.5s) for `typoDamage` (repurposed as melee damage), boss ×`BOSS_ENRAGE_TYPO_MULT` when enraged. Route through `hurtPlayer`, applying A2 `defense` mitigation and seeded `dodge`. Emit the existing `hurt` fx. Runs every tick (new `mobAttackStep`) regardless of `state.mode`. Aggro/leash unchanged.
- Remove typo self-damage from `combat.ts` `typo()` NOW: delete the `hurtPlayer(...)` call and the typo-specific enrage scaling. KEEP the rest of `typo()` — streak reset, `errorFlash`, and the boss shield-phase phrase restart (uwaga 6). After this, `BOSS_ENRAGE_TYPO_MULT`'s only remaining use is the melee multiplier above; leave the constant, it's still used.
- Tests (update existing, add new): `game.test.ts` "a typo ... hurts by the hardest engaged tier" (~lines 52–62) and "punishes typos 1.5x harder when enraged" (~lines 100–105) assert self-damage that no longer exists — rewrite them (typo resets streak / no HP loss; enrage now scales MELEE). KEEP the boss shield test (~lines 89–98) passing: the typo there must still restart the phrase. Add: a mob in range drains HP deterministically; defense reduces it; seeded dodge sometimes avoids; out-of-range mobs don't hit.

`npm test` + `npm run build` pass; commit.
```

---

# Filar C — Przebudowa walki (leech + style broni)

## C1 · [PLAN] — Life-leech + zielony pasek

```
PLAN MODE. Add the life-leech system. Core change in `src/game/combat.ts` (+ types/constants); green bar in the HUD. Keep sim pure. (Typo self-damage was already removed in B2 — here we add leech and the typo→leech penalty.)

Model (decisions already fixed — do not re-open):
- `leech` lives on `Player` (added in A1), range [0..1] = fraction of `LEECH_CAP` (e.g. 0.10 = max 10% of dealt damage returned as HP). It lives on Player (not CombatState) so it persists across the travel/fight boundary and across re-aggro (uwaga 2).
- Starts FULL (1.0). 
- Drains when the player takes damage (in `hurtPlayer`): amount scales with HP lost — `leech -= dmg * LEECH_DRAIN_PER_HP` (clamp ≥ 0). Bigger hits drain more → tougher mobs feel harder (this is the difficulty knob the user wants).
- Rises `+LEECH_GAIN_PER_CHAR` on each correct keystroke (clamp ≤ 1.0). DELIBERATE (v4-4): the gain is tied to a CORRECT keystroke (char matches the prompt), NOT to `damageMob` actually landing. So leech rises even when a correct char dealt no damage — small AoE radius, or a bow counter holding out-of-range. This matches the "poprawne literki → pasek rośnie" intent; do not gate it on a hit.
- Out-of-combat regen (decyzja v3-11): the meter does NOT regen while fighting or while recently damaged. Once combat has ended AND no damage has been taken for `LEECH_REGEN_DELAY` (~10s), it slowly refills toward 1.0 at `LEECH_REGEN_PER_S`. Track a "seconds since last damage / since combat end" timer; any new hit resets it and stops regen. Do this in the sim tick (`sim.ts`), not tied to `CombatState` (which is null outside fight).
- On a typo: single large step down `-LEECH_TYPO_PENALTY` (e.g. 0.5), never below 0. Fold this into the existing `typo()` path WITHOUT reintroducing self-damage, and KEEP the boss shield-phase phrase restart.
- Healing: on each mob hit, `player.hp = min(maxHp, hp + leech * LEECH_CAP * damageDealt)` — per hit, so multi-target = more healing. Document the exact formula and where it hooks (`damageMob`).
- Keep the separate streak→AoE-radius mechanic for the sword style; leech and streak are independent meters.
- Cleanup (smaller suggestion): `constants.ts` `TYPO_DAMAGE` is now dead (combat reads `mob.typoDamage`); remove it and its import in the test file if unused.

HUD:
- Add a green leech bar directly under the mana bar in `index.html`; style in `style.css` (green CSS var). `hud.ts` reads `player.leech` and updates width on change. Show it whenever `mode==='fight'`/combat is active; hide otherwise.

Deliver the plan (exact formulas, hook points in `hurtPlayer`/`damageMob`/`typo`, the post-combat regen timer in `sim.ts`, HUD wiring). Implement after approval. Tests: correct chars raise leech; typo drops it (not to zero); damage taken drains it proportionally; leech heals proportional to dealt damage; shield-phrase restart still works; no regen for `LEECH_REGEN_DELAY` after last damage, then refills to full. `npm test` green. Commit.
```

## C2 · [PLAN] — Style broni: miecz + łuk (pociski, tryby ognia)

```
PLAN MODE. Add a weapon-style layer so combat resolves per the equipped weapon. Implement `sword` (formalize current behavior) and `bow` (new). Largest change — keep `src/game/` pure; projectiles live in state; rendering is C3.

- `weaponStyle` dispatch in `combat.ts` keyed off the equipped weapon's `weaponType`. Only `bow` gets a new style; EVERYTHING ELSE — unarmed AND every non-bow weaponType (sword/greatsword/daggers/staff/wand/grimoire) — uses the `sword` style for now (decyzja v3-2). `magicDamage` stays inert this step. Sword = today's AoE typing: each correct char damages all aggroed mobs within the streak radius; keep streak→radius and the ultimate. Damage uses A2 `physicalDamage`; healing uses C1 leech.
- ULT unchanged across styles (decyzja v3-6): `streak` keeps incrementing on correct chars regardless of style, so the class ultimate (Enter, streak≥threshold) charges and fires the same way with a bow equipped.
- Bow:
  - Tempo: fire 1 arrow every N correct letters, N = `arrowsPerCharsInterval(player)` (A2 helper; base 5, reduced by attackSpeed, clamp [2,5]). Track a correct-letter counter; typos don't count and trigger the C1 leech penalty (no self-damage). NOTE: there is NO backspace-correction (dropped in v3) — the resolver already advances only on correct chars, so there's no wrong-char buffer; Backspace is bound to "exit fight" (B1).
  - Range: arrows only engage mobs within the weapon `range` (default 7 tiles). Out-of-range (decyzja v3-7): if no valid target is within range, the correct-letter counter HOLDS (does not fire an arrow into empty air) until a target enters range. Leech still rises on those correct letters (v4-4) even while the counter holds — only arrow emission waits.
  - Projectiles: represent arrows as entities in `GameState` (origin, target/dir, speed, damage), advanced each tick until hit or expiry. Damage uses `physicalDamage`; on hit emit `dmg` fx and apply C1 leech. IMPORTANT (smaller suggestion): projectiles are transient — `makeSave` must NOT serialize them into v2 saves, and `applySave` must init them empty.
  - Fire modes (via digit / `setFireMode`):
    - Mode 1 (default): focus one GROUP (mobs aggroed from one spawn spot / pack-link, keyed by `spotIdx` — this grouping already exists via `aggroMob`'s pack-link), lowest-current-HP first, one by one.
    - Mode 2: lure — one arrow at each not-yet-aggroed GROUP in range to pull it (one shot per group). When nothing new is left to lure, fire at all engaged targets one at a time round-robin. No auto-switch to mode 1.
  - Add a helper to enumerate groups and pick targets for both modes.
- Constants: bow base interval, arrow speed, range default, fire-mode params — all in `constants.ts`.

Deliver a detailed plan (style dispatch incl. non-bow→sword fallback, projectile lifecycle in the pure sim, group/target selection per mode, out-of-range counter hold, attackSpeed→N mapping, save exclusion of projectiles). Implement after approval. Tests: non-bow weaponType uses sword style; bow tempo vs attackSpeed; range gating + out-of-range counter hold; mode 1 focus-lowest-HP; mode 2 lure-then-round-robin; ult still charges/fires with a bow; projectiles absent from save roundtrip. `npm test` green. Commit.
```

## C3 · [AUTO] — Render: strzały, zasięg, wskaźnik trybu

```
AUTO MODE. Visualize the new combat. Rendering only (`src/render/*`, colors in `palette.ts`) + HUD indicators — no sim logic.

- Draw flying arrows from the C2 projectile list (small oriented shafts + subtle trail); colors from `palette.ts`.
- Draw a bow range indicator (7-tile ring, distinct from the streak ring) when a bow is equipped in fight mode.
- HUD: show current mode (travel/fight) and, in fight, the active weapon + fire mode (e.g. "Bow · Mode 1 — Focus"). Polish the green leech bar.
- Respect existing isometric projection, culling, depth sort.

`npm run build` passes; commit.
```

## C4 · [AUTO] — Strojenie + test integracyjny

```
AUTO MODE. Balance pass and an end-to-end test.

- Tune constants for feel: melee interval/damage, leech cap/gain/drain/typo-penalty, bow tempo/range, attackSpeed and movementSpeed scaling, defense/dodge curves. Document each in `constants.ts`.
- Add one integration vitest driving the full loop deterministically: travel → walk into aggro → take melee damage (leech drains) → enter fight → type correctly (leech rises, mobs die, HP leeches back) → typo (leech drops) → kill a pack → loot → gold increments. Assert key transitions. Cover both sword and bow paths.

`npm test` + `npm run build` pass; commit.
```

---

# Filar D — Domknięcie

## D1 · [AUTO] — Dokumentacja + QA + weryfikacja

```
AUTO MODE. Finalize the branch.

- Update `CLAUDE.md`: the "The game" section still describes movement as tile-to-tile and "each typo damages YOU" — rewrite it for the implemented systems (equipment/attributes-in-combat, `` ` ``/1-4 control modes, WSAD, mob melee, life-leech replacing typo self-damage, weapon styles/bow). Move the relevant "Metin2 inspiration (not built yet)" bullets (stat points, equipment) into the built section. Keep it lean. Add a one-line note that combat is keyboard-gated (no touch combat) so it isn't later mistaken for a regression against the ~360px responsive promise.
- `io_typingRPG/app.json`: update if title/description/links/status changed. Decide whether the combat overhaul warrants a fresh `grid-thumbnail.png` (regen via `node scripts/thumb.mjs`); if yes, do it, else note why not.
- Write a short manual-QA checklist (travel/fight switching, WSAD+arrows, i/c shortcuts, Space types in fight, drag&drop/equip, reqLevel gating, gold, leech bar behavior on hit vs typing, sword vs bow, bow fire modes 1/2, backspace, save v1→v2 load incl. coin→gold).
- Run `npm test` and `npm run build`; confirm green. Summarize changes and follow-ups: remaining weapon styles (daggers/staff/wand/grimoire/greatsword behaviors + activating `magicDamage`); a gold sink (shop/NPC — gold currently has nothing to spend on); class↔weapon gating via `reqClass`; multiplayer seams untouched. Commit.
```

---

## Podsumowanie kolejności i trybów

| # | Prompt | Tryb |
|---|--------|------|
| P0 | Branch + baseline | AUTO |
| A1 | Model danych (types/items/attributes/save v2 + migracja) | PLAN |
| A2 | Logika eq + atrybuty w walce (+ HUD caller) | PLAN |
| A3 | Okno Inventory+Equipment (UI) | AUTO |
| A4 | Drag & drop + tooltipy | AUTO |
| A5 | Kontent: bronie i przedmioty | AUTO |
| B1 | Tryby podróż/walka + WSAD + skróty (reguła spacji) | PLAN |
| B2 | Melee mobów + wygaszenie self-dmg za typo | AUTO |
| C1 | Life-leech + zielony pasek | PLAN |
| C2 | Style broni: miecz + łuk | PLAN |
| C3 | Render: strzały/zasięg/wskaźniki | AUTO |
| C4 | Strojenie + test integracyjny | AUTO |
| D1 | Dokumentacja + QA + weryfikacja | AUTO |

**5× PLAN** (rdzeń/save), **8× AUTO** (UI/kontent/testy). Po każdym promocie: **commit** + `npm test` + szybki rzut oka w grze.

### Znane zależności testowe (żeby model ich nie przeoczył)
- `game.test.ts` l.40–50 → zmienia **A2** (physicalDamage zamiast baseDamage).
- `game.test.ts` l.52–62 i l.100–105 → zmienia **B2** (koniec self-dmg za typo; enrage skaluje melee).
- `game.test.ts` l.89–98 (tarcza bossa) → **B2/C1** muszą to zostawić zielone (restart frazy).
- `game.test.ts` l.157–176 (save roundtrip) → zmienia **A1** (siatka + v2).
- `game.test.ts` l.113–119 (drop bossa) → tylko jeśli **A5** ruszy dropy Typhona.
- `save.ts` l.39 i l.52 (`v===1`) → zmienia **A1** (dopuścić v2).
- `game.test.ts` l.125–132 (level-up „fully heals" przez `maxHp`) → **A2** zmienia `maxHp`/`maxMp` (ujednolicenie); test ma dalej przechodzić dzięki parytetowi baz — dodać osobny test parytetu maxHP/MP na kilku poziomach.
- `classes.ts` `maxHp`/`maxMp` → zmienia **A2** (źródło z atrybutów health/energy zamiast tylko klasa+poziom).
