// Maps as data: every map is a MapDef built deterministically at module load.
// Terrain is deliberately walkable in the open and walled with trees/water/rocks —
// mob chasing is straight-line (no pathfinding), so layouts stay corridor-and-
// clearing shaped rather than true mazes.
import type { PortalDef, SpawnSpot, Vec2 } from './types';
import { decodeCompiledMap } from '../mapkit/format';
import { rand } from './rng';
import type { RngCarrier } from './rng';

export const T_GRASS = 0, T_SAND = 1, T_WATER = 2, T_FOREST = 3, T_MOSS = 4, T_ASH = 5, T_SNOW = 6,
  T_STONE = 7, T_MOUNTAIN = 8, T_VOID = 9;
// T_WATER/T_MOUNTAIN/T_VOID block everyone today; the painted-map model reserves
// them for per-entity passability (swimming mobs, flying mounts over mountains —
// see docs/open/map-pipeline.md). T_VOID renders black: "outside the map".

export type PropKind = 'tree' | 'rock' | 'shroom';
export interface Prop { x: number; y: number; kind: PropKind }

// A painted-map mob group: `sites` are the POSSIBLE spawn points (the painted
// pixels); at most `maxAlive` instances live at once; a new instance spawns at a
// random FREE site every `respawnSeconds`. Composition comes from GROUPS
// (game/groups.ts) via `groupIdx`.
export interface GroupSpawnDef { groupIdx: number; sites: Vec2[]; respawnSeconds: number; maxAlive: number }

export interface MapDef {
  id: string;
  name: string;   // shown in the teleport toast
  w: number;
  h: number;
  terrain: Uint8Array;
  blocked: Uint8Array;
  regions?: Uint8Array; // painted zones (REGION_SAFE = no mob self-aggro); absent = none
  props: Prop[];  // visual objects; blocking is ALWAYS the `blocked` grid, not the prop
  waterTiles: Vec2[]; // precomputed at build time — the renderer's shimmer list
                      // (scanning 9M tiles per WorldIndex build caused a frame spike)
  spawn: Vec2;
  spots: SpawnSpot[];
  groups?: GroupSpawnDef[]; // painted-map dynamic groups (code maps use `spots`)
  portals: PortalDef[];
}

/** Painted-region ids (mirrors mapkit/inks.ts REGION_*; duplicated here so the
 *  pure sim never imports tooling). 0 = no region. */
export const REGION_SAFE_ID = 1;

/** Region id at a tile (0 outside the grid or when the map has no regions). */
export const regionAt = (map: MapDef, x: number, y: number): number =>
  !map.regions || x < 0 || y < 0 || x >= map.w || y >= map.h ? 0 : map.regions[y * map.w + x];

/** One full-grid pass collecting water tiles — paid once at map BUILD time (maps
 *  build lazily off the render path), so the renderer never scans the grid. */
function collectWater(b: MapBuilder): Vec2[] {
  const out: Vec2[] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      if (b.terrain[y * b.w + x] === T_WATER) out.push({ x, y });
  return out;
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
    terrain: b.terrain, blocked: b.blocked, props: b.props, waterTiles: collectWater(b),
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
      // South of the plaza: the way down into the painted demo dungeon.
      { pos: { x: 24, y: 43 }, target: { mapId: 'cellar', pos: { x: 22, y: 50 } }, name: 'The Painted Cellar' },
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
    terrain: b.terrain, blocked: b.blocked, props: b.props, waterTiles: collectWater(b),
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
      // Onward to the steppes — tucked in the basin BEHIND the Rootfather, inside
      // his aggro radius: every onward portal in the chain is boss-guarded.
      // ((76,15): the deterministic glade scatter happens to drop a rock on (76,14).)
      { pos: { x: 76, y: 15 }, target: { mapId: 'steppes', pos: { x: 380, y: 732 } }, name: 'Sunfall Steppes' },
    ],
  };
}

// --- reusable structure library (map-independent, shared by every generator) ---

/** Clear a disc to walkable floor (portal pads, spawn glades). */
function clearDisc(b: MapBuilder, cx: number, cy: number, r: number, floor: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!b.in(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      b.terrain[b.idx(x, y)] = floor;
      b.blocked[b.idx(x, y)] = 0;
    }
}

/** A guaranteed corridor: sand floor, unblocked, gently wobbling — cuts passes
 *  through ridges, patches and even rivers (a causeway). The backbone that makes
 *  spawn → portals/arenas reachability structural, not lucky. */
