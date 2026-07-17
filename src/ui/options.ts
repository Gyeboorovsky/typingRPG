// Options window view — keybindings panel, combat-modifier dropdown, restore-defaults,
// and stub audio/graphics sections. DOM-only: it renders into the static #options skeleton
// and routes rebind / modifier / restore intents to callbacks wired in main.ts (the keymap's
// single source of truth). It owns the "press a key…" capture flow. Hud owns open/close +
// z-order and calls render()/cancelCapture().
import { ACTION_ORDER, ACTIONS, comboLabel, modifierLabel, normalizeModifiers, SELECTABLE_COMBAT_MODIFIERS } from '../keybinds';
import type { ActionId, Captured, Keymap, ModifierKey } from '../keybinds';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

export type OptionResult = { ok: true } | { ok: false; reason: string };

export interface OptionsDeps {
  tryRebind: (id: ActionId, cap: Captured) => OptionResult;
  setCombatModifier: (m: ModifierKey) => OptionResult;
  restoreDefaults: () => void;
  getKeymap: () => Keymap;
}

export class OptionsMenu {
  private body = $('options-body');
  private captureListener: ((e: KeyboardEvent) => void) | null = null;
  private captureRestore: (() => void) | null = null; // reverts the mid-capture row's label on cancel

  constructor(private deps: OptionsDeps) {}

  /** Rebuild the whole panel from the current keymap. */
  render(keymap: Keymap): void {
    this.cancelCapture();
    this.body.innerHTML = '';
    this.body.appendChild(this.keybindsSection(keymap));
    this.body.appendChild(this.modifierSection(keymap));
    this.body.appendChild(stubSection('Audio'));
    this.body.appendChild(stubSection('Graphics'));
  }

  /** Stop any in-progress "press a key…" capture (called on close / re-render). */
  cancelCapture(): void {
    this.captureRestore?.(); // revert the row's "press a key…" back to its current binding label
    this.captureRestore = null;
    if (this.captureListener) {
      window.removeEventListener('keydown', this.captureListener, { capture: true });
      this.captureListener = null;
    }
  }

  private keybindsSection(keymap: Keymap): HTMLElement {
    const sec = el('section');
    sec.appendChild(el('h3', 'Keybindings'));

    let group = '';
    for (const id of ACTION_ORDER) {
      if (ACTIONS[id].group !== group) {
        group = ACTIONS[id].group;
        sec.appendChild(el('div', group, 'opt-group'));
      }
      sec.appendChild(this.keyRow(id, keymap));
    }

    const restore = el('button', 'Restore defaults', 'btn neutral opt-restore') as HTMLButtonElement;
    restore.addEventListener('click', () => { this.deps.restoreDefaults(); this.render(this.deps.getKeymap()); });
    sec.appendChild(restore);
    return sec;
  }

  private keyRow(id: ActionId, keymap: Keymap): HTMLElement {
    const row = el('div', '', 'opt-row');
    const name = el('span', ACTIONS[id].label, 'opt-name');
    const btn = el('button', comboLabel(keymap.bindings[id]), 'opt-key') as HTMLButtonElement;
    const hint = el('div', '', 'opt-hint hidden');
    btn.addEventListener('click', () => this.beginCapture(id, btn, hint));
    row.append(name, btn, hint);
    return row;
  }

  private beginCapture(id: ActionId, btn: HTMLButtonElement, hint: HTMLElement): void {
    this.cancelCapture();
    hint.classList.add('hidden');
    btn.classList.add('capturing');
    btn.textContent = 'press a key…';
    const restore = (): void => {
      btn.classList.remove('capturing');
      btn.textContent = comboLabel(this.deps.getKeymap().bindings[id]);
    };
    this.captureRestore = restore; // so cancelCapture (incl. clicking another row) reverts this label

    this.captureListener = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation(); // never let the game (or anything else) see the capture keystroke
      // Ignore lone modifier presses — incl. AltGr (key 'AltGraph') — and wait for the real key.
      if (e.key === 'Alt' || e.key === 'AltGraph' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta') return;
      if (e.key === 'Escape') { this.cancelCapture(); return; } // cancel — cancelCapture reverts the label
      const { alt, ctrl } = normalizeModifiers(e.altKey, e.ctrlKey, e.getModifierState('AltGraph'));
      const cap: Captured = {
        code: e.code, key: e.key, alt, ctrl, shift: e.shiftKey, meta: e.metaKey,
      };
      const res = this.deps.tryRebind(id, cap);
      this.cancelCapture(); // reverts the label to the current binding + removes the listener
      if (res.ok) this.render(this.deps.getKeymap()); // reflect the new binding across the panel
      else { hint.textContent = res.reason; hint.classList.remove('hidden'); }
    };
    window.addEventListener('keydown', this.captureListener, { capture: true });
  }

  private modifierSection(keymap: Keymap): HTMLElement {
    const sec = el('section');
    sec.appendChild(el('h3', 'Combat modifier'));
    const row = el('div', '', 'opt-row');
    const name = el('span', 'Hold in fight to move / open windows', 'opt-name');
    const sel = el('select', '', 'opt-select') as HTMLSelectElement;
    for (const m of SELECTABLE_COMBAT_MODIFIERS) {
      const o = document.createElement('option');
      o.value = m; o.textContent = modifierLabel(m);
      if (keymap.combatModifier === m) o.selected = true;
      sel.appendChild(o);
    }
    sel.disabled = SELECTABLE_COMBAT_MODIFIERS.length <= 1; // locked to Alt while there's one option
    const hint = el('div', '', 'opt-hint hidden');
    sel.addEventListener('change', () => {
      const res = this.deps.setCombatModifier(sel.value as ModifierKey);
      if (res.ok) { this.render(this.deps.getKeymap()); return; }
      sel.value = this.deps.getKeymap().combatModifier; // revert the dropdown
      hint.textContent = res.reason;
      hint.classList.remove('hidden');
    });
    row.append(name, sel, hint);
    sec.appendChild(row);
    if (SELECTABLE_COMBAT_MODIFIERS.length <= 1) {
      sec.appendChild(el('div', 'Ctrl unlocks in the desktop build — browser shortcuts (Ctrl+W…) conflict.', 'hint'));
    }
    return sec;
  }
}

function stubSection(title: string): HTMLElement {
  const sec = el('section');
  sec.appendChild(el('h3', title));
  sec.appendChild(el('div', 'Coming soon.', 'hint'));
  return sec;
}

/** Tiny element helper: tag + optional text + optional class. */
function el(tag: string, text = '', className = ''): HTMLElement {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
