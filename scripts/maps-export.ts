// Export any registered map (code-built or compiled) to painted-map PNGs +
// sidecar in paintings/ — the editing loop: export → paint in MS Paint →
// npm run maps:compile.
// Run: npm run maps:export -- <mapId>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { MAPS } from '../src/game/map';
import { exportMap } from '../src/mapkit/export';
import type { Layer } from '../src/mapkit/compile';

const id = process.argv[2];
if (!id || !MAPS[id]) {
  console.error(`usage: npm run maps:export -- <mapId>\nknown: ${Object.keys(MAPS).join(', ')}`);
  process.exit(1);
}

const { layers, sidecar } = exportMap(MAPS[id]);
mkdirSync('paintings', { recursive: true });
const write = (suffix: string, layer: Layer): void => {
  const png = new PNG({ width: layer.w, height: layer.h });
  png.data.set(layer.data);
  const path = join('paintings', `${id}.${suffix}.png`);
  writeFileSync(path, PNG.sync.write(png));
  console.log(`✓ ${path}`);
};
write('terrain', layers.terrain);
if (layers.markers) write('markers', layers.markers);
if (layers.regions) write('regions', layers.regions);
writeFileSync(join('paintings', `${id}.config.json`), JSON.stringify(sidecar, null, 2));
console.log(`✓ paintings/${id}.config.json`);
