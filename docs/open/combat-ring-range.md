# Combat rework — the ring & attack range

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 11–19.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. Ring = sword range, but what about the bow?
**How I read it:** the ring grows from typing and that is the sword's range. The bow has
a fixed range ("probably won't change during combat").
**Consequence:** the "ring" stops being one thing — for the sword it's dynamic and
selects targets, for the bow it's static and only filters who *can* be a target.
**Proposal:** name it `attackRange` (per weapon) instead of `aoe`, configured per
weapon: `growth`, `decay`, `dropOnMiss` = 0 for the bow. Then the bow is just a weapon
with zero rates of change — one model, zero branches in the code.

### 2. Is the bow's ring even drawn?
**How I read it:** unspecified.
**Consequence:** a static circle of radius 8 may be visual noise if nothing ever
changes. But without it the player doesn't know how far they reach.
**Proposal:** draw it, but weaker (lower alpha for a static range). Configurable — like
everything else.

### 3. Ring growth from typing a skill while hitting nothing
**How I read it:** you explicitly asked for a flag: does typing skill letters (which
don't hit any mob) also grow the range.
**Consequence:** if yes — you can "pump up" the ring typing skills in downtime, then
walk into a pack at max range. A real strategy or a real exploit, depending how you
look at it.
**Proposal:** default **false**. The ring as a reward for fighting, not for typing into
the air. But the flag stays, so if you change your mind — one-line change.

### 4. What exactly grows the ring
**How I read it:** a correct char. But correct **where** — always in the main prompt,
or only when it actually hit a mob?
**Consequence:** if "always on a correct char", then typing in downtime (no mobs) also
pumps the ring — the same thing as question 3, just by another road.
**Proposal:** a separate flag `growOnlyWhenHitting` (default **true**) — the ring grows
only when the char actually hit someone. Consistent with the proposal in 3.

### 5. Shrinking when idle
**How I read it:** the earlier plan proposes `AOE_DECAY_DELAY = 1s` without typing, then
`0.6/s` downward.
**Consequence:** 1 second is very little. Hesitating over a hard word or glancing at
the inventory immediately starts eating your range.
**Proposal:** delay ~2.5–3s, slower decay. But that's pure tuning — what matters is that
it sits in config and you can change it without asking anyone.

### 6. Shrinking on a typo
**How I read it:** a typo cuts the ring by a % (the plan: 25%).
**Consequence:** with `AOE_MAX = 5` and `growth = 0.05/char`, rebuilding 25% of max is
~25 correct chars. The penalty is significant but not lethal.
**Proposal:** keep 25% as a start, but check it live — under the new model a miss hurts
twice (smaller range **plus** an on-miss attack from every mob, see
[combat-damage-dot.md](combat-damage-dot.md)). Combined it may turn out too harsh.

### 7. The ring survives the death of all mobs
**How I read it:** yes, the plan assumes that; it doesn't reset when the field clears.
**Consequence:** you enter the next pack with range earned on the previous one. A reward
for keeping tempo between fights.
**Proposal:** fine, but only with the decay from question 5 — otherwise the ring never
drops and stops measuring engagement.

### 8. The ring vs leaving fight mode
**How I read it:** on exit to travel `combat = null`, so the ring is lost.
**Consequence:** exiting and immediately re-entering resets range to minimum. Could be a
punishment, could be an annoyance.
**Proposal:** keep `attackRange` **outside** the `combat` object (e.g. on the player) so
it survives exit and obeys only its own decay. It also simplifies the code: one field,
one dynamic, zero dependence on the fight lifecycle.

### 9. Switching weapons mid-fight
**How I read it:** not addressed.
**Consequence:** if range is per weapon, switching sword→bow must do something with the
current value.
**Proposal:** each weapon keeps its own `attackRange` independently. You switch — you
get that weapon's state from before you put it away (with decay that kept running in
the background). Alternative: reset to minimum on switch. I prefer the former —
punishing weapon swaps discourages using the very system we're building.
