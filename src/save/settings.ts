// Device-wide settings persistence — the ONE global keymap + combat-modifier, shared by
// every character and stored OUTSIDE the character save slots. Its own localStorage key
// (a sibling of backends.ts's `typingRPG.save.<slot>`), never threaded through SaveData.
// Loaded synchronously at boot so the very first keydown already sees the real bindings.
import { ACTION_ORDER, cloneKeymap, DEFAULT_KEYMAP, SELECTABLE_COMBAT_MODIFIERS } from '../keybinds';
import type { Combo, Keymap, ModifierKey } from '../keybinds';

const SETTINGS_KEY = 'typingRPG.settings';

interface StoredSettings {
  version: 1 | 2;
  combatModifier: ModifierKey;
  bindings: Partial<Record<string, Combo>>;
}

const isCombo = (v: unknown): v is Combo =>
  !!v && typeof v === 'object'
  && typeof (v as Combo).code === 'string'
  && typeof (v as Combo).alt === 'boolean'
  && typeof (v as Combo).ctrl === 'boolean';

/** Load the global keymap. Missing/corrupt → factory defaults; per-action deep-merge over
 *  defaults so adding an action in a later version never wipes existing binds. Never throws. */
export function loadSettings(): Keymap {
  const keymap = cloneKeymap(DEFAULT_KEYMAP);
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return keymap;
    const data = JSON.parse(raw) as StoredSettings;
    // A stored non-selectable modifier (e.g. 'ctrl' from an earlier session) is ignored → the
    // cloned default 'alt' stays. Self-heals: the next saveSettings rewrites 'alt'.
    if (SELECTABLE_COMBAT_MODIFIERS.includes(data.combatModifier)) {
      keymap.combatModifier = data.combatModifier;
    }
    if (data.bindings && typeof data.bindings === 'object') {
      for (const id of ACTION_ORDER) {
        const b = data.bindings[id];
        if (isCombo(b)) keymap.bindings[id] = { code: b.code, alt: b.alt, ctrl: b.ctrl };
      }
    }
    // v1 → v2: exitFight's factory default moved Alt+Q → Alt+X (Alt+Q now belongs to
    // target-switching). A stored Alt+Q bind is indistinguishable from the old
    // default, so migrate it — unless the user put something else on Alt+X.
    if ((data.version ?? 1) < 2) {
      const ef = keymap.bindings.exitFight;
      const altXTaken = ACTION_ORDER.some((id) =>
        id !== 'exitFight' && keymap.bindings[id].code === 'KeyX' && keymap.bindings[id].alt);
      if (ef.code === 'KeyQ' && ef.alt && !ef.ctrl && !altXTaken)
        keymap.bindings.exitFight = { code: 'KeyX', alt: true, ctrl: false };
    }
  } catch { /* corrupt storage → defaults */ }
  return keymap;
}

/** Persist the global keymap. Best-effort — a storage failure (private mode / quota) is ignored. */
export function saveSettings(keymap: Keymap): void {
  try {
    const data: StoredSettings = {
      version: 2,
      combatModifier: keymap.combatModifier,
      bindings: keymap.bindings,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}
