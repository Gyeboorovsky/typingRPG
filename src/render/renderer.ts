// Isometric world renderer: projection, culling, depth sort, camera,
// the streak radius ring, and floating damage numbers / bursts.
import { currentRing } from '../game/combat';
import { BOSS_ENRAGE_HP, CAMERA_LERP, PORTAL_CHANNEL_SECONDS, TILE_H, TILE_W } from '../game/constants';
import { ITEMS } from '../game/items';
import { mapOf } from '../game/map';
import { MOBS } from '../game/mobs';
import type { Fx, GameState, GroundDrop, Mob, PortalDef, Vec2 } from '../game/types';
import { lerp, playerWorldPos } from '../game/types';
import { PAL } from './palette';
import {
  drawBoar, drawBoss, drawCultist, drawDrop, drawDummy, drawPlayer, drawPortal, drawRock,
  drawRootfather, drawShroom, drawSlime, drawSporeling, drawThornspitter, drawTreant, drawTree,
  drawWaterShimmer, drawWolf,
} from './sprites';
import { ChunkedTerrain } from './terrain';

const IX = TILE_W / 2, IY = TILE_H / 2; // 32, 16
const SQ2 = Math.SQRT2;
// Esc hold-to-exit ring: a fixed iso ellipse hugging the player's base — a UI indicator, not a
// gameplay radius, so it's sized in pixels (2:1 iso ratio) and sits inside the streak ring.
const ESC_RING_RX = IX * 1.25, ESC_RING_RY = IY * 1.25;

interface Particle { wx: number; wy: number; text: string; color: string; born: number }
interface Burst { wx: number; wy: number; r: number; color: string; born: number }
// Depth-sort entry: plain data + a kind tag (drawn via switch), no per-frame closures.
interface Ent {
  d: number; kind: 'tree' | 'rock' | 'shroom' | 'portal' | 'drop' | 'mob' | 'player';
  sx: number; sy: number; ref: GroundDrop | Mob | PortalDef | null;
}

const projX = (wx: number, wy: number): number => (wx - wy) * IX;
const projY = (wx: number, wy: number): number => (wx + wy) * IY;

export class Renderer {
  private cam = { x: 0, y: 0 };
  private camInit = false;
  private particles: Particle[] = [];
  private bursts: Burst[] = [];
  private terrain: ChunkedTerrain | null = null; // chunked ground cache, built lazily
  private terrainMapId = '';                     // rebuild trigger on map switch
  private ents: Ent[] = []; // reused across frames (cleared, not reallocated)

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Snap the camera to the player instead of gliding, e.g. after switching characters. */
  resetCamera(): void { this.camInit = false; }

