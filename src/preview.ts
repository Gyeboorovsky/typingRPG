// The MAP PREVIEW tool (preview.html): renders any registered map with the REAL
// game drawing code (terrain chunks, props, mob sprites, portals) but no player
// and no simulation — so what you see here is exactly what the game shows.
// Mouse-drag pans, wheel zooms, labels mark portals, spawn, groups and spots
// (mobs are drawn on EVERY possible spawn site).
import { TILE_H, TILE_W } from './game/constants';
import { GROUPS } from './game/groups';
import { MAPS } from './game/map';
import type { MapDef } from './game/map';
import { MOBS } from './game/mobs';
import { PAL } from './render/palette';
import {
  drawBoar, drawBoss, drawCultist, drawDummy, drawGolem, drawPortal, drawRock, drawRootfather,
  drawShroom, drawSlime, drawSporeling, drawThornspitter, drawTreant, drawTree, drawWaterShimmer, drawWolf,
} from './render/sprites';
import { ChunkedTerrain, WorldIndex } from './render/terrain';

const IX = TILE_W / 2, IY = TILE_H / 2;
const projX = (wx: number, wy: number): number => (wx - wy) * IX;
const projY = (wx: number, wy: number): number => (wx + wy) * IY;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const select = document.getElementById('map-select') as HTMLSelectElement;
const labelsToggle = document.getElementById('labels-toggle') as HTMLInputElement;
const info = document.getElementById('info')!;

for (const id of Object.keys(MAPS)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = id;
  select.appendChild(option);
}

let map: MapDef;
let terrain: ChunkedTerrain;
let world: WorldIndex;
let cam = { x: 0, y: 0 };
let zoom = 1;

function loadMap(id: string): void {
  map = MAPS[id];
  terrain = new ChunkedTerrain(map);
  world = new WorldIndex(map);
  cam = {
    x: projX(map.spawn.x, map.spawn.y) - innerWidth / 2,
    y: projY(map.spawn.x, map.spawn.y) - innerHeight / 2,
  };
  zoom = 1;
  info.textContent = `${map.name} — ${map.w}×${map.h}`;
}
select.addEventListener('change', () => loadMap(select.value));
loadMap(select.value = 'meadow');

// pan + zoom
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.classList.add('dragging'); });
addEventListener('pointerup', () => { dragging = false; canvas.classList.remove('dragging'); });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.x -= (e.clientX - lastX) / zoom;
  cam.y -= (e.clientY - lastY) / zoom;
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const next = Math.min(2.5, Math.max(0.08, zoom * factor));
  // keep the point under the cursor fixed while zooming
  cam.x += e.clientX / zoom - e.clientX / next;
  cam.y += e.clientY / zoom - e.clientY / next;
  zoom = next;
}, { passive: false });

function label(sx: number, sy: number, text: string, color: string): void {
  ctx.font = 'bold 12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(10,10,14,0.78)';
  ctx.fillRect(sx - w / 2, sy - 26, w, 16);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, sx, sy - 14);
  ctx.textAlign = 'left';
}

function drawMobAt(defId: string, sx: number, sy: number, t: number, seed: number): void {
  const def = MOBS[defId];
  if (!def) return;
  if (defId === 'rootfather') drawRootfather(ctx, sx, sy, t, false, false);
  else if (def.boss) drawBoss(ctx, sx, sy, t, false, false);
  else if (defId === 'dummy') drawDummy(ctx, sx, sy, t, seed);
  else if (defId === 'slime') drawSlime(ctx, sx, sy, t, seed);
  else if (defId === 'boar') drawBoar(ctx, sx, sy, t, seed);
  else if (defId === 'wolf') drawWolf(ctx, sx, sy, t, seed);
  else if (defId === 'sporeling') drawSporeling(ctx, sx, sy, t, seed);
  else if (defId === 'thornspitter') drawThornspitter(ctx, sx, sy, t, seed);
  else if (defId === 'treant') drawTreant(ctx, sx, sy, t, seed);
  else if (defId === 'stone_golem') drawGolem(ctx, sx, sy, t, seed);
  else drawCultist(ctx, sx, sy, t, seed);
}

