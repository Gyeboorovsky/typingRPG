# Platform strategy — browser and desktop (Tauri) as THE SAME GAME

Vision (user): browser and desktop must be the same game — **full feature
parity, never a permanently simplified browser version**. Desktop may have
*better graphics/rendering*, but never *fewer features*. Prioritize browser
development while feasible; desktop remains the eventual primary target.
Assess the real cost/feasibility of one codebase serving both well.

---

## 1. Current-state assessment

- **One codebase already serves both, for real.** The desktop build is the
  same Vite bundle in a Tauri v2 webview: `vite.config.ts` flips `base`
  (`/typingRPG/` for Pages, `/` under `TAURI_ENV_PLATFORM`);
  `src-tauri/tauri.conf.json` points `frontendDist` at `../dist` and runs the
  same `npm run dev/build`. There is no platform fork anywhere in game code.
- **Platform divergence is already funneled through two narrow seams:**
  - Saves: `src/save/backends.ts` picks Tauri fs / File System Access /
    localStorage at runtime behind one `SaveBackend` interface — the exact
    pattern CLAUDE.md mandates ("new platforms add a backend here, not
    branches elsewhere").
  - Input: `SELECTABLE_COMBAT_MODIFIERS` in `src/keybinds.ts` is the ONE
    documented seam for re-enabling Ctrl as a combat modifier on desktop
    (browsers steal Ctrl+W etc.; the router supports Ctrl end-to-end already).
    `decisions.md` locks this and the code comment names it.
- **The Tauri scaffold is real but minimal:** `src-tauri/src/lib.rs` is a
  default builder + fs/log plugins; capabilities are tightly scoped to AppData
  fs (`src-tauri/capabilities/default.json`); bundle target `nsis`
  (Windows-only for now); a `target/` dir with build artifacts shows it has
  actually compiled. No updater, no window-state persistence, no macOS/Linux
  targets configured yet.
- **Rendering is Canvas 2D everywhere** (`src/render/renderer.ts`), with one
  browser-constraint concession already visible: `src/render/terrain.ts` caps
  the pre-rendered ground layer's DPR to fit iOS Safari's ~16.7M-pixel canvas
  limit. That cap is exactly the kind of knob a desktop tier can relax.

## 2. Is one codebase serving both realistic? (assessment)

**Yes — and it is the cheapest option by a wide margin.** Because the desktop
app IS the web app in a webview, "feature parity" is the *default state*, not
an achievement; divergence would require deliberate effort. The honest risks
are narrower than "two platforms":

1. **Webview ≠ Chrome.** Tauri on Windows uses WebView2 (Chromium — near-zero
   risk); on macOS it's WKWebView and on Linux WebKitGTK, which differ in
   canvas performance and API details (e.g. File System Access API is absent —
   irrelevant on desktop since the Tauri fs backend takes over, but a reminder
   that "works in Chrome" isn't "works in every webview"). Cost: test passes
   per OS when those targets are added, not code forks.
2. **"Better graphics on desktop" must be a *tier*, not a fork.** The clean
   model: one renderer with a **quality profile** (particle counts, DPR cap,
   shimmer on/off, ring effects, future shader path), where desktop defaults
   high and browser defaults auto-detected. Profiles live in config
   (`configs.md`), so the browser can also opt UP on a strong machine —
   parity preserved in both directions. What desktop can genuinely offer
   beyond profiles: uncapped DPR (relax the `terrain.ts` cap), guaranteed
   `requestAnimationFrame` cadence (no tab throttling), borderless
   fullscreen, and later a heavier renderer backend (see
   `maps-and-rendering.md` §LOD — WebGL/WebGPU is available in BOTH targets,
   so even that isn't desktop-exclusive; desktop just guarantees the budget).
3. **Input is the one real behavioral divergence** — already solved by design:
   Ctrl unlock via `SELECTABLE_COMBAT_MODIFIERS` (one line), and the options
   UI already explains the browser limitation (`src/ui/options.ts` prints
   "Ctrl unlocks in the desktop build"). Desktop can also legitimately grab
   keys browsers reserve (F-keys, Alt+F4 stays reserved). Suggest gating by
   *capability detection* (`isTauri()` from `backends.ts`) rather than build
   flags, so it stays one bundle.
4. **Networking (post-MMO) is identical** on both: WebSocket from JS. No fork.
   Desktop could later add QUIC/UDP via a Rust-side plugin if ever needed —
   the typing genre almost certainly never needs it (per the latency-tolerance
   stance).

**Cost estimate honesty:** the recurring cost of desktop parity is CI builds +
manual smoke tests per release + Tauri/webview upgrades — small. The one-time
costs that WILL come due: auto-updater (mandatory for an online game whose
protocol evolves; Tauri has a first-party updater plugin + signing), crash
reporting, and installer signing certificates (Windows SmartScreen reputation,
macOS notarization if that target ships). None of this touches game code.

## 3. Options & tradeoffs

- **A. Status quo discipline (recommended for now):** keep desktop building
  green (add a CI job that runs `npx tauri build` on tags or weekly), spend no
  further desktop effort until the online alpha stabilizes. Cost: near zero.
  Risk: bit-rot caught late if CI isn't added — so add the CI job.
- **B. Early desktop beta:** ship the current single-player as an NSIS
  installer now. Value: real save files (already works), a distribution
  experiment, Ctrl-modifier unlock. Cost: updater + support burden arrives
  before the game is online; every prototype iteration ships as an installer
  update. Probably premature.
- **C. Desktop-first pivot:** contradicts "prioritize browser while feasible."
  Not recommended; the browser is the zero-friction funnel for a hobby MMO
  (click a link, play) and Pages hosting is free.

The parity *principle* worth writing into CLAUDE.md when this matures: **"a
feature may not merge if it works on only one platform, unless the other
platform's gap is a capability-detected graceful degrade with an issue filed"**
(e.g. File System Access saves are Chromium-only today — acceptable because
localStorage covers the gap; that's the pattern).

## 4. ⚠ Decision-log cross-checks

- **Ctrl-removal is locked as browser-only** (`decisions.md`: "re-enabling is
  a ONE-LINE change once on the Tauri desktop build") — this plan *fulfills*
  that decision rather than conflicting; flagging only that the unlock should
  be capability-detected at runtime (one bundle) rather than a separate
  desktop build config, which is a mild refinement of the recorded wording.
- **Keyboard-gated combat** (no touch combat; CLAUDE.md's ~360px note) —
  desktop reinforces this; no conflict. A future Steam-Deck-style target would
  reopen it; out of scope.
- **"Cheap to host"** — desktop binaries are free to distribute via GitHub
  Releases; the updater needs only static file hosting. No conflict.

## 5. What would need to change

- Near-term (cheap, high value): CI job building `src-tauri` so the scaffold
  can't rot; a `qualityProfile` object read by `renderer.ts`/`terrain.ts`
  instead of hardcoded caps (groundwork shared with `configs.md`).
- At online-alpha time: Tauri updater plugin + release signing; window-state
  plugin (remember size/position — pairs with the UI-window configs the user
  wants); capability-detected Ctrl unlock.
- At 1.0: decide macOS/Linux targets (adds notarization/GTK test burden);
  crash reporting on both platforms.
