// Bootstrap: canvas sizing, save loading, fixed-timestep game loop, wiring.
import './style.css';
import { SIM_DT } from './game/constants';
import { applySave, newGame, update } from './game/sim';
import type { GameState } from './game/types';
import { Input } from './input';
import { Renderer } from './render/renderer';
import { isTauri, pickFileBackend, supportsFilePicker } from './save/backends';
import { SaveManager } from './save/save';
import { Hud } from './ui/hud';

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

async function boot(): Promise<void> {
  const state: GameState = newGame((Date.now() ^ (Math.random() * 0xffffffff)) | 0);
  const saver = new SaveManager();
  const loaded = await saver.init();
  if (loaded) applySave(state, loaded);
  else void saver.saveNow(state); // create the save file right away

  const input = new Input();
  const hud = new Hud();
  const renderer = new Renderer(ctx);
  input.combatActive = () => state.combat !== null;
  input.onToggleInventory = () => hud.toggleInventory(state);
  input.onCloseInventory = () => hud.closeInventory();
  saver.onStatus = (clean) => hud.setSaveStatus(clean);

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
    if (document.visibilityState === 'hidden') saver.flush(state);
  });
  window.addEventListener('beforeunload', () => saver.flush(state));

  const STEP_MS = 1000 / 60;
  let acc = 0;
  let last = performance.now();

  function frame(now: number): void {
    acc += Math.min(now - last, 100); // clamp huge gaps (tab suspend)
    last = now;
    let steps = 0;
    while (acc >= STEP_MS && steps < 5) {
      update(state, input.drain(), SIM_DT);
      steps++;
      acc -= STEP_MS;
    }
    if (steps === 5) acc = 0; // spiral-of-death guard
    const fx = state.fx;
    state.fx = [];
    if (fx.some((f) => f.kind === 'levelup')) void saver.saveNow(state);
    else saver.tick(state, steps * SIM_DT);
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
