// Stats & attributes: the RPG layer between class base numbers (classes.ts)
// and allocatable stat points (VIT/INT/STR/DEX). Pure config + derivation,
// no simulation state mutation here — sim.ts owns granting/spending points.
import { CLASSES } from './classes';
import type { ClassId } from './types';

export type AttributeId =
  | 'health' | 'energy' | 'defense' | 'physicalDamage' | 'magicDamage'
  | 'movementSpeed' | 'dodge'; // dodge is a percent (0-100)

export type Attributes = Record<AttributeId, number>;

export type StatId = 'VIT' | 'INT' | 'STR' | 'DEX';
export const STAT_IDS: readonly StatId[] = ['VIT', 'INT', 'STR', 'DEX'];

/** Attribute set a character has before spending any stat points, per class.
 *  health/energy come from classes.ts (single source of truth for HP/MP);
 *  the rest are new attributes this module owns. */
const CLASS_BASE_EXTRA: Record<ClassId, Omit<Attributes, 'health' | 'energy'>> = {
  warrior: { defense: 5, physicalDamage: 8, magicDamage: 1, movementSpeed: 4, dodge: 3 },
  ninja: { defense: 3, physicalDamage: 7, magicDamage: 1, movementSpeed: 6, dodge: 8 },
  wizard: { defense: 4, physicalDamage: 6, magicDamage: 5, movementSpeed: 5, dodge: 4 },
  priest: { defense: 2, physicalDamage: 3, magicDamage: 9, movementSpeed: 4, dodge: 3 },
};

export function baseAttributes(classId: ClassId): Attributes {
  const c = CLASSES[classId];
  return { health: c.baseHp, energy: c.baseMp, ...CLASS_BASE_EXTRA[classId] };
}

/** How much one point of a stat adds to each attribute, at a class's default (100%) rate. */
export const STAT_EFFECTS: Record<StatId, Partial<Attributes>> = {
  VIT: { health: 10, defense: 1 },
  INT: { energy: 8, magicDamage: 1 },
  STR: { physicalDamage: 2 },
  DEX: { physicalDamage: 1, movementSpeed: 1, dodge: 1 },
};

/** Per-class % modifier applied to STAT_EFFECTS (100 = unchanged, >100 = amplified, <100 = dampened). */
export const CLASS_STAT_MODIFIERS: Record<ClassId, Record<StatId, number>> = {
  warrior: { VIT: 120, INT: 70, STR: 120, DEX: 90 },
  ninja: { VIT: 90, INT: 80, STR: 100, DEX: 130 },
  wizard: { VIT: 100, INT: 110, STR: 110, DEX: 100 },
  priest: { VIT: 90, INT: 130, STR: 70, DEX: 100 },
};

/** Base attributes plus the effect of all spent stat points, for a class. */
export function effectiveAttributes(classId: ClassId, stats: Record<StatId, number>): Attributes {
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
  return result;
}

// --- stat point progression: 1 point per 25% of the current level's XP bar ---
export const STAT_POINTS_PER_LEVEL = 4;

/** Total stat points a character should have earned by (level, xp), given xpNeeded for that level. */
export function statPointsEarned(level: number, xp: number, xpNeeded: number): number {
  const quarters = Math.min(STAT_POINTS_PER_LEVEL, Math.floor((xp / xpNeeded) * STAT_POINTS_PER_LEVEL));
  return (level - 1) * STAT_POINTS_PER_LEVEL + quarters;
}

export const emptyStats = (): Record<StatId, number> => ({ VIT: 0, INT: 0, STR: 0, DEX: 0 });
