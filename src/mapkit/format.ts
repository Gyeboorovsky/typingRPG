// The COMPILED map format — what the game (and a future server) actually loads.
// Produced by the compiler (compile.ts) from painted PNGs, committed as JSON in
// src/game/maps-compiled/. The painted PNGs themselves are working files: the
// exporter can regenerate them from any MapDef, so they never need to be kept.
import { rleDecode, rleEncode } from './rle';
import type { GroupSpawnDef, MapDef, Prop, PropKind } from '../game/map';
import type { PortalDef, SpawnSpot, Vec2 } from '../game/types';

const PROP_KINDS: PropKind[] = ['tree', 'rock', 'shroom'];

export interface CompiledMap {
  v: 1;
  id: string;
  name: string;
  w: number;
  h: number;
  spawn: Vec2;
  terrain: string;           // RLE
  blocked: string;           // RLE
  regions?: string;          // RLE (omitted when the map has none)
  props: [number, number, number][]; // [kindIndex, x, y]
  spots: SpawnSpot[];
  groups: GroupSpawnDef[];
  portals: PortalDef[];
  sourceHash: string;        // hash of the source PNGs+config — the map's version
}

export function decodeCompiledMap(c: CompiledMap): MapDef {
  if (c.v !== 1) throw new Error(`compiled map ${c.id}: unknown version ${c.v}`);
  const size = c.w * c.h;
  const terrain = rleDecode(c.terrain, size);
  const waterTiles: Vec2[] = [];
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++)
      if (terrain[y * c.w + x] === 2 /* T_WATER */) waterTiles.push({ x, y });
  return {
    id: c.id, name: c.name, w: c.w, h: c.h,
    terrain,
    blocked: rleDecode(c.blocked, size),
    ...(c.regions !== undefined && { regions: rleDecode(c.regions, size) }),
    props: c.props.map(([k, x, y]): Prop => ({ x, y, kind: PROP_KINDS[k] })),
    waterTiles,
    spawn: { ...c.spawn },
    spots: c.spots,
    ...(c.groups.length > 0 && { groups: c.groups }),
    portals: c.portals,
  };
}

export function encodeCompiledMap(map: MapDef, sourceHash: string): CompiledMap {
  return {
    v: 1, id: map.id, name: map.name, w: map.w, h: map.h,
    spawn: { ...map.spawn },
    terrain: rleEncode(map.terrain),
    blocked: rleEncode(map.blocked),
    ...(map.regions && { regions: rleEncode(map.regions) }),
    props: map.props.map((p) => [PROP_KINDS.indexOf(p.kind), p.x, p.y]),
    spots: map.spots,
    groups: map.groups ?? [],
    portals: map.portals,
    sourceHash,
  };
}
