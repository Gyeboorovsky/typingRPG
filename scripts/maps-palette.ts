// Generate paintings/ink-palette.png — the color cheat-sheet you open next to
// your map in MS Paint and eyedropper colors from (never type RGB by hand).
// Run: npm run maps:palette   (SVG → PNG via resvg, same as thumb.mjs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { GROUPS } from '../src/game/groups';
import { markerRgbFor, MOB_INK_ORDER, PORTAL_INKS, REGION_INKS, SPAWN_INK, TERRAIN_INKS } from '../src/mapkit/inks';
import { STRUCTURES } from '../src/mapkit/structures';

interface Row { rgb: readonly [number, number, number]; label: string }
const sections: { title: string; rows: Row[] }[] = [
  { title: 'TERRAIN (terrain layer)', rows: TERRAIN_INKS.map((i) => ({ rgb: i.rgb, label: `${i.label}${i.blocked ? ' [blocked]' : ''}` })) },
  {
    title: 'MARKERS (markers layer; black = nothing)',
    rows: [
      { rgb: SPAWN_INK, label: 'spawn point (exactly one)' },
      ...PORTAL_INKS.map((p, i) => ({ rgb: markerRgbFor({ kind: 'portal', index: i }), label: `portal → ${p.name}` })),
      ...GROUPS.map((g, i) => ({ rgb: markerRgbFor({ kind: 'group', index: i }), label: `group: ${g.id} (${g.members.map((m) => `${m.count}×${m.defId}`).join(' + ')})` })),
      ...STRUCTURES.map((s, i) => ({ rgb: markerRgbFor({ kind: 'structure', index: i }), label: `structure: ${s.label} (paint its footprint)` })),
      ...MOB_INK_ORDER.map((defId, i) => ({ rgb: markerRgbFor({ kind: 'spot', index: i }), label: `fixed spot: ${defId} (needs sidecar entry)` })),
    ],
  },
  { title: 'REGIONS (regions layer; black = none)', rows: REGION_INKS.map((i) => ({ rgb: i.rgb, label: i.label })) },
];

const ROW_H = 26, SWATCH = 40, PAD = 12, W = 560;
let y = PAD;
let body = '';
for (const section of sections) {
  y += 6;
  body += `<text x="${PAD}" y="${y + 14}" font-size="15" font-weight="bold" fill="#ddd">${section.title}</text>`;
  y += 24;
  for (const row of section.rows) {
    const [r, g, b] = row.rgb;
    body += `<rect x="${PAD}" y="${y}" width="${SWATCH}" height="${ROW_H - 6}" fill="rgb(${r},${g},${b})" stroke="#888"/>`;
    body += `<text x="${PAD + SWATCH + 10}" y="${y + 14}" font-size="13" fill="#eee">(${r},${g},${b})  ${row.label}</text>`;
    y += ROW_H;
  }
  y += 8;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y + PAD}">`
  + `<rect width="100%" height="100%" fill="#1c1c22"/>` + body + '</svg>';

mkdirSync('paintings', { recursive: true });
const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
writeFileSync('paintings/ink-palette.png', png);
console.log(`✓ paintings/ink-palette.png (${sections.reduce((n, s) => n + s.rows.length, 0)} inks)`);
