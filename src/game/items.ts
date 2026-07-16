// Item catalog. `upgradable`/`upgradeMats`/`recipe` are data seams for the
// future Metin2-style +0..+9 upgrading and crafting UIs (ItemStack.plus too).
import { INV_H, INV_PAGE_H, INV_W } from './constants';
import { EQUIP_SLOTS } from './types';
import type { EquipSlot, ItemDef, ItemStack, Player } from './types';

// Catalog layout: materials & consumables first, then weapons (one per WeaponType,
// spread across tiers), then armor (a few per non-weapon slot). Weapon `bonuses`
// lean per type — greatsword trades attackSpeed for physicalDamage, daggers the
// reverse, bow carries `range`, staff/wand/grimoire lean magicDamage. No mechanics
// here: `bonuses`/`weapon`/`size`/`reqLevel` are all consumed by existing systems.
export const ITEMS: Record<string, ItemDef> = {
  // --- materials & consumables ---
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
  typhon_horn:   { id: 'typhon_horn', name: "Typhon's Horn", icon: '📯', kind: 'material', tier: 4, maxStack: 99 },

  // --- weapons: sword ---
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
  // --- weapons: greatsword (heavy: big physicalDamage, slow attackSpeed) ---
  war_greatsword: {
    id: 'war_greatsword', name: 'Warbreaker Greatsword', icon: '⚔️', kind: 'weapon', tier: 4, maxStack: 1,
    slot: 'weapon', weaponType: 'greatsword', size: { w: 2, h: 3 }, reqLevel: 7, itemLevel: 12,
    bonuses: { physicalDamage: 14, attackSpeed: -4, health: 20 },
    weapon: { dmgPerChar: 3 }, upgradable: true,
    upgradeMats: [{ itemId: 'dark_shard', qty: 3 }, { itemId: 'typhon_horn', qty: 1 }],
  },
  // --- weapons: daggers (fast: low damage, high attackSpeed/dodge) ---
  rusty_daggers: {
    id: 'rusty_daggers', name: 'Rusty Daggers', icon: '🔪', kind: 'weapon', tier: 2, maxStack: 1,
    slot: 'weapon', weaponType: 'daggers', size: { w: 1, h: 2 }, reqLevel: 3, itemLevel: 4,
    bonuses: { physicalDamage: 2, attackSpeed: 8, dodge: 2 },
    weapon: { dmgPerChar: 1 }, upgradable: true,
    upgradeMats: [{ itemId: 'leather_scrap', qty: 2 }],
  },
  shadow_daggers: {
    id: 'shadow_daggers', name: 'Shadowfang Daggers', icon: '🔪', kind: 'weapon', tier: 4, maxStack: 1,
    slot: 'weapon', weaponType: 'daggers', size: { w: 1, h: 2 }, reqLevel: 6, itemLevel: 10,
    bonuses: { physicalDamage: 5, attackSpeed: 14, dodge: 6 },
    weapon: { dmgPerChar: 2 }, upgradable: true,
    upgradeMats: [{ itemId: 'dark_shard', qty: 2 }, { itemId: 'rune_cloth', qty: 2 }],
  },
  // --- weapons: bow (ranged: carries weapon.range; drops early for C2 testing) ---
  short_bow: {
    id: 'short_bow', name: 'Short Bow', icon: '🏹', kind: 'weapon', tier: 1, maxStack: 1,
    slot: 'weapon', weaponType: 'bow', size: { w: 1, h: 3 }, reqLevel: 2, itemLevel: 3,
    bonuses: { physicalDamage: 2, attackSpeed: 5 },
    weapon: { dmgPerChar: 1, range: 7 }, upgradable: true,
    upgradeMats: [{ itemId: 'slime_gel', qty: 3 }],
  },
  hunter_longbow: {
    id: 'hunter_longbow', name: 'Hunter Longbow', icon: '🏹', kind: 'weapon', tier: 3, maxStack: 1,
    slot: 'weapon', weaponType: 'bow', size: { w: 1, h: 3 }, reqLevel: 5, itemLevel: 8,
    bonuses: { physicalDamage: 6, attackSpeed: 8 },
    weapon: { dmgPerChar: 2, range: 8 }, upgradable: true,
    upgradeMats: [{ itemId: 'leather_scrap', qty: 3 }, { itemId: 'boar_tusk', qty: 2 }],
  },
  // --- weapons: staff / wand / grimoire (magic: lean magicDamage + energy) ---
  apprentice_wand: {
    id: 'apprentice_wand', name: 'Apprentice Wand', icon: '🪄', kind: 'weapon', tier: 2, maxStack: 1,
    slot: 'weapon', weaponType: 'wand', size: { w: 1, h: 2 }, reqLevel: 3, itemLevel: 4,
    bonuses: { magicDamage: 6, energy: 5 },
    weapon: { dmgPerChar: 1 }, upgradable: true,
    upgradeMats: [{ itemId: 'leather_scrap', qty: 2 }],
  },
  oak_staff: {
    id: 'oak_staff', name: 'Oak Staff', icon: '🔱', kind: 'weapon', tier: 3, maxStack: 1,
    slot: 'weapon', weaponType: 'staff', size: { w: 1, h: 3 }, reqLevel: 4, itemLevel: 6,
    bonuses: { magicDamage: 9, energy: 10, defense: 2 },
    weapon: { dmgPerChar: 1 }, upgradable: true,
    upgradeMats: [{ itemId: 'rune_cloth', qty: 2 }, { itemId: 'dark_shard', qty: 1 }],
  },
  forbidden_grimoire: {
    id: 'forbidden_grimoire', name: 'Forbidden Grimoire', icon: '📖', kind: 'weapon', tier: 4, maxStack: 1,
    slot: 'weapon', weaponType: 'grimoire', size: { w: 2, h: 2 }, reqLevel: 6, itemLevel: 10,
    bonuses: { magicDamage: 16, energy: 15, defense: 3 },
    weapon: { dmgPerChar: 2 }, upgradable: true,
    upgradeMats: [{ itemId: 'dark_shard', qty: 3 }, { itemId: 'rune_cloth', qty: 2 }],
  },

  // --- armor: body (armor slot) ---
  padded_vest: {
    id: 'padded_vest', name: 'Padded Vest', icon: '🧥', kind: 'armor', tier: 1, maxStack: 1,
    slot: 'armor', size: { w: 2, h: 2 }, reqLevel: 1, itemLevel: 2,
    bonuses: { defense: 4, health: 15 },
  },
  iron_mail: {
    id: 'iron_mail', name: 'Iron Mail', icon: '🛡️', kind: 'armor', tier: 3, maxStack: 1,
    slot: 'armor', size: { w: 2, h: 2 }, reqLevel: 4, itemLevel: 6,
    bonuses: { defense: 10, health: 30 },
  },
  dragon_plate: {
    id: 'dragon_plate', name: 'Dragonscale Plate', icon: '🛡️', kind: 'armor', tier: 4, maxStack: 1,
    slot: 'armor', size: { w: 2, h: 3 }, reqLevel: 7, itemLevel: 12,
    bonuses: { defense: 18, health: 50, movementSpeed: -2 },
  },
  // --- armor: helmet ---
  leather_cap: {
    id: 'leather_cap', name: 'Leather Cap', icon: '🧢', kind: 'armor', tier: 1, maxStack: 1,
    slot: 'helmet', size: { w: 2, h: 1 }, reqLevel: 1, itemLevel: 2,
    bonuses: { defense: 2, health: 8 },
  },
  iron_helm: {
    id: 'iron_helm', name: 'Iron Helm', icon: '⛑️', kind: 'armor', tier: 3, maxStack: 1,
    slot: 'helmet', size: { w: 2, h: 2 }, reqLevel: 4, itemLevel: 6,
    bonuses: { defense: 6, health: 18 },
  },
  rune_hood: {
    id: 'rune_hood', name: 'Rune Hood', icon: '🪖', kind: 'armor', tier: 4, maxStack: 1,
    slot: 'helmet', size: { w: 2, h: 2 }, reqLevel: 6, itemLevel: 10,
    bonuses: { defense: 4, energy: 12, magicDamage: 4 },
  },
  // --- armor: boots ---
  worn_boots: {
    id: 'worn_boots', name: 'Worn Boots', icon: '🥾', kind: 'armor', tier: 1, maxStack: 1,
    slot: 'boots', size: { w: 2, h: 1 }, reqLevel: 1, itemLevel: 2,
    bonuses: { movementSpeed: 3, defense: 1 },
  },
  swift_greaves: {
    id: 'swift_greaves', name: 'Swift Greaves', icon: '🥾', kind: 'armor', tier: 2, maxStack: 1,
    slot: 'boots', size: { w: 2, h: 1 }, reqLevel: 3, itemLevel: 4,
    bonuses: { movementSpeed: 5, dodge: 3, attackSpeed: 3 },
  },
  boots_of_haste: {
    id: 'boots_of_haste', name: 'Boots of Haste', icon: '👢', kind: 'armor', tier: 4, maxStack: 1,
    slot: 'boots', size: { w: 2, h: 1 }, reqLevel: 6, itemLevel: 10,
    bonuses: { movementSpeed: 8, dodge: 5, attackSpeed: 6 },
  },
  // --- armor: necklace ---
  copper_amulet: {
    id: 'copper_amulet', name: 'Copper Amulet', icon: '📿', kind: 'armor', tier: 1, maxStack: 1,
    slot: 'necklace', size: { w: 1, h: 1 }, reqLevel: 2, itemLevel: 2,
    bonuses: { health: 10, energy: 5 },
  },
  warded_pendant: {
    id: 'warded_pendant', name: 'Warded Pendant', icon: '📿', kind: 'armor', tier: 3, maxStack: 1,
    slot: 'necklace', size: { w: 1, h: 1 }, reqLevel: 4, itemLevel: 6,
    bonuses: { defense: 5, magicDamage: 5 },
  },
  typhon_charm: {
    id: 'typhon_charm', name: "Typhon's Charm", icon: '💎', kind: 'armor', tier: 4, maxStack: 1,
    slot: 'necklace', size: { w: 1, h: 1 }, reqLevel: 7, itemLevel: 12,
    bonuses: { physicalDamage: 6, magicDamage: 6, health: 20 },
  },
  // --- armor: ring ---
  bronze_ring: {
    id: 'bronze_ring', name: 'Bronze Ring', icon: '💍', kind: 'armor', tier: 1, maxStack: 1,
    slot: 'ring', size: { w: 1, h: 1 }, reqLevel: 2, itemLevel: 2,
    bonuses: { physicalDamage: 2 },
  },
  band_of_vigor: {
    id: 'band_of_vigor', name: 'Band of Vigor', icon: '💍', kind: 'armor', tier: 2, maxStack: 1,
    slot: 'ring', size: { w: 1, h: 1 }, reqLevel: 3, itemLevel: 4,
    bonuses: { health: 20, defense: 2 },
  },
  ring_of_the_viper: {
    id: 'ring_of_the_viper', name: 'Ring of the Viper', icon: '💍', kind: 'armor', tier: 4, maxStack: 1,
    slot: 'ring', size: { w: 1, h: 1 }, reqLevel: 6, itemLevel: 10,
    bonuses: { attackSpeed: 8, dodge: 4, physicalDamage: 3 },
  },
};

