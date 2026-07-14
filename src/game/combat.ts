// The heart of the game: per-keystroke resolution, streak → AoE radius,
// ultimates, boss shield/enrage, XP and kills.
import { classOf, maxHp, maxMp } from './classes';
import {
  BOSS_ENRAGE_HP, BOSS_ENRAGE_TYPO_MULT, BOSS_SHIELD_AT, PROMPT_MP_REWARD,
  RADIUS_BASE, RADIUS_MAX, RADIUS_PER_STREAK, ULT_DAMAGE, ULT_RADIUS_MULT, XP_CURVE,
} from './constants';
import { weaponBonus } from './items';
import { rollDrops } from './loot';
import { MOBS, respawnDelayFor } from './mobs';
import { promptFor } from './words';
import type { GameState, Mob, Tier } from './types';
import { dist, playerWorldPos } from './types';

export const radiusFor = (streak: number): number =>
  Math.min(RADIUS_BASE + RADIUS_PER_STREAK * streak, RADIUS_MAX);

export const aggroed = (state: GameState): Mob[] => state.mobs.filter((m) => m.state === 'aggro');

/** Per-tick combat lifecycle: start when mobs engage, end when none remain. */
export function syncCombat(state: GameState): void {
  const ag = aggroed(state);
  if (ag.length === 0) { state.combat = null; return; }
  const tier = ag.reduce<number>((t, m) => Math.max(t, MOBS[m.defId].tier), 1) as Tier;
  if (!state.combat) {
    state.combat = { prompt: promptFor(state, tier), typed: 0, streak: 0, tier, errorFlash: 0 };
  } else if (tier > state.combat.tier) { // a harder mob joined — harder words
    state.combat.tier = tier;
    newPrompt(state);
  }
}

function newPrompt(state: GameState): void {
  const c = state.combat;
  if (!c) return;
  c.prompt = promptFor(state, c.tier);
  c.typed = 0;
}

export function resolveKeystroke(state: GameState, ch: string): void {
  const c = state.combat;
  const p = state.player;
  if (!c || p.dead) return;
  if (ch === c.prompt[c.typed]) {
    c.typed++;
    c.streak++;
    const dmg = classOf(p).baseDamage + weaponBonus(p);
    const r = radiusFor(c.streak);
    const pp = playerWorldPos(p);
    for (const m of aggroed(state)) if (dist(m.pos, pp) <= r) damageMob(state, m, dmg);
    if (state.combat && c.typed >= c.prompt.length) completePrompt(state);
  } else {
    typo(state);
  }
}

function completePrompt(state: GameState): void {
  const p = state.player;
  p.mp = Math.min(p.mp + PROMPT_MP_REWARD, maxMp(p));
  for (const m of aggroed(state)) {
    if (m.shield) { // a full prompt without typos breaks the boss shield
      m.shield = false;
      state.fx.push({ kind: 'shieldbreak', pos: { ...m.pos } });
    }
  }
  newPrompt(state);
}

function typo(state: GameState): void {
  const c = state.combat!;
  c.streak = 0;
  c.errorFlash = 0.3;
  let dmg = 0;
  let shieldedBoss = false;
  for (const m of aggroed(state)) {
    const def = MOBS[m.defId];
    let d = def.typoDamage;
    if (def.boss && m.hp <= def.hp * BOSS_ENRAGE_HP) d = Math.round(d * BOSS_ENRAGE_TYPO_MULT);
    if (d > dmg) dmg = d; // the hardest engaged mob punishes the typo
    if (m.shield) shieldedBoss = true;
  }
  hurtPlayer(state, dmg);
  if (shieldedBoss && state.combat) newPrompt(state); // flawless phase restarts
}

export function damageMob(state: GameState, m: Mob, dmg: number): void {
  if (m.shield) return;
  const def = MOBS[m.defId];
  m.hp -= dmg;
  state.fx.push({ kind: 'dmg', pos: { ...m.pos }, value: dmg });
  if (m.hp <= 0) { killMob(state, m); return; }
  if (def.boss && !m.shield) {
    const at = BOSS_SHIELD_AT[m.shieldsUsed];
    if (at !== undefined && m.hp / def.hp <= at) {
      m.shield = true;
      m.shieldsUsed++;
      newPrompt(state); // fresh phrase for the flawless phase
    }
  }
}

function killMob(state: GameState, m: Mob): void {
  const def = MOBS[m.defId];
  state.mobs.splice(state.mobs.indexOf(m), 1);
  state.spots[m.spotIdx].pending.push(respawnDelayFor(def));
  state.fx.push({ kind: 'xp', pos: { ...m.pos }, value: def.xp });
  grantXp(state, def.xp);
  for (const d of rollDrops(state, def))
    state.drops.push({ id: state.nextId++, defId: d.defId, qty: d.qty, pos: { ...m.pos }, age: 0 });
  if (def.boss) state.bossKilled = true;
  state.dirty = true;
}

export function grantXp(state: GameState, amount: number): void {
  const p = state.player;
  p.xp += amount;
  while (p.xp >= XP_CURVE(p.level)) {
    p.xp -= XP_CURVE(p.level);
    p.level++;
    p.hp = maxHp(p);
    p.mp = maxMp(p);
    state.fx.push({ kind: 'levelup', level: p.level });
  }
  state.dirty = true;
}

export function hurtPlayer(state: GameState, dmg: number): void {
  const p = state.player;
  if (p.dead || dmg <= 0) return;
  p.hp -= dmg;
  state.fx.push({ kind: 'hurt', pos: { ...playerWorldPos(p) }, value: dmg });
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    state.combat = null;
    for (const m of state.mobs) if (m.state === 'aggro') m.state = 'leash';
    state.fx.push({ kind: 'death' });
  }
}

export function tryUltimate(state: GameState): void {
  const c = state.combat;
  const p = state.player;
  if (!c || p.dead || p.ultCooldown > 0) return;
  const ult = classOf(p).ult;
  if (c.streak < ult.streakThreshold || p.mp < ult.manaCost) return;
  p.mp -= ult.manaCost;
  p.ultCooldown = ult.cooldown;
  const pp = playerWorldPos(p);
  const r = radiusFor(c.streak) * ULT_RADIUS_MULT;
  // Every ult id currently resolves to the Whirlwind effect; per-class
  // effects switch on classOf(p).ult.id here when the other classes land.
  for (const m of aggroed(state)) if (dist(m.pos, pp) <= r) damageMob(state, m, ULT_DAMAGE);
  state.fx.push({ kind: 'ult', pos: { ...pp }, radius: r });
}
