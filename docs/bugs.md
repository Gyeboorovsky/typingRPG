# Bugs — known issues

> One line-or-few per bug, newest first. Maintained like every other doc: add when
> reported, update when diagnosed, delete when the fix is `[V]`-verified (the fix's
> one-liner goes to `docs/done.md`). Not for feature ideas — those go to `docs/open/`.

- **2026-07-20 — Big maps still micro-stutter (annoying, not severe); meadow is
  smooth.** PARKED by user decision — findings so far, to resume quickly:
  the meadow is smooth because its 9 terrain chunks fit the cache forever (zero
  rebuilds). On big maps, a 1280×720 view needs ~16 visible chunks and view+prefetch
  ring ≈ 36 = exactly `MAX_CHUNKS` (`src/render/terrain.ts`) → **LRU thrash**: the
  cache constantly evicts chunks it is about to need and rebuilds them (worse on
  bigger windows). Each rebuild allocates a fresh canvas (~2–4 MB) → GC + GPU
  texture-upload spikes. Planned fix (not started): window-aware eviction (never
  evict chunks inside the current view+ring; only evict outside it), a canvas POOL
  (reuse evicted canvases — zero allocations in steady state), prefetch ring 2 with
  build budget 2/frame, and dpr cap 1.0 for big maps (smaller uploads). Headless
  `__game.frame` benchmarks under-report this (no vsync/compositor), so verify the
  fix on a visible tab.

- **2026-07-19 — Options button doesn't close options.** Opening the options window
  via the gear button works, but clicking the button again does not close it (Esc
  does). Expected: the button toggles. Reported by user; not yet diagnosed.