// --- inventory grid + equipment helpers (pure; reused by sim migration + tests) ---

/** Grid footprint of an item; unknown/undefined defs and unsized items are 1x1. */
export const itemSize = (def: ItemDef | undefined): { w: number; h: number } =>
  def?.size ?? { w: 1, h: 1 };

// Reusable occupancy scratch for firstFreeCell — it runs per nearby drop every
// tick (via stepDrops → addToInventory), so no per-call allocation. Fully
// rewritten before each read; single-threaded, non-reentrant, so one buffer is
// safe even for a future server tick handling many players sequentially.
const occ = new Uint8Array(INV_W * INV_H);

/** Bag pages are independent grids: a footprint starting at row y with height h
 *  must sit entirely within one INV_PAGE_H-row page (the UI shows one page at
 *  a time, so a page-spanning item would render torn in half). */
const withinOnePage = (y: number, h: number): boolean =>
  Math.floor(y / INV_PAGE_H) === Math.floor((y + h - 1) / INV_PAGE_H);

/** First row-major top-left cell where a w×h footprint fits among already-placed
 *  items, or null if the INV_W×INV_H grid has no room. Occupancy is rebuilt from
 *  each placed item's own size, so multi-cell items block the cells they span. */
export function firstFreeCell(
  placed: { defId: string; x: number; y: number }[], w: number, h: number,
): { x: number; y: number } | null {
  occ.fill(0);
  for (const it of placed) {
    const s = itemSize(ITEMS[it.defId]);
    for (let dy = 0; dy < s.h; dy++)
      for (let dx = 0; dx < s.w; dx++) {
        const gy = it.y + dy, gx = it.x + dx;
        if (gy >= 0 && gy < INV_H && gx >= 0 && gx < INV_W) occ[gy * INV_W + gx] = 1;
      }
  }
  for (let y = 0; y + h <= INV_H; y++) {
    if (!withinOnePage(y, h)) continue;
    for (let x = 0; x + w <= INV_W; x++) {
      let free = true;
      for (let dy = 0; dy < h && free; dy++)
        for (let dx = 0; dx < w; dx++) if (occ[(y + dy) * INV_W + x + dx]) { free = false; break; }
      if (free) return { x, y };
    }
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

/** True if a w×h footprint at (x,y) is in-bounds, inside a single bag page, and
 *  clear of every already-placed item's footprint. Pass the other items only
 *  (exclude the one being moved). */
export function rectFree(
  placed: { defId: string; x: number; y: number }[], x: number, y: number, w: number, h: number,
): boolean {
  if (x < 0 || y < 0 || x + w > INV_W || y + h > INV_H) return false;
  if (!withinOnePage(y, h)) return false;
  for (const it of placed) {
    const s = itemSize(ITEMS[it.defId]);
    if (x < it.x + s.w && x + w > it.x && y < it.y + s.h && y + h > it.y) return false;
  }
  return true;
}
