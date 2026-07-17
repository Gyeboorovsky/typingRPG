// Cheat-code registry — pure and input-method-agnostic (Layer 1). Maps a typed buffer tail to a
// canonical CheatCode + optional numeric argument. This is the layer a future console or chat
// parser calls directly; the keyboard listener (cheat-listener.ts) is just one frontend onto it.
// The effect logic lives in src/game/ (applyCheat in sim.ts) — this module only RECOGNIZES.
import type { CheatCode } from './game/types';

interface CheatDef {
  literal: string;       // the code typed at the buffer's tail
  code: CheatCode;       // the semantic effect (the sim never sees the GTA spelling)
  numericPrefix: boolean; // accepts digits immediately preceding the literal
}

// The editable code list — add/remove/edit entries here in one place.
// Invariant: keep longest literal first, and NO literal may be a suffix of another (else two
// could complete on the same keydown). recognize() relies on this for a single, unambiguous match.
export const CHEATS: CheatDef[] = [
  { literal: 'hesoyam', code: 'setLevel', numericPrefix: true },  // no digits → max level; N digits → level N (clamped)
  { literal: 'baguvix', code: 'godmode',  numericPrefix: false }, // toggle invincibility
];

export interface RecognizedCheat { code: CheatCode; arg?: number }

/** Recognize a completed code at the tail of `buffer`. Returns the canonical command (with a
 *  numeric arg if the code takes one and digits immediately precede it), or null. Pure — one call
 *  per keydown. The literal completes as a suffix on exactly one keydown, and the digit run is
 *  already resident before it, so the arg is resolved atomically here — never "fire bare then fix". */
export function recognize(buffer: string): RecognizedCheat | null {
  for (const def of CHEATS) {
    if (!buffer.endsWith(def.literal)) continue;
    if (!def.numericPrefix) return { code: def.code };
    const before = buffer.slice(0, buffer.length - def.literal.length);
    const digits = /(\d+)$/.exec(before); // consecutive digits immediately before the literal, else none
    return digits ? { code: def.code, arg: parseInt(digits[1], 10) } : { code: def.code };
  }
  return null;
}
