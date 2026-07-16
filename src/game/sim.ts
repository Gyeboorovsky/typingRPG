// The fixed-timestep orchestrator. Pure: consumes an event queue, mutates
// state, emits fx. A future server runs this exact function authoritatively.
import { emptyStats, maxHp, maxMp, moveSpeed } from './attributes';
import type { StatId } from './attributes';
import { classOf } from './classes';
import {
  DROP_DESPAWN_SECONDS, DROP_REARM_MARGIN, GOLD_PER_COIN, PICKUP_RADIUS, PLAYER_RADIUS,
} from './constants';
import { resolveKeystroke, syncCombat, tryUltimate } from './combat';
import { addToInventory, cloneEquipment, emptyEquipment, firstFreeCell, ITEMS, itemSize, rectFree } from './items';
import { circleBlocked, isBlocked, SPAWN } from './map';
import { initMobs, mobStep, respawnStep, SPOTS } from './mobs';
import type { ClassId, EquipSlot, GameState, InputEvent, ItemStack, SaveData } from './types';
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
    combat: null, mode: 'travel', fireMode: 1, held: [], fx: [], bossKilled: false, dirty: false, nextId: 1,
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
    else if (e.type === 'setMode') setMode(state, e.mode);
    else if (e.type === 'setFireMode') state.fireMode = e.fireMode;
    else if (e.type === 'char') resolveKeystroke(state, e.ch);
    else if (e.type === 'ult') tryUltimate(state);
    else if (e.type === 'respawn') respawnPlayer(state);
    else if (e.type === 'allocateStat') allocateStat(state, e.stat);
    else if (e.type === 'equip') equipItem(state, e.index);
    else if (e.type === 'unequip') unequipItem(state, e.slot, e.x, e.y);
    else if (e.type === 'moveItem') moveItem(state, e.index, e.x, e.y);
    else if (e.type === 'useItem') useItem(state, e.index);
    else if (e.type === 'dropItem') dropItem(state, e.index);
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

/** Enter/leave typing-combat. Entering fight builds the prompt now (via syncCombat) so
 *  keystrokes queued in the same event batch land; leaving hides it immediately. Aggro is
 *  untouched either way — mobs keep chasing/attacking regardless of the player's mode. */
function setMode(state: GameState, mode: GameState['mode']): void {
  state.mode = mode;
  if (mode === 'fight') syncCombat(state);
  else state.combat = null;
}

/** Free continuous movement: held keys sum to a direction vector (diagonals included).
 *  Effective only in travel mode — in fight you're typing, not walking. */
