// Static ground rendering, chunked: the map is split into CHUNK_TILES-square
// chunks, each pre-rendered to its own offscreen canvas. Chunks build lazily —
// visible ones immediately, plus a one-ring PREFETCH margin built at most one
// chunk per frame, so canvas allocation spikes happen off-screen instead of the
// moment they scroll in (the "stutter on scroll" fix). LRU-capped, so the ground
// pass costs the same on a 48-tile map and a 3040-tile one.
// World colors still come exclusively from palette.ts via drawTileBase.
import { TILE_H, TILE_W } from '../game/constants';
import { terrainAt } from '../game/map';
import type { MapDef } from '../game/map';
import { drawTileBase } from './sprites';

const IX = TILE_W / 2, IY = TILE_H / 2; // 32, 16
const CHUNK_TILES = 16;      // chunk edge in tiles — small chunks = small alloc spikes
const MAX_CHUNKS = 36;       // LRU cap (≈9 visible + prefetch ring, with headroom)
const PREFETCH_BUDGET = 1;   // background chunk builds per frame (visible = unlimited)
// Backing-store scale: full quality on small maps, softer (imperceptibly, for flat
// diamonds) on big ones where chunk turnover is constant.
const dprCapFor = (map: MapDef): number => (map.w * map.h <= 64 * 64 ? 2 : 1.25);

interface Chunk {
  canvas: HTMLCanvasElement;
  w: number; h: number; // logical size
}

export class ChunkedTerrain {
  readonly builtForDpr: number;
  private readonly dpr: number;
  private chunks = new Map<number, Chunk>(); // insertion order = LRU order
  private readonly nx: number;
  private readonly ny: number;

  constructor(private map: MapDef) {
    this.builtForDpr = window.devicePixelRatio || 1;
    this.dpr = Math.min(this.builtForDpr, dprCapFor(map));
    this.nx = Math.ceil(map.w / CHUNK_TILES);
    this.ny = Math.ceil(map.h / CHUNK_TILES);
  }

  /** Blit every chunk overlapping the view; build missing visible chunks now and
   *  at most PREFETCH_BUDGET missing margin chunks (one ring beyond the view). */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number): void {
    // Invert the iso projection to a tile-index window: u = x−y ∈ screenX/IX,
    // v = x+y ∈ screenY/IY bound both tile axes, so the chunk loop is O(visible),
    // never O(all chunks) — essential on a 190×190-chunk map.
    const uMin = (camX - TILE_W) / IX, uMax = (camX + viewW + TILE_W) / IX;
    const vMin = (camY - TILE_H * 2) / IY, vMax = (camY + viewH + TILE_H * 2) / IY;
    const xMin = Math.floor((uMin + vMin) / 2), xMax = Math.ceil((uMax + vMax) / 2);
    const yMin = Math.floor((vMin - uMax) / 2), yMax = Math.ceil((vMax - uMin) / 2);
    const ci0 = Math.max(0, Math.floor(xMin / CHUNK_TILES) - 1);
    const ci1 = Math.min(this.nx - 1, Math.floor(xMax / CHUNK_TILES) + 1);
    const cj0 = Math.max(0, Math.floor(yMin / CHUNK_TILES) - 1);
    const cj1 = Math.min(this.ny - 1, Math.floor(yMax / CHUNK_TILES) + 1);

    let prefetchBudget = PREFETCH_BUDGET;
    for (let cj = cj0; cj <= cj1; cj++)
      for (let ci = ci0; ci <= ci1; ci++) {
        const b = this.bounds(ci, cj);
        const sx = b.sxMin - camX, sy = b.syMin - camY;
        const visible = !(sx > viewW || sy > viewH || sx + b.w < 0 || sy + b.h < 0);
        const key = cj * this.nx + ci;
        let chunk = this.chunks.get(key);
        if (chunk) { // LRU touch
          this.chunks.delete(key);
          this.chunks.set(key, chunk);
        } else if (visible || prefetchBudget-- > 0) {
          chunk = this.build(key, b); // visible builds are mandatory; margin is budgeted
        }
        if (chunk && visible)
          ctx.drawImage(chunk.canvas, 0, 0, chunk.canvas.width, chunk.canvas.height, sx, sy, chunk.w, chunk.h);
      }
  }

  /** Screen-space bounds of a chunk's tile diamonds (iso projection). */
  private bounds(ci: number, cj: number) {
    const x0 = ci * CHUNK_TILES, y0 = cj * CHUNK_TILES;
    const x1 = Math.min(x0 + CHUNK_TILES, this.map.w) - 1;
    const y1 = Math.min(y0 + CHUNK_TILES, this.map.h) - 1;
    const sxMin = (x0 - y1) * IX - IX;
    const sxMax = (x1 - y0) * IX + IX;
    const syMin = (x0 + y0) * IY - IY;
    const syMax = (x1 + y1) * IY + IY;
    return { x0, y0, x1, y1, sxMin, syMin, w: sxMax - sxMin, h: syMax - syMin };
  }

  private build(key: number, b: ReturnType<ChunkedTerrain['bounds']>): Chunk {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(b.w * this.dpr);
    canvas.height = Math.round(b.h * this.dpr);
    const cctx = canvas.getContext('2d')!;
    cctx.scale(this.dpr, this.dpr);
    cctx.translate(-b.sxMin, -b.syMin);
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++)
        drawTileBase(cctx, (x - y) * IX, (x + y) * IY, terrainAt(this.map, x, y), x, y);
    const chunk: Chunk = { canvas, w: b.w, h: b.h };
    if (this.chunks.size >= MAX_CHUNKS) { // evict the least-recently-used
      const oldest = this.chunks.keys().next().value as number;
      this.chunks.delete(oldest);
    }
    this.chunks.set(key, chunk);
    return chunk;
  }
}

