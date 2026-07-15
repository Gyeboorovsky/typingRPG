// The fixed-timestep orchestrator. Pure: consumes an event queue, mutates
// state, emits fx. A future server runs this exact function authoritatively.
import { emptyStats } from './attributes';
import type { StatId } from './attributes';
import { classOf, maxHp, maxMp } from './classes';
import { DROP_DESPAWN_SECONDS, GOLD_PER_COIN, PICKUP_RADIUS, PLAYER_RADIUS, PLAYER_SPEED } from './constants';
import { resolveKeystroke, syncCombat, tryUltimate } from './combat';
import { addToInventory, cloneEquipment, emptyEquipment, firstFreeCell, ITEMS, itemSize } from './items';
import { circleBlocked, isBlocked, SPAWN } from './map';
import { initMobs, mobStep, respawnStep, SPOTS } from './mobs';
import type { ClassId, GameState, InputEvent, ItemStack, SaveData } from './types';
import { DIR_VECS, dist, playerWorldPos } from './types';

export function newGame(seed: number, name = 'Hero', classId: ClassId = 'warrior'): GameState {
  const state: GameState = {
    tick: 0, rng: seed | 0,
    player: {
      name, classId, pos: { ...SPAWN }, dir: 0,
      hp: 0, mp: 0, level: 1, xp: 0, stats: emptyStats(), statPoints: 0,
      equipment: emptyEquipment(), gold: 0, leech: 1,
      inventory: [], overflow: [], invRev: 0,
      dead: false, ultCooldown: 0, animT: 0,
    },
    mobs: [], drops: [], spots: SPOTS.map(() => ({ pending: [] })),
    combat: null, held: [], fx: [], bossKilled: false, dirty: false, nextId: 1,
  };
  state.player.hp = maxHp(state.player);
  state.player.mp = maxMp(state.player);
  initMobs(state);
  return state;
}

export function update(state: GameState, events: InputEvent[], dt: number): void {
  state.tick++;
  for (const e of events) {
    if (e.type === 'move') state.held = e.dirs;
    else if (e.type === 'char') resolveKeystroke(state, e.ch);
    else if (e.type === 'ult') tryUltimate(state);
    else if (e.type === 'respawn') respawnPlayer(state);
    else if (e.type === 'allocateStat') allocateStat(state, e.stat);
  }
  const p = state.player;
  if (p.ultCooldown > 0) p.ultCooldown = Math.max(0, p.ultCooldown - dt);
  if (state.combat && state.combat.errorFlash > 0)
    state.combat.errorFlash = Math.max(0, state.combat.errorFlash - dt);
  stepPlayer(state, dt);
  mobStep(state, dt);
  respawnStep(state, dt);
  stepDrops(state, dt);
  syncCombat(state);
  regen(state, dt);
}

/** Free continuous movement: held keys sum to a direction vector (diagonals included). */
function stepPlayer(state: GameState, dt: number): void {
  const p = state.player;
  if (p.dead) return;
  if (state.held.length === 0) return;
  let vx = 0, vy = 0;
  for (const d of state.held) { vx += DIR_VECS[d].x; vy += DIR_VECS[d].y; }
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return;
  vx /= len; vy /= len;
  p.dir = state.held[state.held.length - 1];
  const step = PLAYER_SPEED * dt;
  const nx = p.pos.x + vx * step, ny = p.pos.y + vy * step;
  if (!circleBlocked(nx, p.pos.y, PLAYER_RADIUS)) p.pos.x = nx; // axis-separated slide
  if (!circleBlocked(p.pos.x, ny, PLAYER_RADIUS)) p.pos.y = ny;
  p.animT += dt;
  state.dirty = true; // position is part of the save
}

function stepDrops(state: GameState, dt: number): void {
  const p = state.player;
  const pp = playerWorldPos(p);
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    d.age += dt;
    if (d.age > DROP_DESPAWN_SECONDS) { state.drops.splice(i, 1); continue; }
    if (!p.dead && dist(d.pos, pp) <= PICKUP_RADIUS) {
      addToInventory(p, d.defId, d.qty);
      state.fx.push({ kind: 'pickup', text: `+${d.qty} ${ITEMS[d.defId].name}` });
      state.drops.splice(i, 1);
      state.dirty = true;
    }
  }
}

