// Keyboard capture → event queue for the sim. The keydown decision logic is a PURE
// function (routeKeydown) so it can be unit-tested in node without a DOM; the Input
// class is a thin adapter that maps real KeyboardEvents to it and applies the result.
//
// Control modes (see GameState.mode):
//   travel — WSAD/arrows move; `i`/`c` toggle windows; digits/Space enter fight; nothing types.
//   fight  — printable chars feed the typing resolver; movement does nothing; backtick or Esc
//            return to travel; Alt+digit picks the bow fire mode without typing.
import type { Dir, InputEvent, Mode } from './game/types';

// Movement keys, keyed by e.code so they're layout- and case-independent (WSAD + arrows).
const DIR_CODES: Record<string, Dir> = {
  ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3,
};

// The bits of a KeyboardEvent the router needs — a plain descriptor so tests don't need a DOM.
export interface KeyInfo {
  key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean;
}

export interface KeyRoute {
  preventDefault: boolean;
  events: InputEvent[];   // sim events to enqueue (setMode / setFireMode / char / ult+respawn)
  mode: Mode;             // resulting local mode (unchanged if the key didn't switch modes)
  clearHeld: boolean;     // true when entering fight — drop any held movement
  movePress: Dir | null;  // a travel movement key pressed this event, else null
  ui: 'toggleInventory' | 'toggleCharacter' | 'closeWindows' | null;
}

const fireDigit = (code: string): number | null => {
  const m = /^Digit([1-4])$/.exec(code);
  return m ? Number(m[1]) : null;
};

const isPrintable = (info: KeyInfo): boolean =>
  info.key.length === 1 && !info.ctrlKey && !info.metaKey && !info.altKey;

/** Pure keystroke router: given the current mode and whether a HUD window is open, decide what a
 *  keydown does. No DOM, no state mutation — the Input class applies the returned KeyRoute. */
export function routeKeydown(mode: Mode, windowOpen: boolean, info: KeyInfo): KeyRoute {
  const base: KeyRoute = {
    preventDefault: false, events: [], mode, clearHeld: false, movePress: null, ui: null,
  };

  // Backtick always returns to travel and never types.
  if (info.code === 'Backquote') {
    if (mode === 'fight') return { ...base, preventDefault: true, mode: 'travel', events: [{ type: 'setMode', mode: 'travel' }] };
    return { ...base, preventDefault: true }; // already travel
  }

  // Enter (ult/respawn) and Tab (inventory) behave the same in both modes.
  if (info.key === 'Enter') return { ...base, preventDefault: true, events: [{ type: 'ult' }, { type: 'respawn' }] };
  if (info.key === 'Tab') return { ...base, preventDefault: true, ui: 'toggleInventory' };

  // Esc: close a window first if one is open; otherwise (fight only) exit to travel.
  if (info.key === 'Escape') {
    if (windowOpen) return { ...base, ui: 'closeWindows' };
    if (mode === 'fight') return { ...base, mode: 'travel', events: [{ type: 'setMode', mode: 'travel' }] };
    return base;
  }

  return mode === 'travel' ? routeTravel(base, info) : routeFight(base, info);
}

function routeTravel(base: KeyRoute, info: KeyInfo): KeyRoute {
  const dir = DIR_CODES[info.code];
  if (dir !== undefined) return { ...base, preventDefault: true, movePress: dir };
  if (info.code === 'KeyI') return { ...base, preventDefault: true, ui: 'toggleInventory' };
  if (info.code === 'KeyC') return { ...base, preventDefault: true, ui: 'toggleCharacter' };
  // Space or a digit enters fight; the digit (Space = 1) selects the bow fire mode.
  const digit = fireDigit(info.code);
  const fireMode = info.code === 'Space' ? 1 : digit;
  if (fireMode !== null) {
    return {
      ...base, preventDefault: true, mode: 'fight', clearHeld: true,
      events: [{ type: 'setMode', mode: 'fight' }, { type: 'setFireMode', fireMode }],
    };
  }
  return base; // every other key is inert in travel (letters don't type)
}

function routeFight(base: KeyRoute, info: KeyInfo): KeyRoute {
  // Alt+digit picks the fire mode without typing the digit.
  if (info.altKey) {
    const digit = fireDigit(info.code);
    if (digit !== null) return { ...base, preventDefault: true, events: [{ type: 'setFireMode', fireMode: digit }] };
  }
  // Backspace is inert in fight: the resolver advances only on correct chars, so there's no
  // wrong-char buffer to erase — and binding it to "exit" clashes with its delete-a-letter feel.
  if (info.key === 'Backspace') return { ...base, preventDefault: true };
  // Arrow keys neither move nor type in fight — swallow them so the page doesn't scroll.
  if (DIR_CODES[info.code] !== undefined && info.code.startsWith('Arrow')) return { ...base, preventDefault: true };
  if (isPrintable(info)) return { ...base, preventDefault: true, events: [{ type: 'char', ch: info.key }] };
  return base;
}

export class Input {
  private queue: InputEvent[] = [];
  private held: Dir[] = [];
  private mode: Mode = 'travel'; // optimistic local mirror of state.mode, drives keystroke routing
  enabled: () => boolean = () => true;       // false behind the char-select screen
  windowOpen: () => boolean = () => false;   // a HUD window (or carried item) is open — for Esc precedence
  onToggleInventory: () => void = () => {};
  onToggleCharacter: () => void = () => {};
  onCloseWindows: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => {
      const dir = DIR_CODES[e.code];
      if (dir !== undefined) this.release(dir);
    });
    window.addEventListener('blur', () => { // don't leave keys stuck
      if (this.held.length) { this.held = []; this.pushMove(); }
    });
  }

  private keydown(e: KeyboardEvent): void {
    if (!this.enabled()) return; // char-select screen owns the keyboard (name field, etc.)
    const route = routeKeydown(this.mode, this.windowOpen(),
      { key: e.key, code: e.code, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
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
    else if (route.ui === 'closeWindows') this.onCloseWindows();
  }

  /** Force the input layer back to travel (used on death / character load). Idempotent. */
  forceTravel(): void {
    if (this.mode === 'travel') return;
    this.mode = 'travel';
    this.queue.push({ type: 'setMode', mode: 'travel' });
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
