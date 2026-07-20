// Reusable STRUCTURES for painted maps: paint a filled rectangle of the
// structure's ink (255, G, 0) and the compiler stamps the real thing over that
// footprint. Definitions are map-independent — the same bridge works in a cellar
// and on a frontier river. Index in this array = the ink's G channel; NEVER
// reorder, only append.
import { T_SAND } from '../game/map';
import type { Prop } from '../game/map';

export interface StampGrid {
  w: number; h: number;
  terrain: Uint8Array;
  blocked: Uint8Array;
  props: Prop[];
}

export interface StructureDef {
  id: string;
  label: string;
  /** Stamp the structure over the painted footprint [x0..x1]×[y0..y1] (inclusive). */
  stamp(g: StampGrid, x0: number, y0: number, x1: number, y1: number): void;
}

export const STRUCTURES: StructureDef[] = [
  { // G=0 — a sand causeway: crosses water/anything, always walkable
    id: 'stone_bridge', label: 'stone bridge',
    stamp(g, x0, y0, x1, y1) {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          g.terrain[y * g.w + x] = T_SAND;
          g.blocked[y * g.w + x] = 0;
        }
    },
  },
  { // G=1 — a rock arena ring with a southern entrance gap, sand floor
    id: 'rock_ring', label: 'rock arena ring',
    stamp(g, x0, y0, x1, y1) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rx = Math.max(2, (x1 - x0) / 2), ry = Math.max(2, (y1 - y0) / 2);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d <= 1) { g.terrain[y * g.w + x] = T_SAND; g.blocked[y * g.w + x] = 0; }
        }
      const steps = Math.ceil(Math.PI * (rx + ry) * 2);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        if (Math.abs(a - Math.PI / 2) < 0.4) continue; // gap faces south
        const x = Math.round(cx + Math.cos(a) * rx);
        const y = Math.round(cy + Math.sin(a) * ry);
        if (x < 0 || y < 0 || x >= g.w || y >= g.h || g.blocked[y * g.w + x]) continue;
        g.blocked[y * g.w + x] = 1;
        g.props.push({ x, y, kind: 'rock' });
      }
    },
  },
];
