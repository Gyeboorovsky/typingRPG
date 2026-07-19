# Combat rework — damage: DoT and on-miss attacks

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 26–38.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. Principle: a typo deals no "damage out of nowhere"
**How I read it:** we remove the abstract typo self-damage. Instead, a typo **triggers
an on-miss attack from every mob that has the player inside its attack range**.
**Consequence:** a typo in an empty field = free. A typo surrounded by 5 mobs = 5
separate attacks. The punishment scales with the situation instead of being a fixed
number. A very good change — the penalty comes from the world, not from a rule.
**Proposal:** full agreement, no reservations.

### 2. Three periods — which three?
**How I read it:** you wrote "3 periods for how often it attacks with which attack",
but you listed two timed attacks (physical, magical).
**Consequence:** I'm missing the third. Possibilities: a third attack type you didn't
name? A separate period for the on-miss attack? Something else?
**Proposal:** my guess: physical period, magical period, and a "special" period (e.g. a
rare heavier charge). Confirm or correct — this directly shapes the mob config.

### 3. The 50–200 ms jitter — jitter on what?
**How I read it:** it exists so on-miss attacks don't all land in the same millisecond.
**Consequence:** I don't know whether the same applies to the periodic (DoT) attacks.
If not — 4 mobs with the same period will synchronize and you'll take one big slam
instead of a stream.
**Proposal:** jitter on **both**: a random phase offset assigned when a mob aggroes
(for DoT) and a random delay on every on-miss. Feels and reads far better.

### 4. Typo spam — a serious problem to solve ⚠️
**How I read it:** a typo triggers on-miss from every mob in range.
**Consequence:** with no limit, **10 typos per second = 10 full volleys**. A player can
kill themselves in a fraction of a second by mashing the keyboard, and a bot/macro can
exploit it the other way (triggering attacks at chosen moments).
**Proposal:** an on-miss cooldown **per mob** (a mob can't trigger on-miss more often
than once per X ms, configurable per mob). Without it the whole system is vulnerable
to accident and abuse. In my view the most serious hole in the current description.

### 5. Further typos inside the jitter window
**How I read it:** a typo schedules attacks with a 50–200 ms delay. What if you make
another typo inside that window?
**Consequence:** either you queue another volley (see question 4), or you swallow it.
**Proposal:** if the cooldown from question 4 goes in, the problem disappears on its
own — the second typo simply won't trigger mobs that are on cooldown.

### 6. "In attack range" — whose and which?
**How I read it:** on-miss is triggered by mobs that have the player **inside their own
attack range**, not by everything aggroed.
**Consequence:** a mob still running toward you doesn't punish typos. A mob's attack
range is a new, separate value — different from its aggro radius and from the player's
range.
**Proposal:** new mob-config field: `attackRange`, independent of `aggroRadius`. An
archer mob: big attackRange, small aggroRadius. This opens up mob-archetype design,
which you'll want anyway with a bigger map.

### 7. Defense: flat or percentage?
**How I read it:** damage passes through the player's physical and magical defense.
**Consequence:** the formula choice determines the entire balance for years. Flat
(`dmg - def`) creates hard immortality thresholds. Percentage (`dmg * k/(k+def)`)
scales smoothly but never grants full immunity.
**Proposal:** percentage with a config constant. Metin2 (your stated inspiration) uses
a hybrid, but percentage is much easier to balance under a growing level cap and less
prone to "mob X literally cannot touch me".

### 8. Dodges — whose stat is it?
**How I read it:** "acceptable misses when defense is much higher than attack" — so a
dodge derives from the defense/attack **relation**, not from a separate dodge stat.
**Consequence:** one stat fewer, but also less room for dodge-oriented builds.
**Proposal:** for now derive it from the relation (simple), but leave config room for a
separate `evasion` — with classes like the ninja (you already have `attackSpeed`
derived from DEX) a dodge stat will almost certainly be wanted.

### 9. Is the DoT really "damage over time" or periodic blows?
**How I read it:** "physical attack over time" + a period — so a mob lands a blow every
N seconds; it doesn't trickle damage continuously.
**Consequence:** periodic blows are more readable (you see the numbers); a continuous
trickle is smoother but less informative.
**Proposal:** periodic blows with the phase jitter from question 3. Your own example
(4 mobs × 10 = 40 per period) suggests that's how you see it.

### 10. Does the DoT run independently of typing?
**How I read it:** yes — mobs hit you because they're attacking you, not because you're
typing.
**Consequence:** standing in a pack doing nothing kills you. Good — it forces movement
or fighting.
**Proposal:** confirm, because it means combat runs in real time regardless of the
player's pace — a slow typist is genuinely punished. In a typing game that's
deliberate, but it deserves to be named.

### 11. Player death mid-flow
**How I read it:** not addressed under the new model.
**Consequence:** today death used to leave an artifact (the old plan patches it with a
guard). Under the new model we must know what scheduled, delayed on-miss attacks do
when the player dies before they land.
**Proposal:** on death, cancel all attacks scheduled against that player. The ugly bug
otherwise: you die, respawn, and instantly eat a volley from before your death.

### 12. Godmode vs the new model
**How I read it:** `baguvix` blocks damage inside `hurtPlayer`.
**Consequence:** if on-miss damage takes a different path than `hurtPlayer`, godmode
stops working and you lose your testing tool — exactly when you'll be testing the
damage system.
**Proposal:** a hard requirement in the prompt: **all** player damage (DoT, on-miss,
anything) flows through `hurtPlayer`. One choke point, godmode keeps working, RNG
stays deterministic.

### 13. What the player sees
**How I read it:** not addressed.
**Consequence:** 5 mobs × separate damage numbers at random moments is potentially a
wall of flying digits.
**Proposal:** aggregate visually (one number per "volley"), even if mechanically they
are separate blows. Configurable, like everything else.
