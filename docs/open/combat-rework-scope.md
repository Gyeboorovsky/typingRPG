# Combat rework — stage plan & progress

**Status:** in-progress. ALL questions answered (2026-07-19) — decisions in
`docs/decisions.md` → "Combat rework — decisions locked so far" and onward. This is
now the working file: stages, tasks, status markers (`[ ]` todo / `[I]` implemented /
`[V]` user-verified). Executed work is checked off here; when everything is `[V]`,
the file disappears and one line goes to `docs/done.md`.

User mandate (2026-07-19): implement per the locked decisions, Claude makes the
remaining detail calls; user verifies live and corrections come as fixes.

---

## Stage A — mob damage model + aggro rework (NOW)

- [ ] Mob config: `attackRange` (independent of `aggroRadius`), periodic physical +
      magical attacks (period + damage, either optional), on-miss special attack +
      per-mob cooldown, `attackShape` as data (`single` implemented), attack-range
      ring visualization params.
- [ ] `mob.target` field (always the player today).
- [ ] Two-path aggro: damage-aggro (any mob, one path) + proximity-aggro (only
      `aggressive: true`); no other aggro sources.
- [ ] Ranged AI: mobs approach only to their attack range; mixed melee/ranged packs
      work.
- [ ] Typo → on-miss volleys: only mobs with player in THEIR attack range; 50–200 ms
      jitter; per-mob cooldown; cancelled on player death; old typo-damage path
      removed.
- [ ] Periodic attacks tick independently of typing, per-mob phase jitter at aggro.
- [ ] Percentage defense `dmg * k/(k+def)` + dodge from def/atk relation (config room
      for `evasion`); ALL damage through `hurtPlayer`.
- [ ] Render: faint transparent attack-range rings around mobs (config).
- [ ] Floating text: per-attack numbers; `block` shown where damage numbers appear.
- [ ] Pure tests for every sim-side behavior above.

## Stage B — ring & streak dynamics + exit-reset (NOW, after A)

- [ ] Per-weapon `attackRange` state on the player (replaces combat-owned `aoe`);
      growth-source config (rates, 0=off: `onHit` default-on; `onCorrectType`,
      `whileMoving`, `whileStationary` available); decay delay ~2.5–3 s; 25% typo
      cut (constant, flagged for live tuning).
- [ ] Streak: growth-mode config (`onAttempt` default / `onHit`); freeze when no
      targets; idle time decay (delay + rate); typo resets.
- [ ] Explicit fight exit (Alt+X action / Esc-hold / death) resets ALL in-combat
      meters (streak, all weapons' attackRange).
- [ ] `exitFight` default rebind Alt+Q → Alt+X (+ stored-settings migration).
- [ ] HUD/render updated for the new meters.
- [ ] Pure tests.

## Stage C — targeting system (LATER, lands with the bow)

Pin-until-death nearest target, 4-way screen-axis cyclic switching (Alt+Q/E = X axis,
Alt+R/F = Y axis, rebindable), `combat.targets` + triangle renderer (config-driven
colors, per-state capable), hostile+friendly-capable from day one. Sword shows no
triangles.

## Stage D — weapon styles (LATER)

Bow first (firing spec to be designed then); sword modes, wand, grimoire after.
Skill slots (modal flow — locked) after weapons.

---

## Appendix — old Pillar C prompts (reference)

The old root `PLAN.md`'s C1 (life-leech) and C4 (tuning + integration test) prompts
remain partially relevant for future stages — full text in git history
(`PLAN.md` @ `689ee28`). C2/C3 (two-mode bow + its rendering) are fully superseded
by the decisions above. Note: C1's typo→leech penalty conflicts with the on-miss
model — reconcile if/when leech returns.
