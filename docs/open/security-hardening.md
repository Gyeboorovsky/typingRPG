# Security hardening — save-data trust boundary

**Status:** planning (fixes specified; no open questions — ready to be turned into prompts)
**Source:** Fable audit 2026-07-18, re-verified against the live code on 2026-07-19
(HEAD `689ee28`) — **all findings below confirmed still present**; citations are current.

Why this matters: saves are `JSON.parse`d from localStorage / user-picked files / Tauri
AppData and flow into game state and `innerHTML` with almost no validation. Today this
is self-XSS; it becomes stored XSS the moment a save crosses a trust boundary (shared
save files now, server-sent state in the MMO future). `applySave` is also the template
for what a future authoritative server must never trust.

---

## Tasks

- [ ] **Escape `defId` before it reaches `innerHTML`.** `src/ui/hud.ts:809` —
  `tooltipHtml`'s fallback interpolates `st.defId` (copied verbatim from the save,
  never validated against `ITEMS`) into the string written via `innerHTML` at
  `hud.ts:783`. A crafted save with `defId = "<img src=x onerror=…>"` executes on
  hover. Fix: reuse the `escapeHtml` pattern from `src/ui/charselect.ts:123`, or use
  `textContent`.

- [ ] **Harden character-select against tampered saves.** `src/ui/charselect.ts:77` —
  `CLASSES[save.player.classId].name` throws `TypeError` on an unknown `classId`,
  killing the only entry screen; `save.player.level` is interpolated raw into
  `innerHTML` (`name` is properly escaped at `:65`/`:76`). `listSlots`
  (`src/save/save.ts:39`) validates only the `v` field. Fix: coerce `level` to a
  number for display; guard the `CLASSES` lookup with a fallback.

- [ ] **Tauri: set a restrictive CSP and narrow fs capabilities.**
  `src-tauri/tauri.conf.json:23` sets `"csp": null`;
  `src-tauri/capabilities/default.json:7-11` grants `fs:allow-appdata-read-recursive`
  and `fs:allow-appdata-write-recursive` — while the app only ever touches
  `save-${slot}.json` in its own directory (`src/save/backends.ts:39`). Combined with
  the XSS items above, a tampered save runs arbitrary JS with recursive read/write
  over AppData. Fix: restrictive CSP + capability scoped to the app's own dir/files.

- [ ] **Domain-validate `applySave`.** `src/game/sim.ts:300-342` — `classId` copied
  unchecked (`:302`); `p.level = Math.max(1, save.player.level)` yields `NaN` for
  non-numeric input (`:304`) → `XP_CURVE(NaN)` → NaN HP/XP saved back on next
  autosave (permanently bricks the character); `pos` can be NaN — confirmed
  `isBlocked(NaN,NaN) === false` (`src/game/map.ts:68-69`), so NaN pos passes the
  guard at `:306-307`; hp/mp clamps at `:338-339` have no `Number.isFinite` guard;
  inventory/equipment `defId`s copied verbatim (`:314`, `:317`). Fix: validate
  `classId ∈ CLASSES`, `Number.isFinite` on level/xp/hp/mp/pos, drop or clamp unknown
  `defId`s.

- [ ] **Guard unknown `defId` on the drop/pickup path.** `src/game/items.ts:248-250` —
  `addToInventory` dereferences `ITEMS[defId].maxStack` unguarded; `src/game/sim.ts:119`
  and `:124` deref `ITEMS[d.defId].name` unguarded. Chain: tampered save puts an
  unknown `defId` in the bag → drop → walk-over pickup → `TypeError` kills the sim
  loop. (`itemSize` at `items.ts:188` defends correctly; copy that pattern.) Fix:
  early-return/skip on `!ITEMS[defId]`.

- [ ] **Surface repeated save-backend failures.** Silent catches throughout the save
  layer: `src/save/save.ts:38`, `:51`, `:63`, `:94-95`; `src/save/backends.ts:43-47`,
  `:78`, `:111`. Documented best-effort, but a persistently failing backend (quota,
  revoked file permission) is invisible beyond the save-indicator dot. Fix: surface a
  toast/warning once after N consecutive failures.

## Notes

- Tests: everything except the Tauri config and the `innerHTML` sinks is pure and unit-
  testable (`applySave` validation, `addToInventory` guard). The two UI escapes and the
  CSP need manual verification.
- `better-after:` the combat rework's damage-model stage — `applySave` will grow new
  fields there (ring/streak placement); validating once after the shape settles avoids
  doing it twice. Not a hard dependency.
