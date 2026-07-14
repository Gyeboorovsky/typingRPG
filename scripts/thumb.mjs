// One-off generator: hub thumbnail (1200x900) + app icon source (1024x1024).
// Run: node scripts/thumb.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';

// Shared vector pieces, matching the in-game palette (src/render/palette.ts)
const iso = (cx, cy, w, h, fill) =>
  `<path d="M${cx} ${cy - h} L${cx + w} ${cy} L${cx} ${cy + h} L${cx - w} ${cy} Z" fill="${fill}"/>`;

function ground(cx, cy, tw, th, cols) {
  let s = '';
  for (let y = -3; y <= 3; y++) {
    for (let x = -5; x <= 5; x++) {
      const sx = cx + (x - y) * tw;
      const sy = cy + (x + y) * th;
      s += iso(sx, sy, tw, th, cols[(x + y + 100) % 2]);
    }
  }
  return s;
}

const warrior = (x, y, k) => `
  <g transform="translate(${x} ${y}) scale(${k})">
    <ellipse cx="0" cy="4" rx="30" ry="12" fill="rgba(0,0,0,0.35)"/>
    <rect x="-14" y="-30" width="11" height="28" rx="4" fill="#3f3a5a"/>
    <rect x="3" y="-30" width="11" height="28" rx="4" fill="#3f3a5a"/>
    <rect x="-22" y="-74" width="44" height="48" rx="10" fill="#8c2f2f"/>
    <rect x="-22" y="-36" width="44" height="8" fill="#6d2424"/>
    <circle cx="0" cy="-90" r="17" fill="#e8b98a"/>
    <path d="M-17 -92 A17 17 0 0 1 17 -92 L14 -100 L-14 -100 Z" fill="#4a3220"/>
    <g transform="rotate(-38 30 -40)">
      <rect x="26" y="-108" width="9" height="66" rx="4" fill="#cfd6e4"/>
      <rect x="29" y="-108" width="3" height="66" fill="#f2f6fc"/>
      <rect x="18" y="-46" width="25" height="7" rx="3" fill="#7a5230"/>
    </g>
  </g>`;

const letters = (list) => list.map(([ch, x, y, s, r, o]) =>
  `<text x="${x}" y="${y}" font-family="Consolas, monospace" font-weight="bold" font-size="${s}"
     fill="#ffd75e" opacity="${o}" transform="rotate(${r} ${x} ${y})" text-anchor="middle">${ch}</text>`).join('');

const thumb = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#2b2337"/>
      <stop offset="100%" stop-color="#14101c"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#glow)"/>
  ${ground(600, 430, 120, 60, ['#5cb85c', '#55ac55'])}
  <ellipse cx="600" cy="430" rx="330" ry="165" fill="none" stroke="#ffd75e" stroke-width="6" opacity="0.8"/>
  <ellipse cx="600" cy="430" rx="255" ry="127" fill="none" stroke="#ffd75e" stroke-width="4" opacity="0.35"/>
  <!-- slime -->
  <g transform="translate(360 480)">
    <ellipse cx="0" cy="2" rx="34" ry="13" fill="rgba(0,0,0,0.3)"/>
    <ellipse cx="0" cy="-16" rx="34" ry="26" fill="#59c8a0"/>
    <circle cx="-11" cy="-22" r="4.5" fill="#1c2430"/><circle cx="11" cy="-22" r="4.5" fill="#1c2430"/>
  </g>
  <!-- boss silhouette -->
  <g transform="translate(870 360) scale(1.5)">
    <ellipse cx="0" cy="6" rx="46" ry="17" fill="rgba(0,0,0,0.35)"/>
    <path d="M0 -110 L38 -72 L30 0 L-30 0 L-38 -72 Z" fill="#8b2fc9"/>
    <path d="M0 -84 L22 -57 L0 -8 L-22 -57 Z" fill="#691fa0"/>
    <path d="M-22 -98 Q-50 -118 -38 -140 L-26 -117 Z" fill="#e8d9a0"/>
    <path d="M22 -98 Q50 -118 38 -140 L26 -117 Z" fill="#e8d9a0"/>
    <circle cx="-9" cy="-90" r="5" fill="#c94fe0"/><circle cx="9" cy="-90" r="5" fill="#c94fe0"/>
  </g>
  ${warrior(560, 470, 1.9)}
  ${letters([
    ['W', 380, 260, 64, -18, 0.9], ['O', 470, 200, 52, 10, 0.7], ['R', 705, 190, 70, -8, 0.9],
    ['D', 800, 250, 50, 16, 0.6], ['S', 300, 380, 46, -22, 0.5], ['K', 930, 520, 56, 14, 0.6],
    ['A', 260, 540, 50, 8, 0.55], ['!', 745, 300, 58, 20, 0.8],
  ])}
  <rect x="0" y="620" width="1200" height="280" fill="#14101c" opacity="0.82"/>
  <text x="600" y="740" font-family="Consolas, monospace" font-weight="bold" font-size="110"
    fill="#e8e2f4" text-anchor="middle" letter-spacing="6">TYPING RPG</text>
  <text x="600" y="812" font-family="system-ui, sans-serif" font-size="34"
    fill="#b7abd1" text-anchor="middle">type fast · strike true · never typo</text>
</svg>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="32" y="32" width="960" height="960" rx="200" fill="#2b2337"/>
  <rect x="32" y="32" width="960" height="960" rx="200" fill="none" stroke="#4a3a68" stroke-width="24"/>
  ${iso(512, 620, 330, 165, '#5cb85c')}
  <ellipse cx="512" cy="620" rx="240" ry="120" fill="none" stroke="#ffd75e" stroke-width="22" opacity="0.9"/>
  <g transform="rotate(-38 512 430)">
    <rect x="482" y="120" width="60" height="440" rx="26" fill="#cfd6e4"/>
    <rect x="502" y="120" width="20" height="440" fill="#f2f6fc"/>
    <rect x="422" y="540" width="180" height="46" rx="20" fill="#7a5230"/>
    <rect x="487" y="580" width="50" height="110" rx="22" fill="#4a3220"/>
  </g>
  <text x="512" y="905" font-family="Consolas, monospace" font-weight="bold" font-size="150"
    fill="#ffd75e" text-anchor="middle" letter-spacing="4">TYPE</text>
</svg>`;

function render(svg, path, width) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(path, png);
  console.log(`${path} (${(png.length / 1024).toFixed(0)} KB)`);
}

mkdirSync('io_typingRPG', { recursive: true });
render(thumb, 'io_typingRPG/grid-thumbnail.png', 1200);
render(icon, 'scripts/icon.png', 1024);
