# Combat rework — weapons & modes

**Status:** planning (questions open)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.
**Source:** migrated from `pytania-combat-rework.md` (2026-07-19), translated; original questions 45–48.

Question format: **How I read it** → **Consequence** → **Proposal**. Answer in chat by
number. Answered questions are removed; decisions land in `docs/decisions.md`.

---

### 1. Four sword modes
**How I read it:** you described the bow's modes (sequential / nearest / strongest),
but for the sword only "hits everything in range".
**Consequence:** the sword has 4 mode slots and one idea.
**Proposal:** possible axes for differentiating sword modes: range vs damage (wide weak
swing / narrow strong one), target count (everything / max 3 nearest), ring growth
rate, the % of damage spilling onto mobs beyond the main target. Say which direction
you like, or leave it for a dedicated design pass.

### 2. Does the mode change during a fight?
**How I read it:** today fire modes are combat actions bindable to keys, so yes.
**Consequence:** switching modes mid-fight could reset targets, the prompt, the ring —
or not.
**Proposal:** a mode switch recomputes targets
([combat-aggro-targeting.md](combat-aggro-targeting.md) #6) but does **not** touch the
ring, the streak, or the prompt. Changing tactics shouldn't wipe your progress.

### 3. Range per weapon or per mode?
**How I read it:** "the bow's range probably doesn't change" suggests per weapon.
**Consequence:** if a mode could also alter range (e.g. a "wide swing" mode), the
config must be per (weapon × mode), not per weapon.
**Proposal:** config per weapon, with an optional per-mode override. Costs one field,
opens up the mode design space from question 1.

### 4. Wand and grimoire in this model
**How I read it:** from the earlier conversation: the wand is still to be designed; the
grimoire has area heal / targeted heal (green triangle) / attack / weaker area attack.
**Consequence:** targeted healing requires targeting an **ally** — so the triangle
system must support two target kinds (hostile red, friendly green), and from the
start.
**Proposal:** when designing the targeting system
([combat-aggro-targeting.md](combat-aggro-targeting.md) #3), generalize it right away
to `targets: {id, kind: 'hostile' | 'friendly'}`. Adding this later = reworking
everything that uses it.
