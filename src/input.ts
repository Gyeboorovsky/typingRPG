// Keyboard capture → event queue for the sim. The keydown decision logic is a PURE
// function (routeKeydown) so it can be unit-tested in node without a DOM; the Input
// class is a thin adapter that maps real KeyboardEvents to it and applies the result.
//
// Bindings are DATA (see keybinds.ts): routeKeydown resolves the pressed key/combo
// against the active Keymap plus the live `travelUnlocked` flag. Only Esc / Enter /
// Tab are hardcoded system keys that never go through the binding table.
//
// Control modes (see GameState.mode):
//   travel — bound travel/enter-fight actions fire; nothing types.
//   fight  — printable chars feed the typing resolver; combat actions fire directly;
//            travel actions fire only while the combat-modifier is held (which also
//            unlocks movement). Esc/Backspace are inert here (Part 2 adds hold-to-exit).
import type { Dir, InputEvent, Mode } from './game/types';
import { ACTIONS, DEFAULT_KEYMAP, resolveAction } from './keybinds';
import type { ActionId, Keymap } from './keybinds';

// The bits of a KeyboardEvent the router needs — a plain descriptor so tests don't need a DOM.
export interface KeyInfo {
  key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean;
}

export interface KeyRoute {
  preventDefault: boolean;
  events: InputEvent[];   // sim events to enqueue (setMode / setFireMode / char / ult+respawn)
  mode: Mode;             // resulting local mode (unchanged if the key didn't switch modes)
  clearHeld: boolean;     // true when entering/leaving fight — drop any held movement
  movePress: Dir | null;  // a movement key pressed this event, else null
  ui: 'toggleInventory' | 'toggleCharacter' | 'closeTopWindow' | 'openOptions' | null;
}

const isPrintable = (info: KeyInfo): boolean =>
  info.key.length === 1 && !info.ctrlKey && !info.metaKey && !info.altKey;

/** Build the KeyRoute for a resolved action, from its keybinds metadata. */
function routeForAction(base: KeyRoute, id: ActionId): KeyRoute {
  const meta = ACTIONS[id];
  if (meta.category === 'travel') {
    if (meta.dir !== undefined) return { ...base, preventDefault: true, movePress: meta.dir };
    return { ...base, preventDefault: true, ui: id === 'toggleInventory' ? 'toggleInventory' : 'toggleCharacter' };
  }
  if (meta.category === 'enterFight') {
    return {
      ...base, preventDefault: true, mode: 'fight', clearHeld: true,
      events: [{ type: 'setMode', mode: 'fight' }, { type: 'setFireMode', fireMode: meta.fireMode! }],
    };
  }
  // combat
  if (id === 'exitFight') {
    return { ...base, preventDefault: true, mode: 'travel', clearHeld: true, events: [{ type: 'setMode', mode: 'travel' }] };
  }
  return { ...base, preventDefault: true, events: [{ type: 'setFireMode', fireMode: meta.fireMode! }] };
}

/** Pure keystroke router: given mode, whether a window is open, the active keymap, and
 *  whether the combat-modifier is currently held, decide what a keydown does. No DOM, no
 *  state mutation — the Input class applies the returned KeyRoute. Returns exactly one
 *  route, so at most one action ever fires per physical keydown. */
export function routeKeydown(
  mode: Mode, windowOpen: boolean, info: KeyInfo, keymap: Keymap, travelUnlocked: boolean,
): KeyRoute {
  const base: KeyRoute = {
    preventDefault: false, events: [], mode, clearHeld: false, movePress: null, ui: null,
  };

  // --- Hardcoded system keys (never via the binding table) ---
  // Esc: close the topmost window; else in travel open options; else (fight, no window) no-op.
  if (info.key === 'Escape') {
    if (windowOpen) return { ...base, preventDefault: true, ui: 'closeTopWindow' };
    if (mode === 'travel') return { ...base, preventDefault: true, ui: 'openOptions' };
    // Part 2 fills this slot with a hold-to-confirm fight exit; for now it does nothing.
    return { ...base, preventDefault: true };
  }
  // Enter (ult/respawn) and Tab (inventory) behave the same in both modes.
  if (info.key === 'Enter') return { ...base, preventDefault: true, events: [{ type: 'ult' }, { type: 'respawn' }] };
  if (info.key === 'Tab') return { ...base, preventDefault: true, ui: 'toggleInventory' };

  // --- Printable-key reservation (invariant): in fight, unmodified printables always type. ---
  if (mode === 'fight' && !travelUnlocked && isPrintable(info)) {
    return { ...base, preventDefault: true, events: [{ type: 'char', ch: info.key }] };
  }

  const ev = { code: info.code, alt: info.altKey, ctrl: info.ctrlKey, meta: info.metaKey };

  if (mode === 'travel') {
    const id = resolveAction(ev, keymap, ['travel', 'enterFight'], null);
    if (id) return routeForAction(base, id);
    return base; // unmatched in travel → inert (letters don't type)
  }

  // fight: combat actions match directly (checked first so an explicit cm-combo like exitFight
  // wins over a plain travel key that strips to the same base). Travel actions then match with
  // the combat-modifier stripped, so a plain-key travel binding fires as modifier + key.
  const combatId = resolveAction(ev, keymap, ['combat'], null);
  if (combatId) return routeForAction(base, combatId);
  if (travelUnlocked) {
    const travelId = resolveAction(ev, keymap, ['travel'], keymap.combatModifier);
    if (travelId) return routeForAction(base, travelId);
  }
  // Swallow keys that would otherwise scroll the page / focus the menubar while fighting.
  if (info.key === 'Backspace' || info.code.startsWith('Arrow') || info.altKey || info.ctrlKey) {
    return { ...base, preventDefault: true };
  }
  return base;
}

