# Combat rework — scope, ordering, risk

**Status:** planning (questions open)
**Part of:** combat rework — this file is the entry point; the sibling files are
[combat-aggro-targeting.md](combat-aggro-targeting.md),
[combat-ring-range.md](combat-ring-range.md),
[combat-streak.md](combat-streak.md),
[combat-damage-dot.md](combat-damage-dot.md),
[combat-mob-attacks.md](combat-mob-attacks.md),
[combat-weapons-modes.md](combat-weapons-modes.md),
[combat-skill-slots.md](combat-skill-slots.md).
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 53–58.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. This is no longer the same plan ⚠️
**How I read it:** Claude Code's earlier plan fixed two bugs and rebuilt the ring. Your
answers add: weapon-dependent targeting, a triangle targeting system, a mob-config
rebuild, the on-miss model, per-weapon range, multiplayer preparation.
**Consequence:** this grew from one stage into a minimum of four. Squeezing it into one
prompt is exactly the situation where you previously chose the small-steps path (leave
the foundation untouched as long as possible).
**Proposed split:**
1. **Bugfixes + ring** — the fight-entry race, a ring that actually hits, ring
   dynamics, three visual states. No weapon or mob changes. (Essentially the current
   plan, minus aggro-everything.)
2. **Targeting system** — `targets` in state, red/green triangles, selection modes,
   `maxTargets`. Unblocks the bow and healing.
3. **Mob config + damage model** — DoT, on-miss, mob attack range, defense,
   `mob.target`, `attackShape` as data.
4. **Weapons** — sword/bow differ by range and targeting, modes.
Only after that: skill slots.

### 2. Which stage first?
**How I read it:** stage 1 fixes two real bugs that break your game right now.
**Consequence:** the fixes aren't worth holding back while the rest is being designed.
**Proposal:** stage 1 immediately, but with **one change vs the earlier plan**: don't
blindly aggro everything in the ring — write `aggro ← damage`
([combat-aggro-targeting.md](combat-aggro-targeting.md) #1) instead. Same result for
the sword, but the rule is correct from day one and stage 4 won't have to undo it.

### 3. What about the ult in the meantime?
**How I read it:** the ult is to be rebuilt per class; you haven't thought about it.
**Consequence:** Claude Code's earlier plan modifies it (an "engaged target" condition,
radius from `aoe`). That's investing in something that will be thrown away anyway.
**Proposal:** a minimal patch just so it compiles and doesn't crash — zero design work.
Record in `docs/decisions.md` that the ult is temporary.

### 4. `docs/decisions.md` needs updating
**How I read it:** Claude Code maintains the decision log now.
**Consequence:** three recorded decisions are already stale: auto-exit (removed),
practice mode (no longer exists mechanically), the "nearest in range" pull (replaced
by `aggro ← damage`).
**Proposal:** make this an explicit, separate work item — otherwise the next session
will audit code against a decision log that is no longer true.

