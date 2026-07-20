// The map EXPORTER — the inverse of compile.ts: any MapDef (code-built or
// compiled) becomes painted-map layers + a sidecar, ready to edit in MS Paint
// and recompile. This is why the PNGs never need to be kept: regenerate them
// from the compiled data whenever you want to edit.
//
// Known one-way niceties (deliberate): a prop pixel carries the prop ink, so the
// floor UNDER a prop re-compiles to that ink's default floor (rock→grass,
// shroom→forest). Exact round-trips hold for maps whose props stand on those
// defaults (the meadow does — the round-trip test proves it).
import type { MapDef } from '../game/map';
import { T_GRASS } from '../game/map';
import type { Layer, MapSidecar, PaintedLayers } from './compile';
import { markerRgbFor, PORTAL_INKS, REGION_INKS, SPAWN_INK, TERRAIN_INKS, MOB_INK_ORDER } from './inks';
import type { Rgb } from './inks';
import { GROUPS } from '../game/groups';

const terrainRgb = new Map<number, Rgb>();
for (const ink of TERRAIN_INKS) if (!ink.prop && !terrainRgb.has(ink.terrain)) terrainRgb.set(ink.terrain, ink.rgb);
const propRgb = new Map<string, Rgb>();
for (const ink of TERRAIN_INKS) if (ink.prop && !propRgb.has(ink.prop)) propRgb.set(ink.prop, ink.rgb);

function blank(w: number, h: number): Layer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // opaque black
  return { w, h, data };
}
function put(layer: Layer, x: number, y: number, [r, g, b]: Rgb): void {
  const o = (y * layer.w + x) * 4;
  layer.data[o] = r; layer.data[o + 1] = g; layer.data[o + 2] = b; layer.data[o + 3] = 255;
}

export interface ExportResult { layers: PaintedLayers; sidecar: MapSidecar }

export function exportMap(map: MapDef): ExportResult {
  const terrain = blank(map.w, map.h);
  const markers = blank(map.w, map.h);
  const propAt = new Map<number, Rgb>();
  for (const p of map.props) {
    const rgb = propRgb.get(p.kind);
    if (rgb) propAt.set(p.y * map.w + p.x, rgb);
  }
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      const rgb = propAt.get(i) ?? terrainRgb.get(map.terrain[i]) ?? terrainRgb.get(T_GRASS)!;
      put(terrain, x, y, rgb);
    }

  put(markers, Math.round(map.spawn.x), Math.round(map.spawn.y), SPAWN_INK);
  for (const portal of map.portals) {
    const index = PORTAL_INKS.findIndex((p) =>
      p.targetMap === portal.target.mapId
      && p.targetPos.x === portal.target.pos.x && p.targetPos.y === portal.target.pos.y);
    if (index < 0)
      throw new Error(`export ${map.id}: portal to ${portal.target.mapId}@${portal.target.pos.x},${portal.target.pos.y} has no PORTAL_INKS entry — add one`);
    put(markers, Math.round(portal.pos.x), Math.round(portal.pos.y), markerRgbFor({ kind: 'portal', index }));
  }

  const sidecar: MapSidecar = { id: map.id, name: map.name };
  if (map.spots.length) {
    sidecar.spots = {};
    for (const s of map.spots) {
      const index = MOB_INK_ORDER.indexOf(s.defId);
      if (index < 0) throw new Error(`export ${map.id}: mob ${s.defId} missing from MOB_INK_ORDER`);
      const x = Math.round(s.center.x), y = Math.round(s.center.y);
      put(markers, x, y, markerRgbFor({ kind: 'spot', index }));
      sidecar.spots[`${x},${y}`] = { count: s.count, radius: s.radius };
    }
  }
  if (map.groups?.length) {
    sidecar.groups = {};
    for (const g of map.groups) {
      for (const site of g.sites)
        put(markers, Math.round(site.x), Math.round(site.y), markerRgbFor({ kind: 'group', index: g.groupIdx }));
      sidecar.groups[String(g.groupIdx)] = { respawnSeconds: g.respawnSeconds, maxAlive: g.maxAlive };
      void GROUPS; // (composition lives in the global registry, not the sidecar)
    }
  }

  const layers: PaintedLayers = { terrain, markers };
  if (map.regions) {
    const regions = blank(map.w, map.h);
    const rgbByRegion = new Map<number, Rgb>(REGION_INKS.map((i) => [i.region, i.rgb]));
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const region = map.regions[y * map.w + x];
        if (region !== 0) {
          const rgb = rgbByRegion.get(region);
          if (rgb) put(regions, x, y, rgb);
        }
      }
    layers.regions = regions;
  }
  return { layers, sidecar };
}
