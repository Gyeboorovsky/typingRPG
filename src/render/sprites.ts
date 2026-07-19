// All world art is drawn here as flat vector shapes. Every function takes the
// entity's tile-center screen position (sx, sy) and paints relative to it.
import { TILE_H, TILE_W } from '../game/constants';
import type { ClassId, Dir } from '../game/types';
import { PAL } from './palette';

const HW = TILE_W / 2, HH = TILE_H / 2; // 32, 16
type PlayerLook = typeof PAL.classLooks[ClassId];

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, w = HW, h = HH): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.lineTo(sx + w, sy);
  ctx.lineTo(sx, sy + h);
  ctx.lineTo(sx - w, sy);
  ctx.closePath();
}

/** Static part of a ground tile (fill + edge). Drawn once into the offscreen
 *  terrain layer, not per frame — the animated shimmer stays separate below. */
export function drawTileBase(
  ctx: CanvasRenderingContext2D, sx: number, sy: number,
  terrain: number, x: number, y: number,
): void {
  const alt = (x + y) % 2 === 0;
  let fill = alt ? PAL.grassA : PAL.grassB;
  if (terrain === 1) fill = alt ? PAL.sandA : PAL.sandB;
  else if (terrain === 2) fill = PAL.waterA;
  else if (terrain === 3) fill = alt ? PAL.forestA : PAL.forestB; // Elderwood floor
  else if (terrain === 4) fill = alt ? PAL.mossA : PAL.mossB;     // clearing moss
  diamond(ctx, sx, sy);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = PAL.tileEdge;
  ctx.stroke();
}