### 5. Tests: what can actually be verified automatically
**How I read it:** the fight-entry race is DOM-side, so untestable in the pure suite.
**Consequence:** the biggest bug that annoys you ("sometimes it doesn't enter the
fight") can be verified **only manually**. Green tests say nothing about it.
**Proposal:** when accepting stage 1, press Space a dozen-plus times in a row and count
whether it entered every time. That is the only trustworthy test of this fix.

### 6. Should the vision memos review this?
**How I read it:** `docs/vision/` holds the long-range design memos for the game's
target shape.
**Consequence:** this rework touches things those memos designed (weapons, modes,
mobs). If they say something different, drift appears.
**Proposal:** before stages 3–4, read the relevant memos (`docs/vision/combat-modes.md`,
`docs/vision/progression.md`) and report contradictions explicitly. Cheap, and it
protects against building something that has to be walked back in a month.

---

## Summary: the three things I consider most important

1. **[combat-damage-dot.md](combat-damage-dot.md) #4** — typo spam with no on-miss
   cooldown is a real hole that lets you kill yourself in a fraction of a second. Must
   be solved before this ships.
2. **[combat-streak.md](combat-streak.md) #4** — the streak currently has no consumer.
   Either give it a role, or state explicitly that it waits for the ult.
3. **Question 1 above** — this grew into four stages. Squeezing it into one prompt is a
   straight road to Claude Code quietly simplifying something.

---

## Appendix — previous plan, Pillar C (SUPERSEDED — reference only)

The staged prompts below come from the old root `PLAN.md` (deleted in the 2026-07-19
docs restructure; full text in git history). They predate the combat-rework questions
above and **must not be executed as-is**. C2 in particular (two-mode bow) is directly
superseded by the four-target-priority-mode vision. **C1 (life-leech) is still largely
relevant** and should be salvaged when the corresponding stage is planned.

### C1 · [PLAN] — Life-leech + green bar (largely still relevant)

```
PLAN MODE. Add the life-leech system. Core change in `src/game/combat.ts` (+ types/constants); green bar in the HUD. Keep sim pure. (Typo self-damage was already removed in B2 — here we add leech and the typo→leech penalty.)

Model (decisions already fixed — do not re-open):
- `leech` lives on `Player` (added in A1), range [0..1] = fraction of `LEECH_CAP` (e.g. 0.10 = max 10% of dealt damage returned as HP). It lives on Player (not CombatState) so it persists across the travel/fight boundary and across re-aggro.
- Starts FULL (1.0).
- Drains when the player takes damage (in `hurtPlayer`): amount scales with HP lost — `leech -= dmg * LEECH_DRAIN_PER_HP` (clamp ≥ 0). Bigger hits drain more → tougher mobs feel harder (this is the difficulty knob the user wants).
- Rises `+LEECH_GAIN_PER_CHAR` on each correct keystroke (clamp ≤ 1.0). DELIBERATE (v4-4): the gain is tied to a CORRECT keystroke (char matches the prompt), NOT to `damageMob` actually landing.
- Out-of-combat regen (v3-11): the meter does NOT regen while fighting or while recently damaged. Once combat has ended AND no damage has been taken for `LEECH_REGEN_DELAY` (~10s), it slowly refills toward 1.0 at `LEECH_REGEN_PER_S`. Track the timer in the sim tick (`sim.ts`), not tied to `CombatState`.
- On a typo: single large step down `-LEECH_TYPO_PENALTY` (e.g. 0.5), never below 0. Fold into the existing `typo()` path WITHOUT reintroducing self-damage; KEEP the boss shield-phase phrase restart.
- Healing: on each mob hit, `player.hp = min(maxHp, hp + leech * LEECH_CAP * damageDealt)` — per hit, so multi-target = more healing.
- Leech and streak are independent meters.
- Cleanup: `constants.ts` `TYPO_DAMAGE` is dead (combat reads `mob.typoDamage`); remove it.

HUD: green leech bar under the mana bar; green CSS var; show when fighting.

Tests: correct chars raise leech; typo drops it (not to zero); damage taken drains it proportionally; leech heals proportional to dealt damage; shield-phrase restart still works; no regen for `LEECH_REGEN_DELAY` after last damage, then refills. `npm test` green. Commit.
```

⚠ Note (2026-07-19): "typo self-damage was already removed in B2" and the typo→leech
penalty conflict with the new on-miss model
([combat-damage-dot.md](combat-damage-dot.md) #1) — reconcile when planning.

### C2 · [PLAN] — Weapon styles: sword + bow (SUPERSEDED by the 4-mode targeting vision)

```
PLAN MODE. Add a weapon-style layer so combat resolves per the equipped weapon. Implement `sword` (formalize current behavior) and `bow` (new). Keep `src/game/` pure; projectiles live in state; rendering is C3.

- `weaponStyle` dispatch in `combat.ts` keyed off the equipped weapon's `weaponType`. Only `bow` gets a new style; everything else (unarmed AND every non-bow weaponType) uses the `sword` style for now (v3-2). `magicDamage` stays inert.
- ULT unchanged across styles (v3-6): `streak` keeps incrementing on correct chars regardless of style.
- Bow:
  - Tempo: fire 1 arrow every N correct letters, N = `arrowsPerCharsInterval(player)` (A2 helper; base 5, reduced by attackSpeed, clamp [2,5]).
  - Range: arrows only engage mobs within the weapon `range` (default 7 tiles). Out-of-range (v3-7): the correct-letter counter HOLDS until a target enters range.
  - Projectiles: entities in `GameState` (origin, target/dir, speed, damage), advanced each tick. Transient — `makeSave` must NOT serialize them.
  - Fire modes (via digit / `setFireMode`):
    - Mode 1 (default): focus one GROUP (pack-link by `spotIdx`), lowest-current-HP first, one by one.
    - Mode 2: lure — one arrow at each not-yet-aggroed GROUP in range; then round-robin engaged targets.
- Constants: bow base interval, arrow speed, range default, fire-mode params — all in `constants.ts`.
```

### C3 · [AUTO] — Render: arrows, range, mode indicator (depends on C2's shape)

```
AUTO MODE. Visualize the new combat. Rendering only (`src/render/*`, colors in `palette.ts`) + HUD indicators — no sim logic.
- Draw flying arrows from the projectile list (small oriented shafts + subtle trail).
- Draw a bow range indicator (7-tile ring, distinct from the streak ring) when a bow is equipped in fight mode.
- HUD: show current mode (travel/fight) and, in fight, the active weapon + fire mode. Polish the green leech bar.
- Respect existing isometric projection, culling, depth sort.
```

### C4 · [AUTO] — Tuning + integration test (still conceptually valid)

```
AUTO MODE. Balance pass and an end-to-end test.
- Tune constants for feel: melee interval/damage, leech cap/gain/drain/typo-penalty, bow tempo/range, attackSpeed and movementSpeed scaling, defense/dodge curves. Document each in `constants.ts`.
- Add one integration vitest driving the full loop deterministically: travel → aggro → take melee damage → enter fight → type correctly → typo → kill a pack → loot → gold increments. Cover both sword and bow paths.
```
