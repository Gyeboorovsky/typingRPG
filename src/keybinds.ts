// Keybinding config + validation — pure, no DOM. The single source of truth for
// which actions exist, their categories, factory defaults, and the rules that
// keep the keystroke router unambiguous. Consumed by input.ts (routing),
// save/settings.ts (persistence), ui/options.ts (the menu), and the tests.
import type { Dir } from './game/types';

export type ActionId =
  | 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
  | 'toggleInventory' | 'toggleCharacter'
  | 'enterFight1' | 'enterFight2' | 'enterFight3' | 'enterFight4'
  | 'exitFight' | 'fireMode1' | 'fireMode2' | 'fireMode3' | 'fireMode4';

// travel     — fires in travel; in fight only while the combat-modifier is held.
// enterFight — travel-context only (entering fight is meaningless while fighting).
// combat     — fight-context only; reached directly via its own combo, no modifier.
export type ActionCategory = 'travel' | 'enterFight' | 'combat';

export type ModifierKey = 'alt' | 'ctrl';

/** Combat modifiers the options UI currently offers. Ctrl is intentionally excluded: in a
 *  browser, holding Ctrl in fight collides with shortcuts that can't be preventDefault'd
 *  (Ctrl+W closes the tab). RE-ENABLE by adding 'ctrl' here once running as the desktop
 *  (Tauri — see src-tauri/) build — the router already handles 'ctrl' end to end
 *  (isCombatModifierKey / eventMatchesCombo strip / updateModHeld), so this is the one seam. */
export const SELECTABLE_COMBAT_MODIFIERS: readonly ModifierKey[] = ['alt'];

// A bound key: a physical `code` (layout-independent) plus optional Alt/Ctrl.
// Shift/Meta are never part of a binding — Shift is reserved for typed input,
// Meta is left to the OS.
export interface Combo { code: string; alt: boolean; ctrl: boolean }

export interface Keymap {
  combatModifier: ModifierKey;
  bindings: Record<ActionId, Combo>;
}

interface ActionMeta {
  category: ActionCategory;
  label: string;
  group: string;      // options-menu section
  dir?: Dir;          // movement actions
  fireMode?: number;  // enterFight* + fireMode* actions carry a fire mode 1..4
}

export const ACTIONS: Record<ActionId, ActionMeta> = {
  moveUp:    { category: 'travel', label: 'Move up',    group: 'Movement', dir: 0 },
  moveRight: { category: 'travel', label: 'Move right', group: 'Movement', dir: 1 },
  moveDown:  { category: 'travel', label: 'Move down',  group: 'Movement', dir: 2 },
  moveLeft:  { category: 'travel', label: 'Move left',  group: 'Movement', dir: 3 },
  toggleInventory: { category: 'travel', label: 'Toggle inventory', group: 'Windows' },
  toggleCharacter: { category: 'travel', label: 'Toggle character', group: 'Windows' },
  enterFight1: { category: 'enterFight', label: 'Enter fight — mode 1', group: 'Enter fight', fireMode: 1 },
  enterFight2: { category: 'enterFight', label: 'Enter fight — mode 2', group: 'Enter fight', fireMode: 2 },
  enterFight3: { category: 'enterFight', label: 'Enter fight — mode 3', group: 'Enter fight', fireMode: 3 },
  enterFight4: { category: 'enterFight', label: 'Enter fight — mode 4', group: 'Enter fight', fireMode: 4 },
  exitFight: { category: 'combat', label: 'Exit fight', group: 'Combat' },
  fireMode1: { category: 'combat', label: 'Fire mode 1', group: 'Combat', fireMode: 1 },
  fireMode2: { category: 'combat', label: 'Fire mode 2', group: 'Combat', fireMode: 2 },
  fireMode3: { category: 'combat', label: 'Fire mode 3', group: 'Combat', fireMode: 3 },
  fireMode4: { category: 'combat', label: 'Fire mode 4', group: 'Combat', fireMode: 4 },
};

// Deterministic action order (drives router iteration + menu layout).
export const ACTION_ORDER: ActionId[] = [
  'moveUp', 'moveRight', 'moveDown', 'moveLeft',
  'toggleInventory', 'toggleCharacter',
  'enterFight1', 'enterFight2', 'enterFight3', 'enterFight4',
  'exitFight', 'fireMode1', 'fireMode2', 'fireMode3', 'fireMode4',
];