/** Gentle animated shimmer on a water tile, drawn per frame over the terrain layer. */
export function drawWaterShimmer(
  ctx: CanvasRenderingContext2D, sx: number, sy: number, x: number, y: number, t: number,
): void {
  const s = 0.45 + 0.15 * Math.sin(t * 2 + (x + y) * 0.9);
  diamond(ctx, sx, sy, HW * s, HH * s);
  ctx.fillStyle = PAL.waterB;
  ctx.fill();
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

/** Decorative forest mushroom (never blocks): squat stem + spotted cap. */
export function drawShroom(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  drawShadow(ctx, sx, sy + 1, 6);
  ctx.fillStyle = PAL.shroomStem;
  ctx.fillRect(sx - 2, sy - 7, 4, 7);
  ctx.fillStyle = PAL.shroomCap;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 8, 7, 4.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.shroomDot;
  ctx.beginPath();
  ctx.arc(sx - 3, sy - 9, 1.1, 0, Math.PI * 2);
  ctx.arc(sx + 2.5, sy - 10, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

/** A standing portal: two counter-rotating iso rings around a pulsing core.
 *  Pure vectors, palette-colored; `t` drives the swirl. */
export function drawPortal(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
  drawShadow(ctx, sx, sy + 2, 14);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  // ground ring
  ctx.strokeStyle = PAL.portal;
  ctx.globalAlpha = 0.5 + 0.3 * pulse;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 16, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  // the upright swirl: two arcs orbiting out of phase
  for (let k = 0; k < 2; k++) {
    const ph = t * (k === 0 ? 2.2 : -1.7) + k * Math.PI;
    ctx.strokeStyle = k === 0 ? PAL.portal : PAL.portalCore;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 22, 11 + 2 * Math.sin(ph), 20, Math.sin(ph) * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  // core glow
  ctx.fillStyle = PAL.portalCore;
  ctx.globalAlpha = 0.35 + 0.4 * pulse;
  ctx.beginPath();
  ctx.ellipse(sx, sy - 22, 6 + pulse * 2, 12 + pulse * 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
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
  t: number, dir: Dir, walking: boolean, animT: number, dead: boolean, classId: ClassId,
): void {
  const look = PAL.classLooks[classId];
  drawShadow(ctx, sx, sy + 1, 12);
  if (dead) {
    ctx.fillStyle = look.bodyDark;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 4, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const bob = walking ? Math.sin(animT * 14) * 1.6 : Math.sin(t * 2) * 1;
  const swing = walking ? Math.sin(animT * 14) * 4 : 0;
  const y = sy + bob;
  const side = dir === 0 || dir === 1 ? 1 : -1; // facing side → weapon hand

  // legs
  ctx.fillStyle = look.legs;
  ctx.fillRect(sx - 6 + swing * 0.5, y - 11, 5, 11);
  ctx.fillRect(sx + 1 - swing * 0.5, y - 11, 5, 11);

  drawTorso(ctx, sx, y, classId, look);
  drawHeadwear(ctx, sx, y, classId, look);
  drawWeapon(ctx, sx, y, side, classId, look, t);
}

function drawTorso(ctx: CanvasRenderingContext2D, sx: number, y: number, classId: ClassId, look: PlayerLook): void {
  ctx.fillStyle = look.body;
  if (classId === 'wizard' || classId === 'priest') { // flowing robe, wider at the hem
    ctx.beginPath();
    ctx.moveTo(sx - 6, y - 27);
    ctx.lineTo(sx + 6, y - 27);
    ctx.lineTo(sx + 10, y - 9);
    ctx.lineTo(sx - 10, y - 9);
    ctx.closePath();
    ctx.fill();
  } else if (classId === 'ninja') { // lean, cropped tunic
    ctx.beginPath();
    ctx.roundRect(sx - 7.5, y - 25, 15, 15, 3);
    ctx.fill();
  } else { // warrior tabard
    ctx.beginPath();
    ctx.roundRect(sx - 9, y - 27, 18, 18, 4);
    ctx.fill();
  }
  ctx.fillStyle = look.bodyDark; // belt
  ctx.fillRect(sx - (classId === 'ninja' ? 7.5 : 9), y - 13, classId === 'ninja' ? 15 : 18, 3);
}

function drawHeadwear(ctx: CanvasRenderingContext2D, sx: number, y: number, classId: ClassId, look: PlayerLook): void {
  ctx.fillStyle = PAL.skin;
  ctx.beginPath();
  ctx.arc(sx, y - 33, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  if (classId === 'ninja') { // hood + face mask, only eyes visible
    ctx.beginPath();
    ctx.arc(sx, y - 33.5, 6.8, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.fillRect(sx - 6, y - 33, 12, 4);
    ctx.fillStyle = PAL.eye;
    ctx.fillRect(sx - 4, y - 34, 8, 1.6);
  } else if (classId === 'wizard') { // pointed hat
    ctx.beginPath();
    ctx.arc(sx, y - 35, 6.2, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx - 6.5, y - 37);
    ctx.lineTo(sx + 6.5, y - 37);
    ctx.lineTo(sx, y - 54);
    ctx.closePath();
    ctx.fill();
  } else if (classId === 'priest') { // simple halo instead of hair
    ctx.beginPath();
    ctx.arc(sx, y - 35, 6.2, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = look.accentEdge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(sx, y - 42, 6, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else { // warrior hair
    ctx.beginPath();
    ctx.arc(sx, y - 35, 6.2, Math.PI, Math.PI * 2);
    ctx.fill();
  }
}

function drawWeapon(
  ctx: CanvasRenderingContext2D, sx: number, y: number, side: number,
  classId: ClassId, look: PlayerLook, t: number,
): void {
  const hx = sx + side * 11, hy = y - 14;
  if (classId === 'wizard' || classId === 'priest') { // staff with a glowing orb
    ctx.strokeStyle = PAL.hilt;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 8);
    ctx.lineTo(hx, hy - 20);
    ctx.stroke();
    const glow = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.arc(hx, hy - 22, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = glow;
    ctx.fillStyle = look.accentEdge;
    ctx.beginPath();
    ctx.arc(hx, hy - 22, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const reach = classId === 'ninja' ? 6 : 9; // short kunai vs longer sword
  ctx.strokeStyle = PAL.hilt;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - side * 3, hy + 3);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = look.accent;
  ctx.lineWidth = classId === 'ninja' ? 2.4 : 3.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + side * reach, hy - reach * 1.8);
  ctx.stroke();
  ctx.strokeStyle = look.accentEdge;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + side * reach, hy - reach * 1.8);
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

/** A wooden training dummy: a planted post, crossbar arms and a burlap sack body
 *  with a painted target X. Barely animated (a slow idle sway) — it's inert scenery
 *  you type at until pulled. */
export function drawDummy(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const sway = Math.sin(t * 1.3 + id) * 0.6;
  drawShadow(ctx, sx, sy + 1, 10);
  ctx.strokeStyle = PAL.dummyPost; // post
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + sway, sy - 30);
  ctx.stroke();
  ctx.lineWidth = 3; // crossbar arms
  ctx.beginPath();
  ctx.moveTo(sx - 10 + sway, sy - 21);
  ctx.lineTo(sx + 10 + sway, sy - 21);
  ctx.stroke();
  ctx.fillStyle = PAL.dummy; // burlap body
  ctx.beginPath();
  ctx.ellipse(sx + sway, sy - 16, 8, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.dummyDark; // belt band
  ctx.fillRect(sx - 8 + sway, sy - 15, 16, 3);
  ctx.fillStyle = PAL.dummy; // sack head
  ctx.beginPath();
  ctx.arc(sx + sway, sy - 30, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.dummyDark; // painted target X on the face
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx - 3 + sway, sy - 32); ctx.lineTo(sx + 3 + sway, sy - 28);
  ctx.moveTo(sx + 3 + sway, sy - 32); ctx.lineTo(sx - 3 + sway, sy - 28);
  ctx.stroke();
  ctx.lineWidth = 1;
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

/** Elderwood Wolf: low grey body, perked ears, amber eye, brush tail. */
export function drawWolf(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const lope = Math.sin(t * 7 + id) * 1;
  const y = sy + lope * 0.5;
  drawShadow(ctx, sx, sy + 1, 12);
  ctx.fillStyle = PAL.wolfDark; // brush tail
  ctx.beginPath();
  ctx.ellipse(sx - 12, y - 10, 5, 2.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.wolf; // body
  ctx.beginPath();
  ctx.ellipse(sx - 1, y - 9, 11, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.wolfDark; // back ridge
  ctx.beginPath();
  ctx.ellipse(sx - 2, y - 12, 8, 2.8, -0.15, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.wolf; // head + muzzle
  ctx.beginPath();
  ctx.arc(sx + 9, y - 11, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + 14, y - 9.5, 3.5, 2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.wolfDark; // ears
  ctx.beginPath();
  ctx.moveTo(sx + 6, y - 15); ctx.lineTo(sx + 8, y - 20); ctx.lineTo(sx + 10, y - 15);
  ctx.moveTo(sx + 10, y - 15); ctx.lineTo(sx + 12, y - 19); ctx.lineTo(sx + 13.5, y - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.wolfEye;
  ctx.beginPath();
  ctx.arc(sx + 9, y - 12, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Sporeling: a slime-sized walker wearing a spotted mushroom cap. */
export function drawSporeling(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const bob = Math.sin(t * 3 + id) * 1;
  const y = sy + bob * 0.5;
  drawShadow(ctx, sx, sy + 1, 9);
  ctx.fillStyle = PAL.sporeBody; // squat body
  ctx.beginPath();
  ctx.ellipse(sx, y - 6, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.eye;
  ctx.beginPath();
  ctx.arc(sx - 2.5, y - 6, 1.2, 0, Math.PI * 2);
  ctx.arc(sx + 2.5, y - 6, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.sporeCap; // oversized cap
  ctx.beginPath();
  ctx.ellipse(sx, y - 11, 10, 6, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.sporeCapDot;
  ctx.beginPath();
  ctx.arc(sx - 4, y - 13, 1.4, 0, Math.PI * 2);
  ctx.arc(sx + 3, y - 14.5, 1.4, 0, Math.PI * 2);
  ctx.arc(sx + 6.5, y - 12, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

/** Thornspitter: a cultist-shaped bramble with a thorn crown and acid eyes. */
export function drawThornspitter(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const sway = Math.sin(t * 2 + id) * 1;
  drawShadow(ctx, sx, sy + 1, 11);
  ctx.fillStyle = PAL.thorn; // bramble cone
  ctx.beginPath();
  ctx.moveTo(sx + sway, sy - 32);
  ctx.lineTo(sx + 11, sy);
  ctx.lineTo(sx - 11, sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PAL.thornDark; // thorn crown spikes
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [dx, dy] of [[-6, -22], [0, -30], [6, -22]] as const) {
    ctx.moveTo(sx + sway * 0.7 + dx * 0.5, sy - 26);
    ctx.lineTo(sx + sway * 0.7 + dx, sy + dy - 6);
  }
  ctx.stroke();
  const glow = 0.6 + 0.4 * Math.sin(t * 5 + id);
  ctx.fillStyle = PAL.thornEye;
  ctx.globalAlpha = glow;
  ctx.beginPath();
  ctx.arc(sx - 2 + sway * 0.7, sy - 22, 1.5, 0, Math.PI * 2);
  ctx.arc(sx + 2 + sway * 0.7, sy - 22, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

/** Gnarled Treant: a walking trunk — barrel body, stubby root legs, leafy crown. */
export function drawTreant(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, id: number): void {
  const sway = Math.sin(t * 1.2 + id) * 1.4;
  drawShadow(ctx, sx, sy + 2, 15);
  ctx.fillStyle = PAL.treantDark; // root legs
  ctx.fillRect(sx - 8, sy - 8, 5, 8);
  ctx.fillRect(sx + 3, sy - 8, 5, 8);
  ctx.fillStyle = PAL.treant; // barrel trunk
  ctx.beginPath();
  ctx.moveTo(sx - 9, sy - 6);
  ctx.lineTo(sx - 7 + sway * 0.4, sy - 34);
  ctx.lineTo(sx + 7 + sway * 0.4, sy - 34);
  ctx.lineTo(sx + 9, sy - 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.treantDark; // bark seams
  ctx.fillRect(sx - 2 + sway * 0.2, sy - 30, 2.5, 20);
  ctx.fillStyle = PAL.treantLeaf; // crown
  ctx.beginPath();
  ctx.ellipse(sx + sway * 0.6, sy - 40, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.treantEye; // knothole eyes
  ctx.beginPath();
  ctx.arc(sx - 3 + sway * 0.4, sy - 27, 1.6, 0, Math.PI * 2);
  ctx.arc(sx + 3 + sway * 0.4, sy - 27, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

/** The Rootfather: Typhon-scale silhouette in bark, antler branches for horns,
 *  a mossy mantle, sap-green eyes. Shares the boss aura/enrage language. */
export function drawRootfather(
  ctx: CanvasRenderingContext2D, sx: number, sy: number,
  t: number, enraged: boolean, shielded: boolean,
): void {
  drawShadow(ctx, sx, sy + 2, 24);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.strokeStyle = enraged ? PAL.enrage : PAL.rootLeaf; // aura
  ctx.globalAlpha = 0.35 + 0.25 * pulse;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 30 + pulse * 3, 15 + pulse * 1.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const y = sy + Math.sin(t * 1.2) * 1.5;
  ctx.fillStyle = PAL.root; // broad bark silhouette
  ctx.beginPath();
  ctx.moveTo(sx, y - 56);
  ctx.lineTo(sx + 21, y - 36);
  ctx.lineTo(sx + 16, y);
  ctx.lineTo(sx - 16, y);
  ctx.lineTo(sx - 21, y - 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.rootDark; // chest seam
  ctx.beginPath();
  ctx.moveTo(sx, y - 42);
  ctx.lineTo(sx + 11, y - 28);
  ctx.lineTo(sx, y - 4);
  ctx.lineTo(sx - 11, y - 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.rootLeaf; // mossy mantle
  ctx.beginPath();
  ctx.ellipse(sx, y - 52, 15, 5.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.rootDark; // antler branches
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 10, y - 54);
  ctx.lineTo(sx - 20, y - 68);
  ctx.moveTo(sx - 16, y - 63);
  ctx.lineTo(sx - 23, y - 60);
  ctx.moveTo(sx + 10, y - 54);
  ctx.lineTo(sx + 20, y - 68);
  ctx.moveTo(sx + 16, y - 63);
  ctx.lineTo(sx + 23, y - 60);
  ctx.stroke();
  ctx.fillStyle = enraged ? PAL.enrage : PAL.rootEye; // eyes
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.beginPath();
  ctx.arc(sx - 5, y - 46, 2.2, 0, Math.PI * 2);
  ctx.arc(sx + 5, y - 46, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  if (shielded) {
    ctx.strokeStyle = PAL.shieldRing;
    ctx.globalAlpha = 0.6 + 0.3 * pulse;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(sx, y - 30, 30, 40, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
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
