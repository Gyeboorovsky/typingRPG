# Dev cheat codes

A hidden, GTA-San-Andreas-style keyboard cheat system for single-player. You just
type a code anywhere in-game — there is **no UI and no notification**; nothing
indicates a code was typed or recognized. Each cheat only ever affects your own
local character.

> ⚠️ **MUST be admin-gated before multiplayer.** Before this game is ever exposed
> online/multiplayer in any form, cheat-code execution MUST be restricted to
> authenticated admin users and MUST be validated server-side. The current
> implementation is a local, single-player, fully-trusted-client dev tool with
> zero authorization and is **NOT safe to ship as-is**. (Same warning as in
> `CLAUDE.md`; intentionally repeated so it's hard to miss from either file.)

## Codes

| Type this | Effect |
|---|---|
| `hesoyam` | Set player level to the **max** (`MAX_LEVEL`, currently 120). |
| `<N>hesoyam` (e.g. `50hesoyam`, `4hesoyam`) | Set player level to **N**, clamped to `[1, MAX_LEVEL]`. `0hesoyam` → level 1. |
| `baguvix` | **Toggle** godmode (invincibility). Type it again to turn it off. |

Codes are **case-insensitive** (`HESOYAM` works — input is lowercased before
matching). The digits in `<N>hesoyam` must be typed *immediately* before the word
(any non-digit in between, e.g. `4xhesoyam`, is treated as bare → max level).

### Effect details

- **Level (`hesoyam`)** reuses the game's real level-up point math
  (`recomputeStatPoints` in `src/game/attributes.ts`), so a cheated level grants
  exactly the stat points natural levelling to that level would — 4 unspent points
  per level (`(level - 1) * 4` total at a level boundary).
  - **Levelling up / mild de-levelling** keeps your current attribute allocation
    and just adjusts unspent points.
  - **De-levelling below the points you've already spent** does a full **respec**:
    all attribute points are returned as unspent (this is the only place in the
    game that reclaims allocated points). HP/MP are re-capped to the new level.
  - `MAX_LEVEL` is a cheat-only clamp — normal levelling is unbounded.
- **Godmode (`baguvix`)** sets `player.godmode`; while true, the player takes zero
  damage. It is guarded at the single damage choke point (`hurtPlayer` in
  `src/game/combat.ts`), so it covers every current and future damage source that
  routes through there. Godmode is **not saved** — it resets to off on reload /
  character switch.

## How to add / edit / remove codes

Edit the one config table in **`src/cheats.ts`**:

```ts
export const CHEATS: CheatDef[] = [
  { literal: 'hesoyam', code: 'setLevel', numericPrefix: true },
  { literal: 'baguvix', code: 'godmode',  numericPrefix: false },
];
```

- `literal` — the string typed at the buffer's tail.
- `code` — a semantic `CheatCode` (`src/game/types.ts`); the effect is handled by
  `applyCheat` in `src/game/sim.ts`. Adding a *new kind* of effect means adding a
  `CheatCode` value + an `applyCheat` branch; adding an *alias/variant* of an
  existing effect is just a new row here.
- `numericPrefix` — whether digits immediately before the literal are parsed as a
  numeric argument.

Keep the list **longest-literal-first**, and ensure **no literal is a suffix of
another** (otherwise two could complete on the same keystroke). Do not invent new
words beyond what's needed.

## How it works (the ring buffer)

- `src/keystroke-buffer.ts` is a generic `KeystrokeRingBuffer` holding the last
  **20** typed characters (lowercased). The 21st keystroke evicts the oldest.
- There is **no timer, debounce, or reset** — a code may be typed across an
  arbitrarily long span (even minutes) as long as no more than 20 total keystrokes
  land before it completes.
- `src/cheat-listener.ts` is a passive `window` `keydown` listener (separate from
  the game's `Input` class). It never calls `preventDefault`/`stopPropagation`, so
  a code's characters *also* flow to the game normally (they may move the player,
  open a window, or type as combat input — that's expected, not a bug). It ignores
  OS key-repeat and modifier chords, and only observes while a character is active.
- On each keystroke it asks the pure `recognize()` (`src/cheats.ts`) whether a code
  completed; if so it emits a `devCheat` `InputEvent` onto the same input queue the
  rest of the game uses, and `update()` applies the effect.

This two-layer split (pure registry + one keyboard frontend) is deliberate: a
future console or chat-command frontend can call `recognize()` / emit the same
`devCheat` event and reuse the identical effect logic with no changes.
