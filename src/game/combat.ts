// The heart of the game: per-keystroke resolution, the dynamic AoE ring,
// aggro-on-hit, ultimates, boss shield/enrage, XP and kills.
import {
  maxHp, maxMp, physCharDamage, playerAttributes, recomputeStatPoints,
} from './attributes';
import { classOf } from './classes';
import {
  BOSS_ENRAGE_HP, BOSS_ENRAGE_TYPO_MULT, BOSS_SHIELD_AT, CHILL_FALLBACK_TIER, DEFENSE_K,
  MOB_ONMISS_JITTER_MAX, MOB_ONMISS_JITTER_MIN, RING_BY_WEAPON, RING_DEFAULT,
  STREAK_GROWTH, STREAK_IDLE_DECAY_DELAY, STREAK_IDLE_DECAY_PER_SEC,
  PROMPT_HP_REWARD_PER_TIER, PROMPT_MP_REWARD, ULT_DAMAGE, ULT_RADIUS_MULT, XP_CURVE,
} from './constants';
import type { RingConfig } from './constants';
import { ITEMS } from './items';
import { rollDrops } from './loot';
import { aggroMob, MOBS, mobPhase, respawnDelayFor } from './mobs';
import { rand } from './rng';
import { promptFor } from './words';
import type { GameState, Mob, Player, Tier } from './types';
import { dist, playerWorldPos } from './types';

/** Per-correct-char typing damage for a player, from their effective (gear-aware) attributes. */
export const typingDamage = (p: Player): number =>
  physCharDamage(playerAttributes(p));

/** Apply the player's defense mitigation and roll their dodge against an incoming mob
 *  hit. `kind` is carried as data for a future magicDefense split — both kinds mitigate
 *  through the single `defense` attribute today. Consumes state.rng for the dodge roll,
 *  so results are seed-deterministic. Returns 0 when the hit is dodged. */
export function mitigatePlayerDamage(
  state: GameState, raw: number, _kind: 'physical' | 'magical' = 'physical',
): number {
  if (raw <= 0) return 0;
  const attrs = playerAttributes(state.player);
  if (rand(state) * 100 < attrs.dodge) return 0; // dodged
  return Math.round(raw * DEFENSE_K / (DEFENSE_K + attrs.defense));
}

const aggroed = (state: GameState): Mob[] => state.mobs.filter((m) => m.state === 'aggro');

// --- the attack-range ring: per-weapon live state on the Player ------------------

/** Config key for the equipped weapon's ring: its weaponType, or 'unarmed'. */
export function weaponRingKey(p: Player): string {
  const w = p.equipment.weapon;
  return (w && ITEMS[w.defId]?.weaponType) || 'unarmed';
}

/** Ring config for a weapon key: RING_BY_WEAPON override merged over RING_DEFAULT. */
export function ringConfigFor(key: string): RingConfig {
  const o = RING_BY_WEAPON[key as keyof typeof RING_BY_WEAPON];
  if (!o) return RING_DEFAULT;
  return { ...RING_DEFAULT, ...o, growth: { ...RING_DEFAULT.growth, ...o.growth } };
}

/** The live ring radius for the currently equipped weapon (its floor when untouched). */
export function currentRing(p: Player): number {
  const key = weaponRingKey(p);
  return p.attackRanges[key] ?? ringConfigFor(key).min;
}

function setRing(p: Player, v: number): void {
  const key = weaponRingKey(p);
  const cfg = ringConfigFor(key);
  p.attackRanges[key] = Math.min(Math.max(v, cfg.min), cfg.max);
}

/** Zero every in-combat meter. Fires ONLY on the explicit ways out of a fight —
 *  exitFight (Alt+X / Esc-hold) and death. While the player STAYS in fight mode,
 *  streak and per-weapon rings persist across pack clears and weapon switches
 *  (decision 2026-07-19). */
function resetCombatMeters(p: Player): void {
  p.streak = 0;
  p.typingIdle = 0;
  p.attackRanges = {};
}

/** True while at least one mob sits inside the current damage ring (the "Combat"
 *  state — your next keystroke can harm it). */
export const targetInRange = (state: GameState): boolean => {
  if (!state.combat) return false;
  const pp = playerWorldPos(state.player);
  const r = currentRing(state.player);
  return state.mobs.some((m) => dist(m.pos, pp) <= r);
};

