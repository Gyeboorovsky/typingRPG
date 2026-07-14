// The hunting map, 48x48, authored as deterministic features on a grass base.
// Deliberately open terrain (scattered obstacles, no mazes) so straight-line
// mob chasing works without pathfinding. Future maps: turn this into a MapDef.
import type { Vec2 } from './types';
import { rand } from './rng';
import type { RngCarrier } from './rng';

export const MAP_W = 48;
export const MAP_H = 48;
export const T_GRASS = 0, T_SAND = 1, T_WATER = 2;

export type PropKind = 'tree' | 'rock';
export interface Prop { x: number; y: number; kind: PropKind }

const terrain = new Uint8Array(MAP_W * MAP_H); // grass by default
const blocked = new Uint8Array(MAP_W * MAP_H);
export const PROPS: Prop[] = [];
export const SPAWN: Vec2 = { x: 24, y: 39 };

const idx = (x: number, y: number) => y * MAP_W + x;

function tree(x: number, y: number) { blocked[idx(x, y)] = 1; PROPS.push({ x, y, kind: 'tree' }); }
function rock(x: number, y: number) { blocked[idx(x, y)] = 1; PROPS.push({ x, y, kind: 'rock' }); }
function water(x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    terrain[idx(x, y)] = T_WATER; blocked[idx(x, y)] = 1;
  }
}
function sand(x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) terrain[idx(x, y)] = T_SAND;
}

// --- features ---
// double tree border
for (let x = 0; x < MAP_W; x++) { tree(x, 0); tree(x, 1); tree(x, MAP_H - 2); tree(x, MAP_H - 1); }
for (let y = 2; y < MAP_H - 2; y++) { tree(0, y); tree(1, y); tree(MAP_W - 2, y); tree(MAP_W - 1, y); }

// boss arena: rock ring y3..8, x20..28, entrance gap at (24,8); boss sits at (24,5)
for (let x = 20; x <= 28; x++) rock(x, 3);
for (let y = 4; y <= 7; y++) { rock(20, y); rock(28, y); }
for (let x = 20; x <= 28; x++) if (x !== 24) rock(x, 8);
sand(21, 4, 27, 7); // arena floor

// lake, west side
water(3, 27, 10, 36);

// sand road from boss entrance down to spawn plaza, plus the plaza
sand(24, 8, 24, 41);
sand(21, 37, 27, 41);

// scattered trees (kept clear of exp-spot areas and the road)
const TREES: [number, number][] = [
  [8, 5], [14, 7], [33, 5], [40, 7], [5, 12], [17, 11], [31, 11], [42, 12],
  [7, 16], [30, 16], [43, 18], [18, 17], [5, 23], [20, 22], [28, 21], [43, 25],
  [14, 26], [31, 26], [12, 30], [36, 29], [19, 31], [27, 31], [40, 32],
  [13, 37], [35, 36], [8, 40], [17, 41], [31, 41], [40, 40], [28, 44], [20, 44], [12, 44], [37, 44],
];
for (const [x, y] of TREES) tree(x, y);

// scattered rocks
const ROCKS: [number, number][] = [
  [11, 9], [37, 10], [9, 25], [39, 21], [16, 22], [34, 33], [22, 35], [44, 36], [6, 44],
];
for (const [x, y] of ROCKS) rock(x, y);

// --- queries ---
export const terrainAt = (x: number, y: number): number => terrain[idx(x, y)];
export const isBlocked = (x: number, y: number): boolean =>
  x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || blocked[idx(x, y)] === 1;

/** Random free tile within `radius` of `center` (falls back to center). */
export function findFreeNear(s: RngCarrier, center: Vec2, radius: number): Vec2 {
  for (let i = 0; i < 20; i++) {
    const x = Math.round(center.x + (rand(s) * 2 - 1) * radius);
    const y = Math.round(center.y + (rand(s) * 2 - 1) * radius);
    if (!isBlocked(x, y)) return { x, y };
  }
  return { ...center };
}
