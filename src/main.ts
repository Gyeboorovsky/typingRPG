// Bootstrap: canvas sizing, character select, save loading, fixed-timestep
// game loop, wiring.
import './style.css';
import { SIM_DT } from './game/constants';
import { applySave, newGame, update } from './game/sim';
import type { ClassId, GameState } from './game/types';
import { Input } from './input';
import { Renderer } from './render/renderer';
import { isTauri, pickFileBackend, supportsFilePicker } from './save/backends';
import { SaveManager } from './save/save';
import { CharSelect } from './ui/charselect';
import { Hud } from './ui/hud';
import { OptionsMenu } from './ui/options';
import { loadSettings, saveSettings } from './save/settings';
import {
  ACTIONS, canSetCombatModifier, cloneKeymap, DEFAULT_KEYMAP, modifierLabel, validateCapture,
} from './keybinds';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let viewW = 0, viewH = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  viewW = canvas.clientWidth;
  viewH = canvas.clientHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// right-click is reserved for the app's own controls, not the browser menu
window.addEventListener('contextmenu', (e) => e.preventDefault());

async function boot(): Promise<void> {
  const state: GameState = newGame((Date.now() ^ (Math.random() * 0xffffffff)) | 0);
  let blocked = true; // no character chosen yet — sim stays frozen behind the select screen
  let keymap = loadSettings(); // device-wide binding set + combat-modifier (outside character saves)

  const saver = new SaveManager();
  await saver.setup();

  const input = new Input();
  const hud = new Hud();
  const renderer = new Renderer(ctx);
  const charSelect = new CharSelect();
  input.setKeymap(keymap);

  // Options window. main.ts is the single source of truth for the keymap; the view emits
  // rebind / modifier / restore intents that we validate, persist, and push back into Input.
  const options = new OptionsMenu({
    getKeymap: () => keymap,
    tryRebind: (id, cap) => {
      const res = validateCapture(id, cap, keymap);
      if (!res.ok) return res;
      keymap.bindings[id] = res.combo;
      saveSettings(keymap);
      input.setKeymap(keymap);
      return { ok: true };
    },
    setCombatModifier: (m) => {
      const check = canSetCombatModifier(m, keymap);
      if (!check.ok) {
        const names = check.offenders.map((o) => ACTIONS[o].label).join(', ');
        return { ok: false, reason: `Rebind ${names} first — ${modifierLabel(m)} would be unreachable in fight.` };
      }
      keymap.combatModifier = m;
      saveSettings(keymap);
      input.setKeymap(keymap);
      return { ok: true };
    },
    restoreDefaults: () => {
      keymap = cloneKeymap(DEFAULT_KEYMAP);
      saveSettings(keymap);
      input.setKeymap(keymap);
    },
  });
  hud.attachOptions(options);

  input.enabled = () => !blocked;
  // Char-select counts as a window for Esc precedence — otherwise Esc would open options over it.
  input.windowOpen = () => hud.anyWindowOpen() || charSelect.isOpen;
  input.onToggleInventory = () => { if (!blocked) hud.toggleInventory(state); };
  input.onToggleCharacter = () => { if (!blocked) hud.toggleStats(); };
  input.onOpenOptions = () => { if (!blocked) hud.openOptions(keymap); };
  input.onCloseTopWindow = () => { if (charSelect.isOpen) { charSelect.close(); return; } hud.closeTopWindow(); };
  document.getElementById('options-open-btn')!.addEventListener('click', () => { if (!blocked) hud.openOptions(keymap); });
  hud.onAllocateStat = (stat) => input.push({ type: 'allocateStat', stat });
  hud.onEquip = (index) => input.push({ type: 'equip', index });
  hud.onUnequip = (slot, x, y) => input.push({ type: 'unequip', slot, x, y });
  hud.onMoveItem = (index, x, y) => input.push({ type: 'moveItem', index, x, y });
  hud.onUseItem = (index) => input.push({ type: 'useItem', index });
  hud.onDropItem = (index) => input.push({ type: 'dropItem', index });
  saver.onStatus = (clean) => hud.setSaveStatus(clean);

  async function refreshCharSelect(): Promise<void> {
    charSelect.render(await saver.listSlots());
  }

  async function playSlot(slot: number, existing: boolean, name?: string, classId?: ClassId): Promise<void> {
    if (!blocked) saver.flush(state); // save whoever we're leaving
    let fresh: GameState;
    if (existing) {
      const data = await saver.loadSlot(slot); // also marks slot as active
      fresh = newGame((Date.now() ^ (Math.random() * 0xffffffff)) | 0);
      if (data) applySave(fresh, data);
    } else {
      fresh = newGame((Date.now() ^ (Math.random() * 0xffffffff)) | 0, name, classId);
      saver.setActiveSlot(slot);
      void saver.saveNow(fresh);
    }
    Object.assign(state, fresh);
    input.forceTravel(); // a freshly loaded character starts in travel
    renderer.resetCamera();
    charSelect.setActiveSlot(slot);
    charSelect.closable = true;
    charSelect.close();
    blocked = false;
    await refreshCharSelect();
  }

  charSelect.onPlay = (slot, existing, name, classId) => { void playSlot(slot, existing, name, classId); };
  charSelect.onDelete = (slot) => { void saver.deleteSlot(slot).then(refreshCharSelect); };
  // Open synchronously, then refresh content in place — chaining .open() after
  // the async listSlots() would race a concurrent Play click's close().
  charSelect.onOpenRequested = () => { charSelect.open(); void refreshCharSelect(); };

  await refreshCharSelect();
  charSelect.open();

  // "Save to file" button: browser-only, Chromium-only
  const saveBtn = document.getElementById('save-file') as HTMLButtonElement;
  if (!isTauri() && supportsFilePicker()) {
    saveBtn.classList.remove('hidden');
    saveBtn.addEventListener('click', async () => {
      const backend = await pickFileBackend();
      if (backend) {
        saver.addFileBackend(backend, state);
        saveBtn.textContent = '💾 file linked';
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !blocked) saver.flush(state);
  });
  window.addEventListener('beforeunload', () => { if (!blocked) saver.flush(state); });

  const STEP_MS = 1000 / 60;
  let acc = 0;
  let last = performance.now();

  function frame(now: number): void {
    acc += Math.min(now - last, 100); // clamp huge gaps (tab suspend)
    last = now;
    let steps = 0;
    while (acc >= STEP_MS && steps < 5) {
      if (!blocked) update(state, input.drain(), SIM_DT); else input.drain();
      steps++;
      acc -= STEP_MS;
    }
    if (steps === 5) acc = 0; // spiral-of-death guard
    // Keep Input's optimistic mode aligned with the sim after each tick: death and auto-exit
    // (last aggroed mob gone) both drop the sim to travel. forceTravel no-ops when already
    // aligned, so calling it every travel frame costs nothing.
    if (!blocked && state.mode === 'travel') input.forceTravel();
    const fx = state.fx;
    state.fx = [];
    if (!blocked) {
      if (fx.some((f) => f.kind === 'levelup')) void saver.saveNow(state);
      else saver.tick(state, steps * SIM_DT);
    }
    renderer.draw(state, fx, now / 1000, viewW, viewH);
    hud.sync(state, fx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) { // scripted-verification hook, dev builds only
    Object.assign(window as object, {
      __game: {
        state, saver,
        feedKeys: (s: string) => { for (const ch of s) input.push({ type: 'char', ch }); },
        setMode: (mode: 'travel' | 'fight') => input.push({ type: 'setMode', mode }),
        press: (t: 'ult' | 'respawn') => input.push({ type: t }),
        move: (dirs: number[]) => input.push({ type: 'move', dirs: dirs as never }),
        step: (n: number) => { for (let i = 0; i < n; i++) update(state, input.drain(), SIM_DT); },
        frame: (t = performance.now() / 1000, w?: number, h?: number) => {
          if (w && h) { // render headless at a forced size (hidden-tab checks)
            viewW = w; viewH = h;
            canvas.width = w; canvas.height = h;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          const fx = state.fx;
          state.fx = [];
          renderer.draw(state, fx, t, viewW, viewH);
          hud.sync(state, fx);
        },
      },
    });
  }
}

void boot();
