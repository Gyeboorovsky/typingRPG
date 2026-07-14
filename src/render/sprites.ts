// All world art is drawn here as flat vector shapes. Every function takes the
// entity's tile-center screen position (sx, sy) and paints relative to it.
import { TILE_H, TILE_W } from '../game/constants';
import type { Dir } from '../game/types';
import { PAL } from './palette';

const HW = TILE_W / 2, HH = TILE_H / 2; // 32, 16

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, w = HW, h = HH): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.lineTo(sx + w, sy);
  ctx.lineTo(sx, sy + h);
  ctx.lineTo(sx - w, sy);
  ctx.closePath();
}

export function drawTile(
  ctx: CanvasRenderingContext2D, sx: number, sy: number,
  terrain: number, x: number, y: number, t: number,
): void {
  const alt = (x + y) % 2 === 0;
  let fill = alt ? PAL.grassA : PAL.grassB;
  if (terrain === 1) fill = alt ? PAL.sandA : PAL.sandB;
  if (terrain === 2) fill = PAL.waterA;
  diamond(ctx, sx, sy);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = PAL.tileEdge;
  ctx.stroke();
  if (terrain === 2) { // gentle shimmer
    const s = 0.45 + 0.15 * Math.sin(t * 2 + (x + y) * 0.9);
    diamond(ctx, sx, sy, HW * s, HH * s);
    ctx.fillStyle = PAL.waterB;
    ctx.fill();
  }
}

export function drawShadow(ctx: CanvasRenderingContext2D, sx: number, sy: number, rx: number): void {
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, rx * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = PAL.shadow;
  ctx.fill();
}

