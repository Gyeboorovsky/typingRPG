// Compile every painted map in paintings/<id>/ into src/game/maps-compiled/*.json.
// Run: npm run maps:compile   (vite-node — shares the game's TS modules)
// A map = one folder: paintings/<id>/{terrain.png, markers.png?, regions.png?,
// config.json}. Lint errors fail the run (exit 1) and write errors.png into the
// map's folder with every offending pixel flashed magenta.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

const ids = readdirSync(PAINT_DIR).filter((entry) => {
  try {
    return statSync(join(PAINT_DIR, entry)).isDirectory()
      && statSync(join(PAINT_DIR, entry, 'terrain.png')).isFile();
  } catch { return false; }
});
if (ids.length === 0) {
  console.log(`no ${PAINT_DIR}/<id>/terrain.png found — nothing to compile`);
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
    console.log(`↷ ${id}: code-built map — skipped (rename the folder + config id to fork it)`);
    continue;
  }
  const dir = join(PAINT_DIR, id);
  const sidecar = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as MapSidecar;
  if (sidecar.id !== id) {
    console.log(`✗ ${id}: config.json says id "${sidecar.id}" but the folder is "${id}" — make them match`);
    failed = true;
    continue;
  }
  const layers = { terrain: readLayer(join(dir, 'terrain.png')) } as Parameters<typeof compileMap>[0];
  for (const kind of ['markers', 'regions'] as const) {
    try { layers[kind] = readLayer(join(dir, `${kind}.png`)); } catch { /* optional layer */ }
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
    writeFileSync(join(PAINT_DIR, id, 'errors.png'), PNG.sync.write(overlay));
    console.log(`✗ ${id}: NOT compiled — see ${PAINT_DIR}/${id}/errors.png`);
    continue;
  }
  const out = join(OUT_DIR, `${id}.json`);
  writeFileSync(out, JSON.stringify(result.compiled));
  console.log(`✓ ${id} → ${out} (${result.compiled!.w}x${result.compiled!.h}, hash ${result.compiled!.sourceHash})`);
}
process.exit(failed ? 1 : 0);
