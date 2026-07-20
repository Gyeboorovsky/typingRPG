// The INK REGISTRY — the single global config mapping exact pixel colors to game
// elements for the painted-map pipeline. You paint in MS Paint (1 px = 1 tile,
// flat top-down grid; the game's renderer applies the isometric view), the
// compiler reads these exact RGB values. Colors are organized by CHANNEL RULES so
// categories can never collide and new entries slot in mechanically:
//
//   terrain layer   — hand-picked colors, R<240 (see TERRAIN_INKS)
//   markers layer   — black (0,0,0) = nothing; then by channel signature:
//     spawn point      (255,255,0)                exactly one per map
//     portal           (255, G, 200)  G = entry index in PORTAL_INKS
//     mob group        (0,   G, 255)  G = index into GROUPS (game/groups.ts)
//     legacy mob spot  (200, G, 50)   G = index into MOB_INK_ORDER (fixed-count
//                                     spots — how the code-built maps round-trip;
//                                     count/radius live in the sidecar config)
//     structure        (255, G, 0)    G = index into STRUCTURES (structures.ts)
//   regions layer   — black = none; safe zone (0,255,128); ids reserved upward.
//
// Files must be PNG (lossless). JPG re-encodes pixel values and breaks exact
// matching — the compiler rejects anything that decodes off-palette anyway.
import { T_ASH, T_FOREST, T_GRASS, T_MOSS, T_MOUNTAIN, T_SAND, T_SNOW, T_STONE, T_VOID, T_WATER } from '../game/map';
import type { PropKind } from '../game/map';
import type { Vec2 } from '../game/types';

export type Rgb = readonly [number, number, number];
export const packRgb = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

export interface TerrainInk {
  rgb: Rgb;
  label: string;
  terrain: number;
  blocked: boolean;
  prop?: PropKind; // convenience inks: floor + prop + blocked in one pixel (tree walls)
}

export const TERRAIN_INKS: TerrainInk[] = [
  { rgb: [0, 0, 0], label: 'void (out of map)', terrain: T_VOID, blocked: true },
  { rgb: [60, 180, 60], label: 'grass', terrain: T_GRASS, blocked: false },
  { rgb: [220, 200, 120], label: 'sand / road', terrain: T_SAND, blocked: false },
  { rgb: [30, 100, 255], label: 'water', terrain: T_WATER, blocked: true }, // per-entity swim later
  { rgb: [20, 110, 50], label: 'forest floor', terrain: T_FOREST, blocked: false },
  { rgb: [80, 160, 90], label: 'moss', terrain: T_MOSS, blocked: false },
  { rgb: [110, 105, 95], label: 'ash', terrain: T_ASH, blocked: false },
  { rgb: [230, 240, 250], label: 'snow', terrain: T_SNOW, blocked: false },
  { rgb: [130, 130, 140], label: 'stone floor', terrain: T_STONE, blocked: false },
  { rgb: [120, 90, 70], label: 'mountain', terrain: T_MOUNTAIN, blocked: true }, // per-entity fly later
  // Floor under a tree is grass (the tile is invisible under the canopy anyway) —
  // keeps the meadow's export→compile round-trip byte-exact.
  { rgb: [0, 70, 20], label: 'tree wall', terrain: T_GRASS, blocked: true, prop: 'tree' },
  { rgb: [90, 90, 100], label: 'rock', terrain: T_GRASS, blocked: true, prop: 'rock' },
  { rgb: [200, 120, 160], label: 'shroom (decor)', terrain: T_FOREST, blocked: false, prop: 'shroom' },
];

const terrainByColor = new Map<number, TerrainInk>(TERRAIN_INKS.map((i) => [packRgb(...i.rgb), i]));
export const terrainInkAt = (r: number, g: number, b: number): TerrainInk | undefined =>
  terrainByColor.get(packRgb(r, g, b));

// --- markers layer -------------------------------------------------------------

export const SPAWN_INK: Rgb = [255, 255, 0];

/** The global PORTAL config section: G channel of a (255,G,200) pixel selects an
 *  entry here — each entry is one concrete destination (map + landing + label).
 *  Two portals to the same map with different landings = two entries. */
