# Combat modes — per-weapon mode sets on the fireMode 1–4 pattern

Vision (user): 4 selectable combat modes per weapon. Sword = AoE (existing,
keep). Bow = single-target with a selectable target-priority sub-mode
(sequential / nearest / strongest / …), tying into
`docs/future-target-indicators.md`. Wand/rod = propose a fitting mechanic
(bow-adjacent but distinct). Grimoire (priest) = 4 modes: AoE heal,
single-target heal on a chosen group ally (GREEN inverted triangle, distinct
from the RED attack triangle), weaker-AoE damage, and a fourth attack mode to
be proposed. Propose additional weapon types with their own mode sets reusing
the 4-mode pattern.

---

## 1. Current-state assessment

The 4-mode skeleton **already exists end to end** — it just has no behavior:

- `GameState.fireMode: number` (1..4) with a `setFireMode` InputEvent
  (`src/game/types.ts`), applied in `update()` (`sim.ts`).
- The keymap has `enterFight1..4` (Space/2/3/4 — enter fight *in* mode N) and
  `fireMode1..4` (Alt+1..4 — switch mode mid-fight without typing), enforced
  by the two-action-class rules in `src/keybinds.ts`. This maps 1:1 onto
  "4 selectable combat modes" — no input work needed beyond labels.
- Weapon identity is data-complete: `WeaponType` covers
  `sword|greatsword|daggers|bow|staff|wand|grimoire` and `src/game/items.ts`
  already ships at least one item of every type, with `weapon.range` on bows
  and `attackSpeed`/`magicDamage` bonuses distributed sensibly.
  `arrowsPerCharsInterval()` (bow tempo from attackSpeed) exists in
  `attributes.ts`. `magicDamage` is deliberately inert (PLAN.md v3-2).
- Combat resolution is one seam: `resolveKeystroke()` in `src/game/combat.ts`
  is where every correct char turns into damage (currently: AoE within
  `radiusFor(streak)` on all aggroed mobs). A weapon-style dispatch keyed on
  the equipped `weaponType` slots in exactly here — PLAN.md C2 already
  frames it that way.
