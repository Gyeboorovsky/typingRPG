# Combat rework — aggro & targeting model

**Status:** planning (1 follow-up question open; everything else answered 2026-07-19 —
decisions in `docs/decisions.md` → "Combat rework — decisions locked so far")
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.

Answer in chat by number. Answered questions are removed; decisions land in
`docs/decisions.md`.

---

### 1. "Left / right" target switching — how to avoid inverted feel below the player?
**Context:** pure angular stepping (E = clockwise) feels inverted when the current
target is BELOW the player — clockwise there moves the marker visually to the LEFT
(the user spotted this). Refined options:
   a) **Screen-X cyclic:** sort candidates by their screen X position; E = next to the
      right, Q = next to the left, wrapping at the edges. No rotation concept at all —
      the marker ALWAYS moves the way the key says, no special cases anywhere.
   b) **Angular with hemisphere correction** (the user's instinct): clockwise /
      counter-clockwise stepping, but Q/E swap when the current target is in the lower
      half. Feels right in both hemispheres, but has a seam at exactly east/west and
      mid-fight direction swaps can surprise.
   c) Pure angular, accept the inversion below the player.
   **Recommendation: a** — it's the only variant where "E = right" is true 100% of the
   time with zero seams; ties in X are broken deterministically (nearer first). The
   cyclic wrap keeps every target reachable, which was angular's main advantage.
