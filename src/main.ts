// Bootstrap: canvas sizing, fixed-timestep game loop, input/HUD wiring.
import './style.css';
import { SIM_DT } from './game/constants';
import { newGame, update } from './game/sim';
import type { GameState } from './game/types';
import { Input } from './input';
import { Renderer } from './render/renderer';
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

const state: GameState = newGame((Date.now() ^ (Math.random() * 0xffffffff)) | 0);
const input = new Input();
const hud = new Hud();
const renderer = new Renderer(ctx);
input.combatActive = () => state.combat !== null;
input.onToggleInventory = () => hud.toggleInventory(state);
input.onCloseInventory = () => hud.closeInventory();

const STEP_MS = 1000 / 60;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  acc += Math.min(now - last, 100); // clamp huge gaps (tab suspend)
  last = now;
  let steps = 0;
  while (acc >= STEP_MS && steps < 5) {
    update(state, input.drain(), SIM_DT);
    acc -= STEP_MS;
    steps++;
  }
  if (steps === 5) acc = 0; // spiral-of-death guard
  const fx = state.fx;
  state.fx = [];
  renderer.draw(state, fx, now / 1000, viewW, viewH);
  hud.sync(state, fx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) { // scripted-verification hook, dev builds only
  Object.assign(window as object, {
    __game: {
      state,
      feedKeys: (s: string) => { for (const ch of s) input.push({ type: 'char', ch }); },
      press: (t: 'ult' | 'respawn') => input.push({ type: t }),
      move: (dirs: number[]) => input.push({ type: 'move', dirs: dirs as never }),
      step: (n: number) => { for (let i = 0; i < n; i++) update(state, input.drain(), SIM_DT); },
    },
  });
}