/** Leave combat entirely — the single "end the fight" entry point any module can
 *  call (Esc-hold today; scripted triggers later). setMode('travel') routes here. */
export function exitFight(state: GameState): void {
  state.mode = 'travel';
  state.combat = null;
  resetCombatMeters(state.player);
}

/** Per-tick combat lifecycle. Combat is ONE state: it exists whenever the player is
 *  alive and in fight mode. There is no separate practice mode and no auto-exit — you
 *  leave only via exitFight(). The Chill/Warning/Combat distinction is derived for the
 *  HUD, not stored here. The combat object (and its ring) persists across target
 *  changes; only the word tier/prompt update when a tougher mob engages. */
export function syncCombat(state: GameState): void {
  if (state.mode !== 'fight' || state.player.dead) { state.combat = null; return; }
  let tier = 0;
  for (const m of state.mobs)
    if (m.state === 'aggro' && MOBS[m.defId].tier > tier) tier = MOBS[m.defId].tier;
  const t = (tier || CHILL_FALLBACK_TIER) as Tier;

  if (!state.combat) {
    state.combat = { prompt: promptFor(state, t), typed: 0, tier: t, errorFlash: 0 };
  } else if (t > state.combat.tier) { // a tougher mob engaged — harder words (never downgrade mid-prompt)
    state.combat.tier = t;
    newPrompt(state);
  }
}

/** Advance the in-combat meters one tick: ring idle-decay (equipped weapon after its
 *  decayDelay; unequipped weapons decay unconditionally in the background), the
 *  movement-driven growth sources, and the streak's idle decay. Typing
 *  (resolveKeystroke) resets typingIdle. */
export function stepCombatMeters(state: GameState, dt: number): void {
  const p = state.player;
  if (state.mode !== 'fight' || p.dead) return;
  p.typingIdle += dt;
  const key = weaponRingKey(p);
  const cfg = ringConfigFor(key);
  // growth sources tied to movement (rates default 0 — pure config seams).
  // In fight, movement only happens while the combat-modifier is held.
  const moving = state.held.length > 0 && state.travelUnlocked;
  let r = p.attackRanges[key] ?? cfg.min;
  r += (moving ? cfg.growth.whileMoving : cfg.growth.whileStationary) * dt;
  if (p.typingIdle >= cfg.decayDelay) r -= cfg.decayPerSec * dt;
  p.attackRanges[key] = Math.min(Math.max(r, cfg.min), cfg.max);
  for (const k of Object.keys(p.attackRanges)) { // unequipped rings keep decaying
    if (k === key) continue;
    const c2 = ringConfigFor(k);
    p.attackRanges[k] = Math.max((p.attackRanges[k] ?? c2.min) - c2.decayPerSec * dt, c2.min);
  }
  if (p.streak > 0 && p.typingIdle >= STREAK_IDLE_DECAY_DELAY)
    p.streak = Math.max(0, p.streak - STREAK_IDLE_DECAY_PER_SEC * dt);
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
  p.typingIdle = 0; // any keystroke counts as activity → pauses the idle decays
  const cfg = ringConfigFor(weaponRingKey(p));
  if (ch === c.prompt[c.typed]) {
    c.typed++;
    if (cfg.growth.onCorrectType) setRing(p, currentRing(p) + cfg.growth.onCorrectType);
    const dmg = typingDamage(p);
    const pp = playerWorldPos(p);
    // Attack EVERY mob inside the ring (not just aggroed ones). damageMob itself
    // aggro-pulls the victim + pack (aggro ← damage attempt, the single rule).
    // Snapshot first so killMob's splice is safe.
    const r = currentRing(p);
    const targets = state.mobs.filter((m) => dist(m.pos, pp) <= r);
    let anyHit = false;
    for (const m of targets) if (damageMob(state, m, dmg)) anyHit = true;
    if (anyHit && cfg.growth.onHit) setRing(p, currentRing(p) + cfg.growth.onHit);
    // Streak: grows per STREAK_GROWTH config (attempt vs landed hit); with nothing
    // there to attack it FREEZES — only a typo zeroes it (decision 2026-07-19).
    if (STREAK_GROWTH === 'onAttempt' ? targets.length > 0 : anyHit) p.streak += 1;
    if (state.combat && c.typed >= c.prompt.length) completePrompt(state, aggroed(state));
  } else {
    setRing(p, currentRing(p) * (1 - cfg.dropOnMiss)); // a miss shrinks the ring
    typo(state);
  }
}

