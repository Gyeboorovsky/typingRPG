// Item catalog. `upgradable`/`upgradeMats`/`recipe` are data seams for the
// future Metin2-style +0..+9 upgrading and crafting UIs (ItemStack.plus too).
import { INV_H, INV_W } from './constants';
import { EQUIP_SLOTS } from './types';
import type { EquipSlot, ItemDef, ItemStack, Player } from './types';

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
    slot: 'weapon', weaponType: 'sword', size: { w: 1, h: 2 }, reqLevel: 3, itemLevel: 5,
    bonuses: { physicalDamage: 3 },
    weapon: { dmgPerChar: 1 }, upgradable: true,
    upgradeMats: [{ itemId: 'leather_scrap', qty: 2 }, { itemId: 'boar_tusk', qty: 1 }],
  },
  claymore: {
    id: 'claymore', name: 'Claymore of Clarity', icon: '⚔️', kind: 'weapon', tier: 4, maxStack: 1,
    slot: 'weapon', weaponType: 'sword', size: { w: 1, h: 3 }, reqLevel: 5, itemLevel: 10,
    bonuses: { physicalDamage: 6 },
    weapon: { dmgPerChar: 2 }, upgradable: true,
    upgradeMats: [{ itemId: 'dark_shard', qty: 2 }, { itemId: 'rune_cloth', qty: 1 }],
  },
  typhon_horn:   { id: 'typhon_horn', name: "Typhon's Horn", icon: '📯', kind: 'material', tier: 4, maxStack: 99 },
};

// --- inventory grid + equipment helpers (pure; reused by sim migration + tests) ---

/** Grid footprint of an item; unknown/undefined defs and unsized items are 1x1. */
export const itemSize = (def: ItemDef | undefined): { w: number; h: number } =>
  def?.size ?? { w: 1, h: 1 };

/** First row-major top-left cell where a w×h footprint fits among already-placed
 *  items, or null if the INV_W×INV_H grid has no room. Occupancy is rebuilt from
 *  each placed item's own size, so multi-cell items block the cells they span. */
export function firstFreeCell(
  placed: { defId: string; x: number; y: number }[], w: number, h: number,
): { x: number; y: number } | null {
  const occ: boolean[][] = Array.from({ length: INV_H }, () => new Array(INV_W).fill(false));
  for (const it of placed) {
    const s = itemSize(ITEMS[it.defId]);
    for (let dy = 0; dy < s.h; dy++)
      for (let dx = 0; dx < s.w; dx++) {
        const gy = it.y + dy, gx = it.x + dx;
        if (gy >= 0 && gy < INV_H && gx >= 0 && gx < INV_W) occ[gy][gx] = true;
      }
  }
  for (let y = 0; y + h <= INV_H; y++)
    for (let x = 0; x + w <= INV_W; x++) {
      let free = true;
      for (let dy = 0; dy < h && free; dy++)
        for (let dx = 0; dx < w; dx++) if (occ[y + dy][x + dx]) { free = false; break; }
      if (free) return { x, y };
    }
  return null;
}

/** A fresh all-empty equipment record (one null per slot). */
export const emptyEquipment = (): Record<EquipSlot, ItemStack | null> =>
  Object.fromEntries(EQUIP_SLOTS.map((s) => [s, null])) as Record<EquipSlot, ItemStack | null>;

/** Deep-ish clone of an equipment record (each slot's stack copied by value). */
export const cloneEquipment = (
  eq: Record<EquipSlot, ItemStack | null>,
): Record<EquipSlot, ItemStack | null> =>
  Object.fromEntries(
    EQUIP_SLOTS.map((s) => [s, eq[s] ? { ...eq[s]! } : null]),
  ) as Record<EquipSlot, ItemStack | null>;

/** Place `qty` of an item into the positioned grid, returning how many were actually
 *  taken. Stacks into an existing non-full stack first, then fills fresh cells via
 *  firstFreeCell; when the grid has no room it stops (does NOT overflow) so the caller
 *  can leave the remainder on the ground (bag-full rule, decyzja v4-1). `p.overflow`
 *  is now only the v1→v2 migration fallback in applySave, never written here. */
export function addToInventory(p: Player, defId: string, qty: number): number {
  const def = ITEMS[defId];
  let remaining = qty;
  if (def.maxStack > 1) {
    for (const s of p.inventory) {
      if (remaining <= 0) break;
      if (s.defId !== defId || s.qty >= def.maxStack) continue;
      const take = Math.min(remaining, def.maxStack - s.qty);
      s.qty += take; remaining -= take;
    }
  }
  const { w, h } = itemSize(def);
  while (remaining > 0) {
    const cell = firstFreeCell(p.inventory, w, h);
    if (!cell) break; // bag full — leave the rest for the caller (drop stays on ground)
    const take = Math.min(remaining, def.maxStack);
    p.inventory.push({ defId, qty: take, x: cell.x, y: cell.y });
    remaining -= take;
  }
  const taken = qty - remaining;
  if (taken > 0) p.invRev++;
  return taken;
}

/** True if a w×h footprint at (x,y) is in-bounds and clear of every already-placed
 *  item's footprint. Pass the other items only (exclude the one being moved). */
export function rectFree(
  placed: { defId: string; x: number; y: number }[], x: number, y: number, w: number, h: number,
): boolean {
  if (x < 0 || y < 0 || x + w > INV_W || y + h > INV_H) return false;
  for (const it of placed) {
    const s = itemSize(ITEMS[it.defId]);
    if (x < it.x + s.w && x + w > it.x && y < it.y + s.h && y + h > it.y) return false;
  }
  return true;
}
