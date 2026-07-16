// Isometric world renderer: projection, culling, depth sort, camera,
// the streak radius ring, and floating damage numbers / bursts.
import { radiusFor } from '../game/combat';
import { BOSS_ENRAGE_HP, CAMERA_LERP, TILE_H, TILE_W } from '../game/constants';
import { ITEMS } from '../game/items';
import { PROPS } from '../game/map';
import { MOBS } from '../game/mobs';
import type { Fx, GameState, Vec2 } from '../game/types';
import { lerp, playerWorldPos } from '../game/types';
import { PAL } from './palette';
import {
  drawBoar, drawBoss, drawCultist, drawDrop, drawPlayer, drawRock, drawSlime, drawTree,
  drawWaterShimmer,
} from './sprites';
import { buildTerrain } from './terrain';
import type { TerrainLayer } from './terrain';

const IX = TILE_W / 2, IY = TILE_H / 2; // 32, 16
const SQ2 = Math.SQRT2;

interface Particle { wx: number; wy: number; text: string; color: string; born: number }
interface Burst { wx: number; wy: number; r: number; color: string; born: number }

const projX = (wx: number, wy: number): number => (wx - wy) * IX;
const projY = (wx: number, wy: number): number => (wx + wy) * IY;

export class Renderer {
  private cam = { x: 0, y: 0 };
  private camInit = false;
  private particles: Particle[] = [];
  private bursts: Burst[] = [];
  private terrain: TerrainLayer | null = null; // static ground, built lazily

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Snap the camera to the player instead of gliding, e.g. after switching characters. */
  resetCamera(): void { this.camInit = false; }

  draw(state: GameState, fx: Fx[], t: number, viewW: number, viewH: number): void {
    const ctx = this.ctx;
    const pp = playerWorldPos(state.player);

    // camera follows the player
    const tx = projX(pp.x, pp.y) - viewW / 2;
    const ty = projY(pp.x, pp.y) - viewH / 2 - 16;
    if (!this.camInit) { this.cam.x = tx; this.cam.y = ty; this.camInit = true; }
    this.cam.x = lerp(this.cam.x, tx, CAMERA_LERP);
    this.cam.y = lerp(this.cam.y, ty, CAMERA_LERP);
    const cx = this.cam.x, cy = this.cam.y;

    this.intakeFx(fx, pp, t);

    ctx.clearRect(0, 0, viewW, viewH);

    // ground pass: one blit of the pre-rendered terrain layer, then the
    // animated water shimmer on top. Rebuild only if devicePixelRatio changed
    // (browser zoom / monitor move) — the layer is map-sized, not view-sized.
    if (!this.terrain || this.terrain.builtForDpr !== (window.devicePixelRatio || 1))
      this.terrain = buildTerrain();
    const ter = this.terrain;
    ctx.drawImage(ter.canvas, 0, 0, ter.canvas.width, ter.canvas.height,
      -ter.ox - cx, -ter.oy - cy, ter.w, ter.h);
    for (const wt of ter.waterTiles) {
      const sx = projX(wt.x, wt.y) - cx, sy = projY(wt.x, wt.y) - cy;
      if (sx < -TILE_W || sx > viewW + TILE_W || sy < -TILE_H * 2 || sy > viewH + TILE_H * 2) continue;
      drawWaterShimmer(ctx, sx, sy, wt.x, wt.y, t);
    }

    // streak damage-radius ring, between ground and entities
    if (state.combat && !state.player.dead) {
      const r = radiusFor(state.combat.streak);
      const sx = projX(pp.x, pp.y) - cx, sy = projY(pp.x, pp.y) - cy;
      ctx.strokeStyle = PAL.ring;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 5);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * IX * SQ2, r * IY * SQ2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    // entity pass: props + mobs + drops + player, depth-sorted by x+y
    type Ent = { d: number; draw: () => void };
    const ents: Ent[] = [];
    for (const pr of PROPS) {
      const sx = projX(pr.x, pr.y) - cx, sy = projY(pr.x, pr.y) - cy;
      if (sx < -80 || sx > viewW + 80 || sy < -100 || sy > viewH + 100) continue;
      ents.push({ d: pr.x + pr.y, draw: pr.kind === 'tree' ? () => drawTree(ctx, sx, sy) : () => drawRock(ctx, sx, sy) });
    }
    for (const dr of state.drops) {
      const sx = projX(dr.pos.x, dr.pos.y) - cx, sy = projY(dr.pos.x, dr.pos.y) - cy;
      if (sx < -80 || sx > viewW + 80 || sy < -100 || sy > viewH + 100) continue;
      ents.push({ d: dr.pos.x + dr.pos.y, draw: () => drawDrop(ctx, sx, sy, t, ITEMS[dr.defId].tier, dr.id) });
    }
    for (const m of state.mobs) {
      const def = MOBS[m.defId];
      const sx = projX(m.pos.x, m.pos.y) - cx, sy = projY(m.pos.x, m.pos.y) - cy;
      if (sx < -100 || sx > viewW + 100 || sy < -140 || sy > viewH + 140) continue;
      ents.push({
        d: m.pos.x + m.pos.y,
        draw: () => {
          if (def.boss) drawBoss(ctx, sx, sy, t, m.hp <= def.hp * BOSS_ENRAGE_HP, m.shield);
          else if (m.defId === 'slime') drawSlime(ctx, sx, sy, t, m.id);
          else if (m.defId === 'boar') drawBoar(ctx, sx, sy, t, m.id);
          else drawCultist(ctx, sx, sy, t, m.id);
          if (m.hp < def.hp) this.mobBar(sx, sy - (def.boss ? 80 : 40), m.hp / def.hp);
        },
      });
    }
    {
      const p = state.player;
      const sx = projX(pp.x, pp.y) - cx, sy = projY(pp.x, pp.y) - cy;
      ents.push({ d: pp.x + pp.y, draw: () => drawPlayer(ctx, sx, sy, t, p.dir, state.held.length > 0, p.animT, p.dead, p.classId) });
    }
    ents.sort((a, b) => a.d - b.d);
    for (const e of ents) e.draw();

    this.drawParticles(t, cx, cy);
  }

