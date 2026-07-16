// The static ground pre-rendered once to an offscreen canvas. The map never
// changes at runtime (authored at module load in game/map.ts), so the per-frame
// ground pass — 48×48 tiles of path/fill/stroke — collapses to one drawImage
// blit; only the animated water shimmer stays vector per frame (renderer.ts).
// World colors still come exclusively from palette.ts via drawTileBase.
import { TILE_H, TILE_W } from '../game/constants';
import { MAP_H, MAP_W, T_WATER, terrainAt } from '../game/map';
import { drawTileBase } from './sprites';

const IX = TILE_W / 2, IY = TILE_H / 2; // 32, 16

export interface TerrainLayer {
  canvas: HTMLCanvasElement;
  builtForDpr: number;    // raw devicePixelRatio at build time (rebuild trigger)
  ox: number; oy: number; // world-origin offset inside the canvas, logical px
  w: number; h: number;   // logical size, px
  waterTiles: { x: number; y: number }[]; // tiles that get the per-frame shimmer
}

export function buildTerrain(): TerrainLayer {
  // Isometric extents: projX spans ±MAP_H·IX around 0 (plus a half-tile each
  // side), projY spans 0..(MAP_W+MAP_H-2)·IY (plus a half-tile each side).
  const w = (MAP_W + MAP_H) * IX;
  const h = (MAP_W + MAP_H) * IY;
  const ox = MAP_H * IX;   // tile (0, MAP_H-1)'s left vertex lands at canvas x=0
  const oy = TILE_H / 2;   // tile (0, 0)'s top vertex lands at canvas y=0
  const rawDpr = window.devicePixelRatio || 1;
  // Cap the backing-store scale so w·h·dpr² stays under mobile canvas limits
  // (~16.7M px on iOS Safari). Flat-color diamonds upscale imperceptibly.
  const dpr = Math.min(rawDpr, 2, Math.sqrt(16_000_000 / (w * h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(ox, oy);
  const waterTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const terrain = terrainAt(x, y);
      drawTileBase(ctx, (x - y) * IX, (x + y) * IY, terrain, x, y);
      if (terrain === T_WATER) waterTiles.push({ x, y });
    }
  return { canvas, builtForDpr: rawDpr, ox, oy, w, h, waterTiles };
}
