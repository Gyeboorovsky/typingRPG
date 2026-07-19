# Endgame — group dungeons, instances, raids

Vision (user): group dungeons/instances/raids — high priority.

---

## 1. Current-state assessment

- The boss fight is the embryo: Typhon's shield phases (flawless-prompt
  breaks, `BOSS_SHIELD_AT` in `constants.ts`, shield logic in
  `combat.ts`/`damageMob`) and enrage (`BOSS_ENRAGE_HP`) prove the sim can do
  phase mechanics; the rock-ring arena in `map.ts` is a hand-authored
  proto-instance. CLAUDE.md's roadmap already names "a dungeon-style instance
  for the boss (or bosses)".
- Missing prerequisites, in dependency order: **party/group system** (nothing
  exists; also blocks grimoire ally-heal — `combat-modes.md` §4), **multi-map
  + teleports** (`maps-and-rendering.md` §5 — an instance IS a map whose
  ZoneState is spun up per group), and the multiplayer server itself for
  anything "group."
- Useful architectural note: once zones are instantiable (`ZoneState` per the
  multiplayer memo), an instance is not a new system — it's a zone with a
  lifecycle (create on party entry, destroy on completion/timeout) and a
  membership allowlist. The refactor pays for dungeons "for free."

## 2. Proposed shape

### Party system (prerequisite, small, high-leverage)
Invite/accept, 2–5 players, leader, party chat, member frames (HP/MP/leech)
in the HUD — the frames double as the grimoire heal-target UI (green ▽
selection, `combat-modes.md`). Shared XP with proximity rule; personal loot
(`economy.md` recommendation).

### Dungeons (first endgame beat)
- Instanced 3–5 player runs, 15–30 min, per-group `ZoneState`, entry via a
  portal object on hunting maps (map-pipeline object layer) or town NPC.
- **Typing-native group mechanics** (this is where the game can be genuinely
  original — design candidates to prototype):
  - *Relay phrases:* a long boss phrase split into segments, each assigned to
    a different member; the next segment unlocks when the previous completes
    — coordination without voice chat.
  - *Simultaneous flawless:* Typhon's shield rule generalized — shield breaks
    only if ALL members complete their prompt typo-free within a window.
  - *Word wards:* adds spawn with a word floating over them (indicator tech);
    the member whose prompt contains that word kills it on completion.
  - *Silence zones:* floor hazards that scramble your prompt while stood in
    them — movement (Alt-modifier unlock, already locked in) becomes part of
    the dance.
- Difficulty tiers (normal/hard) via server config multipliers; daily
  lockouts or entry tickets as pacing (tickets also being an economy sink —
  but NOT a monetized item; see `monetization.md` guardrails).

### Raids (later, 2×–3× party size)
Longer instances stitching dungeon mechanics into multi-phase bosses; weekly
lockout; drop the rare +7→+9 upgrade materials so raiding tops the single
material pyramid (`progression.md` §3) instead of forking a separate gear
track. First raid can literally be "Typhon, reborn" — the existing boss
elevated, which is also good lore continuity.

### Solo endgame (don't starve solo players)
Infinite "typing gauntlet" tower (escalating prompt tiers/WPM pressure,
weekly leaderboard — pure server-validated typing prestige, cosmetic
rewards). Cheap: it's one small map + spawn waves + the existing prompt
system.

## 3. ⚠ Decision-log cross-checks

- Auto-exit-fight is edge-triggered on the aggro list emptying (locked,
  Group B) — wave-based encounters must aggro the next wave BEFORE the last
  mob dies or accept a fight-mode drop between waves; mechanics above assume
  the practice-fight/edge-trigger semantics land as decided. No conflict,
  one sequencing dependency.
- Boss shield restart-on-typo behavior is protected by tests (decisions.md/
  PLAN.md) — generalizing it to group-flawless must keep the solo semantics
  intact.
- Everything here sits behind: multi-player sim refactor → maps/zones →
  parties. Ordering argued in `priority-order.md`.
