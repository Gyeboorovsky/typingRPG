# Combat rework — aggro & targeting model

**Status:** planning (2 follow-up questions open; the original 10 questions were
answered 2026-07-19 — decisions recorded in `docs/decisions.md` → "Combat rework —
decisions locked so far")
**Part of:** combat rework — see [combat-rework-scope.md](combat-rework-scope.md) for the stage split.

Answer in chat by number. Answered questions are removed; decisions land in
`docs/decisions.md`.

---

### 1. Alt+Q collides with exit-fight — which defaults for target switching?
**Context:** you asked for Alt+Q / Alt+E to jump the pinned bow target left/right.
But **Alt+Q is currently the DEFAULT `exitFight` binding** (`DEFAULT_KEYMAP` in
`src/keybinds.ts`). Both are combat actions, so one must move.
   a) Move `exitFight` default to **Alt+X**; target switching gets **Alt+Q (left) /
      Alt+E (right)**.
   b) Keep `exitFight` on Alt+Q; target switching on other keys (e.g. Alt+Z / Alt+C).
   c) Something else (say which keys).
   **Recommendation: a** — Q and E flank WSAD (classic strafe-key intuition, hands
   never leave home position), and `exitFight` is the rarer action (Esc-hold already
   covers leaving fight). Everything stays rebindable anyway.

### 2. What exactly does "left / right" mean when switching targets?
**Context:** with mobs clustered around you, "the one to the right" needs a precise
definition or the jump will feel random.
   a) **Angular around the player:** E = next target clockwise from the current one,
      Q = counter-clockwise (cyclic — keeps going around the circle).
   b) Screen-space: the nearest candidate to the left/right of the current target on
      screen (non-cyclic).
   c) Ordered list: Q = previous / E = next in a nearest-first sorted list (spatial
      left/right ignored).
   **Recommendation: a** — well-defined for every layout (no ties), cyclic (you can
   always reach every target), and in the isometric view rotating your aim
   clockwise/counter-clockwise matches what the eye sees. Implementation: sort
   candidates by angle from the player, step through that ring.
