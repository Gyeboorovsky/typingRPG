// Painted-map mob GROUPS: a global registry of group compositions (referenced by
// index from the ink registry) and the runtime spawner. A painted group pixel is
// a POSSIBLE spawn site; per map, at most `maxAlive` instances of a group live at
// once and a new one spawns at a random FREE site every `respawnSeconds` — so
// packs pop up in varying places instead of camping fixed stands.
import { findFreeNear, mapOf } from './map';
import { MOBS } from './mobs';
import { rand } from './rng';
import type { GameState } from './types';

export interface GroupMember { defId: string; count: number }
export interface GroupDef { id: string; members: GroupMember[] }

/** Index here = the G channel of a (0,G,255) marker pixel. NEVER reorder — only
 *  append — or painted maps silently change their populations. */
export const GROUPS: GroupDef[] = [
  { id: 'boar_pack', members: [{ defId: 'boar', count: 2 }, { defId: 'archer', count: 1 }] }, // G=0
  { id: 'slime_drift', members: [{ defId: 'slime', count: 3 }] },                             // G=1
  { id: 'wolf_hunt', members: [{ defId: 'wolf', count: 3 }, { defId: 'thornspitter', count: 1 }] }, // G=2
  { id: 'cellar_watch', members: [{ defId: 'cultist', count: 2 }, { defId: 'stone_golem', count: 1 }] }, // G=3
];

/** Encode a group instance into Mob.spotIdx-compatible NEGATIVE ids so the
 *  existing pack-link (spotIdx equality) works within an instance while killMob
 *  knows not to queue a spot respawn (groups respawn via their own cooldown). */
const groupSpotId = (defIdx: number, siteIdx: number): number => -(1 + defIdx * 1024 + siteIdx);

/** Which sites of map-group `defIdx` are occupied by a LIVING instance. An
 *  instance = the mobs spawned at one site; it holds its site until the last of
 *  them dies (leashed/idle survivors still count — the pack is alive). */
function occupiedSites(state: GameState, defIdx: number, siteCount: number): boolean[] {
  const occ = new Array<boolean>(siteCount).fill(false);
  for (const m of state.mobs) {
    if (m.groupDef === defIdx && m.groupSite !== undefined && m.groupSite < siteCount)
      occ[m.groupSite] = true;
  }
  return occ;
}

function spawnGroupInstance(state: GameState, defIdx: number, siteIdx: number): void {
  const map = mapOf(state);
  const g = map.groups![defIdx];
  const def = GROUPS[g.groupIdx];
  if (!def) return; // unknown group index — compiler lints this; fail safe at runtime
  const site = g.sites[siteIdx];
  for (const member of def.members) {
    for (let k = 0; k < member.count; k++) {
      if (!MOBS[member.defId]) continue;
      const pos = findFreeNear(state, map, site, 1.5);
      state.mobs.push({
        id: state.nextId++, defId: member.defId, pos: { ...pos }, hp: MOBS[member.defId].hp,
        state: 'idle', spotIdx: groupSpotId(defIdx, siteIdx), home: { ...pos },
        shield: false, shieldsUsed: 0,
        target: null, physT: 0, magT: 0, onMissCd: 0, pendingOnMiss: null,
        groupDef: defIdx, groupSite: siteIdx,
      });
    }
  }
}

/** Fill every group up to maxAlive immediately — map entry starts populated. */
export function initGroups(state: GameState): void {
  const groups = mapOf(state).groups;
  state.groupCd = groups ? groups.map((g) => g.respawnSeconds) : [];
  if (!groups) return;
  groups.forEach((g, defIdx) => {
    const occ = occupiedSites(state, defIdx, g.sites.length);
    let alive = occ.filter(Boolean).length;
    for (let siteIdx = 0; siteIdx < g.sites.length && alive < g.maxAlive; siteIdx++) {
      if (occ[siteIdx]) continue;
      spawnGroupInstance(state, defIdx, siteIdx);
      alive++;
    }
  });
}

/** Per-tick group respawn: when below maxAlive and off cooldown, spawn one new
 *  instance at a RANDOM free site (state.rng — deterministic per seed). */
export function groupStep(state: GameState, dt: number): void {
  const groups = mapOf(state).groups;
  if (!groups) return;
  groups.forEach((g, defIdx) => {
    if (state.groupCd[defIdx] > 0) { state.groupCd[defIdx] -= dt; return; }
    const occ = occupiedSites(state, defIdx, g.sites.length);
    const alive = occ.filter(Boolean).length;
    if (alive >= g.maxAlive) return; // full — stay ready (no cooldown reset)
    const free: number[] = [];
    for (let i = 0; i < occ.length; i++) if (!occ[i]) free.push(i);
    if (free.length === 0) return;
    spawnGroupInstance(state, defIdx, free[Math.floor(rand(state) * free.length)]);
    state.groupCd[defIdx] = g.respawnSeconds;
  });
}
