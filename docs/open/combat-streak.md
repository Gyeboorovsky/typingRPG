# Combat rework — streak

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 20–25.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. When does the streak grow
**How I read it:** it grows when a correct char **attacks any mob** — even if the mob
defends, dodges, or has too much armor. The attempt counts, not the outcome.
**Consequence:** an important difference from Claude Code's earlier plan, which says
"streak grows only when a mob is inside the ring". Your version is broader (an attack
happened) and more sensible — the player isn't punished for running into a
well-armored mob.
**Proposal:** definition: `streak++` if and only if the char triggered at least one
**attack attempt** on a mob (regardless of result).

### 2. Streak when you're attacking nobody — reset or hold?
**How I read it:** you said it grows only on attack. You didn't say what happens when
there's nobody to attack. The earlier plan assumes a hard reset.
**Consequence:** a huge difference. Reset = leaving the pack wipes your progress.
Freeze = you can walk to the next pack and continue.
**Proposal:** **freeze**, not reset. Keep the reset exclusively for a typo. Then you
have a clean rule: *only a mistake breaks the streak*. Plus an optional time decay if
you don't want it to stand forever.

### 3. Active-skill letters don't touch the streak
**How I read it:** they neither grow nor reset it — fully neutral.
**Consequence:** consistent with the "as if the player pressed nothing" rule from our
skill-slot spec.
**Proposal:** fine, no reservations. Worth writing down as one rule: a char consumed by
an active slot **does not exist** from the main combat's perspective.

### 4. What is the streak even for now?
**How I read it:** it used to drive the ring radius. Now the ring is independent of it,
and the ultimate is to be rebuilt from scratch and you haven't thought about it.
**Consequence:** **the streak is currently a counter with no consumer.** It displays,
it grows, but nothing comes of it beyond an ult that doesn't exist yet.
**Proposal:** this is the section's most important question. Either (a) you assign it a
role now (damage multiplier? mana-cost reduction? faster regen?), or (b) you
consciously leave it as a bare counter for the future ult and say so explicitly.
Without that, Claude Code will guess, and tests will assert a number that affects
nothing.

### 5. Is a mob's defense (dodge / too much armor) a "miss"?
**How I read it:** the mob defended itself, but the streak grows. So mob defense ≠
player typo.
**Consequence:** you need two different words, because "miss" would otherwise mean two
things: the player's typo and a no-damage outcome due to defense.
**Proposal:** in code: `typo` (player error — punished) and `blocked`/`evaded` (mob
defense — no damage, but zero penalty). Never use the word "miss" for both.

### 6. Streak vs leaving fight mode
**How I read it:** not addressed.
**Consequence:** as with the ring ([combat-ring-range.md](combat-ring-range.md) #8) —
if the streak lives in `combat`, it's lost on exit.
**Proposal:** same as for the ring — if you choose the freeze from question 2, move
both onto the player and treat them uniformly.
