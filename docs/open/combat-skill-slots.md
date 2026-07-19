# Combat rework — integration with skill slots

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 49–52.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. A letter of an inactive slot = a typo — but which kind?
**How I read it:** we agreed that a letter valid for a dimmed (inactive) slot hurts the
player like a typo.
**Consequence:** under the new model "typo" means "every mob in range triggers
on-miss". So hitting a dimmed skill letter surrounded by 5 mobs = a full volley.
**Proposal:** yes, and it's consistent — one punishment path. But confirm, because this
is a much harsher penalty than when we set the rule (back then a typo was a single
number).

### 2. A dimmed slot in downtime
**How I read it:** no mobs in range = typos are free = hitting a dimmed slot is free
too.
**Consequence:** consistent, but it means the "dimmed slot hurts" rule is conditional,
not absolute.
**Proposal:** rephrase the rule: *a letter from a dimmed slot is an ordinary typo* —
and everything else follows from the typo model. Simpler, and it self-reconciles.

### 3. Active-slot letters vs the ring and the DoT
**How I read it:** neutral for the streak ([combat-streak.md](combat-streak.md) #3);
for the ring this is already decided (2026-07-19): growth sources are config-driven
and skill-slot letters don't pump the ring by default.
**Consequence:** standing in a pack typing skills does not protect you from the DoT —
mobs keep hitting.
**Proposal:** fine, no reservations, but worth seeing clearly: skills are not a "safe
harbor", just another action inside the same fight.

### 4. Do skills hit by the same targeting rules?
**How I read it:** we agreed a skill's target is per config: target / nearest / AoE /
self.
**Consequence:** "target" must mean the same thing as the red triangle from
[combat-aggro-targeting.md](combat-aggro-targeting.md) #3 — otherwise the player has
two different notions of "target".
**Proposal:** one targeting system for everything (weapons, skills, healing). This
strengthens the argument from combat-aggro-targeting.md #3 and
[combat-weapons-modes.md](combat-weapons-modes.md) #4 to build it properly, once, up
front.
