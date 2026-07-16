// Stats & attributes: the RPG layer between class base numbers (classes.ts)
// and allocatable stat points (VIT/INT/STR/DEX). Pure config + derivation,
// no simulation state mutation here — sim.ts owns granting/spending points.
import { CLASSES } from './classes';
import {
  ATK_PER_POINT, BOW_BASE_CHARS_PER_ARROW, MOVE_PER_POINT,
  PHYS_DAMAGE_SCALE, PLAYER_SPEED, WEAPON_ILVL_DMG,
} from './constants';
import { ITEMS } from './items';
import type { ClassId, EquipSlot, ItemStack, Player } from './types';
import { EQUIP_SLOTS } from './types';

export type AttributeId =
  | 'health' | 'energy' | 'defense' | 'physicalDamage' | 'magicDamage'
  | 'movementSpeed' | 'dodge' // dodge is a percent (0-100)
  | 'attackSpeed';            // drives bow tempo (fewer chars per arrow); grows with DEX + gear

export type Attributes = Record<AttributeId, number>;

export type StatId = 'VIT' | 'INT' | 'STR' | 'DEX';
export const STAT_IDS: readonly StatId[] = ['VIT', 'INT', 'STR', 'DEX'];

/** Attribute set a character has before spending any stat points, per class.
 *  health/energy come from classes.ts (single source of truth for HP/MP);
 *  the rest are new attributes this module owns. */
const CLASS_BASE_EXTRA: Record<ClassId, Omit<Attributes, 'health' | 'energy'>> = {
  warrior: { defense: 5, physicalDamage: 8, magicDamage: 1, movementSpeed: 4, dodge: 3, attackSpeed: 5 },
  ninja: { defense: 3, physicalDamage: 7, magicDamage: 1, movementSpeed: 6, dodge: 8, attackSpeed: 8 },
  wizard: { defense: 4, physicalDamage: 6, magicDamage: 5, movementSpeed: 5, dodge: 4, attackSpeed: 6 },
  priest: { defense: 2, physicalDamage: 3, magicDamage: 9, movementSpeed: 4, dodge: 3, attackSpeed: 5 },
};

/** Per-class base attribute sets, folded once at module load. Read-only —
 *  callers that need a mutable copy go through baseAttributes(). */
const BASE_ATTRS: Record<ClassId, Attributes> = Object.fromEntries(
  (Object.keys(CLASSES) as ClassId[]).map((id) => {
    const c = CLASSES[id];
    return [id, { health: c.baseHp, energy: c.baseMp, ...CLASS_BASE_EXTRA[id] }];
  }),
) as Record<ClassId, Attributes>;

export function baseAttributes(classId: ClassId): Attributes {
  return { ...BASE_ATTRS[classId] }; // fresh copy — effectiveAttributes mutates its seed
}

/** How much one point of a stat adds to each attribute, at a class's default (100%) rate. */
export const STAT_EFFECTS: Record<StatId, Partial<Attributes>> = {
  VIT: { health: 10, defense: 1 },
  INT: { energy: 8, magicDamage: 1 },
  STR: { physicalDamage: 2 },
  DEX: { physicalDamage: 1, movementSpeed: 1, dodge: 1, attackSpeed: 1 },
};

/** Per-class % modifier applied to STAT_EFFECTS (100 = unchanged, >100 = amplified, <100 = dampened).
 *  Modifiers are keyed by STAT (not attribute), so the new DEX→attackSpeed effect automatically
 *  rides each class's existing DEX modifier — no per-attribute row needed here. */
export const CLASS_STAT_MODIFIERS: Record<ClassId, Record<StatId, number>> = {
  warrior: { VIT: 120, INT: 70, STR: 120, DEX: 90 },
  ninja: { VIT: 90, INT: 80, STR: 100, DEX: 130 },
  wizard: { VIT: 100, INT: 110, STR: 110, DEX: 100 },
  priest: { VIT: 90, INT: 130, STR: 70, DEX: 100 },
};

/** Base attributes, plus spent stat points, plus equipped-gear bonuses (when given).
 *  Single source of truth for a character's real attributes — combat, maxHp/maxMp and
 *  the Character panel all read from here so they can never disagree. */
export function effectiveAttributes(
  classId: ClassId, stats: Record<StatId, number>,
  equipment?: Record<EquipSlot, ItemStack | null>,
): Attributes {
  const result = baseAttributes(classId);
  const mods = CLASS_STAT_MODIFIERS[classId];
  for (const stat of STAT_IDS) {
    const pts = stats[stat];
    if (!pts) continue;
    const mod = mods[stat] / 100;
    const effect = STAT_EFFECTS[stat];
    for (const key of Object.keys(effect) as AttributeId[])
      result[key] += (effect[key] ?? 0) * pts * mod;
  }
  if (equipment) {
    for (const slot of Object.keys(equipment) as EquipSlot[]) {
      const st = equipment[slot];
      if (!st) continue;
      const def = ITEMS[st.defId];
      if (!def) continue;
      if (def.bonuses)
        for (const key of Object.keys(def.bonuses) as AttributeId[])
          result[key] += def.bonuses[key] ?? 0;
      // the equipped weapon's power level scales its physical damage
      if (slot === 'weapon' && def.itemLevel)
        result.physicalDamage += def.itemLevel * WEAPON_ILVL_DMG;
    }
  }
  return result;
}