function stepPlayer(state: GameState, dt: number): void {
  const p = state.player;
  if (p.dead) return;
  if (state.mode !== 'travel') return;
  if (state.held.length === 0) return;
  let vx = 0, vy = 0;
  for (const d of state.held) { vx += DIR_VECS[d].x; vy += DIR_VECS[d].y; }
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return;
  vx /= len; vy /= len;
  p.dir = state.held[state.held.length - 1];
  const step = moveSpeed(p) * dt;
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
    const prevAge = d.age;
    d.age += dt;
    if (d.age > DROP_DESPAWN_SECONDS) { state.drops.splice(i, 1); continue; }
    const dd = dist(d.pos, pp);
    // a player-thrown drop re-arms only once the player has stepped away from it
    if (d.rearm && dd > PICKUP_RADIUS + DROP_REARM_MARGIN) d.rearm = false;
    if (p.dead || d.rearm || dd > PICKUP_RADIUS) continue;

    if (d.defId === 'copper_coin') { // coins convert to gold, never enter the bag
      p.gold += d.qty * GOLD_PER_COIN;
      state.fx.push({ kind: 'pickup', text: `+${d.qty * GOLD_PER_COIN} gold` });
      state.drops.splice(i, 1);
      state.dirty = true;
      continue;
    }

    const taken = addToInventory(p, d.defId, d.qty);
    if (taken >= d.qty) { // fully picked up
      state.fx.push({ kind: 'pickup', text: `+${d.qty} ${ITEMS[d.defId].name}` });
      state.drops.splice(i, 1);
      state.dirty = true;
    } else if (taken > 0) { // partial — leave the remainder on the ground
      d.qty -= taken;
      state.fx.push({ kind: 'pickup', text: `+${taken} ${ITEMS[d.defId].name}` });
      state.dirty = true;
    } else if (Math.floor(prevAge) !== Math.floor(d.age)) { // bag full — toast ~1/sec, no spam
      state.fx.push({ kind: 'pickup', text: 'Bag full' });
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

/** A max-HP/MP change (equip/unequip) keeps current values, clamped down to the new cap. */
function clampVitals(p: GameState['player']): void {
  p.hp = Math.min(p.hp, maxHp(p));
  p.mp = Math.min(p.mp, maxMp(p));
}

/** Equip inventory[index] into its slot. Silent no-op (v4-2) if the item isn't equippable
 *  or the character is under the required level; the UI pre-checks and shows feedback. */
function equipItem(state: GameState, index: number): void {
  const p = state.player;
  const st = p.inventory[index];
  if (!st) return;
  const def = ITEMS[st.defId];
  if (!def?.slot) return;                       // not equippable
  if (p.level < (def.reqLevel ?? 0)) return;    // under-level — reject silently
  const slot = def.slot;
  const prev = p.equipment[slot];
  p.inventory.splice(index, 1);                 // free the item's cells first
  if (prev) {                                   // swap: place the old item back in the bag
    const ps = itemSize(ITEMS[prev.defId]);
    const cell = firstFreeCell(p.inventory, ps.w, ps.h);
    if (!cell) { p.inventory.splice(index, 0, st); return; } // no room for the swap — revert
    p.inventory.push({ ...prev, x: cell.x, y: cell.y });
  }
  p.equipment[slot] = { defId: st.defId, qty: st.qty, ...(st.plus !== undefined && { plus: st.plus }) };
  clampVitals(p);
  p.invRev++;
  state.dirty = true;
}

/** Move the item in `slot` into the bag: to (x,y) when given (drop/click on a specific
 *  cell), else to the first free grid cell. Silent no-op if the target is taken or the
 *  bag has no room — the UI pre-checks and shows feedback. */
function unequipItem(state: GameState, slot: EquipSlot, x?: number, y?: number): void {
  const p = state.player;
  const st = p.equipment[slot];
  if (!st) return;
  const us = itemSize(ITEMS[st.defId]);
  const cell = x !== undefined && y !== undefined
    ? (rectFree(p.inventory, x, y, us.w, us.h) ? { x, y } : null)
    : firstFreeCell(p.inventory, us.w, us.h);
  if (!cell) return;                            // no room / target blocked — reject silently
  p.inventory.push({ ...st, x: cell.x, y: cell.y });
  p.equipment[slot] = null;
  clampVitals(p);
  p.invRev++;
  state.dirty = true;
}

/** Reposition inventory[index] to (x,y) if its footprint fits clear of the other items. */
function moveItem(state: GameState, index: number, x: number, y: number): void {
  const p = state.player;
  const st = p.inventory[index];
  if (!st) return;
  const { w, h } = itemSize(ITEMS[st.defId]);
  const others = p.inventory.filter((_, i) => i !== index);
  if (!rectFree(others, x, y, w, h)) return;    // out of bounds or collision — reject silently
  st.x = x; st.y = y;
  p.invRev++;
  state.dirty = true;
}

/** Consume inventory[index] if it's a consumable, applying its heal/mana. Blocked in
 *  fight mode (decyzja v3-3): in combat, healing comes from life-leech, not potions —
 *  the UI also gates this, but the sim guards it so a stray event can't fire mid-fight. */
function useItem(state: GameState, index: number): void {
  const p = state.player;
  if (state.combat) return;                     // consumables only in travel
  const st = p.inventory[index];
  if (!st) return;
  const def = ITEMS[st.defId];
  if (!def?.consumable) return;
  const heal = def.consumable.heal ?? 0;
  const mana = def.consumable.mana ?? 0;
  if (heal) p.hp = Math.min(p.hp + heal, maxHp(p));
  if (mana) p.mp = Math.min(p.mp + mana, maxMp(p));
  st.qty -= 1;
  if (st.qty <= 0) p.inventory.splice(index, 1);
  p.invRev++;
  state.dirty = true;
  const gain = [heal ? `+${heal} HP` : '', mana ? `+${mana} MP` : ''].filter(Boolean).join(' ');
  state.fx.push({ kind: 'pickup', text: `${def.name} ${gain}`.trim() });
}

/** Throw inventory[index] on the ground at the player's feet. The drop starts
 *  re-armed (see stepDrops) so auto-pickup doesn't vacuum it straight back up. */
function dropItem(state: GameState, index: number): void {
  const p = state.player;
  const st = p.inventory[index];
  if (!st) return;
  p.inventory.splice(index, 1);
  state.drops.push({
    id: state.nextId++, defId: st.defId, qty: st.qty,
    pos: { ...playerWorldPos(p) }, age: 0, rearm: true,
  });
  p.invRev++;
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
  // Clamp vitals AFTER stats + equipment are applied, so the gear-aware maxHp/maxMp are correct.
  p.hp = Math.min(Math.max(1, save.player.hp), maxHp(p));
  p.mp = Math.min(Math.max(0, save.player.mp), maxMp(p));
  p.invRev++;
  state.bossKilled = save.bossKilled;
}
