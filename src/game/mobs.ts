// Mob definitions and the chase AI. Exp-spot clusters live on each MapDef
// (game/map.ts) — this module only reads the current map's spots.
// No pathfinding: maps are authored open, so straight-line + axis slide works.
import {
  BOSS_RESPAWN_SECONDS, LEASH_DIST, MOB_RADIUS, MOB_SEPARATION, MOB_STOP_DIST,
  PACK_LINK_RADIUS, RANGED_APPROACH_MARGIN, RESPAWN_MIN_PLAYER_DIST, RESPAWN_SECONDS,
} from './constants';
import { circleBlocked, findFreeNear, mapOf } from './map';
import type { MapDef } from './map';
import type { GameState, Mob, MobDef, Vec2 } from './types';
import { dist, playerWorldPos } from './types';

export const MOBS: Record<string, MobDef> = {
  // Permanent non-aggressive training target: never self-aggroes, grants no XP and
  // drops nothing (a pure typing practice dummy). Once damaged it fights back like
  // any mob but hits softly. speed 0 = it stays planted where it spawned.
  dummy: {
    id: 'dummy', name: 'Training Dummy', tier: 1, hp: 40, xp: 0,
    speed: 0, aggroRadius: 3, aggressive: false,
    attackRange: 1.2,
    attacks: { physical: { damage: 1, period: 3.0 } },
    onMiss: { damage: 2, kind: 'physical', cooldown: 1.5 },
    drops: [],
  },
  slime: {
    id: 'slime', name: 'Slime Whelp', tier: 1, hp: 20, xp: 10,
    speed: 1.8, aggroRadius: 3,
    attackRange: 1.2,
    attacks: { physical: { damage: 2, period: 2.5 } },
    onMiss: { damage: 3, kind: 'physical', cooldown: 1.2 },
    drops: [
      { itemId: 'slime_gel', chance: 0.6, min: 1, max: 2 },
      { itemId: 'copper_coin', chance: 0.3, min: 1, max: 1 },
      // tier-1 gear: the bow drops here so ranged combat (C2) is testable from level 1
      { itemId: 'short_bow', chance: 0.05, min: 1, max: 1 },
      { itemId: 'leather_cap', chance: 0.04, min: 1, max: 1 },
      { itemId: 'worn_boots', chance: 0.04, min: 1, max: 1 },
    ],
  },
  boar: {
    id: 'boar', name: 'Fang Boar', tier: 2, hp: 45, xp: 25,
    speed: 2.2, aggroRadius: 4,
    attackRange: 1.2,
    attacks: { physical: { damage: 4, period: 2.2 } },
    onMiss: { damage: 6, kind: 'physical', cooldown: 1.2 },
    drops: [
      { itemId: 'boar_tusk', chance: 0.5, min: 1, max: 1 },
      { itemId: 'leather_scrap', chance: 0.4, min: 1, max: 1 },
      { itemId: 'hp_potion', chance: 0.1, min: 1, max: 1 },
      // tier-1/2 gear
      { itemId: 'padded_vest', chance: 0.05, min: 1, max: 1 },
      { itemId: 'copper_amulet', chance: 0.04, min: 1, max: 1 },
      { itemId: 'bronze_ring', chance: 0.04, min: 1, max: 1 },
      { itemId: 'rusty_daggers', chance: 0.05, min: 1, max: 1 },
      { itemId: 'apprentice_wand', chance: 0.04, min: 1, max: 1 },
      { itemId: 'swift_greaves', chance: 0.04, min: 1, max: 1 },
      { itemId: 'band_of_vigor', chance: 0.04, min: 1, max: 1 },
    ],
  },
  // Ranged pack member: holds position at the edge of its attack range and fires
  // from there (the first Metin2-archer-style mob; placeholder cultist sprite).
  archer: {
    id: 'archer', name: 'Bone Archer', tier: 2, hp: 35, xp: 30,
    speed: 2.4, aggroRadius: 5,
    attackRange: 5.5,
    attacks: { physical: { damage: 4, period: 2.8 } },
    onMiss: { damage: 7, kind: 'physical', cooldown: 1.3 },
    dodge: 8,
    drops: [
      { itemId: 'leather_scrap', chance: 0.4, min: 1, max: 1 },
      { itemId: 'copper_coin', chance: 0.3, min: 1, max: 2 },
      { itemId: 'hp_potion', chance: 0.08, min: 1, max: 1 },
      { itemId: 'hunter_longbow', chance: 0.03, min: 1, max: 1 },
    ],
  },
  cultist: {
    id: 'cultist', name: 'Dark Cultist', tier: 3, hp: 80, xp: 60,
    speed: 2.0, aggroRadius: 4.5,
    attackRange: 1.4,
    attacks: { physical: { damage: 3, period: 2.5 }, magical: { damage: 5, period: 4.0 } },
    onMiss: { damage: 10, kind: 'magical', cooldown: 1.5 },
    dodge: 5,
    drops: [
      { itemId: 'dark_shard', chance: 0.45, min: 1, max: 1 },
      { itemId: 'rune_cloth', chance: 0.35, min: 1, max: 1 },
      // tier-3 gear
      { itemId: 'iron_sword', chance: 0.05, min: 1, max: 1 },
      { itemId: 'oak_staff', chance: 0.05, min: 1, max: 1 },
      { itemId: 'hunter_longbow', chance: 0.04, min: 1, max: 1 },
      { itemId: 'iron_mail', chance: 0.05, min: 1, max: 1 },
      { itemId: 'iron_helm', chance: 0.05, min: 1, max: 1 },
      { itemId: 'warded_pendant', chance: 0.04, min: 1, max: 1 },
      // tier-4 gear: rare drops off the toughest farmable mob (boss keeps the rest)
      { itemId: 'war_greatsword', chance: 0.02, min: 1, max: 1 },
      { itemId: 'shadow_daggers', chance: 0.02, min: 1, max: 1 },
      { itemId: 'forbidden_grimoire', chance: 0.02, min: 1, max: 1 },
      { itemId: 'dragon_plate', chance: 0.02, min: 1, max: 1 },
      { itemId: 'rune_hood', chance: 0.02, min: 1, max: 1 },
      { itemId: 'boots_of_haste', chance: 0.02, min: 1, max: 1 },
      { itemId: 'typhon_charm', chance: 0.02, min: 1, max: 1 },
      { itemId: 'ring_of_the_viper', chance: 0.02, min: 1, max: 1 },
    ],
  },
  typhon: {
    id: 'typhon', name: 'Typhon, Word-Eater', tier: 4, hp: 400, xp: 500,
    speed: 1.6, aggroRadius: 6, boss: true,
    attackRange: 1.8,
    attacks: { physical: { damage: 8, period: 2.0 }, magical: { damage: 12, period: 5.0 } },
    onMiss: { damage: 15, kind: 'magical', cooldown: 1.0 },
    defense: 10,
    drops: [
      { itemId: 'typhon_horn', chance: 1, min: 1, max: 1 },
      { itemId: 'claymore', chance: 1, min: 1, max: 1 },
      { itemId: 'dark_shard', chance: 1, min: 3, max: 3 },
    ],
  },

  // --- Elderwood natives (map 2) ---
  // Fast, fragile pack hunter — bites often, dodges a bit.
  wolf: {
    id: 'wolf', name: 'Elderwood Wolf', tier: 2, hp: 30, xp: 22,
    speed: 3.0, aggroRadius: 5,
    attackRange: 1.1,
    attacks: { physical: { damage: 3, period: 1.6 } },
    onMiss: { damage: 5, kind: 'physical', cooldown: 1.0 },
    dodge: 6,
    drops: [
      { itemId: 'wolf_pelt', chance: 0.5, min: 1, max: 1 },
      { itemId: 'leather_scrap', chance: 0.3, min: 1, max: 1 },
      { itemId: 'copper_coin', chance: 0.3, min: 1, max: 2 },
      { itemId: 'hp_potion', chance: 0.06, min: 1, max: 1 },
      { itemId: 'swift_greaves', chance: 0.03, min: 1, max: 1 },
    ],
  },
  // Docile mushroom-folk — never starts a fight, sulks with spores when hit.
  sporeling: {
    id: 'sporeling', name: 'Sporeling', tier: 1, hp: 18, xp: 8,
    speed: 1.2, aggroRadius: 2.5, aggressive: false,
    attackRange: 1.1,
    attacks: { physical: { damage: 2, period: 3.0 } },
    onMiss: { damage: 3, kind: 'magical', cooldown: 1.5 },
    drops: [
      { itemId: 'spore_dust', chance: 0.6, min: 1, max: 2 },
      { itemId: 'slime_gel', chance: 0.2, min: 1, max: 1 },
    ],
  },
  // Ranged thorn-lobber: holds the edge of its long attack range like the archer.
  thornspitter: {
    id: 'thornspitter', name: 'Thornspitter', tier: 3, hp: 55, xp: 70,
    speed: 1.8, aggroRadius: 5.5,
    attackRange: 6,
    attacks: { magical: { damage: 6, period: 3.2 } },
    onMiss: { damage: 9, kind: 'magical', cooldown: 1.4 },
    dodge: 4,
    drops: [
      { itemId: 'ancient_bark', chance: 0.4, min: 1, max: 1 },
      { itemId: 'dark_shard', chance: 0.15, min: 1, max: 1 },
      { itemId: 'oak_staff', chance: 0.04, min: 1, max: 1 },
      { itemId: 'apprentice_wand', chance: 0.04, min: 1, max: 1 },
    ],
  },
  // Slow bark tank — heavy blows, heavy armor; the wall you type through.
  treant: {
    id: 'treant', name: 'Gnarled Treant', tier: 3, hp: 140, xp: 110,
    speed: 1.1, aggroRadius: 4,
    attackRange: 1.6,
    attacks: { physical: { damage: 9, period: 3.5 } },
    onMiss: { damage: 12, kind: 'physical', cooldown: 1.8 },
    defense: 25,
    drops: [
      { itemId: 'ancient_bark', chance: 0.8, min: 1, max: 2 },
      { itemId: 'rune_cloth', chance: 0.25, min: 1, max: 1 },
      { itemId: 'iron_mail', chance: 0.04, min: 1, max: 1 },
      { itemId: 'oak_staff', chance: 0.03, min: 1, max: 1 },
    ],
  },
  // Animated boulder — the heaviest armor in the game; chip it down patiently.
  stone_golem: {
    id: 'stone_golem', name: 'Stone Golem', tier: 3, hp: 160, xp: 130,
    speed: 0.9, aggroRadius: 3.5,
    attackRange: 1.5,
    attacks: { physical: { damage: 10, period: 3.2 } },
    onMiss: { damage: 12, kind: 'physical', cooldown: 1.6 },
    defense: 30,
    drops: [
      { itemId: 'dark_shard', chance: 0.3, min: 1, max: 1 },
      { itemId: 'copper_coin', chance: 0.5, min: 2, max: 4 },
      { itemId: 'iron_helm', chance: 0.04, min: 1, max: 1 },
      { itemId: 'iron_mail', chance: 0.03, min: 1, max: 1 },
    ],
  },
  // The Elderwood's boss: shield phases like Typhon, hits in two elements.
  rootfather: {
    id: 'rootfather', name: 'The Rootfather', tier: 4, hp: 550, xp: 800,
    speed: 1.4, aggroRadius: 7, boss: true,
    attackRange: 2.0,
    attacks: { physical: { damage: 10, period: 2.2 }, magical: { damage: 14, period: 4.5 } },
    onMiss: { damage: 18, kind: 'magical', cooldown: 1.0 },
    defense: 15, dodge: 3,
    drops: [
      { itemId: 'rootfather_heart', chance: 1, min: 1, max: 1 },
      { itemId: 'forbidden_grimoire', chance: 1, min: 1, max: 1 },
      { itemId: 'ancient_bark', chance: 1, min: 4, max: 4 },
      { itemId: 'dragon_plate', chance: 0.5, min: 1, max: 1 },
    ],
  },
};