- Targeting groundwork: `aggroMob()` pack-links by `spotIdx` (the "group"
  concept C2's bow modes use); `docs/future-target-indicators.md` specs the
  yellow in-range glow + red ▽ target marker, dependent on Group B's practice
  fight; indicator colors are required to be config-driven, not hardcoded.
- **Nothing else exists yet**: no projectiles, no target selection state, no
  party/ally concept (grimoire's single-heal mode has a hard dependency there),
  no healing-anyone-but-self anywhere in the sim.

## 2. Proposed shape: a WeaponStyle contract

One dispatch table keyed by `weaponType`, each style defining up to 4 modes
(the meaning of `fireMode` 1–4 for that weapon). Unused slots no-op with a HUD
hint. Suggested contract per style (pure, in `combat.ts` or a new
`src/game/styles/` if it outgrows one file): how a correct char converts to
effect; how a target is chosen; what completing a prompt does; what a typo
does beyond the shared streak-reset/leech-penalty.

Shared invariants to preserve (all locked or landed): streak grows on correct
chars regardless of style → ult keeps charging (PLAN.md v3-6); leech rises per
correct char, not per hit (v4-4); boss shield flawless-phrase rule; typo
self-damage stays dead (B2) with leech penalty instead (C1).

### Per-weapon mode sets (proposal — numbers are placeholders for constants.ts)

**Sword (exists):**
1. AoE — current behavior (radius from streak). Keep as-is.
2. *Cleave-forward* — same damage budget concentrated in a facing-cone: ~1.6×
   damage inside a 120° cone, nothing behind. Positioning starts to matter.
3. *Riposte stance* — −25% outgoing, but each completed prompt grants a brief
   block (next melee hit −75%). Tank flavor for pulls.
4. *Executioner* — single-target only (current red-▽ target), +streak-scaled
   bonus vs targets under 30% HP. Bridges into the bow's targeting UI.

**Bow (single-target + priority sub-mode — the user's spec):** the four
fireModes ARE the target-priority selectors; damage model is shared (arrow per
N correct chars via `arrowsPerCharsInterval`, `weapon.range` gate, counter
holds out of range per v3-7):
1. *Sequential* — lock current target until it dies, then next in aggro order.
2. *Nearest* — always the closest aggroed mob (re-evaluated per arrow).
3. *Strongest* — highest current HP (or highest tier first).
4. *Weakest* — lowest current HP (finisher; this is C2-mode-1's heart).
   The red ▽ shows the current lock; the yellow glow shows in-range candidates
   (exactly the indicators doc). ⚠ PLAN.md C2 tension — see §4.
   C2's "lure" behavior (pull a fresh group with one arrow) becomes a
   *contextual* rule available in any mode when aiming at a non-aggroed group
   (consistent with Group B's pull-nearest practice-prompt decision), instead
   of occupying a whole mode slot.

**Wand/rod (proposed mechanic — "focus channel," bow-adjacent but distinct):**
where the bow is *discrete packets on a counter*, the wand is a *continuous
beam that rewards staying on one target*: every correct char deals small
`magicDamage`-scaled damage to the locked target immediately (no counter, no
projectile travel), and consecutive chars on the SAME target ramp a focus
multiplier (e.g. +4%/char up to +60%); switching targets or a typo resets the
ramp. Feels completely different in the hands: bow = rhythm/burst, wand =
commitment. Modes reuse the bow's four priority selectors (sequential/nearest/
strongest/weakest) so the targeting UI and code are shared — this finally
activates `magicDamage` (PLAN.md earmarked wands for exactly that).

**Grimoire (priest) — 4 modes per the user's spec:**
1. *AoE heal* — correct chars heal all GROUP members in radius (self included)
   for a small magicDamage-scaled amount; no damage dealt.
2. *Single heal* — heal a chosen ally; the chosen ally carries a **GREEN
   inverted triangle** (new palette/config entry alongside the red ▽ —
   indicator colors are already required to be configurable). Ally selection
   reuses the priority-mode machinery (nearest ally / lowest-HP ally /
   sequential cycling) or an explicit cycle key — needs a small design pass.
   **Hard dependency: a party/group system** (see `endgame.md`); until groups
   exist this mode can degrade to self-heal so the weapon isn't dead solo.
3. *AoE smite* — weaker AoE damage (e.g. 0.6× sword AoE, magicDamage-scaled).
4. *Fourth attack mode — proposal, pick one:*
   - **(a) Lifelink lash (recommended):** single-target damage; a share (e.g.
     50%) of damage dealt heals the lowest-HP group member. Solo it heals
     self, so it works day one, and it is the most "priest" of the options —
     attack and support in one action.
   - (b) Word of ruin: completing a prompt flawlessly detonates an AoE burst
     (per-char chip is tiny, the payoff is the completion) — a distinct
     "cadence" mechanic, but overlaps conceptually with the boss-shield rule.
   - (c) Curse/DoT: chars stack a damage-over-time on the target — cheap to
     build but the least distinct next to the wand ramp.

**Additional weapon types (reusing the pattern; all already in items.ts):**
- *Greatsword:* damage banks per char and detonates on **word completion**
  (space/prompt-segment) as one heavy AoE hit — slow, chunky, attackSpeed
  lowers the bank threshold. Modes: 1 radial burst / 2 cone / 3 shockwave line
  / 4 single-target crush.
- *Daggers:* every char hits the locked target; every Nth consecutive
  flawless char adds a bonus proc hit; typos hurt it most (highest skill
  ceiling). Modes = the four priority selectors.
- *Staff:* AoE magic mirror of the sword (magicDamage-scaled), giving
  wizard/priest an AoE farm option: 1 radius AoE / 2 targeted splash (hits
  target + neighbors within 1.5 tiles) / 3 slow-field (damage + brief slow) /
  4 mana-weave (less damage, refunds MP per completed prompt).

Class↔weapon gating: `reqClass` already exists as a seam on `ItemDef`
(unused, PLAN.md v3-10). Metin2-style identity suggests eventually gating
grimoire→priest etc.; leave open until class selection UI exists.

## 3. What would need to change

- `combat.ts`: extract the char→damage block of `resolveKeystroke` into the
  style dispatch; add `TargetLock` state (per-player; transient, not saved —
  same treatment as `fireMode`).
- `types.ts`: projectile entities for bow (C2 already specs: transient, never
  serialized); a `targetId`/`allyTargetId`; later `groupId` on Player.
- `render/`: arrows (C3), the two triangles + glow (indicators doc); palette
  entries via config-driven colors (`configs.md`).
- `hud.ts`: mode name/labels per weapon (the "Bow · Mode 1 — Focus" line C3
  already plans), plus a "mode does nothing for this weapon" hint.
- `constants.ts`: per-style tuning blocks.
- `PLAN.md`: C2/C3 need re-scoping around this design before implementation.

## 4. ⚠ Decision-log / PLAN.md conflicts to resolve consciously

1. **PLAN.md C2 specs exactly TWO bow modes** (mode 1 focus-lowest-HP within a
   group, mode 2 lure-then-round-robin). The user's new vision (four
   target-priority sub-modes; single-target identity) **supersedes** that
   spec. C2 has not been implemented, so nothing is walked back in code — but
   C2's prompt text must be rewritten before it is ever run, or Claude Code
   will faithfully build the outdated two-mode design. This memo's §2 is the
   candidate replacement shape.
2. **Group B pull-nearest** (locked 2026-07-17): the bow/wand "attack a
   non-aggroed mob to pull it" path must reuse Group B's pull logic and its
   "streak resets on pull" rule, not grow a parallel one — decisions.md
   explicitly warns against parallel targeting concepts.
3. **Indicator colors config-driven** (indicators doc): adding the green heal
   triangle as a hardcoded palette value would violate that spec; it belongs
   with the red ▽ in whatever config surface lands (`configs.md`).
4. **Grimoire mode 2 requires groups**, which nothing in decisions.md or
   PLAN.md schedules yet — a sequencing dependency to make explicit in
   `priority-order.md`, not a conflict per se.
5. Multiplayer: every targeting/mode decision must resolve server-side later
   (target locks are intents, not client-computed hits) — designing styles as
   pure sim functions (as above) keeps that free.