// --- memoized per-Player attributes -------------------------------------
// effectiveAttributes is on hot paths (regen every tick, HUD bars every frame,
// damage every keystroke) yet its inputs change only on equip/unequip/
// allocateStat/class change. Cache the fold per Player object and validate by
// content fingerprint — no invalidation hooks, so code (or tests, or future
// server paths) that mutates Player directly can never be served stale values.
// Keyed on object identity, the WeakMap scales to N players on one server
// process (one entry per player, GC'd with it) and never touches SaveData.
interface AttrCache {
  classId: ClassId;
  vit: number; int: number; str: number; dex: number;
  eqId: (string | null)[];         // per-slot defId, EQUIP_SLOTS order
  eqPlus: (number | undefined)[];  // per-slot upgrade level (+0..+9 seam)
  attrs: Attributes;
}
const attrCache = new WeakMap<Player, AttrCache>();

function cacheValid(c: AttrCache, p: Player): boolean {
  if (c.classId !== p.classId) return false;
  const s = p.stats;
  if (c.vit !== s.VIT || c.int !== s.INT || c.str !== s.STR || c.dex !== s.DEX) return false;
  for (let i = 0; i < EQUIP_SLOTS.length; i++) {
    const st = p.equipment[EQUIP_SLOTS[i]];
    if (c.eqId[i] !== (st ? st.defId : null) || c.eqPlus[i] !== st?.plus) return false;
  }
  return true;
}

/** Memoized effectiveAttributes for a live Player. The returned object is
 *  shared with the cache — treat it as READ-ONLY. Level is deliberately not
 *  fingerprinted: it only feeds the maxHp/maxMp level term, outside the fold. */
export function playerAttributes(p: Player): Attributes {
  const hit = attrCache.get(p);
  if (hit && cacheValid(hit, p)) return hit.attrs;
  const c: AttrCache = hit ?? {
    classId: p.classId, vit: 0, int: 0, str: 0, dex: 0,
    eqId: EQUIP_SLOTS.map(() => null), eqPlus: EQUIP_SLOTS.map(() => undefined),
    attrs: undefined as unknown as Attributes,
  };
  c.classId = p.classId;
  c.vit = p.stats.VIT; c.int = p.stats.INT; c.str = p.stats.STR; c.dex = p.stats.DEX;
  for (let i = 0; i < EQUIP_SLOTS.length; i++) {
    const st = p.equipment[EQUIP_SLOTS[i]];
    c.eqId[i] = st ? st.defId : null;
    c.eqPlus[i] = st?.plus;
  }
  c.attrs = effectiveAttributes(p.classId, p.stats, p.equipment);
  if (!hit) attrCache.set(p, c);
  return c.attrs;
}

/** Per-correct-char typing damage from a character's physical damage (integer, ≥1). */
export const physCharDamage = (attrs: Attributes): number =>
  Math.max(1, Math.round(attrs.physicalDamage * PHYS_DAMAGE_SCALE));

// --- per-Player derivations (kept here, not classes.ts, so they can read gear-aware
// effectiveAttributes without a classes↔attributes import cycle) ---

/** Max HP = the effective `health` attribute (class base + VIT + gear) plus level scaling.
 *  The class base is already inside `health`, so only hpPerLevel*(level-1) is added on top —
 *  at 0 stats/gear this equals the old baseHp + hpPerLevel*(level-1). */
export const maxHp = (p: Player): number =>
  playerAttributes(p).health + CLASSES[p.classId].hpPerLevel * (p.level - 1);

export const maxMp = (p: Player): number =>
  playerAttributes(p).energy + CLASSES[p.classId].mpPerLevel * (p.level - 1);

/** Effective movement speed (tiles/s): movementSpeed as a % bonus over the class's OWN
 *  baseline, so every class moves at ≈ PLAYER_SPEED with default gear (v4-3). */
export function moveSpeed(p: Player): number {
  const base = BASE_ATTRS[p.classId].movementSpeed;
  const eff = playerAttributes(p).movementSpeed;
  const factor = Math.max(0.6, Math.min(1.8, 1 + (eff - base) * MOVE_PER_POINT));
  return PLAYER_SPEED * factor;
}

/** Correct letters required per bow arrow: BOW_BASE_CHARS_PER_ARROW reduced by attackSpeed
 *  over the class baseline, clamped to [2,5]. Pure helper — bow tempo is wired in C2. */
export function arrowsPerCharsInterval(p: Player): number {
  const base = BASE_ATTRS[p.classId].attackSpeed;
  const eff = playerAttributes(p).attackSpeed;
  const chars = Math.round(BOW_BASE_CHARS_PER_ARROW - (eff - base) * ATK_PER_POINT);
  return Math.max(2, Math.min(5, chars));
}

// --- stat point progression: 1 point per 25% of the current level's XP bar ---
export const STAT_POINTS_PER_LEVEL = 4;

/** Total stat points a character should have earned by (level, xp), given xpNeeded for that level. */
export function statPointsEarned(level: number, xp: number, xpNeeded: number): number {
  const quarters = Math.min(STAT_POINTS_PER_LEVEL, Math.floor((xp / xpNeeded) * STAT_POINTS_PER_LEVEL));
  return (level - 1) * STAT_POINTS_PER_LEVEL + quarters;
}

export const emptyStats = (): Record<StatId, number> => ({ VIT: 0, INT: 0, STR: 0, DEX: 0 });