export function spawnMob(state: GameState, spotIdx: number): void {
  const map = mapOf(state);
  const spot = map.spots[spotIdx];
  const pos = findFreeNear(state, map, spot.center, spot.radius);
  state.mobs.push({
    id: state.nextId++, defId: spot.defId, pos: { ...pos }, hp: MOBS[spot.defId].hp,
    state: 'idle', spotIdx, home: { ...pos }, shield: false, shieldsUsed: 0,
    target: null, physT: 0, magT: 0, onMissCd: 0, pendingOnMiss: null,
  });
}

/** Deterministic per-mob pseudo-random in [0,1): a cheap hash of the mob id (+salt).
 *  Used for attack-timer phases and on-miss jitter so a pack desyncs naturally WITHOUT
 *  consuming state.rng — combat timing must never shift the seeded loot rolls. */
export function mobPhase(id: number, salt = 0): number {
  const x = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function initMobs(state: GameState): void {
  mapOf(state).spots.forEach((s, i) => { for (let k = 0; k < s.count; k++) spawnMob(state, i); });
}

/** Aggro a mob and pack-link its nearby spot-mates (chain pull, Metin2-style).
 *  The ONLY callers are damageMob (aggro ← damage attempt) and the proximity check in
 *  mobStep (aggressive mobs only) — never add other aggro sources (decision 2026-07-19). */
export function aggroMob(state: GameState, m: Mob): void {
  const queue = [m];
  while (queue.length) {
    const cur = queue.pop()!;
    if (cur.state === 'aggro') continue;
    cur.state = 'aggro';
    cur.target = 'player';
    // Phase-jitter the periodic attack timers so a freshly pulled pack doesn't
    // synchronize into one frame-slam (decision 2026-07-19; hash, not rng).
    const def = MOBS[cur.defId];
    if (def.attacks?.physical) cur.physT = def.attacks.physical.period * mobPhase(cur.id);
    if (def.attacks?.magical) cur.magT = def.attacks.magical.period * mobPhase(cur.id, 1);
    for (const o of state.mobs)
      if (o.state === 'idle' && o.spotIdx === cur.spotIdx && dist(o.pos, cur.pos) <= PACK_LINK_RADIUS)
        queue.push(o);
  }
}

export function mobStep(state: GameState, dt: number): void {
  const pp = playerWorldPos(state.player);
  const map = mapOf(state);
  for (const m of state.mobs) {
    const def = MOBS[m.defId];
    if (m.state === 'idle') {
      // Passive mobs (aggressive === false) never self-aggro — they can only be pulled.
      if (!state.player.dead && def.aggressive !== false && dist(m.pos, pp) <= def.aggroRadius) aggroMob(state, m);
    } else if (m.state === 'aggro') {
      if (state.player.dead || dist(m.pos, m.home) > LEASH_DIST) {
        m.state = 'leash'; m.target = null; m.pendingOnMiss = null;
        continue;
      }
      // Ranged mobs hold position just inside their own attack range; melee
      // attackRanges fall below MOB_STOP_DIST so they close in as before.
      const stopAt = Math.max(MOB_STOP_DIST, def.attackRange - RANGED_APPROACH_MARGIN);
      if (dist(m.pos, pp) > stopAt) moveToward(map, m, pp, def.speed * dt);
    } else { // leash: run home, heal, forget (including boss phase state)
      if (dist(m.pos, m.home) < 0.15) {
        m.state = 'idle'; m.hp = def.hp; m.pos = { ...m.home };
        m.shield = false; m.shieldsUsed = 0;
      } else moveToward(map, m, m.home, def.speed * 1.5 * dt);
    }
  }
  separate(map, state.mobs);
}

function moveToward(map: MapDef, m: Mob, target: Vec2, step: number): void {
  const dx = target.x - m.pos.x, dy = target.y - m.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = m.pos.x + (dx / len) * step;
  const ny = m.pos.y + (dy / len) * step;
  if (!circleBlocked(map, nx, m.pos.y, MOB_RADIUS)) m.pos.x = nx; // axis-separated slide
  if (!circleBlocked(map, m.pos.x, ny, MOB_RADIUS)) m.pos.y = ny;
}

/** Soft pairwise push so packs don't collapse into one point.
 *  O(n²) over all mobs — fine at today's ~28 per map (squared-distance early
 *  exit keeps the constant small). If MMO-scale zones raise mob counts,
 *  replace the broad phase with a coarse spatial hash (~1-tile buckets
 *  rebuilt per tick, comparing neighboring buckets only). */
function separate(map: MapDef, mobs: Mob[]): void {
  const minSq = MOB_SEPARATION * MOB_SEPARATION;
  for (let i = 0; i < mobs.length; i++) {
    for (let j = i + 1; j < mobs.length; j++) {
      const a = mobs[i], b = mobs[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= 1e-12 || dSq >= minSq) continue; // sqrt only for real overlaps
      const d = Math.sqrt(dSq);
      const push = (MOB_SEPARATION - d) / 2 / d;
      const ax = a.pos.x - dx * push, ay = a.pos.y - dy * push;
      const bx = b.pos.x + dx * push, by = b.pos.y + dy * push;
      if (!circleBlocked(map, ax, ay, MOB_RADIUS)) { a.pos.x = ax; a.pos.y = ay; }
      if (!circleBlocked(map, bx, by, MOB_RADIUS)) { b.pos.x = bx; b.pos.y = by; }
    }
  }
}

/** Tick spot respawn timers; hold the respawn while the player camps the spot. */
export function respawnStep(state: GameState, dt: number): void {
  const pp = playerWorldPos(state.player);
  const spots = mapOf(state).spots;
  state.spots.forEach((spot, i) => {
    for (let k = spot.pending.length - 1; k >= 0; k--) {
      spot.pending[k] -= dt;
      if (spot.pending[k] <= 0 && dist(spots[i].center, pp) > RESPAWN_MIN_PLAYER_DIST) {
        spot.pending.splice(k, 1);
        spawnMob(state, i);
      }
    }
  });
}

export const respawnDelayFor = (def: MobDef): number =>
  def.boss ? BOSS_RESPAWN_SECONDS : RESPAWN_SECONDS;