// `ag` is the keystroke's aggro snapshot: mobs killed by the damage loop have
// shield=false (shielded mobs are unkillable), so the shield passes see the
// same set a fresh filter would.
function completePrompt(state: GameState, ag: Mob[]): void {
  const p = state.player;
  const c = state.combat!;
  // A completed prompt regenerates mana AND HP (HP scaled by tier).
  // See PROMPT_HP_REWARD_PER_TIER for the PvP caveat.
  p.mp = Math.min(p.mp + PROMPT_MP_REWARD, maxMp(p));
  p.hp = Math.min(p.hp + c.tier * PROMPT_HP_REWARD_PER_TIER, maxHp(p));
  for (const m of ag) {
    if (m.shield) { // a full prompt without typos breaks the boss shield
      m.shield = false;
      state.fx.push({ kind: 'shieldbreak', pos: { ...m.pos } });
    }
  }
  newPrompt(state);
}

/** A typo deals no damage "out of nowhere" — instead it TRIGGERS the on-miss special
 *  of every mob that is targeting the player AND has them inside its own attackRange.
 *  Each triggered mob schedules its blow after a small jitter (lands in mobAttackStep)
 *  and starts its per-mob cooldown, which is what absorbs typo spam (decision 2026-07-19). */
function typo(state: GameState): void {
  const c = state.combat!;
  state.player.streak = 0; // the ONE thing that zeroes the streak instantly
  c.errorFlash = 0.3;
  const pp = playerWorldPos(state.player);
  let shieldedBoss = false;
  for (const m of state.mobs) {
    if (m.state !== 'aggro' || m.target !== 'player') continue;
    if (m.shield) shieldedBoss = true;
    const def = MOBS[m.defId];
    if (!def.onMiss) continue;
    if (m.onMissCd > 0 || m.pendingOnMiss !== null) continue; // cooldown absorbs spam
    if (dist(m.pos, pp) > def.attackRange) continue;          // out of ITS reach → no punishment
    m.pendingOnMiss = MOB_ONMISS_JITTER_MIN
      + mobPhase(m.id, state.tick) * (MOB_ONMISS_JITTER_MAX - MOB_ONMISS_JITTER_MIN);
    m.onMissCd = def.onMiss.cooldown;
  }
  if (shieldedBoss && state.combat) newPrompt(state); // flawless phase restarts
}

/** Mob offense, ticked every frame independent of typing: scheduled on-miss specials
 *  land after their jitter, and periodic physical/magical channels blow while the
 *  target sits inside the mob's attackRange. ALL damage flows through hurtPlayer
 *  (the one choke point — godmode + deterministic RNG). */
export function mobAttackStep(state: GameState, dt: number): void {
  const p = state.player;
  if (p.dead) {
    // Death cancels every scheduled attack — no post-respawn ghost volleys.
    for (const m of state.mobs) m.pendingOnMiss = null;
    return;
  }
  const pp = playerWorldPos(p);
  for (const m of state.mobs) {
    if (m.onMissCd > 0) m.onMissCd = Math.max(0, m.onMissCd - dt);
    if (m.state !== 'aggro' || m.target !== 'player') { m.pendingOnMiss = null; continue; }
    const def = MOBS[m.defId];
    if (m.pendingOnMiss !== null) {
      m.pendingOnMiss -= dt;
      if (m.pendingOnMiss <= 0) {
        m.pendingOnMiss = null;
        if (def.onMiss) {
          let raw = def.onMiss.damage;
          if (def.boss && m.hp <= def.hp * BOSS_ENRAGE_HP) raw = Math.round(raw * BOSS_ENRAGE_TYPO_MULT);
          hurtPlayer(state, mitigatePlayerDamage(state, raw, def.onMiss.kind));
        }
      }
    }
    if (!def.attacks || dist(m.pos, pp) > def.attackRange) continue; // channels tick only in range
    const phys = def.attacks.physical;
    if (phys) {
      m.physT -= dt;
      if (m.physT <= 0) {
        m.physT += phys.period;
        hurtPlayer(state, mitigatePlayerDamage(state, phys.damage, 'physical'));
      }
    }
    const mag = def.attacks.magical;
    if (mag) {
      m.magT -= dt;
      if (m.magT <= 0) {
        m.magT += mag.period;
        hurtPlayer(state, mitigatePlayerDamage(state, mag.damage, 'magical'));
      }
    }
  }
}

