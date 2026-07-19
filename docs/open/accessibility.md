# Accessibility

**Status:** planning (one open question; the rest are specified fixes)
**Source:** Fable audit 2026-07-18, re-verified against the live code on 2026-07-19
(HEAD `689ee28`); citations are current. One audit sub-claim was already fixed (the
control-bar buttons gained `aria-label`s in `689ee28`); three new gaps from that same
commit are added below.

---

## Questions

### 1. AltGr characters — deliberate decision needed (Polish typists!)
**Current behavior:** an AltGr keystroke is folded into `alt` by `normalizeModifiers`
(`src/keybinds.ts:153-155`), so it fails `isPrintable` (`src/input.ts:34-35`, gate at
`:92`) → typed AltGr characters silently do nothing in fight mode. The cheat buffer
also skips them (`src/cheat-listener.ts:28`). Prompts are ASCII-only (`words.ts`) so
nothing is unwinnable — but a Polish typist reflexively typing ą/ę/ó gets silent
nothing, and AltGr is this game's combat-modifier, which collides with Polish input
habits.
   a) Keep as-is (ASCII prompts, AltGr = modifier only) and document it as a decision.
   b) Let AltGr-produced printable chars type in fight (count as typo vs ASCII prompts)
      while still working as the held modifier.
   c) Rework the combat-modifier choice for Polish keyboards (e.g. left-Alt only as
      modifier, right-Alt/AltGr reserved for characters).
   **Recommendation: c** — left-Alt stays the modifier, AltGr produces characters (which
   will be typos against ASCII prompts, consistent with the typo model). The audience is
   Polish; silently eating AltGr keystrokes will read as "the game dropped my input".
   Needs a small keybinds change (stop folding `altGraph` into `alt`) + tests.

## Tasks

- [ ] **`prefers-reduced-motion` block.** `src/style.css` has zero
  `@media (prefers-reduced-motion: reduce)` handling; infinite loops: `#stats-btn`
  `bob` (:188), `#boss-banner` `pulse` (:209), `#ult-hint` `pulse` (:250), plus
  `shake` (:246), `.nudge` (:475), `.toast` `fadeout` (:263); keyframes at
  `:680-684`. Users with the OS accessibility preference still get constant motion.
  Fix: one media-query block disabling/shortening the loops. (Audit rated this
  Critical — the OS preference is functionally ignored.)

- [ ] **ARIA live regions.** Toasts container (`index.html:37`) has no
  `aria-live`/`role` and toasts are created bare (`src/ui/hud.ts:839-845`); death
  overlay (`index.html:110-113`) has no `role="alert"`; HP/MP/XP/boss/streak update
  via `textContent` silently; `save-dot` (`index.html:39`) has `title` only. Fix:
  `aria-live="polite"` on toasts, `role="alert"` on death, labels on status dots.

- [ ] **Focus management for windows.** Only char-select manages focus
  (`src/ui/charselect.ts:111,:115`); inventory/character/options panels receive no
  focus on open (Esc-to-close works, so it's not a trap — but keyboard/AT users land
  nowhere). Fix: move focus on open, restore on close.

- [ ] **Focus-visible styling on custom buttons** (new, from `689ee28`).
  `src/style.css:272-283` styles only `:hover`/`:active` for the control-bar buttons
  (likewise `.stat-plus`, `.inv-page-btn`, window close buttons) — keyboard focus has
  no visible ring. Fix: add `:focus-visible` outlines.

- [ ] **Label the remaining icon buttons** (new, from `689ee28`). Window close `×`
  buttons (`index.html:49`, `:76`, `:106`), bag-page `I/II/III` (`:63-65`), stat `+`
  buttons (`:82-85`) rely on `title`/bare glyphs — a screen reader announces `×` as
  "multiplication sign". Fix: `aria-label`s; optionally `type="button"` on all.

## Notes

- No hard dependencies; can be done any time. All items are DOM-side → **cannot be
  auto-tested**; every item needs a manual `[V]` check (screen reader / OS
  reduced-motion toggle / keyboard-only pass).
