// The heart of the game: per-keystroke resolution, streak → AoE radius,
// ultimates, boss shield/enrage, XP and kills.
import {
  maxHp, maxMp, physCharDamage, playerAttributes, recomputeStatPoints,
} from './attributes';
import { classOf } from './classes';
import {
  BOSS_ENRAGE_HP, BOSS_ENRAGE_TYPO_MULT, BOSS_SHIELD_AT, DEFENSE_K, PROMPT_MP_REWARD,
  RADIUS_BASE, RADIUS_MAX, RADIUS_PER_STREAK, ULT_DAMAGE, ULT_RADIUS_MULT, XP_CURVE,
} from './constants';
import { rollDrops } from './loot';
import { MOBS, respawnDelayFor } from './mobs';
import { rand } from './rng';
import { promptFor } from './words';
import type { GameState, Mob, Player, Tier } from './types';
import { dist, playerWorldPos } from './types';

/** Per-correct-char typing damage for a player, from their effective (gear-aware) attributes. */
export const typingDamage = (p: Player): number =>
  physCharDamage(playerAttributes(p));

/** Apply defense mitigation and roll dodge against an incoming melee hit (the mob's typo
 *  retaliation today; real mob-melee reuses this later). Consumes state.rng for dodge, so
 *  results are seed-deterministic. Returns 0 when the hit is dodged. */
export function meleeMitigatedDamage(state: GameState, raw: number): number {
  if (raw <= 0) return 0;
  const attrs = playerAttributes(state.player);
  if (rand(state) * 100 < attrs.dodge) return 0; // dodged
  return Math.round(raw * DEFENSE_K / (DEFENSE_K + attrs.defense));
}

export const radiusFor = (streak: number): number =>
  Math.min(RADIUS_BASE + RADIUS_PER_STREAK * streak, RADIUS_MAX);

const aggroed = (state: GameState): Mob[] => state.mobs.filter((m) => m.state === 'aggro');

/** Per-tick combat lifecycle: start when mobs engage, end when none remain.
 *  Single pass over mobs — this runs every tick, so no array is allocated. */
export function syncCombat(state: GameState): void {
  if (state.mode !== 'fight') { state.combat = null; return; } // prompt shows only in fight mode
  let tier = 0;
  for (const m of state.mobs)
    if (m.state === 'aggro' && MOBS[m.defId].tier > tier) tier = MOBS[m.defId].tier;
  if (tier === 0) { state.mode = 'travel'; state.combat = null; return; } // last target gone → leave fight
  if (!state.combat) {
    state.combat = { prompt: promptFor(state, tier as Tier), typed: 0, streak: 0, tier: tier as Tier, errorFlash: 0 };
  } else if (tier > state.combat.tier) { // a harder mob joined — harder words
    state.combat.tier = tier as Tier;
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
  const ag = aggroed(state); // one scan per keystroke, shared with completion/typo
  if (ch === c.prompt[c.typed]) {
    c.typed++;
    c.streak++;
    const dmg = typingDamage(p);
    const r = radiusFor(c.streak);
    const pp = playerWorldPos(p);
    for (const m of ag) if (dist(m.pos, pp) <= r) damageMob(state, m, dmg);
    if (state.combat && c.typed >= c.prompt.length) completePrompt(state, ag);
  } else {
    typo(state, ag);
  }
}

// Both take the keystroke's aggro snapshot: mobs killed by the damage loop have
// shield=false (shielded mobs are unkillable), so the shield passes see the
// same set a fresh filter would.
function completePrompt(state: GameState, ag: Mob[]): void {
  const p = state.player;
  p.mp = Math.min(p.mp + PROMPT_MP_REWARD, maxMp(p));
  for (const m of ag) {
    if (m.shield) { // a full prompt without typos breaks the boss shield
      m.shield = false;
      state.fx.push({ kind: 'shieldbreak', pos: { ...m.pos } });
    }
  }
  newPrompt(state);
}

function typo(state: GameState, ag: Mob[]): void {
  const c = state.combat!;
  c.streak = 0;
  c.errorFlash = 0.3;
  let raw = 0;
  let shieldedBoss = false;
  for (const m of ag) {
    const def = MOBS[m.defId];
    let d = def.typoDamage;
    if (def.boss && m.hp <= def.hp * BOSS_ENRAGE_HP) d = Math.round(d * BOSS_ENRAGE_TYPO_MULT);
    if (d > raw) raw = d; // the hardest engaged mob punishes the typo
    if (m.shield) shieldedBoss = true;
  }
  hurtPlayer(state, meleeMitigatedDamage(state, raw)); // defense/dodge soften the hit
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
  recomputeStatPoints(p); // earned − spent; shared with the set-level cheat so they can't diverge
  state.dirty = true;
}

export function hurtPlayer(state: GameState, dmg: number): void {
  const p = state.player;
  // The single player-damage choke point. godmode guarded HERE (not at the call site) so the
  // rng-consuming meleeMitigatedDamage argument still advances state.rng identically on/off —
  // keeping loot rolls seed-deterministic.
  if (p.dead || dmg <= 0 || p.godmode) return;
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
