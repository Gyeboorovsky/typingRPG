// Painted-map pipeline tests: RLE, the compiler/linter on synthetic buffers, and
// the meadow export→compile round-trip (the proof the format covers the game).
import { describe, expect, it } from 'vitest';
import { MAPS } from '../game/map';
import { compileMap } from './compile';
import type { Layer, PaintedLayers } from './compile';
import { exportMap } from './export';
import { decodeCompiledMap } from './format';
import { markerRgbFor, SPAWN_INK, TERRAIN_INKS } from './inks';
import { rleDecode, rleEncode } from './rle';

describe('RLE', () => {
  it('round-trips arbitrary data', () => {
    const data = new Uint8Array(500);
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) % 5;
    expect(rleDecode(rleEncode(data), data.length)).toEqual(data);
  });
  it('compresses runs and rejects length mismatches', () => {
    const flat = new Uint8Array(10_000).fill(6);
    const enc = rleEncode(flat);
    expect(enc).toBe('6:10000');
    expect(() => rleDecode(enc, 9_999)).toThrow();
  });
});

// tiny painted-layer factory
const GRASS = TERRAIN_INKS.find((i) => i.label === 'grass')!.rgb;
function layerOf(w: number, h: number, fill?: readonly [number, number, number]): Layer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (fill) { data[o] = fill[0]; data[o + 1] = fill[1]; data[o + 2] = fill[2]; }
    data[o + 3] = 255;
  }
  return { w, h, data };
}
function put(layer: Layer, x: number, y: number, [r, g, b]: readonly [number, number, number]): void {
  const o = (y * layer.w + x) * 4;
  layer.data[o] = r; layer.data[o + 1] = g; layer.data[o + 2] = b;
}

describe('compileMap linter', () => {
  const base = (): PaintedLayers => {
    const terrain = layerOf(8, 8, GRASS);
    const markers = layerOf(8, 8);
    put(markers, 4, 4, SPAWN_INK);
    return { terrain, markers };
  };

  it('compiles a minimal valid map', () => {
    const result = compileMap(base(), { id: 't', name: 'T' }, []);
    expect(result.ok).toBe(true);
    const map = decodeCompiledMap(result.compiled!);
    expect(map.w).toBe(8);
    expect(map.spawn).toEqual({ x: 4, y: 4 });
  });

  it('reports unknown terrain colors with coordinates and the nearest ink', () => {
    const layers = base();
    put(layers.terrain, 2, 3, [30, 100, 254]); // one off from water
    const result = compileMap(layers, { id: 't', name: 'T' }, []);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.message.includes('unknown color'));
    expect(issue).toMatchObject({ x: 2, y: 3 });
    expect(issue!.message).toContain('water');
    expect(result.errorPixels).toContainEqual({ x: 2, y: 3 });
  });

  it('requires exactly one spawn and known portal targets', () => {
    const noSpawn = compileMap({ terrain: layerOf(4, 4, GRASS) }, { id: 't', name: 'T' }, []);
    expect(noSpawn.ok).toBe(false);
    expect(noSpawn.issues.some((i) => i.message.includes('no spawn'))).toBe(true);

    const layers = base();
    put(layers.markers!, 1, 1, markerRgbFor({ kind: 'portal', index: 0 })); // → meadow
    expect(compileMap(layers, { id: 't', name: 'T' }, ['meadow']).ok).toBe(true);
    expect(compileMap(layers, { id: 't', name: 'T' }, []).ok).toBe(false); // meadow unknown
  });

  it('rejects group pixels without sidecar params and unreachable sites', () => {
    const layers = base();
    put(layers.markers!, 6, 6, markerRgbFor({ kind: 'group', index: 1 }));
    expect(compileMap(layers, { id: 't', name: 'T' }, []).ok).toBe(false); // no params
    const withParams = { id: 't', name: 'T', groups: { '1': { respawnSeconds: 10, maxAlive: 1 } } };
    expect(compileMap(layers, withParams, []).ok).toBe(true);
    // wall the site off → reachability error
    const water = TERRAIN_INKS.find((i) => i.label === 'water')!.rgb;
    for (let x = 0; x < 8; x++) put(layers.terrain, x, 5, water);
    const walled = compileMap(layers, withParams, []);
    expect(walled.ok).toBe(false);
    expect(walled.issues.some((i) => i.message.includes('unreachable'))).toBe(true);
  });
});

describe('export → compile round-trip', () => {
  it('the meadow survives the full painted-map cycle byte-for-byte', () => {
    const original = MAPS.meadow;
    const { layers, sidecar } = exportMap(original);
    const result = compileMap(layers, sidecar, ['elderwood', 'cellar']);
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
    const back = decodeCompiledMap(result.compiled!);
    expect(back.terrain).toEqual(original.terrain);
    expect(back.blocked).toEqual(original.blocked);
    expect(back.spawn).toEqual(original.spawn);
    const key = (s: { defId: string; center: { x: number; y: number } }): string => `${s.defId}@${s.center.x},${s.center.y}`;
    expect(back.spots.map(key).sort()).toEqual(original.spots.map(key).sort());
    expect(back.spots.length).toBe(original.spots.length);
    const pkey = (p: { pos: { x: number; y: number }; target: { mapId: string } }): string => `${p.target.mapId}@${p.pos.x},${p.pos.y}`;
    expect(back.portals.map(pkey).sort()).toEqual(original.portals.map(pkey).sort());
    const propKey = (p: { kind: string; x: number; y: number }): string => `${p.kind}@${p.x},${p.y}`;
    expect(back.props.map(propKey).sort()).toEqual(original.props.map(propKey).sort());
  });
});