  draw(state: GameState, fx: Fx[], t: number, viewW: number, viewH: number, escHoldProgress = 0): void {
    const ctx = this.ctx;
    const pp = playerWorldPos(state.player);
    const map = mapOf(state);

    // A map switch (teleport) snaps the camera instead of gliding across the world.
    if (this.terrainMapId !== state.mapId) this.camInit = false;

    // camera follows the player
    const tx = projX(pp.x, pp.y) - viewW / 2;
    const ty = projY(pp.x, pp.y) - viewH / 2 - 16;
    if (!this.camInit) { this.cam.x = tx; this.cam.y = ty; this.camInit = true; }
    this.cam.x = lerp(this.cam.x, tx, CAMERA_LERP);
    this.cam.y = lerp(this.cam.y, ty, CAMERA_LERP);
    const cx = this.cam.x, cy = this.cam.y;

    this.intakeFx(fx, pp, t);

    ctx.clearRect(0, 0, viewW, viewH);

    // ground pass: blit the visible chunks of the per-map terrain cache, then the
    // animated water shimmer on top. Rebuilt on map switch or devicePixelRatio
    // change (browser zoom / monitor move).
    if (!this.terrain || this.terrainMapId !== state.mapId
        || this.terrain.builtForDpr !== (window.devicePixelRatio || 1)) {
      this.terrain = new ChunkedTerrain(map);
      this.terrainMapId = state.mapId;
    }
    this.terrain.draw(ctx, cx, cy, viewW, viewH);
    for (const wt of this.terrain.waterTiles) {
      const sx = projX(wt.x, wt.y) - cx, sy = projY(wt.x, wt.y) - cy;
      if (sx < -TILE_W || sx > viewW + TILE_W || sy < -TILE_H * 2 || sy > viewH + TILE_H * 2) continue;
      drawWaterShimmer(ctx, sx, sy, wt.x, wt.y, t);
    }

    // AoE damage-ring, between ground and entities
    if (state.combat && !state.player.dead) {
      const r = currentRing(state.player);
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

    // Faint per-mob attack-range rings (aggroed mobs only) — shows the zone where
    // that mob's periodic blows and on-miss punishment can reach you.
    ctx.strokeStyle = PAL.mobRangeRing;
    ctx.globalAlpha = PAL.mobRangeRingAlpha;
    ctx.lineWidth = 1.5;
    for (const m of state.mobs) {
      if (m.state !== 'aggro') continue;
      const r = MOBS[m.defId].attackRange;
      const sx = projX(m.pos.x, m.pos.y) - cx, sy = projY(m.pos.x, m.pos.y) - cy;
      if (sx < -300 || sx > viewW + 300 || sy < -300 || sy > viewH + 300) continue;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * IX * SQ2, r * IY * SQ2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    // entity pass: props + mobs + drops + player, depth-sorted by x+y.
    // Push order matches insertion order and the sort is stable, so draw
    // order is identical to the old closure-based pass.
    const ents = this.ents;
    ents.length = 0;
    for (const pr of map.props) {
      const sx = projX(pr.x, pr.y) - cx, sy = projY(pr.x, pr.y) - cy;
      if (sx < -80 || sx > viewW + 80 || sy < -100 || sy > viewH + 100) continue;
      ents.push({ d: pr.x + pr.y, kind: pr.kind, sx, sy, ref: null });
    }
    for (const por of map.portals) {
      const sx = projX(por.pos.x, por.pos.y) - cx, sy = projY(por.pos.x, por.pos.y) - cy;
      if (sx < -80 || sx > viewW + 80 || sy < -100 || sy > viewH + 100) continue;
      ents.push({ d: por.pos.x + por.pos.y, kind: 'portal', sx, sy, ref: por });
    }
    for (const dr of state.drops) {
      const sx = projX(dr.pos.x, dr.pos.y) - cx, sy = projY(dr.pos.x, dr.pos.y) - cy;
      if (sx < -80 || sx > viewW + 80 || sy < -100 || sy > viewH + 100) continue;
      ents.push({ d: dr.pos.x + dr.pos.y, kind: 'drop', sx, sy, ref: dr });
    }
    for (const m of state.mobs) {
      const sx = projX(m.pos.x, m.pos.y) - cx, sy = projY(m.pos.x, m.pos.y) - cy;
      if (sx < -100 || sx > viewW + 100 || sy < -140 || sy > viewH + 140) continue;
      ents.push({ d: m.pos.x + m.pos.y, kind: 'mob', sx, sy, ref: m });
    }
    ents.push({ d: pp.x + pp.y, kind: 'player', sx: projX(pp.x, pp.y) - cx, sy: projY(pp.x, pp.y) - cy, ref: null });
    ents.sort((a, b) => a.d - b.d);
    const p = state.player;
    for (const e of ents) {
      switch (e.kind) {
        case 'tree': drawTree(ctx, e.sx, e.sy); break;
        case 'rock': drawRock(ctx, e.sx, e.sy); break;
        case 'shroom': drawShroom(ctx, e.sx, e.sy); break;
        case 'portal': drawPortal(ctx, e.sx, e.sy, t); break;
        case 'drop': {
          const dr = e.ref as GroundDrop;
          drawDrop(ctx, e.sx, e.sy, t, ITEMS[dr.defId].tier, dr.id);
          break;
        }
        case 'mob': {
          const m = e.ref as Mob;
          const def = MOBS[m.defId];
          if (m.defId === 'rootfather') drawRootfather(ctx, e.sx, e.sy, t, m.hp <= def.hp * BOSS_ENRAGE_HP, m.shield);
          else if (def.boss) drawBoss(ctx, e.sx, e.sy, t, m.hp <= def.hp * BOSS_ENRAGE_HP, m.shield);
          else if (m.defId === 'dummy') drawDummy(ctx, e.sx, e.sy, t, m.id);
          else if (m.defId === 'slime') drawSlime(ctx, e.sx, e.sy, t, m.id);
          else if (m.defId === 'boar') drawBoar(ctx, e.sx, e.sy, t, m.id);
          else if (m.defId === 'wolf') drawWolf(ctx, e.sx, e.sy, t, m.id);
          else if (m.defId === 'sporeling') drawSporeling(ctx, e.sx, e.sy, t, m.id);
          else if (m.defId === 'thornspitter') drawThornspitter(ctx, e.sx, e.sy, t, m.id);
          else if (m.defId === 'treant') drawTreant(ctx, e.sx, e.sy, t, m.id);
          else drawCultist(ctx, e.sx, e.sy, t, m.id);
          if (m.hp < def.hp) this.mobBar(e.sx, e.sy - (def.boss ? 80 : 40), m.hp / def.hp);
          break;
        }
        case 'player':
          drawPlayer(ctx, e.sx, e.sy, t, p.dir, state.held.length > 0, p.animT, p.dead, p.classId);
          break;
      }
    }

    // Portal channel: a teal arc filling around the player while standing on a
    // portal (same visual language as the Esc hold-to-exit ring, other color).
    if (state.portalChannel && !p.dead) {
      const frac = Math.min(1, state.portalChannel.t / PORTAL_CHANNEL_SECONDS);
      const sx = projX(pp.x, pp.y) - cx, sy = projY(pp.x, pp.y) - cy;
      const start = -Math.PI / 2;
      ctx.strokeStyle = PAL.portal;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.ellipse(sx, sy, ESC_RING_RX * 1.4, ESC_RING_RY * 1.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(sx, sy, ESC_RING_RX * 1.4, ESC_RING_RY * 1.4, 0, start, start + frac * Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    // Esc hold-to-exit ring: fills red clockwise from the top as the hold builds. Drawn OVER the
    // entities (unlike the streak ring's ground slot) so the player's body can't hide the fill.
    // Gated on state.mode so it can never linger once the sim has already left fight.
    if (escHoldProgress > 0 && state.mode === 'fight' && !p.dead) {
      const sx = projX(pp.x, pp.y) - cx, sy = projY(pp.x, pp.y) - cy;
      const start = -Math.PI / 2;
      ctx.strokeStyle = PAL.exitRing;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.22; // faint full track
      ctx.beginPath();
      ctx.ellipse(sx, sy, ESC_RING_RX, ESC_RING_RY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.95; // bright progress arc
      ctx.beginPath();
      ctx.ellipse(sx, sy, ESC_RING_RX, ESC_RING_RY, 0, start, start + escHoldProgress * Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

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
      else if (f.kind === 'block') this.particles.push({ wx: f.pos.x, wy: f.pos.y, text: 'block', color: PAL.blockText, born: t });
      else if (f.kind === 'hurt') this.particles.push({ wx: pp.x, wy: pp.y, text: `-${f.value}`, color: PAL.hurtText, born: t });
      else if (f.kind === 'xp') this.particles.push({ wx: f.pos.x, wy: f.pos.y, text: `+${f.value} XP`, color: PAL.xpText, born: t });
      else if (f.kind === 'ult') this.bursts.push({ wx: f.pos.x, wy: f.pos.y, r: f.radius, color: PAL.burst, born: t });
      else if (f.kind === 'teleport') this.bursts.push({ wx: f.pos.x, wy: f.pos.y, r: 2.2, color: PAL.portal, born: t });
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
    let n = 0; // expire in place — no new arrays per frame
    for (const p of this.particles) if (t - p.born < 0.8) this.particles[n++] = p;
    this.particles.length = n;
    for (const p of this.particles) {
      const age = t - p.born;
      const sx = projX(p.wx, p.wy) - cx;
      const sy = projY(p.wx, p.wy) - cy - 30 - age * 40;
      ctx.globalAlpha = 1 - age / 0.8;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, sx, sy);
    }
    n = 0;
    for (const b of this.bursts) if (t - b.born < 0.45) this.bursts[n++] = b;
    this.bursts.length = n;
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