function regen(state: GameState, dt: number): void {
  const p = state.player;
  if (p.dead) return;
  const cls = classOf(p);
  p.hp = Math.min(p.hp + (state.combat ? cls.hpRegenCombat : cls.hpRegen) * dt, maxHp(p));
  p.mp = Math.min(p.mp + cls.mpRegen * dt, maxMp(p));
}

function allocateStat(state: GameState, stat: StatId): void {
  const p = state.player;
  if (p.statPoints <= 0) return;
  p.stats[stat]++;
  p.statPoints--;
  state.dirty = true;
}

function respawnPlayer(state: GameState): void {
  const p = state.player;
  if (!p.dead) return;
  p.dead = false;
  p.pos = { ...SPAWN };
  p.hp = maxHp(p);
  p.mp = maxMp(p);
}

// --- save serialization (pure; timestamps are stamped by the save layer) ---
export function makeSave(state: GameState): SaveData {
  const p = state.player;
  return {
    v: 2, savedAt: '',
    player: {
      name: p.name, classId: p.classId, level: p.level, xp: p.xp, hp: p.hp, mp: p.mp,
      pos: { ...p.pos }, inventory: p.inventory.map((s) => ({ ...s })),
      equipment: cloneEquipment(p.equipment), gold: p.gold,
      overflow: p.overflow.map((s) => ({ ...s })),
      stats: { ...p.stats }, statPoints: p.statPoints,
      // leech is transient — deliberately not serialized (re-init full on load).
    },
    bossKilled: state.bossKilled,
  };
}

export function applySave(state: GameState, save: SaveData): void {
  const p = state.player;
  p.name = save.player.name || 'Hero';
  p.classId = save.player.classId;
  p.level = Math.max(1, save.player.level);
  p.xp = Math.max(0, save.player.xp);
  p.hp = Math.min(Math.max(1, save.player.hp), maxHp(p));
  p.mp = Math.min(Math.max(0, save.player.mp), maxMp(p));
  const pos = save.player.pos;
  p.pos = isBlocked(Math.round(pos.x), Math.round(pos.y)) ? { ...SPAWN } : { ...pos };
  p.stats = save.player.stats ? { ...save.player.stats } : emptyStats();
  p.statPoints = save.player.statPoints ?? 0;
  p.leech = 1; // transient — always re-init full on load (never persisted)

  if (save.v === 2) {
    p.inventory = save.player.inventory.map((s) => ({ ...s, x: s.x ?? 0, y: s.y ?? 0 }));
    p.overflow = (save.player.overflow ?? []).map((s) => ({ ...s }));
    p.gold = save.player.gold ?? 0;
    p.equipment = save.player.equipment ? cloneEquipment(save.player.equipment) : emptyEquipment();
  } else {
    // v1 → v2: auto-place the old flat bag row-major, convert held copper_coin → gold
    // (so returning players don't keep dead currency), no equipment yet; anything
    // that still doesn't fit spills to overflow (shouldn't happen at 60 cells vs old ≤30).
    const placed: (ItemStack & { x: number; y: number })[] = [];
    const overflow: ItemStack[] = [];
    let gold = 0;
    for (const stack of save.player.inventory) {
      if (stack.defId === 'copper_coin') { gold += stack.qty * GOLD_PER_COIN; continue; }
      const { w, h } = itemSize(ITEMS[stack.defId]);
      const cell = firstFreeCell(placed, w, h);
      if (cell) placed.push({ ...stack, x: cell.x, y: cell.y });
      else overflow.push({ ...stack });
    }
    p.inventory = placed;
    p.overflow = overflow;
    p.gold = gold;
    p.equipment = emptyEquipment();
  }
  p.invRev++;
  state.bossKilled = save.bossKilled;
}
