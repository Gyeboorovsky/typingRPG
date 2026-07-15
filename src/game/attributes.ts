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

export function baseAttributes(classId: ClassId): Attributes {
  const c = CLASSES[classId];
  return { health: c.baseHp, energy: c.baseMp, ...CLASS_BASE_EXTRA[classId] };
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

/** Per-correct-char typing damage from a character's physical damage (integer, ≥1). */
export const physCharDamage = (attrs: Attributes): number =>
  Math.max(1, Math.round(attrs.physicalDamage * PHYS_DAMAGE_SCALE));

// --- per-Player derivations (kept here, not classes.ts, so they can read gear-aware
// effectiveAttributes without a classes↔attributes import cycle) ---

/** Max HP = the effective `health` attribute (class base + VIT + gear) plus level scaling.
 *  The class base is already inside `health`, so only hpPerLevel*(level-1) is added on top —
 *  at 0 stats/gear this equals the old baseHp + hpPerLevel*(level-1). */
export const maxHp = (p: Player): number =>
  effectiveAttributes(p.classId, p.stats, p.equipment).health + CLASSES[p.classId].hpPerLevel * (p.level - 1);

export const maxMp = (p: Player): number =>
  effectiveAttributes(p.classId, p.stats, p.equipment).energy + CLASSES[p.classId].mpPerLevel * (p.level - 1);

/** Effective movement speed (tiles/s): movementSpeed as a % bonus over the class's OWN
 *  baseline, so every class moves at ≈ PLAYER_SPEED with default gear (v4-3). */
export function moveSpeed(p: Player): number {
  const base = baseAttributes(p.classId).movementSpeed;
  const eff = effectiveAttributes(p.classId, p.stats, p.equipment).movementSpeed;
  const factor = Math.max(0.6, Math.min(1.8, 1 + (eff - base) * MOVE_PER_POINT));
  return PLAYER_SPEED * factor;
}

/** Correct letters required per bow arrow: BOW_BASE_CHARS_PER_ARROW reduced by attackSpeed
 *  over the class baseline, clamped to [2,5]. Pure helper — bow tempo is wired in C2. */
export function arrowsPerCharsInterval(p: Player): number {
  const base = baseAttributes(p.classId).attackSpeed;
  const eff = effectiveAttributes(p.classId, p.stats, p.equipment).attackSpeed;
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
