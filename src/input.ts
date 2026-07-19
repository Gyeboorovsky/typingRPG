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
import { ESC_HOLD_EXIT_FIGHT_MS } from './game/constants';
import type { Dir, InputEvent, Mode } from './game/types';
import { ACTIONS, DEFAULT_KEYMAP, normalizeModifiers, resolveAction } from './keybinds';
import type { ActionId, Keymap } from './keybinds';

// The bits of a KeyboardEvent the router needs — a plain descriptor so tests don't need a DOM.
export interface KeyInfo {
  key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; repeat: boolean;
}

export interface KeyRoute {
  preventDefault: boolean;
  events: InputEvent[];   // sim events to enqueue (setMode / setFireMode / char / ult+respawn)
  mode: Mode;             // resulting local mode (unchanged if the key didn't switch modes)
  clearHeld: boolean;     // true when entering/leaving fight — drop any held movement
  movePress: Dir | null;  // a movement key pressed this event, else null
  ui: 'toggleInventory' | 'toggleCharacter' | 'closeTopWindow' | 'openOptions' | null;
  beginEscHold: boolean;  // Esc pressed in fight with no window open — arm the hold-to-exit timer
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

/** Pure keystroke router: decides what a keydown does and returns exactly one route. No DOM, no
 *  state mutation — the Input class applies the returned KeyRoute. Discrete window/hold actions
 *  are suppressed on OS auto-repeat (see below), so a held key can only drive the fight-exit hold. */
export function routeKeydown(
  mode: Mode, windowOpen: boolean, info: KeyInfo, keymap: Keymap, travelUnlocked: boolean,
): KeyRoute {
  const route = resolveKeyRoute(mode, windowOpen, info, keymap, travelUnlocked);
  // Opening/closing/toggling a window and arming the exit-hold are DISCRETE — one per physical
  // press. On an auto-repeat keydown, strip them; the fight-exit hold is advanced each tick by
  // tickEscHold, so it (and only it) still responds to a held key. preventDefault/events/mode stay.
  if (info.repeat) { route.ui = null; route.beginEscHold = false; route.movePress = null; }
  return route;
}

function resolveKeyRoute(
  mode: Mode, windowOpen: boolean, info: KeyInfo, keymap: Keymap, travelUnlocked: boolean,
): KeyRoute {
  const base: KeyRoute = {
    preventDefault: false, events: [], mode, clearHeld: false, movePress: null, ui: null, beginEscHold: false,
  };

  // --- Hardcoded system keys (never via the binding table) ---
  // Esc: close the topmost window; else in travel open options; else (fight, no window) no-op.
  if (info.key === 'Escape') {
    if (windowOpen) return { ...base, preventDefault: true, ui: 'closeTopWindow' };
    if (mode === 'travel') return { ...base, preventDefault: true, ui: 'openOptions' };
    // fight + no window: arm a hold-to-confirm exit. Only a keydown that lands HERE can arm it —
    // one that closed a window took the branch above, so a window-close can never roll into an exit.
    return { ...base, preventDefault: true, beginEscHold: true };
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
    // Combat-modifier + travel key works the SAME in travel as in fight's unlocked branch:
    // Alt+WSAD moves. Swallow any other combat-modifier combo so the browser doesn't grab it
    // (e.g. Alt+D focusing the address bar).
    if (travelUnlocked) {
      const travelId = resolveAction(ev, keymap, ['travel'], keymap.combatModifier);
      if (travelId) return routeForAction(base, travelId);
      return { ...base, preventDefault: true };
    }
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

// --- Esc hold-to-confirm fight exit (pure; Input owns one, tests drive it with explicit dt) ---
/** Live progress of a hold-to-exit gesture. Transient input state — deliberately NOT on
 *  GameState: the sim only ever learns the final outcome (a setMode travel via forceTravel). */
export interface EscHold { holding: boolean; ms: number }

export const newEscHold = (): EscHold => ({ holding: false, ms: 0 });
export function escHoldBegin(h: EscHold): void { h.holding = true; h.ms = 0; }
export function escHoldCancel(h: EscHold): void { h.holding = false; h.ms = 0; }

/** Advance one tick. `valid` (still in fight, no window open) is re-derived by the caller every
 *  tick — not latched at press time — so the hold cancels the moment it stops holding. Returns
 *  true on the single tick it crosses the threshold (>=, so reaching it fires), then auto-resets. */
export function escHoldTick(h: EscHold, dtMs: number, valid: boolean, thresholdMs: number): boolean {
  if (!h.holding) return false;
  if (!valid) { h.holding = false; h.ms = 0; return false; } // window opened / left fight → cancel
  h.ms += dtMs;
  if (h.ms >= thresholdMs) { h.holding = false; h.ms = 0; return true; }
  return false;
}

/** 0..1 for the render ring; 0 when no hold is active. */
export const escHoldFraction = (h: EscHold, thresholdMs: number): number =>
  h.holding ? Math.min(h.ms / thresholdMs, 1) : 0;

export class Input {
  private queue: InputEvent[] = [];
  private held: Dir[] = [];
  private mode: Mode = 'travel'; // optimistic local mirror of state.mode, drives keystroke routing
  private keymap: Keymap = DEFAULT_KEYMAP;
  private modHeld = false; // is the combat-modifier currently held (live, non-latched)
  private moveCodeToDir: Record<string, Dir> = {}; // bound movement code → dir, for keyup release
  private escHold = newEscHold(); // live Esc hold-to-exit progress (fight only; drives the ring)
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
      const { alt, ctrl } = normalizeModifiers(e.altKey, e.ctrlKey, e.getModifierState('AltGraph'));
      this.updateModHeld(alt, ctrl);
      if (e.key === 'Escape') escHoldCancel(this.escHold); // releasing before the threshold cancels
      const dir = this.moveCodeToDir[e.code];
      if (dir !== undefined) this.release(dir);
    });
    window.addEventListener('blur', () => { // don't leave keys / the modifier / a hold stuck
      if (this.held.length) { this.held = []; this.pushMove(); }
      if (this.modHeld) { this.modHeld = false; this.queue.push({ type: 'setTravelUnlocked', value: false }); }
      escHoldCancel(this.escHold);
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

  /** Recompute the live combat-modifier state from already-normalized modifier flags (so AltGr
   *  counts as Alt); enqueue on change so the sim's travelUnlocked gate tracks it (edge-triggered). */
  private updateModHeld(alt: boolean, ctrl: boolean): void {
    const held = this.keymap.combatModifier === 'alt' ? alt : ctrl;
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
    const { alt, ctrl } = normalizeModifiers(e.altKey, e.ctrlKey, e.getModifierState('AltGraph'));
    this.updateModHeld(alt, ctrl);
    if (this.isCombatModifierKey(e.code)) e.preventDefault(); // suppress the Alt menubar / focus loss
    const route = routeKeydown(this.mode, this.windowOpen(),
      { key: e.key, code: e.code, altKey: alt, ctrlKey: ctrl, metaKey: e.metaKey, repeat: e.repeat },
      this.keymap, this.modHeld);
    if (route.preventDefault) e.preventDefault();
    this.mode = route.mode;
    if (route.clearHeld && this.held.length) { this.held = []; this.pushMove(); }
    // routeKeydown already nulls movePress/beginEscHold on auto-repeat (discrete actions fire once
    // per physical press), so no !e.repeat guard is needed here.
    if (route.movePress !== null && !this.held.includes(route.movePress)) {
      this.held.push(route.movePress);
      this.pushMove();
    }
    if (route.beginEscHold) escHoldBegin(this.escHold);
    for (const ev of route.events) this.queue.push(ev);
    if (route.ui === 'toggleInventory') this.onToggleInventory();
    else if (route.ui === 'toggleCharacter') this.onToggleCharacter();
    else if (route.ui === 'closeTopWindow') this.onCloseTopWindow();
    else if (route.ui === 'openOptions') this.onOpenOptions();
  }

  /** Force the input layer back to travel (death / character load / sim auto-exit / a future
   *  Part 2 hold-exit). Idempotent; drops any held movement so a stale press can't linger. */
  forceTravel(): void {
    escHoldCancel(this.escHold); // leaving fight for ANY reason ends the hold (and its ring)
    if (this.mode === 'travel') return;
    this.mode = 'travel';
    this.queue.push({ type: 'setMode', mode: 'travel' });
    if (this.held.length) { this.held = []; this.pushMove(); }
  }

  /** Advance the Esc hold-to-exit timer one sim step (dt in seconds). Validity is re-derived live,
   *  so a window opening — or the sim leaving fight on its own (death / last aggroed mob gone) —
   *  cancels it immediately. On reaching the threshold it fires the SAME outcome as the exitFight
   *  action by calling forceTravel(); no exit logic is duplicated and no keypress is synthesized. */
  tickEscHold(dt: number): void {
    const valid = this.mode === 'fight' && !this.windowOpen();
    if (escHoldTick(this.escHold, dt * 1000, valid, ESC_HOLD_EXIT_FIGHT_MS)) this.forceTravel();
  }

  /** 0..1 hold progress, for the render ring. 0 when no hold is active. */
  escHoldProgress(): number {
    return escHoldFraction(this.escHold, ESC_HOLD_EXIT_FIGHT_MS);
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
