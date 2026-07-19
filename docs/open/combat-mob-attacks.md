# Combat rework — mob attack shapes & multiplayer preparation

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 39–44.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. On-miss hits whoever the mob is targeting
**How I read it:** the player makes a typo → mobs **targeting that player** trigger
on-miss → each such attack hits whatever **that mob** is targeting.
**Consequence:** in single-player that's always you, so mechanically nothing changes.
In multiplayer it gets interesting: your typo can hurt a teammate if the mob targets
you both (AoE) — a "don't fail your party" mechanic.
**Proposal:** model an explicit `mob.target` field **now** (today always the player),
even in single-player. Adding it later means rewriting the whole damage path; now it's
one field.

### 2. Attack shapes — model now or later?
**How I read it:** you listed three: single target, area around itself, projectile with
an area explosion where it lands.
**Consequence:** in single-player **all three produce identical results** (there's only
one player to hit). The whole difference only shows up in multiplayer.
**Proposal:** add `attackShape: 'single' | 'aoe' | 'projectileAoe'` to the mob config
now as *data*, but implement only `single`. Config ready, code simple, zero dead
logic. The branching gets written at multiplayer time.

### 3. Projectiles with travel time
**How I read it:** "when its projectile lands" suggests the projectile flies and
explodes on arrival.
**Consequence:** that's a big thing: projectile entities in the sim, collisions, the
ability to dodge by moving. A completely different complexity class than "deal damage
now".
**Proposal:** **not now.** Log it in the vision memos (docs/vision/), build it at
multiplayer time. Today: projectile = instant attack with a range. Otherwise this
stage doubles in size.

### 4. Can the player dodge an attack by moving?
**How I read it:** follows from question 3 — if projectiles fly, movement matters.
**Consequence:** with instant attacks, position only matters at the moment of the blow —
you run to get out of range, not to "dodge shots".
**Proposal:** for now, only leaving the range. Consistent with this being a game about
typing — demanding real-time dodging would fight with typing with both hands.

### 5. Mob aggression between players (multiplayer)
**How I read it:** touched on indirectly.
**Consequence:** in multiplayer you must decide how a mob picks its target: first
striker, highest damage, nearest, threat/tank.
**Proposal:** don't decide now, but keep the `mob.target` from question 1 — then it's a
one-function change, not an architecture change.

### 6. Does `attackShape` affect aggro?
**How I read it:** not addressed.
**Consequence:** if an AoE mob hits two players, does it aggro both? Only the one who
provoked it?
**Proposal:** aggro stays the rule from
[combat-aggro-targeting.md](combat-aggro-targeting.md) #1 (whoever dealt damage),
independent of who the mob hits. Clean separation: a mob aggroes those who hit it; it
hits those it targets.
