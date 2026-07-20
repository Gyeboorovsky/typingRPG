// Compile every painted map in paintings/ into src/game/maps-compiled/*.json.
// Run: npm run maps:compile   (vite-node — shares the game's TS modules)
// A map = <id>.terrain.png [+ <id>.markers.png] [+ <id>.regions.png] + <id>.config.json.
// Lint errors fail the run (exit 1) and write <id>.errors.png next to the sources
// with every offending pixel flashed magenta.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { compileMap } from '../src/mapkit/compile';
import type { Layer, MapSidecar } from '../src/mapkit/compile';

const PAINT_DIR = 'paintings';
const OUT_DIR = 'src/game/maps-compiled';
const CODE_MAP_IDS = ['meadow', 'elderwood', 'steppes', 'highlands', 'frontier'];

function readLayer(path: string): Layer {
  const png = PNG.sync.read(readFileSync(path));
  return { w: png.width, h: png.height, data: new Uint8Array(png.data) };
}

const ids = [...new Set(
  readdirSync(PAINT_DIR)
    .filter((f) => f.endsWith('.terrain.png'))
    .map((f) => f.replace('.terrain.png', '')),
)];
if (ids.length === 0) {
  console.log(`no *.terrain.png in ${PAINT_DIR}/ — nothing to compile`);
  process.exit(0);
}
const knownIds = [...CODE_MAP_IDS, ...ids];

let failed = false;
for (const id of ids) {
  // Code-built maps export to paintings/ for VIEWING/EDITING — compiling them back
  // would shadow the generator with a frozen snapshot (compiled JSON wins in the
  // registry). To fork one, change `id` in its config.json (e.g. "meadow2"); to
  // truly replace a code map with its painted version, drop it from CODE_MAP_IDS.
  if (CODE_MAP_IDS.includes(id)) {
    console.log(`↷ ${id}: code-built map — skipped (edit its id in ${id}.config.json to fork it)`);
    continue;
  }
  const sidecar = JSON.parse(readFileSync(join(PAINT_DIR, `${id}.config.json`), 'utf8')) as MapSidecar;
  const layers = { terrain: readLayer(join(PAINT_DIR, `${id}.terrain.png`)) } as Parameters<typeof compileMap>[0];
  for (const kind of ['markers', 'regions'] as const) {
    try { layers[kind] = readLayer(join(PAINT_DIR, `${id}.${kind}.png`)); } catch { /* optional layer */ }
  }
  const result = compileMap(layers, sidecar, knownIds);
  for (const issue of result.issues) {
    const at = issue.x !== undefined ? ` @ (${issue.x},${issue.y})` : '';
    console.log(`${issue.level === 'error' ? '✗' : '⚠'} ${id}: ${issue.message}${at}`);
  }
  if (!result.ok) {
    failed = true;
    // errors overlay: the terrain image with offending pixels flashed magenta
    const overlay = new PNG({ width: layers.terrain.w, height: layers.terrain.h });
    overlay.data.set(layers.terrain.data);
    for (const p of result.errorPixels) {
      const o = (p.y * layers.terrain.w + p.x) * 4;
      overlay.data[o] = 255; overlay.data[o + 1] = 0; overlay.data[o + 2] = 255; overlay.data[o + 3] = 255;
    }
    writeFileSync(join(PAINT_DIR, `${id}.errors.png`), PNG.sync.write(overlay));
    console.log(`✗ ${id}: NOT compiled — see ${PAINT_DIR}/${id}.errors.png`);
    continue;
  }
  const out = join(OUT_DIR, `${id}.json`);
  writeFileSync(out, JSON.stringify(result.compiled));
  console.log(`✓ ${id} → ${out} (${result.compiled!.w}x${result.compiled!.h}, hash ${result.compiled!.sourceHash})`);
}
process.exit(failed ? 1 : 0);
