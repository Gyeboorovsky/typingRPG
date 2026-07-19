// Maps as data: every map is a MapDef built deterministically at module load.
// Terrain is deliberately walkable in the open and walled with trees/water/rocks —
// mob chasing is straight-line (no pathfinding), so layouts stay corridor-and-
// clearing shaped rather than true mazes.
import type { PortalDef, SpawnSpot, Vec2 } from './types';
import { rand } from './rng';
import type { RngCarrier } from './rng';

export const T_GRASS = 0, T_SAND = 1, T_WATER = 2, T_FOREST = 3, T_MOSS = 4;

export type PropKind = 'tree' | 'rock' | 'shroom';
export interface Prop { x: number; y: number; kind: PropKind }

export interface MapDef {
  id: string;
  name: string;   // shown in the teleport toast
  w: number;
  h: number;
  terrain: Uint8Array;
  blocked: Uint8Array;
  props: Prop[];  // visual objects; blocking is ALWAYS the `blocked` grid, not the prop
  spawn: Vec2;
  spots: SpawnSpot[];
  portals: PortalDef[];
}

/** Small builder DSL shared by the authored + generated maps. */
class MapBuilder {
  terrain: Uint8Array;
  blocked: Uint8Array;
  props: Prop[] = [];
  constructor(public w: number, public h: number, baseTerrain = T_GRASS) {
    this.terrain = new Uint8Array(w * h).fill(baseTerrain);
    this.blocked = new Uint8Array(w * h);
  }
  idx(x: number, y: number): number { return y * this.w + x; }
  in(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  tree(x: number, y: number): void { this.blocked[this.idx(x, y)] = 1; this.props.push({ x, y, kind: 'tree' }); }
  rock(x: number, y: number): void { this.blocked[this.idx(x, y)] = 1; this.props.push({ x, y, kind: 'rock' }); }
  shroom(x: number, y: number): void { this.props.push({ x, y, kind: 'shroom' }); } // decorative, NOT blocking
  water(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      this.terrain[this.idx(x, y)] = T_WATER; this.blocked[this.idx(x, y)] = 1;
    }
  }
  sand(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.terrain[this.idx(x, y)] = T_SAND;
  }
}

// --- Map 1: the meadow (the original 48x48 hunting map, feature-identical) ---

function buildMeadow(): MapDef {
  const b = new MapBuilder(48, 48, T_GRASS);
  // double tree border
  for (let x = 0; x < b.w; x++) { b.tree(x, 0); b.tree(x, 1); b.tree(x, b.h - 2); b.tree(x, b.h - 1); }
  for (let y = 2; y < b.h - 2; y++) { b.tree(0, y); b.tree(1, y); b.tree(b.w - 2, y); b.tree(b.w - 1, y); }
  // boss arena: rock ring y3..8, x20..28, entrance gap at (24,8); boss sits at (24,5)
  for (let x = 20; x <= 28; x++) b.rock(x, 3);
  for (let y = 4; y <= 7; y++) { b.rock(20, y); b.rock(28, y); }
  for (let x = 20; x <= 28; x++) if (x !== 24) b.rock(x, 8);
  b.sand(21, 4, 27, 7); // arena floor
  // lake, west side
  b.water(3, 27, 10, 36);
  // sand road from boss entrance down to spawn plaza, plus the plaza
  b.sand(24, 8, 24, 41);
  b.sand(21, 37, 27, 41);
  // scattered trees (kept clear of exp-spot areas and the road)
  const TREES: [number, number][] = [
    [8, 5], [14, 7], [33, 5], [40, 7], [5, 12], [17, 11], [31, 11], [42, 12],
    [7, 16], [30, 16], [43, 18], [18, 17], [5, 23], [20, 22], [28, 21], [43, 25],
    [14, 26], [31, 26], [12, 30], [36, 29], [19, 31], [27, 31], [40, 32],
    [13, 37], [35, 36], [8, 40], [17, 41], [31, 41], [40, 40], [28, 44], [20, 44], [12, 44], [37, 44],
  ];
  for (const [x, y] of TREES) b.tree(x, y);
  const ROCKS: [number, number][] = [
    [11, 9], [37, 10], [9, 25], [39, 21], [16, 22], [34, 33], [22, 35], [44, 36], [6, 44],
  ];
  for (const [x, y] of ROCKS) b.rock(x, y);
  return {
    id: 'meadow', name: 'Whispering Meadow', w: b.w, h: b.h,
    terrain: b.terrain, blocked: b.blocked, props: b.props,
    spawn: { x: 24, y: 39 },
    spots: [
      { defId: 'dummy', center: { x: 20, y: 37 }, count: 2, radius: 1.5 }, // training dummies by the spawn plaza
      { defId: 'slime', center: { x: 15, y: 33 }, count: 5, radius: 2.5 },
      { defId: 'slime', center: { x: 31, y: 33 }, count: 5, radius: 2.5 },
      { defId: 'slime', center: { x: 23, y: 27 }, count: 5, radius: 2.5 },
      { defId: 'boar', center: { x: 11, y: 20 }, count: 4, radius: 2.5 },
      { defId: 'boar', center: { x: 36, y: 21 }, count: 4, radius: 2.5 },
      { defId: 'archer', center: { x: 34, y: 15 }, count: 3, radius: 2.5 },
      { defId: 'cultist', center: { x: 24, y: 13 }, count: 4, radius: 2.5 },
      { defId: 'typhon', center: { x: 24, y: 5 }, count: 1, radius: 0.5 },
    ],
    // Tucked BEHIND the boss arena — Typhon's aggro radius covers the walk-up,
    // so reaching (and channeling!) it with the boss alive is a deliberate dare.
    portals: [
      { pos: { x: 24, y: 2 }, target: { mapId: 'elderwood', pos: { x: 76, y: 141 } }, name: 'Elderwood' },
    ],
  };
}