/** Returns true when hp damage actually landed (false on shield-block / dodge) —
 *  the 'onHit' streak/ring growth sources key off this. */
export function damageMob(state: GameState, m: Mob, dmg: number): boolean {
  // aggro ← damage ATTEMPT: the mob (and its pack) turns on you even when the hit
  // is then shield-blocked or dodged. The only other aggro source is the proximity
  // check in mobStep (aggressive mobs). Decision 2026-07-19.
  if (m.state !== 'aggro') aggroMob(state, m);
  if (m.shield) return false;
  const def = MOBS[m.defId];
  // Mob-side mitigation of the player's hit: dodge% shows a floating "block" and
  // deals nothing; percentage defense softens what lands (same K-formula as the
  // player's). rand() is consumed ONLY for mobs that actually have dodge, so
  // zero-dodge fights keep the pre-rework RNG stream.
  if (def.dodge && rand(state) * 100 < def.dodge) {
    state.fx.push({ kind: 'block', pos: { ...m.pos } });
    return false;
  }
  if (def.defense) dmg = Math.max(1, Math.round(dmg * DEFENSE_K / (DEFENSE_K + def.defense)));
  m.hp -= dmg;
  state.fx.push({ kind: 'dmg', pos: { ...m.pos }, value: dmg });
  if (m.hp <= 0) { killMob(state, m); return true; }
  if (def.boss && !m.shield) {
    const at = BOSS_SHIELD_AT[m.shieldsUsed];
    if (at !== undefined && m.hp / def.hp <= at) {
      m.shield = true;
      m.shieldsUsed++;
      newPrompt(state); // fresh phrase for the flawless phase
    }
  }
  return true;
}

function killMob(state: GameState, m: Mob): void {
  const def = MOBS[m.defId];
  state.mobs.splice(state.mobs.indexOf(m), 1);
  state.spots[m.spotIdx].pending.push(respawnDelayFor(def));
  if (def.xp > 0) { // training targets (xp 0) grant nothing and skip the floating XP number
    state.fx.push({ kind: 'xp', pos: { ...m.pos }, value: def.xp });
    grantXp(state, def.xp);
  }
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
  // rng-consuming mitigatePlayerDamage argument still advances state.rng identically on/off —
  // keeping loot rolls seed-deterministic.
  if (p.dead || dmg <= 0 || p.godmode) return;
  p.hp -= dmg;
  state.fx.push({ kind: 'hurt', pos: { ...playerWorldPos(p) }, value: dmg });
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    state.combat = null;
    for (const m of state.mobs) {
      if (m.state === 'aggro') m.state = 'leash';
      m.target = null;
      m.pendingOnMiss = null; // death cancels scheduled attacks — no post-respawn volleys
    }
    resetCombatMeters(p); // death is an exit — all in-combat meters reset
    state.fx.push({ kind: 'death' });
  }
}

export function tryUltimate(state: GameState): void {
  const c = state.combat;
  const p = state.player;
  if (!c || p.dead || p.ultCooldown > 0) return;
  // Need a real target: something aggroed or already inside the ring. Otherwise the
  // ult would whiff and waste mana (streak can linger at threshold after a clear).
  if (!targetInRange(state) && !state.mobs.some((m) => m.state === 'aggro')) return;
  const ult = classOf(p).ult;
  if (p.streak < ult.streakThreshold || p.mp < ult.manaCost) return;
  p.mp -= ult.manaCost;
  p.ultCooldown = ult.cooldown;
  const pp = playerWorldPos(p);
  const r = currentRing(p) * ULT_RADIUS_MULT;
  // Every ult id currently resolves to the Whirlwind effect; per-class
  // effects switch on classOf(p).ult.id here when the other classes land.
  const targets = state.mobs.filter((m) => dist(m.pos, pp) <= r);
  for (const m of targets) damageMob(state, m, ULT_DAMAGE); // damageMob aggro-pulls
  state.fx.push({ kind: 'ult', pos: { ...pp }, radius: r });
}
