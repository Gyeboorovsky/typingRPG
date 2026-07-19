// Static ground rendering, chunked: the map is split into CHUNK_TILES-square
// chunks, each pre-rendered to its own offscreen canvas the first time it
// scrolls into view (then LRU-cached). This is what lets a 152x152 map cost the
// same per frame as the old 48x48 single-canvas approach — the ground pass is
// a handful of drawImage blits regardless of map size.
// World colors still come exclusively from palette.ts via drawTileBase.
import { TILE_H, TILE_W } from '../game/constants';
import { T_WATER, terrainAt } from '../game/map';
import type { MapDef } from '../game/map';
import { drawTileBase } from './sprites';

const IX = TILE_W / 2, IY = TILE_H / 2; // 32, 16
const CHUNK_TILES = 24;   // chunk edge in tiles (48-map → 2x2 chunks, 152-map → 7x7)
const MAX_CHUNKS = 16;    // LRU cap — ~10 MB/chunk at dpr 2 keeps worst case bounded

interface Chunk {
  canvas: HTMLCanvasElement;
  sx: number; sy: number; // world-screen position of the canvas' top-left, logical px
  w: number; h: number;   // logical size
}

export class ChunkedTerrain {
  readonly waterTiles: { x: number; y: number }[] = [];
  readonly builtForDpr: number;
  private readonly dpr: number;
  private chunks = new Map<number, Chunk>(); // insertion order = LRU order
  private readonly nx: number;
  private readonly ny: number;

  constructor(private map: MapDef) {
    this.builtForDpr = window.devicePixelRatio || 1;
    this.dpr = Math.min(this.builtForDpr, 2); // flat diamonds upscale imperceptibly
    this.nx = Math.ceil(map.w / CHUNK_TILES);
    this.ny = Math.ceil(map.h / CHUNK_TILES);
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++)
        if (terrainAt(map, x, y) === T_WATER) this.waterTiles.push({ x, y });
  }

  /** Blit every chunk overlapping the view, building missing ones lazily. */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number): void {
    for (let cj = 0; cj < this.ny; cj++)
      for (let ci = 0; ci < this.nx; ci++) {
        const b = this.bounds(ci, cj);
        const sx = b.sxMin - camX, sy = b.syMin - camY;
        if (sx > viewW || sy > viewH || sx + b.w < 0 || sy + b.h < 0) continue;
        const chunk = this.ensure(ci, cj, b);
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

  private ensure(ci: number, cj: number, b: ReturnType<ChunkedTerrain['bounds']>): Chunk {
    const key = cj * this.nx + ci;
    const hit = this.chunks.get(key);
    if (hit) { // LRU touch: re-insert at the tail
      this.chunks.delete(key);
      this.chunks.set(key, hit);
      return hit;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(b.w * this.dpr);
    canvas.height = Math.round(b.h * this.dpr);
    const cctx = canvas.getContext('2d')!;
    cctx.scale(this.dpr, this.dpr);
    cctx.translate(-b.sxMin, -b.syMin);
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++)
        drawTileBase(cctx, (x - y) * IX, (x + y) * IY, terrainAt(this.map, x, y), x, y);
    const chunk: Chunk = { canvas, sx: b.sxMin, sy: b.syMin, w: b.w, h: b.h };
    if (this.chunks.size >= MAX_CHUNKS) { // evict the least-recently-used
      const oldest = this.chunks.keys().next().value as number;
      this.chunks.delete(oldest);
    }
    this.chunks.set(key, chunk);
    return chunk;
  }
}
