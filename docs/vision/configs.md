# Configs — user-facing and server-facing configuration coverage

Vision (user): expand config coverage — UI window size AND per-window
opacity/transparency (**wanted soon**), camera zoom, plus anything else
reasonable, each at whichever layer (local vs server-enforced) fits.

---

## 1. Current-state assessment

- **A real options window + persistence layer already exist:**
  `src/ui/options.ts` renders the keybindings panel plus **stub "Audio" and
  "Graphics" sections** ("Coming soon.") — the natural home for everything
  below. `src/save/settings.ts` persists device-wide settings to its own
  localStorage key (`typingRPG.settings`, versioned, deep-merged over
  defaults so new fields never wipe old ones — exactly the extension point
  needed; currently `version: 1` with keymap only).
- Windows are DOM panels (`#inventory`, `#statspanel`, `#options` managed by
  `src/ui/hud.ts` + `windows.ts`); the character panel is already draggable
  (`initDrag` in hud.ts) but its position is NOT persisted. All UI colors/
  surfaces are CSS custom properties (`src/style.css` — including `--glass`,
  the panel translucency token, with a comment explaining the deliberate
  no-backdrop-blur performance rule). Per-window opacity is therefore a
  near-trivial CSS-variable-per-window change.
- **Camera zoom does not exist:** projection scale is fixed by
  `TILE_W/TILE_H` constants through `projX/projY` in `renderer.ts` (and
  duplicated half-tile constants in `sprites.ts`/`terrain.ts`). Zoom =
  a scale transform on the world canvas draw (ctx.scale around the camera
  focal point) — sprites are vectors, so it stays crisp; culling margins and
  the DOM-canvas coordinate mapping (drop-to-world in hud.ts resolveDrop uses
  elementFromPoint — unaffected) need review. Moderately easy, not trivial.
- Tuning constants (`src/game/constants.ts`) are the future server-config
  seed: everything gameplay-affecting in one file is a gift — the
  client/server split (below) becomes a sorting exercise, not a hunt.

## 2. Proposed config architecture (three layers)

1. **Client-local (device):** extends `typingRPG.settings` (bump to
   `version: 2`, keep the per-field merge): everything visual/UX. Never
   affects gameplay outcomes → never needs server validation.
2. **Account-level (server era):** settings worth roaming across devices
   (cosmetic loadouts, social preferences like ignore lists). Client-local
   settings deliberately do NOT roam by default (see §4 keybind flag).
3. **Server-enforced:** anything with gameplay or economy effect — XP rates,
   drop rates, shop limits (`economy.md`), boost values, instance lockouts,
   PvP zone flags, event toggles. Lives in server config (hot-reloadable
   table/file), NEVER client-editable; the client merely renders what the
   server says. Today's equivalents in `constants.ts` migrate here when the
   server lands (the split flagged in economy/monetization memos).

## 3. Concrete settings catalog (proposal, grouped by options section)

**Interface (new section — contains the user's "wanted soon" items):**
- Per-window SIZE (scale factor per window: inventory / character / options /
  prompt box) and per-window OPACITY (a `--win-opacity-<id>` CSS var per
  panel; range clamped, e.g. 0.4–1.0, so windows can't vanish). Persist
  window drag positions too (the drag already exists — saving it is the
  missing 10%).
- Prompt box: font size, width, position preset (bottom/center) — the most
  important window in the game deserves its own block; pairs with the
  cosmetic prompt themes (`monetization.md`) without overlapping them.
- HUD toggles: damage numbers on/off/compact, streak ring visibility,
  toast verbosity, save-status dot.
- Practice-fight HUD marker color (Group B specs it as a named constant "not
  exposed in Options YET" — this section is where it eventually surfaces;
  decisions.md explicitly anticipated that).

**Graphics (existing stub):**
- Quality profile low/medium/high (the tier shared with
  `platform-strategy.md`/`maps-and-rendering.md`: DPR cap, shimmer,
  particle budget, glow effects), FPS cap / battery saver, camera zoom
  (slider + mouse-wheel binding, clamped e.g. 0.5×–1.5×), screen-shake
  toggle, colorblind-safe palette swap for tier colors & target indicators
  (the indicators doc already mandates configurable colors — fold it in
  here; also `additional-ideas.md` §accessibility).

**Audio (existing stub):** master/effects/music volumes, mute-on-focus-loss,
typing-click feedback on/off (sound design is currently absent entirely —
`additional-ideas.md`).

**Gameplay (client-side only, no outcomes):** autosave interval within
server-safe bounds (single-player only), language of UI (later), word-pool
locale (⚠ gameplay-affecting in PvP — server-constrained choice, see
`additional-ideas.md` §i18n), auto-pickup toggles.

**Accessibility:** dyslexia-friendly font for prompts, reduced motion,
high-contrast mode, prompt letter-spacing. (Rationale in
`additional-ideas.md`; listed here because they're settings mechanically.)

## 4. ⚠ Decision-log cross-checks

- **"Single global binding set, device-wide, NO per-character override"** is
  locked. This memo's account-level layer must NOT quietly become per-
  character keybind overrides; if account-roaming keybinds are ever wanted,
  that's an explicit decisions.md amendment. (PLAN.md's E1 text still
  describes a per-character override design that decisions.md later
  overrode — a known doc drift to ignore in favor of decisions.md.)
- The Esc ladder is locked with Options always-topmost — new settings
  sections change nothing structurally; keep all new panels inside the
  existing `#options` window so the ladder logic (`windows.ts`) is untouched.
- `--glass` no-backdrop-blur is a documented performance decision in
  style.css — per-window opacity should modulate panel alpha, not introduce
  backdrop-filter; flagging so a future "frosted glass" request doesn't
  accidentally cross it.
- Settings stay OUTSIDE character saves (locked) — the proposed
  `version: 2` extension honors that; nothing enters `SaveData`.

## 5. What would need to change

`settings.ts` schema v2 + merge rules (pattern already written);
`options.ts` new sections (replace the two stubs); CSS vars per window +
size/opacity plumbing in `hud.ts`; camera zoom in `renderer.ts` (+ culling
margins, + wheel binding routed through the keybinds system as a bindable
action pair); quality profile consumed by `renderer.ts`/`terrain.ts`. Server
config table design belongs to the multiplayer track. The user's "wanted
soon" subset (window size/opacity, zoom) is implementable entirely
client-side today, before any MMO work — a good near-term PLAN.md stage.