export class Input {
  private queue: InputEvent[] = [];
  private held: Dir[] = [];
  private mode: Mode = 'travel'; // optimistic local mirror of state.mode, drives keystroke routing
  private keymap: Keymap = DEFAULT_KEYMAP;
  private modHeld = false; // is the combat-modifier currently held (live, non-latched)
  private moveCodeToDir: Record<string, Dir> = {}; // bound movement code → dir, for keyup release
  enabled: () => boolean = () => true;       // false behind the char-select screen
  windowOpen: () => boolean = () => false;   // a HUD window / carried item / char-select is open — for Esc precedence
  onToggleInventory: () => void = () => {};
  onToggleCharacter: () => void = () => {};
  onOpenOptions: () => void = () => {};
  onCloseTopWindow: () => void = () => {};

  constructor() {
    this.setKeymap(DEFAULT_KEYMAP);
    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => {
      this.updateModHeld(e);
      const dir = this.moveCodeToDir[e.code];
      if (dir !== undefined) this.release(dir);
    });
    window.addEventListener('blur', () => { // don't leave keys / the modifier stuck
      if (this.held.length) { this.held = []; this.pushMove(); }
      if (this.modHeld) { this.modHeld = false; this.queue.push({ type: 'setTravelUnlocked', value: false }); }
    });
  }

  /** Swap the active binding set (from options / load). Rebuilds the keyup release map. */
  setKeymap(k: Keymap): void {
    this.keymap = k;
    this.moveCodeToDir = {};
    for (const id of ['moveUp', 'moveRight', 'moveDown', 'moveLeft'] as ActionId[]) {
      this.moveCodeToDir[k.bindings[id].code] = ACTIONS[id].dir!;
    }
  }

  /** Recompute the live combat-modifier state from an event; enqueue on change so the sim's
   *  travelUnlocked gate tracks it (edge-triggered — no per-tick spam). */
  private updateModHeld(e: { altKey: boolean; ctrlKey: boolean }): void {
    const held = this.keymap.combatModifier === 'alt' ? e.altKey : e.ctrlKey;
    if (held !== this.modHeld) {
      this.modHeld = held;
      this.queue.push({ type: 'setTravelUnlocked', value: held });
    }
  }

  private isCombatModifierKey(code: string): boolean {
    return this.keymap.combatModifier === 'alt'
      ? code === 'AltLeft' || code === 'AltRight'
      : code === 'ControlLeft' || code === 'ControlRight';
  }

  private keydown(e: KeyboardEvent): void {
    if (!this.enabled()) return; // char-select screen owns the keyboard (name field, etc.)
    this.updateModHeld(e);
    if (this.isCombatModifierKey(e.code)) e.preventDefault(); // suppress the Alt menubar / focus loss
    const route = routeKeydown(this.mode, this.windowOpen(),
      { key: e.key, code: e.code, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey },
      this.keymap, this.modHeld);
    if (route.preventDefault) e.preventDefault();
    this.mode = route.mode;
    if (route.clearHeld && this.held.length) { this.held = []; this.pushMove(); }
    if (route.movePress !== null && !e.repeat && !this.held.includes(route.movePress)) {
      this.held.push(route.movePress);
      this.pushMove();
    }
    for (const ev of route.events) this.queue.push(ev);
    if (route.ui === 'toggleInventory') this.onToggleInventory();
    else if (route.ui === 'toggleCharacter') this.onToggleCharacter();
    else if (route.ui === 'closeTopWindow') this.onCloseTopWindow();
    else if (route.ui === 'openOptions') this.onOpenOptions();
  }

  /** Force the input layer back to travel (death / character load / sim auto-exit / a future
   *  Part 2 hold-exit). Idempotent; drops any held movement so a stale press can't linger. */
  forceTravel(): void {
    if (this.mode === 'travel') return;
    this.mode = 'travel';
    this.queue.push({ type: 'setMode', mode: 'travel' });
    if (this.held.length) { this.held = []; this.pushMove(); }
  }

  private release(dir: Dir): void {
    const i = this.held.indexOf(dir);
    if (i >= 0) { this.held.splice(i, 1); this.pushMove(); }
  }

  private pushMove(): void {
    this.queue.push({ type: 'move', dirs: [...this.held] });
  }

  push(ev: InputEvent): void {
    this.queue.push(ev);
  }

  drain(): InputEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
