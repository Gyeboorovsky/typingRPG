# Combat rework — stage plan & progress

**Status:** in-progress. ALL questions answered (2026-07-19) — decisions in
`docs/decisions.md` → "Combat rework — decisions locked so far" and onward. This is
now the working file: stages, tasks, status markers (`[ ]` todo / `[I]` implemented /
`[V]` user-verified). Executed work is checked off here; when everything is `[V]`,
the file disappears and one line goes to `docs/done.md`.

User mandate (2026-07-19): implement per the locked decisions, Claude makes the
remaining detail calls; user verifies live and corrections come as fixes.

---

## Stage A — mob damage model + aggro rework — IMPLEMENTED 2026-07-19, awaiting [V]

- [I] Mob config: `attackRange`, periodic physical + magical channels, on-miss
      special + per-mob cooldown, `attackShape` as data, mob-side `defense`/`dodge`.
      New ranged mob: **Bone Archer** (spot at 34,15; placeholder cultist sprite).
- [I] `mob.target` field (always the player today; cleared on leash/death).
- [I] Two-path aggro: `damageMob` aggro-pulls on the ATTEMPT (even shield-blocked);
      proximity only for `aggressive: true`. No other `aggroMob` callers.
- [I] Ranged AI: stop at `max(MOB_STOP_DIST, attackRange − RANGED_APPROACH_MARGIN)`.
- [I] Typo → on-miss volleys: only mobs targeting the player with them inside THEIR
      attackRange; 50–200 ms hash-jitter (no rng consumption); per-mob cooldown
      absorbs spam; cancelled on death; old instant typo-damage removed.
- [I] Periodic attacks tick in real time; per-mob phase jitter at aggro (hash-based).
- [I] Player-side mitigation `mitigatePlayerDamage(raw, kind)` (kind = seam for a
      future magicDefense); mob-side dodge → floating "block" + percentage defense;
      ALL damage through `hurtPlayer` (godmode/RNG intact).
- [I] Render: faint attack-range rings on aggroed mobs (`PAL.mobRangeRing`+alpha).
- [I] Floating text: per-attack numbers; "block" particle.
- [I] 10 new pure tests; suite 140 green; build green.

**Manual [V] checklist (DOM/visual — user):** archer pack at (34,15) keeps distance
and shoots; faint orange rings around aggroed mobs; typo near mobs → delayed hits
(not instant), spam-mashing typos doesn't melt you; "block" text pops on archer
dodges; godmode (`baguvix`) blocks everything; death cancels queued hits.

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