// --- Map 2: the Elderwood (152x152 ≈ 10x the meadow's area, generated) ---
// A dark forest of clearings joined by tree-walled corridors, split by a river
// with three bridges, a lake, and the Rootfather's basin at the far north.
// Fully deterministic: a local PRNG carrier with a fixed seed — same forest
// every load, and none of this touches game-state RNG.

interface Glade { x: number; y: number; r: number }

function buildElderwood(): MapDef {
  const W = 152, H = 152;
  const b = new MapBuilder(W, H, T_FOREST);
  const rc: RngCarrier = { rng: 0xE1DE4 }; // local, fixed seed — deterministic layout
  const open = new Uint8Array(W * H);      // 1 = carved, walkable forest floor

  const G: Record<string, Glade> = {
    entry: { x: 76, y: 140, r: 8 },
    westGrove: { x: 44, y: 124, r: 9 },
    eastGrove: { x: 108, y: 124, r: 9 },
    crossroads: { x: 76, y: 104, r: 7 },
    lakeShore: { x: 38, y: 92, r: 10 },
    ruins: { x: 114, y: 94, r: 10 },
    wolfDen: { x: 52, y: 68, r: 9 },
    hollow: { x: 100, y: 64, r: 9 },
    approach: { x: 76, y: 44, r: 7 },
    basin: { x: 76, y: 22, r: 11 },
  };

  const carve = (x: number, y: number, floor = T_FOREST): void => {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return; // keep a solid border
    open[b.idx(x, y)] = 1;
    b.terrain[b.idx(x, y)] = floor;
  };
  const carveCircle = (g: Glade, floor: number): void => {
    for (let y = Math.floor(g.y - g.r); y <= g.y + g.r; y++)
      for (let x = Math.floor(g.x - g.r); x <= g.x + g.r; x++)
        if ((x - g.x) ** 2 + (y - g.y) ** 2 <= g.r * g.r) carve(x, y, floor);
  };
  const carvePath = (a: Glade, b2: Glade, halfWidth = 1): void => {
    const steps = Math.ceil(Math.hypot(b2.x - a.x, b2.y - a.y)) * 2;
    for (let i = 0; i <= steps; i++) {
      // a gentle deterministic wobble keeps corridors organic, not ruler-straight
      const t = i / steps;
      const wob = Math.sin(t * Math.PI * 3 + a.x + b2.y) * 1.2;
      const cx = Math.round(a.x + (b2.x - a.x) * t + (Math.abs(b2.y - a.y) > Math.abs(b2.x - a.x) ? wob : 0));
      const cy = Math.round(a.y + (b2.y - a.y) * t + (Math.abs(b2.x - a.x) >= Math.abs(b2.y - a.y) ? wob : 0));
      for (let dy = -halfWidth; dy <= halfWidth; dy++)
        for (let dx = -halfWidth; dx <= halfWidth; dx++) carve(cx + dx, cy + dy);
    }
  };

  for (const g of Object.values(G)) carveCircle(g, T_MOSS);
  const links: [keyof typeof G, keyof typeof G][] = [
    ['entry', 'westGrove'], ['entry', 'eastGrove'], ['westGrove', 'crossroads'],
    ['eastGrove', 'crossroads'], ['crossroads', 'lakeShore'], ['crossroads', 'ruins'],
    ['crossroads', 'approach'], ['lakeShore', 'wolfDen'], ['ruins', 'hollow'],
    ['wolfDen', 'approach'], ['hollow', 'approach'], ['approach', 'basin'],
    ['westGrove', 'lakeShore'], ['eastGrove', 'ruins'],
  ];
  for (const [from, to] of links) carvePath(G[from], G[to]);

  // The river: a sinus band across the whole width (overrides carving)…
  const riverY = (x: number): number => Math.round(80 + 5 * Math.sin(x * 0.09));
  for (let x = 2; x < W - 2; x++) {
    const yc = riverY(x);
    for (let dy = -1; dy <= 1; dy++) {
      const y = yc + dy;
      b.terrain[b.idx(x, y)] = T_WATER;
      b.blocked[b.idx(x, y)] = 1;
      open[b.idx(x, y)] = 0;
    }
  }
  // …with three sand bridges where the main routes cross it.
  for (const bx of [44, 76, 107]) {
    for (let x = bx - 2; x <= bx + 2; x++) {
      const yc = riverY(x);
      for (let dy = -2; dy <= 2; dy++) {
        const y = yc + dy;
        b.terrain[b.idx(x, y)] = T_SAND;
        b.blocked[b.idx(x, y)] = 0;
        open[b.idx(x, y)] = 1;
      }
    }
  }

  // The lake, inside the lakeShore glade, with a sand rim.
  const lake = { x: 32, y: 88, rx: 6, ry: 4.5 };
  for (let y = Math.floor(lake.y - lake.ry - 1); y <= lake.y + lake.ry + 1; y++)
    for (let x = Math.floor(lake.x - lake.rx - 1); x <= lake.x + lake.rx + 1; x++) {
      const d = ((x - lake.x) / lake.rx) ** 2 + ((y - lake.y) / lake.ry) ** 2;
      if (d <= 1) { b.terrain[b.idx(x, y)] = T_WATER; b.blocked[b.idx(x, y)] = 1; open[b.idx(x, y)] = 0; }
      else if (d <= 1.6 && open[b.idx(x, y)]) b.terrain[b.idx(x, y)] = T_SAND;
    }

  // Sand road through the basin up to the Rootfather + a rock crown behind it.
  b.sand(75, 12, 77, 30);
  for (let x = 70; x <= 82; x += 2) b.rock(x, 12);
  b.rock(68, 14); b.rock(84, 14);

  // Everything never carved is forest wall: blocked, with a tree on every tile
  // (visual truth — players must read "trees = can't walk").
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = b.idx(x, y);
      if (open[i] || b.blocked[i]) continue;
      b.blocked[i] = 1;
      b.props.push({ x, y, kind: 'tree' });
    }

  // Sparse life inside the clearings: shrooms (decor) + the odd rock.
  for (const g of Object.values(G)) {
    const n = Math.round(g.r * 0.8);
    for (let k = 0; k < n; k++) {
      const x = Math.round(g.x + (rand(rc) * 2 - 1) * (g.r - 2));
      const y = Math.round(g.y + (rand(rc) * 2 - 1) * (g.r - 2));
      const i = b.idx(x, y);
      if (!open[i] || b.blocked[i]) continue;
      if (rand(rc) < 0.7) b.shroom(x, y);
      else { b.blocked[i] = 1; b.props.push({ x, y, kind: 'rock' }); }
    }
  }

  return {
    id: 'elderwood', name: 'The Elderwood', w: W, h: H,
    terrain: b.terrain, blocked: b.blocked, props: b.props,
    spawn: { x: 76, y: 141 },
    spots: [
      { defId: 'sporeling', center: { x: 44, y: 124 }, count: 5, radius: 2.5 },
      { defId: 'wolf', center: { x: 48, y: 120 }, count: 3, radius: 2.5 },
      { defId: 'wolf', center: { x: 108, y: 124 }, count: 4, radius: 2.5 },
      { defId: 'sporeling', center: { x: 104, y: 128 }, count: 4, radius: 2.5 },
      { defId: 'wolf', center: { x: 76, y: 104 }, count: 4, radius: 2.5 },
      { defId: 'thornspitter', center: { x: 42, y: 96 }, count: 3, radius: 2.5 },
      { defId: 'wolf', center: { x: 44, y: 88 }, count: 3, radius: 2 },
      { defId: 'thornspitter', center: { x: 114, y: 94 }, count: 4, radius: 2.5 },
      { defId: 'treant', center: { x: 118, y: 90 }, count: 2, radius: 2 },
      { defId: 'wolf', center: { x: 52, y: 68 }, count: 5, radius: 2.5 },
      { defId: 'wolf', center: { x: 48, y: 72 }, count: 4, radius: 2.5 },
      { defId: 'treant', center: { x: 100, y: 64 }, count: 3, radius: 2.5 },
      { defId: 'thornspitter', center: { x: 96, y: 60 }, count: 3, radius: 2.5 },
      { defId: 'wolf', center: { x: 76, y: 44 }, count: 3, radius: 2.5 },
      { defId: 'thornspitter', center: { x: 72, y: 48 }, count: 2, radius: 2 },
      { defId: 'rootfather', center: { x: 76, y: 20 }, count: 1, radius: 0.5 },
      { defId: 'treant', center: { x: 70, y: 24 }, count: 2, radius: 1.5 },
      { defId: 'treant', center: { x: 82, y: 24 }, count: 2, radius: 1.5 },
    ],
    portals: [
      // Arrival lands BESIDE the meadow portal (outside its trigger radius, still
      // behind the arena) so returning never instantly re-channels you back.
      { pos: { x: 76, y: 145 }, target: { mapId: 'meadow', pos: { x: 26, y: 2 } }, name: 'Whispering Meadow' },
    ],
  };
}