const combo = (code: string, alt = false, ctrl = false): Combo => ({ code, alt, ctrl });

export const DEFAULT_KEYMAP: Keymap = {
  combatModifier: 'alt',
  bindings: {
    moveUp: combo('KeyW'), moveRight: combo('KeyD'), moveDown: combo('KeyS'), moveLeft: combo('KeyA'),
    toggleInventory: combo('KeyI'), toggleCharacter: combo('KeyC'),
    enterFight1: combo('Space'), enterFight2: combo('Digit2'),
    enterFight3: combo('Digit3'), enterFight4: combo('Digit4'),
    // Alt+X. (Alt+Q moved to target-switching in the combat rework — settings.ts
    // migrates a stored old-default Alt+Q bind to Alt+X on load.)
    exitFight: combo('KeyX', true),
    fireMode1: combo('Digit1', true), fireMode2: combo('Digit2', true),
    fireMode3: combo('Digit3', true), fireMode4: combo('Digit4', true),
  },
};

/** Deep copy of a keymap (restore-defaults / load fallback — never share refs). */
export const cloneKeymap = (k: Keymap): Keymap => ({
  combatModifier: k.combatModifier,
  bindings: Object.fromEntries(
    ACTION_ORDER.map((id) => [id, { ...k.bindings[id] }]),
  ) as Record<ActionId, Combo>,
});

export const comboEquals = (a: Combo, b: Combo): boolean =>
  a.code === b.code && a.alt === b.alt && a.ctrl === b.ctrl;

// --- labels ---
const CODE_LABELS: Record<string, string> = {
  Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
};
const codeLabel = (code: string): string => {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  const key = /^Key([A-Z])$/.exec(code); if (key) return key[1];
  const digit = /^Digit([0-9])$/.exec(code); if (digit) return digit[1];
  const numpad = /^Numpad([0-9])$/.exec(code); if (numpad) return `Num ${numpad[1]}`;
  return code;
};

export const comboLabel = (c: Combo): string => {
  const parts: string[] = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  parts.push(codeLabel(c.code));
  return parts.join(' + ');
};

export const modifierLabel = (m: ModifierKey): string => (m === 'alt' ? 'Alt' : 'Ctrl');

// --- matching (used by the router) ---
/** A physical keydown reduced to the bits binding-matching cares about. */
export interface EventKeys { code: string; alt: boolean; ctrl: boolean; meta: boolean }

/** Does an event match a binding? `strip` removes the combat-modifier from the
 *  event first (used in fight, where it's held as the unlock). Meta always
 *  disqualifies (leave OS combos alone); Shift is ignored. */
export function eventMatchesCombo(ev: EventKeys, c: Combo, strip: ModifierKey | null): boolean {
  if (ev.meta) return false;
  if (ev.code !== c.code) return false;
  let alt = ev.alt, ctrl = ev.ctrl;
  if (strip === 'alt') alt = false;
  if (strip === 'ctrl') ctrl = false;
  return alt === c.alt && ctrl === c.ctrl;
}

/** First action (in ACTION_ORDER) of one of `categories` whose binding matches. */
export function resolveAction(
  ev: EventKeys, keymap: Keymap, categories: ActionCategory[], strip: ModifierKey | null,
): ActionId | null {
  for (const id of ACTION_ORDER) {
    if (!categories.includes(ACTIONS[id].category)) continue;
    if (eventMatchesCombo(ev, keymap.bindings[id], strip)) return id;
  }
  return null;
}

// --- validation ---
/** Fold a keydown's modifiers for combos: treat AltGr (Right Alt on international layouts — it
 *  reports AltGraph, and on Windows also raises altKey/ctrlKey) as a plain Alt, and unify left/
 *  right (altKey/ctrlKey are already side-agnostic), so Right Alt behaves exactly like Left Alt.
 *  Note: where AltGr sets both, Ctrl+Alt combos collapse to Alt — acceptable; no default uses them. */
export function normalizeModifiers(altKey: boolean, ctrlKey: boolean, altGraph: boolean): { alt: boolean; ctrl: boolean } {
  return { alt: altKey || altGraph, ctrl: ctrlKey && !altGraph };
}

/** Keys owned by the hardcoded system layer — never bindable to any action. */
export const RESERVED_CODES = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'Backspace']);

