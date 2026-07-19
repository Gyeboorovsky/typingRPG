# Code hygiene — dead code, duplicated tunables, small gaps

**Status:** planning (one question — stale branches; the rest are specified fixes)
**Source:** Fable audit 2026-07-18, re-verified against the live code on 2026-07-19
(HEAD `689ee28`); citations are current. Doc-drift findings from the audit were fixed
by the 2026-07-19 docs restructure and are not repeated here.

---

## Questions

### 1. Stale local branches — which to delete?
Current branches besides `main` (verified 2026-07-19):
**Merged into main (safe to prune):** `feat/inventory-click-carry`,
`feat/inventory-equipment-combat-rebuild`, `feature/character-system`,
`feature/m1-map`, `fix/inventory-ux`, `refactor/perf-pass-pre-b1` (6).
**NOT merged:** `km-h-recovery`, `km-h-recovery-phase4`, `overnight-stress-test` (3).
Note: `overnight-stress-test` is checked out in an external worktree
(`../typingRPG-overnight`).
   a) Delete the 6 merged now; keep the 3 unmerged.
   b) Delete the 6 merged + the 2 `km-h-recovery*` (old recovery snapshots); keep
      `overnight-stress-test`.
   c) Delete everything except `main` (incl. removing the external worktree).
   **Recommendation: a** — merged branches carry zero information (commits live in
   main's history); the unmerged three may still hold unique work and deserve a look
   before deletion.

## Tasks — dead code & duplication

- [ ] **Delete dead `hasFileBackend()`** — `src/save/save.ts:73-75`; zero callers, and
  its predicate (`b.name !== 'local'`) would wrongly match the `'tauri'` backend.
- [ ] **Resolve orphaned Fx `'death'`** — emitted by `hurtPlayer`
  (`src/game/combat.ts:208`) but explicitly ignored by `renderer.intakeFx`
  (`src/render/renderer.ts:181`) and unhandled in `hud.sync` (`src/ui/hud.ts:294-296`);
  the death screen keys off `p.dead` instead. Consume it or stop emitting.
- [ ] **Drop unnecessary `export`s** — `STAT_EFFECTS` (`src/game/attributes.ts:47`),
  `CLASS_STAT_MODIFIERS` (`:57`), `STAT_POINTS_PER_LEVEL` (`:184`), `hurtPlayer`
  (`src/game/combat.ts:195`) — all referenced only internally.
- [ ] **De-duplicate the tick rate** — `src/main.ts:162` `STEP_MS = 1000 / 60`
  re-encodes `SIM_DT = 1/60` (`src/game/constants.ts:4`); change one alone and the
  accumulator desyncs from `update()`. Fix: `STEP_MS = SIM_DT * 1000`.
- [ ] **De-duplicate "4 stat points per level"** — `src/ui/hud.ts:66`, `:200`, `:201`
  hardcode what is `STAT_POINTS_PER_LEVEL` (`src/game/attributes.ts:184`); the four
  `.lvl-circle` divs at `index.html:22-25` are the coupled markup (can't import —
  comment the coupling).
- [ ] **De-duplicate ring-buffer capacity** — `src/keystroke-buffer.ts:7` default `20`
  vs explicit `new KeystrokeRingBuffer(20)` at `src/cheat-listener.ts:12`; drop the
  argument.
- [ ] **Extract a shared `canEquip()` predicate** — `equipValidity`
  (`src/ui/hud.ts:688-702`, comment admits "Mirrors sim.equipItem's guards") duplicates
  `equipItem`'s guards (`src/game/sim.ts:183-203`). Two copies will drift; in the
  server future the UI copy must be a prediction of the same rule, not a fork.
- [ ] **Guard `canvas.getContext('2d')!`** — `src/main.ts:20-21`; a blocked canvas
  throws at boot with no friendly message. Null-check with a visible error.
- [ ] **Document (or enforce) the `applySave` pairing contract** —
  `src/game/sim.ts:300-342` resets `leech`/`godmode` but never `dead`, `ultCooldown`,
  `combat`, `mobs`; safe only because `src/main.ts:116-117` always pairs it with a
  fresh `newGame`. Reset in-function or document the contract.
- [ ] **Fix stale code comments** — `src/game/classes.ts` header still claims "Only
  Warrior is playable" (all four classes are selectable, `src/ui/charselect.ts:10`);
  `src/game/mobs.ts:13` still references the removed practice mode.

## Tasks — dead constants (⚠ coordinate with the combat rework)

- [ ] `RESPAWN_FULL` (`src/game/constants.ts:51`) — referenced nowhere.
- [ ] `LEECH_*` block (`constants.ts:79-84`, six constants) + `Player.leech`
  (initialized `sim.ts:310`, never consumed) — dead until a leech system lands.
  **Do not delete blindly:** the combat rework
  ([combat-rework-scope.md](combat-rework-scope.md) appendix C1) may revive leech.
  Resolve when that stage is decided.
- [ ] `T_GRASS` (`src/game/map.ts:10`) — never read (terrain defaults to 0).
- [ ] `BOW_BASE_CHARS_PER_ARROW` / `ATK_PER_POINT` + `arrowsPerCharsInterval`
  (`src/game/attributes.ts:176-181`) — test-only until a bow stage lands; coverage
  ahead of the feature, keep but note.

## Tasks — test micro-gaps

- [ ] **Enforce the cheat-registry ordering invariant** — `src/cheats.ts:14`
  documents "longest-first, no literal is a suffix of another", which `recognize()`
  depends on, but nothing enforces it; a third code could silently break
  disambiguation. Add a tiny unit test or module-load assert.
- [ ] **Test `saveSettings()` round-trip** — `src/save/settings.ts:46`; only the
  load/migration path is covered today.

## Notes — performance (MMO-density concerns only, fine today)

- O(n²) mob separation per tick — `src/game/mobs.ts:157-171` (spatial-hash fix already
  sketched in-code at `:152-156`).
- Per-frame allocations — `state.fx = []` (`src/main.ts:186`, `:216`); `aggroed()`
  filter per keystroke (`src/game/combat.ts:33`).
- `hud.sync` runs at full cost behind the char-select overlay — `src/main.ts:192`
  (outside the `if (!blocked)` guard). Early-out when blocked.
- App version maintained in three places — `package.json:4`,
  `src-tauri/tauri.conf.json:4`, `src-tauri/Cargo.toml:3` (in sync at 0.1.0 today).
  Single source or a bump script when it first drifts.

## Already resolved (for the record)

- Combat tier ratchet-up (audit #32) — behavior unchanged and now documented in-code
  (`src/game/combat.ts:51-55`, `:65` "never downgrade mid-prompt").
- `.claude/worktrees/` gitignore safety net, stale `m1-map` worktree, empty `design/`
  dir, control-bar `aria-label`s — fixed in/around the 2026-07-19 restructure.
