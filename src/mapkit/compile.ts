// The painted-map COMPILER + LINTER. Pure buffer→data transforms — PNG file IO
// lives in scripts/ (pngjs) so this module runs in tests and any runtime.
// Input: RGBA layers painted in MS Paint (1 px = 1 tile, top-down grid — the
// game's renderer supplies the isometric view) + a per-map sidecar config.
// Output: a CompiledMap (or a precise list of lint errors with coordinates).
import { GROUPS } from '../game/groups';
import type { GroupSpawnDef, Prop } from '../game/map';
import type { PortalDef, SpawnSpot, Vec2 } from '../game/types';
import { encodeCompiledMap } from './format';
import type { CompiledMap } from './format';
import {
  markerInkAt, MOB_INK_ORDER, nearestTerrainInk, PORTAL_INKS, regionInkAt, terrainInkAt,
} from './inks';
import { STRUCTURES } from './structures';

export interface Layer { w: number; h: number; data: Uint8Array } // RGBA, 4 bytes/px
export interface PaintedLayers { terrain: Layer; markers?: Layer; regions?: Layer }

/** Per-map sidecar config (JSON next to the PNGs): everything a pixel can't say. */
export interface MapSidecar {
  id: string;
  name: string;
  /** Legacy fixed spots: params keyed by the painted pixel's "x,y". */
  spots?: Record<string, { count: number; radius: number }>;
  /** Group spawn params keyed by the group ink's G index (as a string). */
  groups?: Record<string, { respawnSeconds: number; maxAlive: number }>;
}

export interface LintIssue { level: 'error' | 'warning'; message: string; x?: number; y?: number }
export interface CompileResult {
  ok: boolean;
  issues: LintIssue[];
  compiled?: CompiledMap;
  errorPixels: Vec2[]; // for the errors-overlay image
}

const MAX_REPORTED = 40; // cap per issue family so a bad flood-fill doesn't spam megabytes