/** A raw capture from the options "press a key…" flow. */
export interface Captured { code: string; key: string; alt: boolean; ctrl: boolean; shift: boolean; meta: boolean }

export type ValidationResult = { ok: true; combo: Combo } | { ok: false; reason: string };

// A single-character `key` with no Alt/Ctrl is "plain printable" — in fight it
// would resolve as typed combat input, so combat actions may never use it.
const isPlainPrintable = (cap: Captured): boolean =>
  cap.key.length === 1 && !cap.alt && !cap.ctrl;

// Combos the browser/OS intercept — some (Ctrl+W/T/N, Alt+F4) can't be preventDefault'd and would
// close the tab/window. Rejected at capture so a rebind can never hijack them. Extend here.
// (Ctrl+Shift+* is already blocked — Shift is rejected; Ctrl+Tab too — Tab is a RESERVED_CODE.)
const BROWSER_RESERVED_CTRL = new Set([
  'KeyW', 'KeyT', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'KeyH', 'KeyJ', 'KeyD',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'PageUp', 'PageDown',
]);
const BROWSER_RESERVED_ALT = new Set(['F4', 'ArrowLeft', 'ArrowRight', 'Home']);
const isBrowserReserved = (cap: Captured): boolean =>
  (cap.ctrl && !cap.alt && BROWSER_RESERVED_CTRL.has(cap.code)) ||
  (cap.alt && !cap.ctrl && BROWSER_RESERVED_ALT.has(cap.code));

/** Validate a captured combo for an action against its class rules + conflicts.
 *  HARD BLOCK on any failure (returns the reason to show inline). */
export function validateCapture(actionId: ActionId, cap: Captured, keymap: Keymap): ValidationResult {
  if (cap.shift || cap.meta) return { ok: false, reason: 'Use only Alt or Ctrl as a modifier.' };
  if (RESERVED_CODES.has(cap.code)) return { ok: false, reason: 'Esc, Enter, Tab and Backspace are reserved.' };
  if (isBrowserReserved(cap)) return { ok: false, reason: 'This shortcut is reserved by your browser.' };

  const category = ACTIONS[actionId].category;
  if (category === 'combat' && isPlainPrintable(cap)) {
    return { ok: false, reason: "Combat actions can't use plain letters/digits — in fight they'd be typed as combat input. Use a non-letter key or an Alt/Ctrl combo." };
  }
  if (category === 'travel' || category === 'enterFight') {
    const usesCm = keymap.combatModifier === 'alt' ? cap.alt : cap.ctrl;
    if (usesCm) {
      const cm = modifierLabel(keymap.combatModifier);
      const other = keymap.combatModifier === 'alt' ? 'Ctrl' : 'Alt';
      return { ok: false, reason: `${cm} is your combat-unlock key — travel actions can't also use it. Pick a plain key or use ${other}.` };
    }
  }

  const c: Combo = { code: cap.code, alt: cap.alt, ctrl: cap.ctrl };
  const owner = findConflict(c, keymap, actionId);
  if (owner) return { ok: false, reason: `Already bound to "${ACTIONS[owner].label}".` };
  return { ok: true, combo: c };
}

/** The action (other than `exceptId`) already bound to this combo, if any. */
export function findConflict(c: Combo, keymap: Keymap, exceptId: ActionId): ActionId | null {
  for (const id of ACTION_ORDER) {
    if (id === exceptId) continue;
    if (comboEquals(keymap.bindings[id], c)) return id;
  }
  return null;
}

/** May the combat-modifier be switched to `next`? Blocked if a travel/enterFight
 *  binding uses `next` (it would become unreachable in fight). */
export function canSetCombatModifier(next: ModifierKey, keymap: Keymap):
  { ok: true } | { ok: false; offenders: ActionId[] } {
  if (!SELECTABLE_COMBAT_MODIFIERS.includes(next)) return { ok: false, offenders: [] }; // not selectable in this build
  const offenders: ActionId[] = [];
  for (const id of ACTION_ORDER) {
    const cat = ACTIONS[id].category;
    if (cat !== 'travel' && cat !== 'enterFight') continue;
    const b = keymap.bindings[id];
    if ((next === 'alt' && b.alt) || (next === 'ctrl' && b.ctrl)) offenders.push(id);
  }
  return offenders.length ? { ok: false, offenders } : { ok: true };
}
