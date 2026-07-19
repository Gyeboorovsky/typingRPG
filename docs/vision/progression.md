# Progression breadth — crafting, quests/story, mounts & pets (and how they interlock)

Vision (user): all three wanted; propose how they interconnect. Balance
philosophy: lean classic Metin2 grind (not heavy catch-up), but moderate —
open to judgment (see §5).

---

## 1. Current-state assessment

- **Crafting/upgrading seams already exist as data:** `ItemDef` reserves
  `upgradable`, `upgradeMats`, `recipe` and `ItemStack.plus`
  (`src/game/types.ts`); `items.ts` populates `upgradeMats` on every weapon
  and one `recipe` (hp_potion ← slime_gel). Materials (`slime_gel`,
  `boar_tusk`, `dark_shard`, `rune_cloth`, `typhon_horn`) drop today with no
  purpose — the demand side is simply unbuilt. CLAUDE.md's roadmap lists
  "+0→+9 and crafting (fields already reserved)".
- **Stat/level progression is solid and shared-path:** XP curve, 4 stat
  points per level at 25% XP quarters (`statPointsEarned`/`recomputeStatPoints`
  in `attributes.ts`), dirty-tracked saves. `MAX_LEVEL=120` is currently
  cheat-only (flagged in `multiplayer-architecture.md` §3 — MMO needs it
  real).
- **Quests: nothing exists.** No quest state on `Player`, no NPC concept, no
  dialogue UI. Mobs/maps are data-driven enough that kill/collect quests are
  cheap once a quest data shape exists.
- **Mounts/pets: nothing exists**, but the hooks are visible: `moveSpeed()`
  (attributes.ts) is the one place mount speed folds in; `stepDrops` pickup
  radius is where a loot-pet hooks; the renderer's entity pass takes a
  follower sprite trivially.

## 2. Proposed shapes

### Crafting & upgrading (the Metin2 spine — build FIRST of the three)
- **Upgrading +0→+9:** at a blacksmith NPC: gold + `upgradeMats` per attempt;
  success chance drops per level (e.g. 100/95/90/80/65/50/40/30/20%); on
  failure at higher tiers the item keeps level (soft) or drops one (+7→+6,
  spicy Metin2 default) — tune in beta, start soft. `plus` scales weapon
  damage via a `WEAPON_PLUS_DMG`-style constant next to the existing
  `WEAPON_ILVL_DMG` (attributes.ts). This is simultaneously: the gear chase,
  the material demand, the gold sink, and the trade-economy driver
  (`economy.md`). Single-player can ship a first version of this BEFORE any
  server exists — it's pure sim + one NPC UI.
- **Crafting proper:** `recipe` on more items (potions, mid-tier gear,
  cosmetic dyes later); learned recipes as droppable/quest-reward items for
  chase depth. Keep it flat (no crafting-skill levels) at first — Metin2
  itself is thin here; depth belongs in upgrading.

### Quests / story (data-driven, typing-flavored)
- Quest defs as pure data (`src/game/quests.ts`): giver NPC, steps
  (kill N / collect N / deliver / **type-a-passage** — a scribe/oath step
  where the quest text IS the prompt: story delivered through the core verb;
  no other MMO can do this), rewards (XP/gold/items/recipe/title).
- `Player.quests: {id, step, progress}` — soft-optional SaveData field
  (same precedent as `stats?`; no forced version bump).
- NPCs: static map objects (map pipeline object layer) with a dialogue panel
  in `src/ui/`. Story arc frame that fits the existing lore (Typhon the
  Word-Eater, `words.ts` tier-4 phrases): a world where language is being
  devoured; leveling = reclaiming words — conveniently justifies word-pool
  tiers per zone.
- Server era: progress validated server-side like all state (a quest is just
  more reducer events).

### Mounts & pets (distinct roles, no overlap)
- **Mounts = travel utility:** +40–60% `moveSpeed` out of combat; entering
  fight dismounts (mode system makes this trivial and is consistent with the
  locked manual-fight-entry model). Acquired via quest chain (first mount
  free-ish, story moment) and rarer drops/craft; cosmetic skins are the
  monetization surface (`monetization.md`), never speed tiers beyond a small
  premium-adjacent margin — recommend speed identical across skins.
- **Pets = passive companion:** auto-pickup drops in a radius (quality-of-
  life, huge in a typing game where hands never leave home row), small stat
  bonuses, cosmetic presence. **Feeding/leveling loop eats materials** (pet
  XP from consuming `slime_gel` etc.) — a deliberate material sink so
  low-tier drops never become vendor trash.

## 3. How the three interconnect (the requested weave)

Quests introduce systems (first upgrade quest → blacksmith; first mount
quest → stables; pet egg from a boss quest). Grinding drops materials →
crafting/upgrading consumes them → pets eat the surplus → shops/trading move
the imbalances between players (`economy.md`). Mounts shorten travel between
hunting maps (`maps-and-rendering.md` teleports cover long hauls; mounts own
mid-range). Endgame instances (`endgame.md`) drop the rare upgrade materials
(+7→+9 tier), making raids the top of the same material pyramid rather than a
separate gear track. One resource graph, no orphan systems.

## 4. Veteran/newcomer balance (user asked for judgment — recommendation)

Lean grind, moderate softening. Concretely:
- NO XP-boost catch-up mechanics baked into the game (boosts exist only as
  the time-limited monetized ring — user's own example).
- Softening levers that don't cheapen the grind: account-wide unlocks
  (mount/pet types, cosmetics, titles — alts skip nothing that matters);
  smooth XP curve without Metin2's brutal wall-levels; newcomer zones rich in
  materials veterans still want (economic interdependence instead of level
  charity); "rested"-style small bonus ONLY if beta retention data demands it
  (explicitly a break-glass option, not a launch feature).
- Death penalty: adopt a small XP loss on PvE death at server launch
  (`RESPAWN_FULL = true` in constants.ts is already commented as a "future
  knob") — grind-lean identity wants death to sting a little. ⚠ This changes
  a standing (if soft) assumption; log it when decided.

## 5. ⚠ Decision-log cross-checks

- Stat-point granting is locked to the shared `recomputeStatPoints` path
  (cheat and natural leveling may never diverge — decisions.md). Any quest/
  item that grants stat points must route through the same function.
- Consumables-in-travel-only (v3-3) shapes potion crafting demand — fine,
  just keep it in mind when tuning potion recipes (they compete with leech,
  not with combat healing).
- `MAX_LEVEL` becoming a real cap (multiplayer memo §3) interacts with the XP
  curve tail — one decision, two documents; decide once.
