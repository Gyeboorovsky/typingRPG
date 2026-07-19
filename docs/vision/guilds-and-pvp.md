# Guilds & PvP — Metin2-style wars, open-world PvP, arenas

Vision (user): high priority, Metin2-style — guild wars, likely open-world
PvP and/or arenas; propose the concrete shape.

---

## 1. Current-state assessment

- Nothing social exists (correctly — no speculative code). Relevant existing
  substrate: combat is fully event-driven and per-actor once the multi-player
  sim refactor lands (`multiplayer-architecture.md` §2.2); `hurtPlayer` in
  `src/game/combat.ts` is the single damage choke point (PvP damage will flow
  through the same door, which keeps godmode/admin/immunity rules in one
  place); the mode system (`GameState.mode`, fight entered manually — locked
  in decisions.md) shapes how PvP engagement can even start.
- **The genre question nobody else will ask: what IS typing PvP?** Two
  players "fighting" = both typing prompts; your correct chars damage your
  target, your typos cost you (leech penalty). It is a WPM race modulated by
  gear/level/class. This is honest to the game's identity — but raw typing
  skill will dominate harder than mechanical skill dominates in Metin2.
  Grind-lean philosophy (user) says gear/level SHOULD matter; the balance
  lever is how steeply stats scale player-vs-player damage. Flag it as a
  design axis to tune in beta, not solve on paper.

## 2. Proposed concrete shape (three layers, shipped in this order)

### 2.1 Guilds (the social base — ship with or right after parties)
- Create at NPC: level requirement + hefty gold fee (economy sink). Name,
  tag, emblem (cosmetic customization hook → `monetization.md` dyes).
- Ranks (leader/officer/member), MOTD, guild chat channel, roster with
  online status. Guild level/XP from member activity unlocking capacity
  (member cap 30 → 60) and cosmetics — **not power** (avoids "mandatory guild
  buffs" pressure; deviation from Metin2's dragon-god buffs, flagged as a
  deliberate softening consistent with 'moderate' balance stances elsewhere).
- Guild bank later (item-instance + logging prerequisites from `economy.md`
  first — banks are dupe/theft magnets).

### 2.2 Guild wars (the Metin2 centerpiece)
- Declared war (leader vs leader, both consent, gold stake optional):
  war-flagged members are mutually attackable EVERYWHERE (except safe towns)
  for the duration; scoreboard = kills (Metin2 classic) with a first-to-N or
  timed format; results broadcast, winner takes stake + a cosmetic banner
  period. Non-consensual "hostile declaration" (Metin2 allows it) is
  deliberately deferred — great drama, terrible for a small young community.
- Arranged battlefield war as a v2: instanced map (reuses the instance tech
  from `endgame.md`), objective-based (hold points where holding = typing an
  endless capture prompt — a genuinely typing-native objective).

### 2.3 Open-world PvP + arenas
- **Zone-flag model (recommended):** safe zones (towns, starter maps), PvP-on
  zones (high-tier hunting maps — risk/reward where the best spots are
  contested, very Metin2), optional FFA pockets (boss arenas). Rules are map
  data (`MapDef.pvpRule` — hooks into the map pipeline,
  `maps-and-rendering.md` §2). Level-band protection (can't attack players
  >K levels below) in PvP-on zones to blunt seal-clubbing.
- Arenas: 1v1 and small-team queue from town NPC; instanced; normalized
  nothing (gear matters — grind-lean), but seasonal ratings + cosmetic
  rewards. Cheap once instances exist.
- Death rules in PvP: no gear loss (Metin2 item-drop-on-PK is legendary and
  legendarily toxic); XP penalty only in PvE deaths if adopted
  (`progression.md`). PK/karma system only if non-consensual overworld
  attacks ever ship — the zone-flag model makes karma unnecessary (attacking
  is opt-in by location), which is a big simplification. **Recommendation:
  zone-flag, no karma system.**

### Typing-native PvP mechanics worth prototyping
- Both fighters see their own prompt; damage rate = correct chars/s ×
  stat scaling. Interrupts: your completed prompt scrambles 2 chars of the
  opponent's current word (counterplay beyond raw WPM).
- The ult (streak ≥ threshold, Enter — `tryUltimate` in `combat.ts`) works
  unchanged and becomes the comeback mechanic.
- Anti-cheese: entering fight mode is already manual (locked decision);
  being attacked must NOT force a prompt on the victim (consistent with
  "mode is fully decoupled from aggro") — a fleeing player just takes hits,
  same as mob melee today. This preserves the locked input model in PvP
  untouched.

## 3. Latency & fairness in PvP

Per the user's stance (typing game, looser fairness): server timestamps
keystroke batches; per-keystroke fairness between a 30 ms and a 150 ms player
is dominated by WPM anyway. One rule matters: damage lands when the SERVER
processes it, identically for both sides — no client-side hit claims
(`anti-cheat.md`). Multi-continent shards someday = regional arenas, shared
overworld tolerable.

## 4. ⚠ Decision-log cross-checks

- **Mode/aggro decoupling + manual fight entry are locked** — §2.3's victim
  rule is designed to comply; any future proposal to auto-enter fight on
  being PK'd would need a decisions.md walk-back. Flagged so it isn't done
  casually.
- **Fight-mode printable reservation** (all printables type in fight) means
  PvP needs no new input rules at all — chat-while-fighting is impossible by
  design, which is actually a fairness feature; note it in chat design
  (`additional-ideas.md`).
- Guild/war fees assume the gold-sink framework (`economy.md`); wars assume
  parties/instances (`endgame.md`); everything here sits behind the
  multiplayer alpha in `priority-order.md`.
