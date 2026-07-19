# Combat rework — streak

**Status:** planning (1 CONFLICT question open; the other 5 answered 2026-07-19 —
decisions in `docs/decisions.md`)
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.

Answer in chat by number. Answered questions are removed; decisions land in
`docs/decisions.md`.

---

### 1. ⚠ CONFLICT: "everything resets on fight exit" vs "the ring survives exit"
**Context:** answering the streak questions you said: *"when I leave the fight, the
streak, combo, range and whatever else grew during combat resets to zero."* But
minutes earlier, in the ring file, you approved the opposite for the ring
(answer "P8: super"): *`attackRange` lives on the player and SURVIVES leaving fight
mode, subject only to its own decay* — plus P9 (per-weapon ranges persist across
weapon switches). Both cannot hold. Which version wins?
   a) **Exit resets everything** — streak AND ring/attackRange (and any future
      in-combat meter) drop to baseline on leaving fight. Overrides P8; P9's
      per-weapon persistence then applies only WITHIN one fight session. Simple,
      readable rule: "leaving combat = clean slate".
   b) **Keep P8** — the ring survives exit (with decay), only the STREAK resets on
      exit. Preserves the "reward for keeping tempo between fights" idea; costs a
      two-rule model (streak resets, ring persists).
   c) Both survive exit with their own decays (streak freeze + idle decay would keep
      running out of combat) — most continuous, least readable.
   **Recommendation: b** — you chose the ring's persistence deliberately and twice
   (P7 "ok", P8 "super"), and it feeds the "enter the next pack with earned range"
   flow you liked; the streak is currently a consumer-less counter, so resetting IT
   on exit costs nothing and keeps exit meaningful.
