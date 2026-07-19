# Combat rework — aggro & targeting model

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 1–10.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number (`1 ok`, `3 but …`). Answered questions are removed from this file and the
decision lands in `docs/decisions.md`; this file only ever contains what is still open.

---

### 1. Aggro = exclusively a result of damage?
**How I read it:** a mob starts chasing the player only when it took damage from them. No
"incidental" aggro (being inside the ring, completing a prompt, walking close).
**Consequence:** Claude Code's earlier plan does something different — it aggroes
*everything in the ring on every correct char*. For the sword that comes out the same
(the sword hits everything in range anyway), but for the bow it's a chasm.
**Proposal:** write the rule as a single sentence in code: `aggro ← damage`, and never
call `aggroMob` from anywhere else. One path, zero exceptions, easy to audit.

### 2. Do mobs still have their own aggro radius?
**How I read it:** today mobs have an `aggro radius` — walk too close and they attack.
Your "only what takes damage from me aggroes" talks about *player-caused* aggro, but I
don't know whether it also removes *mob-initiated* aggro.
**Consequence:** if we remove it — you can walk through the middle of a pack of
aggressive mobs and nobody reacts until you strike first. That changes the game's
character from "watch where you walk" to "you decide when the fight starts".
**Proposal:** keep both, but name them separately: `playerAggro` (took damage) and
`proximityAggro` (mob noticed you on its own). Aggressive mobs have proximity,
non-aggressive ones have `proximityAggro = false`. That's exactly the distinction you
asked for with "some mobs should be non-aggressive".

### 3. The red triangle stops being cosmetic
**How I read it:** the bow hits *only* what has a triangle. So the targeting system
(today in `docs/future-target-indicators.md` as "for later") becomes a **hard
prerequisite** for the bow to work at all.
**Consequence:** a dependency inversion. We planned the triangle as a visual feature
"someday", and now it's a core mechanism without which one of the weapons doesn't exist.
**Proposal:** promote it from "future" to "now", but in a minimal version:
`combat.targets: MobId[]` in state + a simple triangle renderer. The rest (yellow glow
on in-range mobs, configurable colors/pulsing) can stay for later.

### 4. Does the sword use triangles at all?
**How I read it:** the sword hits everything in range, so it doesn't need a triangle.
**Consequence:** two different targeting models in one game — sword "area, no target",
bow "targeted". If the sword shows no triangles, the player gets no feedback about
*what* is about to be hit (beyond the ring).
**Proposal:** the sword also highlights, with triangles, every mob the next char will
hit. One consistent visual language: **triangle = this will take the hit**. With the
sword there will simply be many at once.

### 5. Who picks the bow's target — the player or the game?
**How I read it:** the modes (sequential / nearest / strongest) suggest **automatic**
selection by rule, not a manual click.
**Consequence:** if automatic, the player has no direct control over who they hit —
they steer only through mode choice. That is consistent with this being a game about
typing, not mousing.
**Proposal:** automatic per mode + an optional manual override (clicking a mob pins the
target until it dies). Override as a separate config flag, default off.

### 6. When is target selection recomputed?
**How I read it:** unspecified. Candidates: every frame, every char, on target death, on
mode change.
**Consequence:** recomputing every frame with the "nearest" mode causes target flicker
when two mobs are almost equally distant — the triangle will jump around.
**Proposal:** recompute on events (target death, target left range, mode change, weapon
change), **not** per frame. Plus hysteresis for "nearest": switch target only when the
new one is closer by more than X% — no more flicker.

### 7. Target dies mid-word
**How I read it:** you're typing a prompt, the target dies from your hit, 5 other mobs
remain.
**Consequence:** three possible behaviors, each with a different feel: (a) the triangle
jumps to the next target per mode, you keep typing uninterrupted; (b) the prompt
resets; (c) you drop into a no-target state.
**Proposal:** (a) — jump without a prompt reset. Interrupting typing as punishment for
killing a mob would be frustrating, and this is a game about typing flow.

### 8. How many targets at once, and where does the number come from
**How I read it:** it depends on the mode **and** on passives we haven't designed yet.
E.g. "multi" mode + a passive gives 2/3/4/5 targets.
**Consequence:** the target count is a product of two systems, one of which doesn't
exist. Risk of building something the passives later overturn.
**Proposal:** for now, only `maxTargets: number` in code, computed by a single function
`resolveMaxTargets(weapon, mode, passives)`. Today it returns a constant from the
weapon/mode config; passives get added later in one place.

### 9. Selection order when there are several candidates
**How I read it:** with `maxTargets = 3` and 7 mobs in range — which 3?
**Consequence:** with "strongest" mode it's obvious (top 3); with "sequential" it isn't —
a sequence of what, in what order, does it loop?
**Proposal:** a mode defines a **sort function**, and `maxTargets` takes the first N.
Sequential = sorted by aggro order. Simple and uniform across every mode.

### 10. Non-aggressive mobs vs damage
**How I read it:** a non-aggressive mob doesn't start a fight, but once hit — it aggroes
and fights back.
**Consequence:** none, that's standard. Asking only to be sure, because "non-aggressive"
could also mean "never fights" (like harvestable critters).
**Proposal:** the `aggressive` flag controls only *initiation*, not *retaliation*. If
you also want pacifist mobs (chickens you can hit risk-free) — that's a separate
`retaliates` flag.
