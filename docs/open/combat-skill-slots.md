# Combat rework — integration with skill slots

**Status:** planning (1 question open). The 2026-07-19 modal-flow decision (select
slot → window switches → type to load → press key again to activate → mana +
cooldown → back to normal prompt; skill-window typing counts like normal typing) is
recorded in `docs/decisions.md` and SUPERSEDED the old inline-slot questions that
used to live here (dimmed-slot letter = typo — dropped as obsolete).
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.

Answer in chat by number. Answered questions are removed; decisions land in
`docs/decisions.md`.

---

### 1. Do skills hit by the same targeting rules as weapons?
**How I read it:** we agreed a skill's target is per config: target / nearest / AoE /
self.
**Consequence:** "target" must mean the same thing as the red triangle from the
targeting decisions — otherwise the player has two different notions of "target".
Targeted healing (grimoire) additionally needs friendly targets.
**Proposal:** ONE targeting system for everything (weapons, skills, healing), with
`targets: {id, kind: 'hostile' | 'friendly'}` from day one — see also
[combat-weapons-modes.md](combat-weapons-modes.md) #4.
