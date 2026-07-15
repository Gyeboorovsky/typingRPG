// The four-class registry, Metin2-style. Only Warrior is playable in this
// build (selection UI is a future feature); the others are tuning stubs whose
// ults fall back to Whirlwind until their effects are implemented.
import type { ClassDef, ClassId, Player } from './types';

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Warrior',
    baseHp: 100, hpPerLevel: 20, baseMp: 50, mpPerLevel: 10,
    hpRegen: 2, hpRegenCombat: 0.5, mpRegen: 3, baseDamage: 1,
    ult: { id: 'whirlwind', name: 'Berserk Whirlwind', manaCost: 30, streakThreshold: 30, cooldown: 5 },
  },
  ninja: {
    id: 'ninja', name: 'Ninja',
    baseHp: 80, hpPerLevel: 15, baseMp: 60, mpPerLevel: 12,
    hpRegen: 2, hpRegenCombat: 0.5, mpRegen: 3.5, baseDamage: 1,
    ult: { id: 'shadowstrike', name: 'Shadow Strike', manaCost: 25, streakThreshold: 25, cooldown: 5 },
  },
  wizard: {
    id: 'wizard', name: 'Wizard',
    baseHp: 90, hpPerLevel: 17, baseMp: 70, mpPerLevel: 14,
    hpRegen: 2, hpRegenCombat: 0.5, mpRegen: 4, baseDamage: 1,
    ult: { id: 'flamespirit', name: 'Flame Spirit', manaCost: 35, streakThreshold: 30, cooldown: 6 },
  },
  priest: {
    id: 'priest', name: 'Priest',
    baseHp: 75, hpPerLevel: 14, baseMp: 90, mpPerLevel: 18,
    hpRegen: 2.5, hpRegenCombat: 1, mpRegen: 5, baseDamage: 1,
    ult: { id: 'lightning', name: 'Lightning Totem', manaCost: 40, streakThreshold: 30, cooldown: 6 },
  },
};

export const classOf = (p: Player): ClassDef => CLASSES[p.classId];
// maxHp/maxMp now live in attributes.ts (they read gear-aware effectiveAttributes).
