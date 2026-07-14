// Item catalog. `upgradable`/`upgradeMats`/`recipe` are data seams for the
// future Metin2-style +0..+9 upgrading and crafting UIs (ItemStack.plus too).
import type { ItemDef, Player } from './types';

export const ITEMS: Record<string, ItemDef> = {
  slime_gel:     { id: 'slime_gel', name: 'Slime Gel', icon: '💧', kind: 'material', tier: 1, maxStack: 99 },
  copper_coin:   { id: 'copper_coin', name: 'Copper Coin', icon: '🪙', kind: 'material', tier: 1, maxStack: 99 },
  boar_tusk:     { id: 'boar_tusk', name: 'Boar Tusk', icon: '🦷', kind: 'material', tier: 2, maxStack: 99 },
  leather_scrap: { id: 'leather_scrap', name: 'Leather Scrap', icon: '🟫', kind: 'material', tier: 2, maxStack: 99 },
  hp_potion: {
    id: 'hp_potion', name: 'Health Potion', icon: '🧪', kind: 'consumable', tier: 2, maxStack: 20,
    consumable: { heal: 40 },
    recipe: { inputs: [{ itemId: 'slime_gel', qty: 3 }] },
  },
  dark_shard:    { id: 'dark_shard', name: 'Dark Shard', icon: '🔮', kind: 'material', tier: 3, maxStack: 99 },
  rune_cloth:    { id: 'rune_cloth', name: 'Rune Cloth', icon: '🧵', kind: 'material', tier: 3, maxStack: 99 },
  iron_sword: {
    id: 'iron_sword', name: 'Iron Sword', icon: '🗡️', kind: 'weapon', tier: 3, maxStack: 1,
    weapon: { dmgPerChar: 1 }, upgradable: true,
    upgradeMats: [{ itemId: 'leather_scrap', qty: 2 }, { itemId: 'boar_tusk', qty: 1 }],
  },
  claymore: {
    id: 'claymore', name: 'Claymore of Clarity', icon: '⚔️', kind: 'weapon', tier: 4, maxStack: 1,
    weapon: { dmgPerChar: 2 }, upgradable: true,
    upgradeMats: [{ itemId: 'dark_shard', qty: 2 }, { itemId: 'rune_cloth', qty: 1 }],
  },
  typhon_horn:   { id: 'typhon_horn', name: "Typhon's Horn", icon: '📯', kind: 'material', tier: 4, maxStack: 99 },
};

/** Stack items into the inventory (gear never stacks). */
export function addToInventory(p: Player, defId: string, qty: number): void {
  const def = ITEMS[defId];
  if (def.maxStack > 1) {
    const st = p.inventory.find((s) => s.defId === defId && s.qty < def.maxStack);
    if (st) {
      const take = Math.min(qty, def.maxStack - st.qty);
      st.qty += take; qty -= take;
    }
  }
  while (qty > 0) {
    const take = Math.min(qty, def.maxStack);
    p.inventory.push({ defId, qty: take });
    qty -= take;
  }
  p.invRev++;
}

/** Best weapon in the bag auto-applies (no equip UI yet — future seam). */
export function weaponBonus(p: Player): number {
  let best = 0;
  for (const st of p.inventory) {
    const w = ITEMS[st.defId]?.weapon;
    if (w && w.dmgPerChar > best) best = w.dmgPerChar;
  }
  return best;
}