// --- spatial index for per-frame world iteration -------------------------------
// Props and water tiles used to be flat arrays scanned every frame — O(map).
// Bucketed on a coarse tile grid, the renderer touches only visible buckets, so
// a 3040-tile map with tens of thousands of border trees costs the same per
// frame as the meadow.
const BUCKET_TILES = 32;

export class WorldIndex {
  readonly bw: number;
  readonly bh: number;
  readonly propBuckets: MapDef['props'][];
  readonly waterBuckets: { x: number; y: number }[][];

  constructor(map: MapDef) {
    this.bw = Math.ceil(map.w / BUCKET_TILES);
    this.bh = Math.ceil(map.h / BUCKET_TILES);
    this.propBuckets = Array.from({ length: this.bw * this.bh }, () => []);
    this.waterBuckets = Array.from({ length: this.bw * this.bh }, () => []);
    for (const pr of map.props)
      this.propBuckets[((pr.y / BUCKET_TILES) | 0) * this.bw + ((pr.x / BUCKET_TILES) | 0)].push(pr);
    for (const wt of map.waterTiles) // precomputed at map build — no grid scan here
      this.waterBuckets[((wt.y / BUCKET_TILES) | 0) * this.bw + ((wt.x / BUCKET_TILES) | 0)].push(wt);
  }

  /** Invoke `fn` for every bucket overlapping the given screen rect. */
  visit<T>(buckets: T[][], camX: number, camY: number, viewW: number, viewH: number, fn: (items: T[]) => void): void {
    const pad = TILE_W * 2;
    const uMin = (camX - pad) / IX, uMax = (camX + viewW + pad) / IX;
    const vMin = (camY - pad * 2) / IY, vMax = (camY + viewH + pad * 2) / IY;
    const xMin = Math.floor((uMin + vMin) / 2), xMax = Math.ceil((uMax + vMax) / 2);
    const yMin = Math.floor((vMin - uMax) / 2), yMax = Math.ceil((vMax - uMin) / 2);
    const bi0 = Math.max(0, Math.floor(xMin / BUCKET_TILES));
    const bi1 = Math.min(this.bw - 1, Math.floor(xMax / BUCKET_TILES));
    const bj0 = Math.max(0, Math.floor(yMin / BUCKET_TILES));
    const bj1 = Math.min(this.bh - 1, Math.floor(yMax / BUCKET_TILES));
    for (let bj = bj0; bj <= bj1; bj++)
      for (let bi = bi0; bi <= bi1; bi++)
        fn(buckets[bj * this.bw + bi]);
  }
}
