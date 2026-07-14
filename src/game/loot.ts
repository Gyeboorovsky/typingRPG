// Drop rolls — pure and seeded, so they're unit-testable.
import { rand, randInt } from './rng';
import type { RngCarrier } from './rng';
import type { MobDef } from './types';

export function rollDrops(s: RngCarrier, def: MobDef): { defId: string; qty: number }[] {
  const out: { defId: string; qty: number }[] = [];
  for (const d of def.drops)
    if (rand(s) < d.chance) out.push({ defId: d.itemId, qty: randInt(s, d.min, d.max) });
  return out;
}