export function compileMap(layers: PaintedLayers, sidecar: MapSidecar, knownMapIds: string[]): CompileResult {
  const issues: LintIssue[] = [];
  const errorPixels: Vec2[] = [];
  const err = (message: string, x?: number, y?: number): void => {
    issues.push({ level: 'error', message, x, y });
    if (x !== undefined && y !== undefined && errorPixels.length < 5000) errorPixels.push({ x, y });
  };

  const { w, h } = layers.terrain;
  for (const [name, layer] of [['markers', layers.markers], ['regions', layers.regions]] as const)
    if (layer && (layer.w !== w || layer.h !== h))
      err(`${name} layer is ${layer.w}x${layer.h} but terrain is ${w}x${h}`);
  if (issues.length) return { ok: false, issues, errorPixels };

  const size = w * h;
  const terrain = new Uint8Array(size);
  const blocked = new Uint8Array(size);
  const props: Prop[] = [];
  const px = (layer: Layer, x: number, y: number): [number, number, number] => {
    const o = (y * layer.w + x) * 4;
    return [layer.data[o], layer.data[o + 1], layer.data[o + 2]];
  };

  // --- terrain layer ---
  let unknownTerrain = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(layers.terrain, x, y);
      const ink = terrainInkAt(r, g, b);
      if (!ink) {
        if (++unknownTerrain <= MAX_REPORTED) {
          const near = nearestTerrainInk(r, g, b);
          err(`terrain: unknown color (${r},${g},${b}) — nearest ink is "${near.label}" (${near.rgb.join(',')})`, x, y);
        } else if (x !== undefined) errorPixels.push({ x, y });
        continue;
      }
      terrain[y * w + x] = ink.terrain;
      if (ink.blocked) blocked[y * w + x] = 1;
      if (ink.prop) props.push({ x, y, kind: ink.prop });
    }
  if (unknownTerrain > MAX_REPORTED)
    err(`terrain: ${unknownTerrain - MAX_REPORTED} more unknown-color pixels not listed`);

  // --- markers layer ---
  let spawn: Vec2 | null = null;
  const portals: PortalDef[] = [];
  const groupSites = new Map<number, Vec2[]>();
  const spots: SpawnSpot[] = [];
  const structureCells = new Map<number, Vec2[]>();
  if (layers.markers) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = px(layers.markers, x, y);
        const m = markerInkAt(r, g, b);
        if (m === null) continue;
        if (m === 'unknown') { err(`markers: color (${r},${g},${b}) matches no marker channel rule`, x, y); continue; }
        if (m.kind === 'spawn') {
          if (spawn) err('markers: more than one spawn point', x, y);
          spawn = { x, y };
        } else if (m.kind === 'portal') {
          const def = PORTAL_INKS[m.index];
          if (!def) { err(`markers: portal ink G=${m.index} has no PORTAL_INKS entry`, x, y); continue; }
          if (!knownMapIds.includes(def.targetMap))
            err(`markers: portal to unknown map "${def.targetMap}"`, x, y);
          portals.push({ pos: { x, y }, target: { mapId: def.targetMap, pos: { ...def.targetPos } }, name: def.name });
        } else if (m.kind === 'group') {
          if (!GROUPS[m.index]) { err(`markers: group ink G=${m.index} has no GROUPS entry`, x, y); continue; }
          (groupSites.get(m.index) ?? groupSites.set(m.index, []).get(m.index)!).push({ x, y });
        } else if (m.kind === 'spot') {
          const defId = MOB_INK_ORDER[m.index];
          if (!defId) { err(`markers: spot ink G=${m.index} beyond MOB_INK_ORDER`, x, y); continue; }
          const meta = sidecar.spots?.[`${x},${y}`];
          if (!meta) { err(`markers: spot ${defId} at (${x},${y}) has no sidecar entry "${x},${y}"`, x, y); continue; }
          spots.push({ defId, center: { x, y }, count: meta.count, radius: meta.radius });
        } else {
          if (!STRUCTURES[m.index]) { err(`markers: structure ink G=${m.index} has no STRUCTURES entry`, x, y); continue; }
          (structureCells.get(m.index) ?? structureCells.set(m.index, []).get(m.index)!).push({ x, y });
        }
      }
  }
  if (!spawn) err('markers: no spawn point (255,255,0) painted');

  // structures: each contiguous painted region = one instance, stamped over its bbox
  for (const [index, cells] of structureCells) {
    const remaining = new Set(cells.map((c) => c.y * w + c.x));
    while (remaining.size) {
      const seed = remaining.values().next().value as number;
      const queue = [seed];
      remaining.delete(seed);
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      while (queue.length) {
        const i = queue.pop()!;
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const n of [i - 1, i + 1, i - w, i + w])
          if (remaining.delete(n)) queue.push(n);
      }
      STRUCTURES[index].stamp({ w, h, terrain, blocked, props }, x0, y0, x1, y1);
    }
  }

  // --- regions layer ---
  let regions: Uint8Array | undefined;
  if (layers.regions) {
    regions = new Uint8Array(size);
    let any = false;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = px(layers.regions, x, y);
        const region = regionInkAt(r, g, b);
        if (region === undefined) { err(`regions: unknown color (${r},${g},${b})`, x, y); continue; }
        regions[y * w + x] = region;
        if (region !== 0) any = true;
      }
    if (!any) regions = undefined;
  }

  // --- group params from the sidecar ---
  const groups: GroupSpawnDef[] = [];
  for (const [index, sites] of [...groupSites.entries()].sort((a, b) => a[0] - b[0])) {
    const params = sidecar.groups?.[String(index)];
    if (!params) { err(`group "${GROUPS[index].id}" (G=${index}) painted but has no sidecar params`); continue; }
    if (params.maxAlive > sites.length)
      issues.push({ level: 'warning', message: `group "${GROUPS[index].id}": maxAlive ${params.maxAlive} > ${sites.length} painted sites` });
    groups.push({ groupIdx: index, sites, respawnSeconds: params.respawnSeconds, maxAlive: params.maxAlive });
  }

  // --- reachability (only when structurally sound so far) ---
  if (spawn && !issues.some((i) => i.level === 'error')) {
    if (blocked[spawn.y * w + spawn.x]) err('spawn point stands on a blocked tile', spawn.x, spawn.y);
    else {
      const seen = flood(w, h, blocked, spawn);
      const check = (p: Vec2, what: string): void => {
        if (!seen[p.y * w + p.x]) err(`${what} unreachable from spawn`, p.x, p.y);
      };
      for (const p of portals) check(p.pos, `portal "${p.name}"`);
      for (const s of spots) check(s.center, `spot ${s.defId}`);
      for (const g of groups) for (const site of g.sites) check(site, `group site (${GROUPS[g.groupIdx].id})`);
    }
  }

  if (issues.some((i) => i.level === 'error')) return { ok: false, issues, errorPixels };

  const map = {
    id: sidecar.id, name: sidecar.name, w, h,
    terrain, blocked, ...(regions && { regions }), props,
    waterTiles: [], // derived on decode; not needed for encoding
    spawn: spawn!, spots, ...(groups.length > 0 && { groups }), portals,
  };
  return { ok: true, issues, compiled: encodeCompiledMap(map, hashInputs(layers, sidecar)), errorPixels };
}

function flood(w: number, h: number, blocked: Uint8Array, start: Vec2): Uint8Array {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const s = start.y * w + start.x;
  seen[s] = 1;
  queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0 && !seen[i - 1] && !blocked[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
    if (x < w - 1 && !seen[i + 1] && !blocked[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
    if (y > 0 && !seen[i - w] && !blocked[i - w]) { seen[i - w] = 1; queue[tail++] = i - w; }
    if (y < h - 1 && !seen[i + w] && !blocked[i + w]) { seen[i + w] = 1; queue[tail++] = i + w; }
  }
  return seen;
}

/** FNV-1a over every input byte — the compiled map's version fingerprint. */
function hashInputs(layers: PaintedLayers, sidecar: MapSidecar): string {
  let hash = 0x811c9dc5;
  const mix = (byte: number): void => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const layer of [layers.terrain, layers.markers, layers.regions])
    if (layer) for (let i = 0; i < layer.data.length; i++) mix(layer.data[i]);
  for (const ch of JSON.stringify(sidecar)) mix(ch.charCodeAt(0));
  return hash.toString(16).padStart(8, '0');
}
