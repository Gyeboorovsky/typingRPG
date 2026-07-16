// Options window view — keybindings panel, combat-modifier dropdown, restore-defaults,
// and stub audio/graphics sections. DOM-only: it renders into the static #options skeleton
// and routes rebind / modifier / restore intents to callbacks wired in main.ts (the keymap's
// single source of truth). It owns the "press a key…" capture flow. Hud owns open/close +
// z-order and calls render()/cancelCapture().
import { ACTION_ORDER, ACTIONS, comboLabel, modifierLabel } from '../keybinds';
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

    this.captureListener = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation(); // never let the game (or anything else) see the capture keystroke
      if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta') return; // wait for the real key
      if (e.key === 'Escape') { this.cancelCapture(); restore(); return; } // cancel capture, keep the binding
      const cap: Captured = {
        code: e.code, key: e.key, alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey,
      };
      const res = this.deps.tryRebind(id, cap);
      this.cancelCapture();
      if (res.ok) {
        this.render(this.deps.getKeymap()); // reflect the new binding across the panel
      } else {
        restore();
        hint.textContent = res.reason;
        hint.classList.remove('hidden');
      }
    };
    window.addEventListener('keydown', this.captureListener, { capture: true });
  }

  private modifierSection(keymap: Keymap): HTMLElement {
    const sec = el('section');
    sec.appendChild(el('h3', 'Combat modifier'));
    const row = el('div', '', 'opt-row');
    const name = el('span', 'Hold in fight to move / open windows', 'opt-name');
    const sel = el('select', '', 'opt-select') as HTMLSelectElement;
    for (const m of ['alt', 'ctrl'] as ModifierKey[]) {
      const o = document.createElement('option');
      o.value = m; o.textContent = modifierLabel(m);
      if (keymap.combatModifier === m) o.selected = true;
      sel.appendChild(o);
    }
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