export interface PortalInkDef { targetMap: string; targetPos: Vec2; name: string }
export const PORTAL_INKS: PortalInkDef[] = [
  { targetMap: 'meadow', targetPos: { x: 24, y: 41 }, name: 'Whispering Meadow' },     // G=0 (plaza arrival)
  { targetMap: 'elderwood', targetPos: { x: 76, y: 141 }, name: 'The Elderwood' },     // G=1 (entry glade)
  { targetMap: 'steppes', targetPos: { x: 380, y: 732 }, name: 'Sunfall Steppes' },    // G=2 (south arrival)
  { targetMap: 'highlands', targetPos: { x: 760, y: 1486 }, name: 'Ashen Highlands' }, // G=3 (south arrival)
  { targetMap: 'frontier', targetPos: { x: 1520, y: 3006 }, name: 'Frostreach Frontier' }, // G=4
  { targetMap: 'cellar', targetPos: { x: 22, y: 50 }, name: 'The Painted Cellar' },    // G=5
  // Return-leg landings of the existing world chain (so every current map exports):
  { targetMap: 'meadow', targetPos: { x: 26, y: 2 }, name: 'Whispering Meadow' },      // G=6 (behind the arena)
  { targetMap: 'elderwood', targetPos: { x: 76, y: 17 }, name: 'The Elderwood' },      // G=7 (Rootfather basin)
  { targetMap: 'steppes', targetPos: { x: 380, y: 24 }, name: 'Sunfall Steppes' },     // G=8 (north gate)
  { targetMap: 'highlands', targetPos: { x: 760, y: 28 }, name: 'Ashen Highlands' },   // G=9 (north gate)
];

/** Fixed defId order for legacy mob-spot inks (200,G,50). Index = G. NEVER
 *  reorder — only append — or painted maps silently change their mobs. */
export const MOB_INK_ORDER: string[] = [
  'dummy', 'slime', 'boar', 'archer', 'cultist', 'typhon',
  'wolf', 'sporeling', 'thornspitter', 'treant', 'stone_golem', 'rootfather',
];

export type MarkerInk =
  | { kind: 'spawn' }
  | { kind: 'portal'; index: number }
  | { kind: 'group'; index: number }
  | { kind: 'spot'; index: number }
  | { kind: 'structure'; index: number };

/** Decode a markers-layer pixel by its channel signature (null = background). */
export function markerInkAt(r: number, g: number, b: number): MarkerInk | null | 'unknown' {
  if (r === 0 && g === 0 && b === 0) return null;
  if (r === 255 && g === 255 && b === 0) return { kind: 'spawn' };
  if (r === 255 && b === 200) return { kind: 'portal', index: g };
  if (r === 0 && b === 255) return { kind: 'group', index: g };
  if (r === 200 && b === 50) return { kind: 'spot', index: g };
  if (r === 255 && b === 0) return { kind: 'structure', index: g };
  return 'unknown';
}

export const markerRgbFor = (m: MarkerInk): Rgb =>
  m.kind === 'spawn' ? SPAWN_INK
  : m.kind === 'portal' ? [255, m.index, 200]
  : m.kind === 'group' ? [0, m.index, 255]
  : m.kind === 'spot' ? [200, m.index, 50]
  : [255, m.index, 0];

// --- regions layer -------------------------------------------------------------

export const REGION_NONE = 0;
export const REGION_SAFE = 1; // no mob self-aggro while the player stands inside
export const REGION_INKS: { rgb: Rgb; region: number; label: string }[] = [
  { rgb: [0, 255, 128], region: REGION_SAFE, label: 'safe zone' },
];
const regionByColor = new Map<number, number>(REGION_INKS.map((i) => [packRgb(...i.rgb), i.region]));
export const regionInkAt = (r: number, g: number, b: number): number | undefined =>
  (r === 0 && g === 0 && b === 0) ? REGION_NONE : regionByColor.get(packRgb(r, g, b));

// --- linter helper -------------------------------------------------------------

/** Nearest registered terrain ink to an off-palette color — powers the linter's
 *  "you painted (30,100,254); nearest known ink is water (30,100,255)" hints. */
export function nearestTerrainInk(r: number, g: number, b: number): TerrainInk {
  let best = TERRAIN_INKS[0];
  let bestD = Infinity;
  for (const ink of TERRAIN_INKS) {
    const d = (ink.rgb[0] - r) ** 2 + (ink.rgb[1] - g) ** 2 + (ink.rgb[2] - b) ** 2;
    if (d < bestD) { bestD = d; best = ink; }
  }
  return best;
}