export function drawTree(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  drawShadow(ctx, sx, sy + 2, 13);
  ctx.fillStyle = PAL.treeTrunk;
  ctx.fillRect(sx - 3, sy - 16, 6, 17);
  ctx.fillStyle = PAL.treeLeafA;
  ctx.beginPath(); // lower canopy
  ctx.moveTo(sx, sy - 52);
  ctx.lineTo(sx + 17, sy - 18);
  ctx.lineTo(sx - 17, sy - 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.treeLeafB;
  ctx.beginPath(); // upper canopy
  ctx.moveTo(sx, sy - 62);
  ctx.lineTo(sx + 12, sy - 36);
  ctx.lineTo(sx - 12, sy - 36);
  ctx.closePath();
  ctx.fill();
}

export function drawRock(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  drawShadow(ctx, sx, sy + 2, 13);
  ctx.fillStyle = PAL.rockA;
  ctx.beginPath();
  ctx.moveTo(sx - 13, sy + 4);
  ctx.lineTo(sx - 9, sy - 12);
  ctx.lineTo(sx + 2, sy - 17);
  ctx.lineTo(sx + 13, sy - 6);
  ctx.lineTo(sx + 11, sy + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.rockB; // shaded facet
  ctx.beginPath();
  ctx.moveTo(sx + 2, sy - 17);
  ctx.lineTo(sx + 13, sy - 6);
  ctx.lineTo(sx + 11, sy + 5);
  ctx.lineTo(sx + 1, sy + 4);
  ctx.closePath();
  ctx.fill();
}

export function drawPlayer(
  ctx: CanvasRenderingContext2D, sx: number, sy: number,
  t: number, dir: Dir, walking: boolean, animT: number, dead: boolean,
): void {
  drawShadow(ctx, sx, sy + 1, 12);
  if (dead) {
    ctx.fillStyle = PAL.bodyDark;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const bob = walking ? Math.sin(animT * 14) * 1.6 : Math.sin(t * 2) * 1;
  const swing = walking ? Math.sin(animT * 14) * 4 : 0;
  const y = sy + bob;
  // legs
  ctx.fillStyle = PAL.legs;
  ctx.fillRect(sx - 6 + swing * 0.5, y - 11, 5, 11);
  ctx.fillRect(sx + 1 - swing * 0.5, y - 11, 5, 11);
  // torso (tabard)
  ctx.fillStyle = PAL.body;
  ctx.beginPath();
  ctx.roundRect(sx - 9, y - 27, 18, 18, 4);
  ctx.fill();
  ctx.fillStyle = PAL.bodyDark; // belt
  ctx.fillRect(sx - 9, y - 13, 18, 3);
  // head
  ctx.fillStyle = PAL.skin;
  ctx.beginPath();
  ctx.arc(sx, y - 33, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.hair;
  ctx.beginPath();
  ctx.arc(sx, y - 35, 6.2, Math.PI, Math.PI * 2);
  ctx.fill();
  // sword, held on the facing side (up/right → right hand)
  const side = dir === 0 || dir === 1 ? 1 : -1;
  const hx = sx + side * 11, hy = y - 14;
  ctx.strokeStyle = PAL.hilt;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - side * 3, hy + 3);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = PAL.sword;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + side * 9, hy - 16);
  ctx.stroke();
  ctx.strokeStyle = PAL.swordEdge;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + side * 9, hy - 16);
  ctx.stroke();
  ctx.lineWidth = 1;
}

export function drawSlime(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const squash = 1 + 0.08 * Math.sin(t * 4 + id);
  drawShadow(ctx, sx, sy + 1, 11);
  ctx.fillStyle = PAL.slime;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 7, 11 * squash, 9 / squash, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.slimeDark;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 3, 9 * squash, 4, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = PAL.eye;
  ctx.beginPath();
  ctx.arc(sx - 4, sy - 9, 1.6, 0, Math.PI * 2);
  ctx.arc(sx + 4, sy - 9, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBoar(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const bounce = Math.sin(t * 5 + id) * 0.8;
  const y = sy + bounce;
  drawShadow(ctx, sx, sy + 1, 13);
  ctx.fillStyle = PAL.boar; // body
  ctx.beginPath();
  ctx.ellipse(sx - 2, y - 9, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.boarDark; // bristle ridge
  ctx.beginPath();
  ctx.ellipse(sx - 4, y - 13, 8, 3.5, -0.2, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.boar; // head
  ctx.beginPath();
  ctx.arc(sx + 9, y - 8, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.snout;
  ctx.beginPath();
  ctx.ellipse(sx + 14, y - 6, 3.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.tusk;
  ctx.beginPath();
  ctx.moveTo(sx + 12, y - 4);
  ctx.lineTo(sx + 15, y - 1);
  ctx.lineTo(sx + 15.5, y - 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.eye;
  ctx.beginPath();
  ctx.arc(sx + 8, y - 10, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCultist(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const sway = Math.sin(t * 2 + id) * 1;
  drawShadow(ctx, sx, sy + 1, 11);
  ctx.fillStyle = PAL.cultist; // hooded robe
  ctx.beginPath();
  ctx.moveTo(sx + sway, sy - 34);
  ctx.lineTo(sx + 11, sy);
  ctx.lineTo(sx - 11, sy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.cultistDark; // hood shadow
  ctx.beginPath();
  ctx.ellipse(sx + sway * 0.7, sy - 24, 5.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const glow = 0.6 + 0.4 * Math.sin(t * 6 + id);
  ctx.fillStyle = PAL.cultistEye;
  ctx.globalAlpha = glow;
  ctx.beginPath();
  ctx.arc(sx - 2 + sway * 0.7, sy - 24, 1.4, 0, Math.PI * 2);
  ctx.arc(sx + 2 + sway * 0.7, sy - 24, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawBoss(
  ctx: CanvasRenderingContext2D, sx: number, sy: number,
  t: number, enraged: boolean, shielded: boolean,
): void {
  drawShadow(ctx, sx, sy + 2, 24);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  // aura
  ctx.strokeStyle = enraged ? PAL.enrage : PAL.boss;
  ctx.globalAlpha = 0.35 + 0.25 * pulse;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 30 + pulse * 3, 15 + pulse * 1.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // body: broad horned silhouette
  const y = sy + Math.sin(t * 1.5) * 1.5;
  ctx.fillStyle = PAL.boss;
  ctx.beginPath();
  ctx.moveTo(sx, y - 58);
  ctx.lineTo(sx + 20, y - 38);
  ctx.lineTo(sx + 16, y);
  ctx.lineTo(sx - 16, y);
  ctx.lineTo(sx - 20, y - 38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.bossDark; // chest shade
  ctx.beginPath();
  ctx.moveTo(sx, y - 44);
  ctx.lineTo(sx + 12, y - 30);
  ctx.lineTo(sx, y - 4);
  ctx.lineTo(sx - 12, y - 30);
  ctx.closePath();
  ctx.fill();
  // horns
  ctx.fillStyle = PAL.horn;
  ctx.beginPath();
  ctx.moveTo(sx - 12, y - 52);
  ctx.quadraticCurveTo(sx - 26, y - 62, sx - 20, y - 74);
  ctx.lineTo(sx - 14, y - 62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + 12, y - 52);
  ctx.quadraticCurveTo(sx + 26, y - 62, sx + 20, y - 74);
  ctx.lineTo(sx + 14, y - 62);
  ctx.closePath();
  ctx.fill();
  // eyes
  ctx.fillStyle = enraged ? PAL.enrage : PAL.cultistEye;
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.beginPath();
  ctx.arc(sx - 5, y - 48, 2.2, 0, Math.PI * 2);
  ctx.arc(sx + 5, y - 48, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (enraged) {
    ctx.fillStyle = PAL.enrage;
    ctx.beginPath();
    ctx.moveTo(sx, y - 58);
    ctx.lineTo(sx + 20, y - 38);
    ctx.lineTo(sx + 16, y);
    ctx.lineTo(sx - 16, y);
    ctx.lineTo(sx - 20, y - 38);
    ctx.closePath();
    ctx.fill();
  }
  if (shielded) {
    ctx.strokeStyle = PAL.shieldRing;
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(sx, y - 28, 30, 42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = 1;
}

const TIER_COLORS = ['', '#c8c8c8', '#6fe08a', '#3f7fe0', '#a03ae0'];

export function drawDrop(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, tier: number, id: number): void {
  const spin = Math.abs(Math.sin(t * 3 + id));
  const hover = Math.sin(t * 2.5 + id) * 2;
  drawShadow(ctx, sx, sy, 6);
  ctx.fillStyle = TIER_COLORS[tier] ?? TIER_COLORS[1];
  ctx.beginPath();
  ctx.moveTo(sx, sy - 18 + hover);
  ctx.lineTo(sx + 6 * spin, sy - 11 + hover);
  ctx.lineTo(sx, sy - 4 + hover);
  ctx.lineTo(sx - 6 * spin, sy - 11 + hover);
  ctx.closePath();
  ctx.fill();
}