  private mobBar(sx: number, sy: number, frac: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = PAL.mobBarBack;
    ctx.fillRect(sx - 18, sy, 36, 5);
    ctx.fillStyle = PAL.mobBarFill;
    ctx.fillRect(sx - 17, sy + 1, 34 * Math.max(0, frac), 3);
  }

  private intakeFx(fx: Fx[], pp: Vec2, t: number): void {
    for (const f of fx) {
      if (f.kind === 'dmg') this.particles.push({ wx: f.pos.x, wy: f.pos.y, text: `${f.value}`, color: PAL.dmgText, born: t });
      else if (f.kind === 'hurt') this.particles.push({ wx: pp.x, wy: pp.y, text: `-${f.value}`, color: PAL.hurtText, born: t });
      else if (f.kind === 'xp') this.particles.push({ wx: f.pos.x, wy: f.pos.y, text: `+${f.value} XP`, color: PAL.xpText, born: t });
      else if (f.kind === 'ult') this.bursts.push({ wx: f.pos.x, wy: f.pos.y, r: f.radius, color: PAL.burst, born: t });
      else if (f.kind === 'shieldbreak') {
        this.bursts.push({ wx: f.pos.x, wy: f.pos.y, r: 2.5, color: PAL.shieldBurst, born: t });
        this.particles.push({ wx: f.pos.x, wy: f.pos.y, text: 'SHIELD DOWN!', color: PAL.shieldBurst, born: t });
      }
      // 'pickup' | 'levelup' | 'death' are HUD concerns
    }
  }

  private drawParticles(t: number, cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    this.particles = this.particles.filter((p) => t - p.born < 0.8);
    for (const p of this.particles) {
      const age = t - p.born;
      const sx = projX(p.wx, p.wy) - cx;
      const sy = projY(p.wx, p.wy) - cy - 30 - age * 40;
      ctx.globalAlpha = 1 - age / 0.8;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, sx, sy);
    }
    this.bursts = this.bursts.filter((b) => t - b.born < 0.45);
    for (const b of this.bursts) {
      const age = (t - b.born) / 0.45;
      const sx = projX(b.wx, b.wy) - cx, sy = projY(b.wx, b.wy) - cy;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(sx, sy, b.r * IX * SQ2 * age, b.r * IY * SQ2 * age, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
  }
}