function frame(now: number): void {
  const t = now / 1000;
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  }
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  const viewW = innerWidth / zoom, viewH = innerHeight / zoom;
  ctx.fillStyle = PAL.voidTile;
  ctx.fillRect(0, 0, viewW, viewH);

  terrain.draw(ctx, cam.x, cam.y, viewW, viewH);
  world.visit(world.waterBuckets, cam.x, cam.y, viewW, viewH, (tiles) => {
    for (const wt of tiles) {
      const sx = projX(wt.x, wt.y) - cam.x, sy = projY(wt.x, wt.y) - cam.y;
      if (sx < -TILE_W || sx > viewW + TILE_W || sy < -TILE_H * 2 || sy > viewH + TILE_H * 2) continue;
      drawWaterShimmer(ctx, sx, sy, wt.x, wt.y, t);
    }
  });

  // depth-sorted entities: props + preview mobs + portals
  interface Ent { d: number; draw(): void }
  const ents: Ent[] = [];
  world.visit(world.propBuckets, cam.x, cam.y, viewW, viewH, (props) => {
    for (const pr of props) {
      const sx = projX(pr.x, pr.y) - cam.x, sy = projY(pr.x, pr.y) - cam.y;
      if (sx < -80 || sx > viewW + 80 || sy < -100 || sy > viewH + 100) continue;
      const fn = pr.kind === 'tree' ? drawTree : pr.kind === 'rock' ? drawRock : drawShroom;
      ents.push({ d: pr.x + pr.y, draw: () => fn(ctx, sx, sy) });
    }
  });
  const showLabels = labelsToggle.checked;
  const pushMob = (defId: string, x: number, y: number, seed: number, tag: string, color: string): void => {
    const sx = projX(x, y) - cam.x, sy = projY(x, y) - cam.y;
    if (sx < -100 || sx > viewW + 100 || sy < -140 || sy > viewH + 140) return;
    ents.push({ d: x + y, draw: () => {
      drawMobAt(defId, sx, sy, t, seed);
      if (showLabels) label(sx, sy + 26, tag, color);
    } });
  };
  for (const s of map.spots)
    pushMob(s.defId, s.center.x, s.center.y, s.center.x * 7 + s.center.y, `${s.defId} ×${s.count}`, '#ffd75e');
  for (const g of map.groups ?? []) {
    const def = GROUPS[g.groupIdx];
    g.sites.forEach((site, i) => {
      const lead = def?.members[0]?.defId ?? 'slime';
      pushMob(lead, site.x, site.y, i * 13 + site.x,
        `${def?.id ?? '?'} (max ${g.maxAlive}, ${g.respawnSeconds}s)`, '#9fe0ff');
    });
  }
  for (const p of map.portals) {
    const sx = projX(p.pos.x, p.pos.y) - cam.x, sy = projY(p.pos.x, p.pos.y) - cam.y;
    if (sx < -100 || sx > viewW + 100 || sy < -140 || sy > viewH + 140) continue;
    ents.push({ d: p.pos.x + p.pos.y, draw: () => {
      drawPortal(ctx, sx, sy, t);
      if (showLabels) label(sx, sy - 34, `→ ${p.name}`, PAL.portalCore);
    } });
  }
  {
    const sx = projX(map.spawn.x, map.spawn.y) - cam.x, sy = projY(map.spawn.x, map.spawn.y) - cam.y;
    ents.push({ d: map.spawn.x + map.spawn.y, draw: () => {
      ctx.strokeStyle = '#ffd75e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 18, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      if (showLabels) label(sx, sy - 8, 'SPAWN', '#ffd75e');
    } });
  }
  ents.sort((a, b) => a.d - b.d);
  for (const e of ents) e.draw();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) { // scripted-verification hook (rAF is dead on hidden tabs)
  Object.assign(window as object, { __preview: { frame: (t: number) => frame(t) } });
}