function clearPath(b: MapBuilder, ax: number, ay: number, bx: number, by: number, halfWidth = 1): void {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wob = Math.sin(t * Math.PI * 6 + ax + by) * 1.5;
    const vertical = Math.abs(by - ay) > Math.abs(bx - ax);
    const cx = Math.round(ax + (bx - ax) * t + (vertical ? wob : 0));
    const cy = Math.round(ay + (by - ay) * t + (vertical ? 0 : wob));
    for (let dy = -halfWidth; dy <= halfWidth; dy++)
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!b.in(x, y) || x < 2 || y < 2 || x >= b.w - 2 || y >= b.h - 2) continue;
        b.terrain[b.idx(x, y)] = T_SAND;
        b.blocked[b.idx(x, y)] = 0;
      }
  }
}

/** A natural barrier: a prop line along a polyline with periodic passes —
 *  Metin2-style "walk around it (or find the gap)" geography. */
function ridgeChain(b: MapBuilder, points: Vec2[], kind: 'rock' | 'tree', gapEvery: number, gapWidth: number): void {
  let walked = 0;
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], c = points[s + 1];
    const len = Math.ceil(Math.hypot(c.x - a.x, c.y - a.y));
    for (let i = 0; i <= len; i++) {
      walked++;
      if (walked % gapEvery < gapWidth) continue; // the pass
      const x = Math.round(a.x + (c.x - a.x) * (i / len));
      const y = Math.round(a.y + (c.y - a.y) * (i / len));
      if (!b.in(x, y) || x < 3 || y < 3 || x >= b.w - 3 || y >= b.h - 3) continue;
      if (b.blocked[b.idx(x, y)]) continue;
      if (kind === 'rock') b.rock(x, y); else b.tree(x, y);
    }
  }
}

/** A solid blob of trees — an obstacle woodland, not a map-filling one. */
function forestPatch(b: MapBuilder, cx: number, cy: number, r: number, rc: RngCarrier): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!b.in(x, y) || x < 3 || y < 3 || x >= b.w - 3 || y >= b.h - 3) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > r || b.blocked[b.idx(x, y)]) continue;
      if (d > r - 1.2 && rand(rc) < 0.35) continue; // ragged edge
      b.tree(x, y);
    }
}

/** An oval lake with a sand rim. */
function lakeOval(b: MapBuilder, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (!b.in(x, y) || x < 3 || y < 3 || x >= b.w - 3 || y >= b.h - 3) continue;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) { b.terrain[b.idx(x, y)] = T_WATER; b.blocked[b.idx(x, y)] = 1; }
      else if (d <= 1.55 && !b.blocked[b.idx(x, y)]) b.terrain[b.idx(x, y)] = T_SAND;
    }
}

/** A horizontal sinus river band with evenly spaced sand bridges. */
function riverBand(b: MapBuilder, yBase: number, amp: number, freq: number, bridges: number): void {
  const yAt = (x: number): number => Math.round(yBase + amp * Math.sin(x * freq));
  for (let x = 2; x < b.w - 2; x++) {
    const yc = yAt(x);
    for (let dy = -1; dy <= 1; dy++) {
      const y = yc + dy;
      if (!b.in(x, y)) continue;
      b.terrain[b.idx(x, y)] = T_WATER;
      b.blocked[b.idx(x, y)] = 1;
    }
  }
  for (let k = 1; k <= bridges; k++) {
    const bx = Math.round((b.w * k) / (bridges + 1));
    for (let x = bx - 2; x <= bx + 2; x++) {
      const yc = yAt(x);
      for (let dy = -2; dy <= 2; dy++) {
        const y = yc + dy;
        if (!b.in(x, y)) continue;
        b.terrain[b.idx(x, y)] = T_SAND;
        b.blocked[b.idx(x, y)] = 0;
      }
    }
  }
}

/** A boss arena: a rock ring with a southern entrance gap and a sand floor. */
function arenaRing(b: MapBuilder, cx: number, cy: number, r: number): void {
  clearDisc(b, cx, cy, r + 1, T_SAND);
  const steps = Math.ceil(2 * Math.PI * r * 2);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.35) continue; // gap faces south (screen-down)
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (!b.in(x, y) || b.blocked[b.idx(x, y)]) continue;
    b.rock(x, y);
  }
}

/** Sparse decorative scatter on open base terrain (never on roads/accents). */
function scatterProps(b: MapBuilder, rc: RngCarrier, count: number, base: number, treeShare: number): void {
  for (let k = 0; k < count; k++) {
    const x = 4 + Math.floor(rand(rc) * (b.w - 8));
    const y = 4 + Math.floor(rand(rc) * (b.h - 8));
    const i = b.idx(x, y);
    if (b.blocked[i] || b.terrain[i] !== base) continue;
    const roll = rand(rc);
    if (roll < treeShare) b.tree(x, y);
    else if (roll < treeShare + 0.15) b.rock(x, y);
    else b.shroom(x, y);
  }
}