export const MAPS: Record<string, MapDef> = {
  meadow: buildMeadow(),
  elderwood: buildElderwood(),
};

/** The current map for a state-ish carrier. Unknown ids fall back to the meadow
 *  (also the safety net for tampered saves). */
export const mapOf = (s: { mapId: string }): MapDef => MAPS[s.mapId] ?? MAPS.meadow;

// --- queries (map-explicit — no module-level "current map" hidden state) ---
export const terrainAt = (map: MapDef, x: number, y: number): number => map.terrain[y * map.w + x];
export const isBlocked = (map: MapDef, x: number, y: number): boolean =>
  x < 0 || y < 0 || x >= map.w || y >= map.h || map.blocked[y * map.w + x] === 1;

/** Whether a circle of radius `r` centered at (x, y) overlaps a blocked tile. */
export function circleBlocked(map: MapDef, x: number, y: number, r: number): boolean {
  return isBlocked(map, Math.round(x - r), Math.round(y - r)) || isBlocked(map, Math.round(x + r), Math.round(y - r))
      || isBlocked(map, Math.round(x - r), Math.round(y + r)) || isBlocked(map, Math.round(x + r), Math.round(y + r));
}

/** Random free tile within `radius` of `center` (falls back to center). */
export function findFreeNear(s: RngCarrier, map: MapDef, center: Vec2, radius: number): Vec2 {
  for (let i = 0; i < 20; i++) {
    const x = Math.round(center.x + (rand(s) * 2 - 1) * radius);
    const y = Math.round(center.y + (rand(s) * 2 - 1) * radius);
    if (!isBlocked(map, x, y)) return { x, y };
  }
  return { ...center };
}
