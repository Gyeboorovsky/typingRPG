// Mob definitions, Metin2-style exp-spot clusters, and the chase AI.
// No pathfinding: the map is authored open, so straight-line + axis slide works.
import {
  BOSS_RESPAWN_SECONDS, LEASH_DIST, MOB_RADIUS, MOB_SEPARATION, MOB_STOP_DIST,
  PACK_LINK_RADIUS, RESPAWN_MIN_PLAYER_DIST, RESPAWN_SECONDS,
} from './constants';
import { circleBlocked, findFreeNear } from './map';
import type { GameState, Mob, MobDef, SpawnSpot, Vec2 } from './types';
import { dist, playerWorldPos } from './types';

export const MOBS: Record<string, MobDef> = {
  slime: {
    id: 'slime', name: 'Slime Whelp', tier: 1, hp: 20, typoDamage: 3, xp: 10,
    speed: 1.8, aggroRadius: 3,
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
    id: 'boar', name: 'Fang Boar', tier: 2, hp: 45, typoDamage: 6, xp: 25,
    speed: 2.2, aggroRadius: 4,
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
  cultist: {
    id: 'cultist', name: 'Dark Cultist', tier: 3, hp: 80, typoDamage: 10, xp: 60,
    speed: 2.0, aggroRadius: 4.5,
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
    id: 'typhon', name: 'Typhon, Word-Eater', tier: 4, hp: 400, typoDamage: 15, xp: 500,
    speed: 1.6, aggroRadius: 6, boss: true,
    drops: [
      { itemId: 'typhon_horn', chance: 1, min: 1, max: 1 },
      { itemId: 'claymore', chance: 1, min: 1, max: 1 },
      { itemId: 'dark_shard', chance: 1, min: 3, max: 3 },
    ],
  },
};

export const SPOTS: SpawnSpot[] = [
  { defId: 'slime', center: { x: 15, y: 33 }, count: 5, radius: 2.5 },
  { defId: 'slime', center: { x: 31, y: 33 }, count: 5, radius: 2.5 },
  { defId: 'slime', center: { x: 23, y: 27 }, count: 5, radius: 2.5 },
  { defId: 'boar', center: { x: 11, y: 20 }, count: 4, radius: 2.5 },
  { defId: 'boar', center: { x: 36, y: 21 }, count: 4, radius: 2.5 },
  { defId: 'cultist', center: { x: 24, y: 13 }, count: 4, radius: 2.5 },
  { defId: 'typhon', center: { x: 24, y: 5 }, count: 1, radius: 0.5 },
];

export function spawnMob(state: GameState, spotIdx: number): void {
  const spot = SPOTS[spotIdx];
  const pos = findFreeNear(state, spot.center, spot.radius);
  state.mobs.push({
    id: state.nextId++, defId: spot.defId, pos: { ...pos }, hp: MOBS[spot.defId].hp,
    state: 'idle', spotIdx, home: { ...pos }, shield: false, shieldsUsed: 0,
  });
}

export function initMobs(state: GameState): void {
  SPOTS.forEach((s, i) => { for (let k = 0; k < s.count; k++) spawnMob(state, i); });
}

/** Aggro a mob and pack-link its nearby spot-mates (chain pull, Metin2-style). */
export function aggroMob(state: GameState, m: Mob): void {
  const queue = [m];
  while (queue.length) {
    const cur = queue.pop()!;
    if (cur.state === 'aggro') continue;
    cur.state = 'aggro';
    for (const o of state.mobs)
      if (o.state === 'idle' && o.spotIdx === cur.spotIdx && dist(o.pos, cur.pos) <= PACK_LINK_RADIUS)
        queue.push(o);
  }
}

export function mobStep(state: GameState, dt: number): void {
  const pp = playerWorldPos(state.player);
  for (const m of state.mobs) {
    const def = MOBS[m.defId];
    if (m.state === 'idle') {
      if (!state.player.dead && dist(m.pos, pp) <= def.aggroRadius) aggroMob(state, m);
    } else if (m.state === 'aggro') {
      if (state.player.dead || dist(m.pos, m.home) > LEASH_DIST) { m.state = 'leash'; continue; }
      if (dist(m.pos, pp) > MOB_STOP_DIST) moveToward(m, pp, def.speed * dt);
    } else { // leash: run home, heal, forget (including boss phase state)
      if (dist(m.pos, m.home) < 0.15) {
        m.state = 'idle'; m.hp = def.hp; m.pos = { ...m.home };
        m.shield = false; m.shieldsUsed = 0;
      } else moveToward(m, m.home, def.speed * 1.5 * dt);
    }
  }
  separate(state.mobs);
}

function moveToward(m: Mob, target: Vec2, step: number): void {
  const dx = target.x - m.pos.x, dy = target.y - m.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = m.pos.x + (dx / len) * step;
  const ny = m.pos.y + (dy / len) * step;
  if (!circleBlocked(nx, m.pos.y, MOB_RADIUS)) m.pos.x = nx; // axis-separated slide
  if (!circleBlocked(m.pos.x, ny, MOB_RADIUS)) m.pos.y = ny;
}

/** Soft pairwise push so packs don't collapse into one point. */
function separate(mobs: Mob[]): void {
  for (let i = 0; i < mobs.length; i++) {
    for (let j = i + 1; j < mobs.length; j++) {
      const a = mobs[i], b = mobs[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= 1e-6 || d >= MOB_SEPARATION) continue;
      const push = (MOB_SEPARATION - d) / 2 / d;
      const ax = a.pos.x - dx * push, ay = a.pos.y - dy * push;
      const bx = b.pos.x + dx * push, by = b.pos.y + dy * push;
      if (!circleBlocked(ax, ay, MOB_RADIUS)) { a.pos.x = ax; a.pos.y = ay; }
      if (!circleBlocked(bx, by, MOB_RADIUS)) { b.pos.x = bx; b.pos.y = by; }
    }
  }
}

/** Tick spot respawn timers; hold the respawn while the player camps the spot. */
export function respawnStep(state: GameState, dt: number): void {
  const pp = playerWorldPos(state.player);
  state.spots.forEach((spot, i) => {
    for (let k = spot.pending.length - 1; k >= 0; k--) {
      spot.pending[k] -= dt;
      if (spot.pending[k] <= 0 && dist(SPOTS[i].center, pp) > RESPAWN_MIN_PLAYER_DIST) {
        spot.pending.splice(k, 1);
        spawnMob(state, i);
      }
    }
  });
}

export const respawnDelayFor = (def: MobDef): number =>
  def.boss ? BOSS_RESPAWN_SECONDS : RESPAWN_SECONDS;