/** BFS reachability from a start tile over unblocked terrain (typed-array queue —
 *  runs on 9M-tile maps in a few hundred ms, once per generated map). */
function reachableMask(b: MapBuilder, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(b.w * b.h);
  const queue = new Int32Array(b.w * b.h);
  let head = 0, tail = 0;
  const start = b.idx(sx, sy);
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++];
    const x = i % b.w, y = (i / b.w) | 0;
    if (x > 0 && !seen[i - 1] && !b.blocked[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
    if (x < b.w - 1 && !seen[i + 1] && !b.blocked[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
    if (y > 0 && !seen[i - b.w] && !b.blocked[i - b.w]) { seen[i - b.w] = 1; queue[tail++] = i - b.w; }
    if (y < b.h - 1 && !seen[i + b.w] && !b.blocked[i + b.w]) { seen[i + b.w] = 1; queue[tail++] = i + b.w; }
  }
  return seen;
}

// --- the open-world generator: one parametric builder for every Metin2-style map ---
// Philosophy (user 2026-07-19): MOST of the map is walkable hunting ground packed
// with big spots; forests/ridges/rivers are only borders you route around.

interface SpotMix { defId: string; weight: number; count: [number, number]; radius: number }

interface OpenWorldCfg {
  id: string; name: string; size: number; seed: number;
  base: number;                       // ground terrain
  accent: number;                     // walkable accent patches (visual variety)
  ridges: number; forestPatches: number; lakes: number;
  rivers: { yFrac: number; amp: number; freq: number; bridges: number }[];
  spotSites: number; spotMix: SpotMix[];
  bosses: { defId: string; x: number; y: number }[]; // arena built around each
  exitPortal: { x: number; y: number; targetMap: string; targetPos: Vec2; name: string } | null;
  entryPortal: { x: number; y: number; targetMap: string; targetPos: Vec2; name: string };
  spawn: Vec2;
  scatter: number; scatterTreeShare: number;
}

function buildOpenWorld(cfg: OpenWorldCfg): MapDef {
  const S = cfg.size;
  const b = new MapBuilder(S, S, cfg.base);
  const rc: RngCarrier = { rng: cfg.seed };

  // border: a 3-deep wall of trees
  for (let d = 0; d < 3; d++)
    for (let x = 0; x < S; x++) { b.tree(x, d); b.tree(x, S - 1 - d); }
  for (let d = 0; d < 3; d++)
    for (let y = 3; y < S - 3; y++) { b.tree(d, y); b.tree(S - 1 - d, y); }

  // walkable accent patches (pure visual variety on the open ground)
  for (let k = 0; k < Math.round(S / 24); k++) {
    const cx = rand(rc) * S, cy = rand(rc) * S, r = 6 + rand(rc) * (S / 40);
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!b.in(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        if (!b.blocked[b.idx(x, y)]) b.terrain[b.idx(x, y)] = cfg.accent;
      }
  }

  for (const rv of cfg.rivers) riverBand(b, Math.round(S * rv.yFrac), rv.amp, rv.freq, rv.bridges);

  // ridge chains: 2-4 segment polylines, passes every ~26 tiles
  for (let k = 0; k < cfg.ridges; k++) {
    const points: Vec2[] = [];
    let px = 20 + rand(rc) * (S - 40), py = 20 + rand(rc) * (S - 40);
    points.push({ x: px, y: py });
    const segs = 2 + Math.floor(rand(rc) * 3);
    for (let s2 = 0; s2 < segs; s2++) {
      px = Math.min(S - 20, Math.max(20, px + (rand(rc) * 2 - 1) * (S / 6)));
      py = Math.min(S - 20, Math.max(20, py + (rand(rc) * 2 - 1) * (S / 6)));
      points.push({ x: px, y: py });
    }
    ridgeChain(b, points, rand(rc) < 0.65 ? 'rock' : 'tree', 26, 4);
  }

  for (let k = 0; k < cfg.forestPatches; k++)
    forestPatch(b, 20 + rand(rc) * (S - 40), 20 + rand(rc) * (S - 40), 5 + rand(rc) * (S / 60), rc);

  for (let k = 0; k < cfg.lakes; k++)
    lakeOval(b, 25 + rand(rc) * (S - 50), 25 + rand(rc) * (S - 50), 5 + rand(rc) * (S / 70), 4 + rand(rc) * (S / 90), );

  for (const boss of cfg.bosses) arenaRing(b, boss.x, boss.y, 7);

  // guaranteed corridors: spawn → portals and spawn → each arena entrance
  clearDisc(b, cfg.spawn.x, cfg.spawn.y, 4, cfg.base);
  clearDisc(b, cfg.entryPortal.x, cfg.entryPortal.y, 3, cfg.base);
  clearPath(b, cfg.spawn.x, cfg.spawn.y, cfg.entryPortal.x, cfg.entryPortal.y);
  if (cfg.exitPortal) {
    clearDisc(b, cfg.exitPortal.x, cfg.exitPortal.y, 3, cfg.base);
    clearPath(b, cfg.spawn.x, cfg.spawn.y, cfg.exitPortal.x, cfg.exitPortal.y);
  }
  for (const boss of cfg.bosses) clearPath(b, cfg.spawn.x, cfg.spawn.y, boss.x, boss.y + 9);

  // decorative scatter BEFORE the reachability pass — nothing may block a pass
  // after reachability has been computed.
  scatterProps(b, rc, cfg.scatter, cfg.base, cfg.scatterTreeShare);

  // reachability mask drives spot placement — a spot can never land in a pocket
  const seen = reachableMask(b, Math.round(cfg.spawn.x), Math.round(cfg.spawn.y));

  // big spots, Metin2-style: many sites, min-spaced, on reachable open ground
  const spots: SpawnSpot[] = [];
  const sites: Vec2[] = [];
  const minDist = S / Math.sqrt(cfg.spotSites) / 1.35;
  const totalWeight = cfg.spotMix.reduce((sum, m) => sum + m.weight, 0);
  for (let tries = 0; tries < cfg.spotSites * 60 && sites.length < cfg.spotSites; tries++) {
    const x = 12 + Math.floor(rand(rc) * (S - 24));
    const y = 12 + Math.floor(rand(rc) * (S - 24));
    if (!seen[y * S + x] || b.terrain[b.idx(x, y)] === T_SAND) continue;
    if (Math.hypot(x - cfg.spawn.x, y - cfg.spawn.y) < 25) continue; // keep the spawn calm
    if (sites.some((s2) => Math.hypot(s2.x - x, s2.y - y) < minDist)) continue;
    sites.push({ x, y });
    let roll = rand(rc) * totalWeight;
    let mix = cfg.spotMix[0];
    for (const m of cfg.spotMix) { roll -= m.weight; if (roll <= 0) { mix = m; break; } }
    const count = mix.count[0] + Math.floor(rand(rc) * (mix.count[1] - mix.count[0] + 1));
    spots.push({ defId: mix.defId, center: { x, y }, count, radius: mix.radius });
  }
  for (const boss of cfg.bosses)
    spots.push({ defId: boss.defId, center: { x: boss.x, y: boss.y }, count: 1, radius: 0.5 });

  const portals: PortalDef[] = [
    { pos: { x: cfg.entryPortal.x, y: cfg.entryPortal.y },
      target: { mapId: cfg.entryPortal.targetMap, pos: cfg.entryPortal.targetPos }, name: cfg.entryPortal.name },
  ];
  if (cfg.exitPortal)
    portals.push({ pos: { x: cfg.exitPortal.x, y: cfg.exitPortal.y },
      target: { mapId: cfg.exitPortal.targetMap, pos: cfg.exitPortal.targetPos }, name: cfg.exitPortal.name });

  return {
    id: cfg.id, name: cfg.name, w: S, h: S,
    terrain: b.terrain, blocked: b.blocked, props: b.props, waterTiles: collectWater(b),
    spawn: cfg.spawn, spots, portals,
  };
}

// --- the three open worlds (edge 5x / 10x / 20x the Elderwood's 152) ---

const buildSteppes = (): MapDef => buildOpenWorld({
  id: 'steppes', name: 'Sunfall Steppes', size: 760, seed: 0x57E99,
  base: T_GRASS, accent: T_SAND,
  ridges: 10, forestPatches: 12, lakes: 5,
  rivers: [{ yFrac: 0.45, amp: 12, freq: 0.02, bridges: 8 }],
  spotSites: 24,
  spotMix: [
    { defId: 'boar', weight: 3, count: [5, 9], radius: 3 },
    { defId: 'wolf', weight: 3, count: [5, 9], radius: 3 },
    { defId: 'archer', weight: 2, count: [4, 7], radius: 3 },
    { defId: 'slime', weight: 2, count: [6, 10], radius: 3.5 },
    { defId: 'cultist', weight: 1.5, count: [4, 7], radius: 3 },
    { defId: 'treant', weight: 0.7, count: [2, 4], radius: 2.5 },
  ],
  bosses: [],
  entryPortal: { x: 380, y: 736, targetMap: 'elderwood', targetPos: { x: 76, y: 17 }, name: 'The Elderwood' },
  exitPortal: { x: 380, y: 20, targetMap: 'highlands', targetPos: { x: 760, y: 1486 }, name: 'Ashen Highlands' },
  spawn: { x: 380, y: 730 },
  scatter: 1400, scatterTreeShare: 0.45,
});

const buildHighlands = (): MapDef => buildOpenWorld({
  id: 'highlands', name: 'Ashen Highlands', size: 1520, seed: 0xA5EE5,
  base: T_ASH, accent: T_MOSS,
  ridges: 24, forestPatches: 18, lakes: 7,
  rivers: [{ yFrac: 0.5, amp: 18, freq: 0.012, bridges: 12 }],
  spotSites: 34,
  spotMix: [
    { defId: 'cultist', weight: 3, count: [5, 8], radius: 3 },
    { defId: 'thornspitter', weight: 2.5, count: [4, 7], radius: 3 },
    { defId: 'stone_golem', weight: 2, count: [3, 5], radius: 2.5 },
    { defId: 'treant', weight: 2, count: [3, 6], radius: 3 },
    { defId: 'archer', weight: 2, count: [4, 8], radius: 3 },
    { defId: 'wolf', weight: 1.5, count: [5, 9], radius: 3 },
  ],
  bosses: [],
  entryPortal: { x: 760, y: 1496, targetMap: 'steppes', targetPos: { x: 380, y: 24 }, name: 'Sunfall Steppes' },
  exitPortal: { x: 760, y: 24, targetMap: 'frontier', targetPos: { x: 1520, y: 3006 }, name: 'Frostreach Frontier' },
  spawn: { x: 760, y: 1490 },
  scatter: 3200, scatterTreeShare: 0.4,
});

const buildFrontier = (): MapDef => buildOpenWorld({
  id: 'frontier', name: 'Frostreach Frontier', size: 3040, seed: 0xF057F,
  base: T_SNOW, accent: T_ASH,
  ridges: 40, forestPatches: 30, lakes: 12,
  rivers: [
    { yFrac: 0.33, amp: 24, freq: 0.008, bridges: 16 },
    { yFrac: 0.66, amp: 24, freq: 0.009, bridges: 16 },
  ],
  spotSites: 48,
  spotMix: [
    { defId: 'wolf', weight: 3.5, count: [6, 10], radius: 3.5 },
    { defId: 'stone_golem', weight: 2.5, count: [3, 6], radius: 3 },
    { defId: 'treant', weight: 2, count: [4, 7], radius: 3 },
    { defId: 'thornspitter', weight: 2, count: [4, 7], radius: 3 },
    { defId: 'cultist', weight: 2, count: [5, 8], radius: 3 },
    { defId: 'archer', weight: 1.5, count: [4, 8], radius: 3 },
  ],
  // Both bosses roam the frontier's far north — reusable mobs, reusable arenas.
  bosses: [
    { defId: 'typhon', x: 760, y: 620 },
    { defId: 'rootfather', x: 2280, y: 620 },
  ],
  entryPortal: { x: 1520, y: 3016, targetMap: 'highlands', targetPos: { x: 760, y: 28 }, name: 'Ashen Highlands' },
  exitPortal: null, // the end of the chain (for now)
  spawn: { x: 1520, y: 3010 },
  scatter: 6000, scatterTreeShare: 0.5,
});

// --- registry: maps build LAZILY on first access (a 3040² map costs a few
// hundred ms to generate — that price is paid on first teleport, not at boot).
const MAP_BUILDERS: Record<string, () => MapDef> = {
  meadow: buildMeadow,
  elderwood: buildElderwood,
  steppes: buildSteppes,
  highlands: buildHighlands,
  frontier: buildFrontier,
};

// Painted maps: every compiled JSON in maps-compiled/ self-registers (id from the
// file's contents). The game never reads PNGs — only this compiled output.
const compiled = import.meta.glob('./maps-compiled/*.json', { eager: true }) as
  Record<string, { default: import('../mapkit/format').CompiledMap }>;
for (const mod of Object.values(compiled)) {
  const c = mod.default;
  MAP_BUILDERS[c.id] = () => decodeCompiledMap(c);
}
const mapCache: Record<string, MapDef> = {};
export const MAPS: Record<string, MapDef> = {};
for (const id of Object.keys(MAP_BUILDERS))
  Object.defineProperty(MAPS, id, {
    enumerable: true,
    get: () => (mapCache[id] ??= MAP_BUILDERS[id]()),
  });

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
