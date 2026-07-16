// Unit tests for the pure simulation core (no DOM, fully seeded).
import { describe, expect, it } from 'vitest';
import {
  arrowsPerCharsInterval, baseAttributes, effectiveAttributes, emptyStats,
  maxHp, maxMp, moveSpeed,
} from './attributes';
import { CLASSES } from './classes';
import {
  damageMob, grantXp, meleeMitigatedDamage, radiusFor, resolveKeystroke, syncCombat, typingDamage,
} from './combat';
import {
  BOSS_ENRAGE_TYPO_MULT, DROP_REARM_MARGIN, GOLD_PER_COIN, INV_H, INV_PAGE_H, INV_W,
  MOVE_PER_POINT, PICKUP_RADIUS, PLAYER_SPEED, PROMPT_MP_REWARD, RADIUS_BASE, RADIUS_MAX,
  SIM_DT, XP_CURVE,
} from './constants';
import { addToInventory, firstFreeCell, ITEMS, rectFree } from './items';
import { rollDrops } from './loot';
import { isBlocked } from './map';
import { MOBS } from './mobs';
import { EQUIP_SLOTS } from './types';
import { rand } from './rng';
import { applySave, makeSave, newGame, update } from './sim';
import type { ClassId, GameState, Mob, SaveData, Vec2 } from './types';
import { routeKeydown } from '../input';
import type { KeyInfo } from '../input';

/** A controlled state: player at spawn, exactly these mobs, combat synced. */
function stateWith(mobs: { defId: string; pos: Vec2; hp?: number; shield?: boolean; shieldsUsed?: number }[]): GameState {
  const s = newGame(42);
  s.mode = 'fight'; // the combat tests exercise the typing prompt, which shows only in fight
  s.mobs = mobs.map((m, i): Mob => ({
    id: i + 1, defId: m.defId, pos: { ...m.pos }, hp: m.hp ?? MOBS[m.defId].hp,
    state: 'aggro', spotIdx: 0, home: { ...m.pos },
    shield: m.shield ?? false, shieldsUsed: m.shieldsUsed ?? 0,
  }));
  syncCombat(s);
  return s;
}
const NEAR: Vec2 = { x: 24, y: 38 }; // one tile from spawn (24,39)
const MISS = '\u0000'; // never appears in any prompt

describe('radiusFor', () => {
  it('starts at the base, grows 0.05/streak, caps at the max', () => {
    expect(radiusFor(0)).toBe(RADIUS_BASE);
    expect(radiusFor(10)).toBeCloseTo(RADIUS_BASE + 0.5);
    expect(radiusFor(70)).toBe(RADIUS_MAX);
    expect(radiusFor(500)).toBe(RADIUS_MAX);
  });
});

describe('resolveKeystroke', () => {
  it('a correct key damages only aggroed mobs within the radius', () => {
    const s = stateWith([
      { defId: 'slime', pos: NEAR },
      { defId: 'slime', pos: { x: 24, y: 30 } }, // 9 tiles away
    ]);
    const dmg = typingDamage(s.player); // physicalDamage-based, gear-aware
    resolveKeystroke(s, s.combat!.prompt[0]);
    expect(s.mobs[0].hp).toBe(MOBS.slime.hp - dmg);
    expect(s.mobs[1].hp).toBe(MOBS.slime.hp);
    expect(s.combat!.streak).toBe(1);
    expect(s.combat!.typed).toBe(1);
  });

  it('a typo resets the streak and hurts by the hardest engaged tier (defense-mitigated)', () => {
    const s = stateWith([
      { defId: 'slime', pos: NEAR },
      { defId: 'cultist', pos: { x: 23, y: 38 } },
    ]);
    s.combat!.streak = 12;
    const a = effectiveAttributes(s.player.classId, s.player.stats, s.player.equipment);
    const dodged = rand({ rng: s.rng }) * 100 < a.dodge; // probe the same roll, without consuming s.rng
    const expected = dodged ? 0 : Math.round(MOBS.cultist.typoDamage * 100 / (100 + a.defense));
    const hp = s.player.hp;
    resolveKeystroke(s, MISS);
    expect(hp - s.player.hp).toBe(expected);
    expect(s.combat!.streak).toBe(0);
  });

  it('completing a prompt grants mana and starts a fresh one', () => {
    const s = stateWith([{ defId: 'slime', pos: NEAR }]);
    s.player.mp = 10;
    for (const ch of s.combat!.prompt) resolveKeystroke(s, ch);
    expect(s.player.mp).toBe(10 + PROMPT_MP_REWARD);
    expect(s.combat!.typed).toBe(0);
  });

  it('killing a mob grants XP, rolls drops and queues a respawn', () => {
    const s = stateWith([{ defId: 'slime', pos: NEAR, hp: 1 }]);
    resolveKeystroke(s, s.combat!.prompt[0]);
    expect(s.mobs).toHaveLength(0);
    expect(s.player.xp).toBe(MOBS.slime.xp);
    expect(s.spots[0].pending).toHaveLength(1);
  });
});

describe('boss (Typhon)', () => {
  it('raises its shield when damage crosses the 66% threshold', () => {
    const s = stateWith([{ defId: 'typhon', pos: NEAR }]);
    damageMob(s, s.mobs[0], 150); // 400 → 250 = 62.5%
    expect(s.mobs[0].shield).toBe(true);
    expect(s.mobs[0].shieldsUsed).toBe(1);
  });

  it('shield blocks damage; a typo restarts the phrase; a flawless phrase breaks it', () => {
    const s = stateWith([{ defId: 'typhon', pos: NEAR, hp: 250, shield: true, shieldsUsed: 1 }]);
    const hp0 = s.mobs[0].hp;
    resolveKeystroke(s, s.combat!.prompt[0]);
    expect(s.mobs[0].hp).toBe(hp0); // immune
    resolveKeystroke(s, MISS);
    expect(s.combat!.typed).toBe(0); // phrase restarted
    for (const ch of s.combat!.prompt) resolveKeystroke(s, ch);
    expect(s.mobs[0].shield).toBe(false);
  });

  it('punishes typos 1.5x harder when enraged (≤50% HP), then applies defense', () => {
    const s = stateWith([{ defId: 'typhon', pos: NEAR, hp: 150 }]);
    const a = effectiveAttributes(s.player.classId, s.player.stats, s.player.equipment);
    const raw = Math.round(MOBS.typhon.typoDamage * BOSS_ENRAGE_TYPO_MULT);
    const dodged = rand({ rng: s.rng }) * 100 < a.dodge;
    const expected = dodged ? 0 : Math.round(raw * 100 / (100 + a.defense));
    const hp = s.player.hp;
    resolveKeystroke(s, MISS);
    expect(hp - s.player.hp).toBe(expected);
  });
});

describe('loot and xp', () => {
  it('rollDrops is deterministic for a fixed seed', () => {
    expect(rollDrops({ rng: 123 }, MOBS.slime)).toEqual(rollDrops({ rng: 123 }, MOBS.slime));
  });

  it('the boss drop table is guaranteed', () => {
    expect(rollDrops({ rng: 7 }, MOBS.typhon)).toEqual([
      { defId: 'typhon_horn', qty: 1 },
      { defId: 'claymore', qty: 1 },
      { defId: 'dark_shard', qty: 3 },
    ]);
  });

  it('xp curve grows monotonically', () => {
    for (let l = 1; l < 30; l++) expect(XP_CURVE(l + 1)).toBeGreaterThan(XP_CURVE(l));
  });

  it('every mob drop references a real item', () => {
    for (const def of Object.values(MOBS))
      for (const d of def.drops) expect(ITEMS[d.itemId], d.itemId).toBeDefined();
  });
});

describe('item catalog invariants', () => {
  it('every weapon has a weaponType and covers all seven types', () => {
    const types = new Set<string>();
    for (const def of Object.values(ITEMS))
      if (def.kind === 'weapon') { expect(def.weaponType, def.id).toBeDefined(); types.add(def.weaponType!); }
    expect([...types].sort()).toEqual(
      ['bow', 'daggers', 'greatsword', 'grimoire', 'staff', 'sword', 'wand'],
    );
  });

  it('every equippable (weapon/armor) has a valid slot', () => {
    for (const def of Object.values(ITEMS)) {
      if (def.kind !== 'weapon' && def.kind !== 'armor') continue;
      expect(def.slot, def.id).toBeDefined();
      expect(EQUIP_SLOTS, def.id).toContain(def.slot!);
    }
  });

  it('level-up carries the xp remainder and fully heals', () => {
    const s = newGame(1);
    s.player.hp = 5;
    grantXp(s, XP_CURVE(1) + 30);
    expect(s.player.level).toBe(2);
    expect(s.player.xp).toBe(30);
    expect(s.player.hp).toBe(maxHp(s.player));
  });
});

describe('movement and map', () => {
  it('moves continuously toward a held direction, screen-relative', () => {
    const s = newGame(3);
    s.mobs = [];
    const start = { ...s.player.pos };
    update(s, [{ type: 'move', dirs: [0] }], SIM_DT); // hold ArrowUp (screen-up)
    for (let i = 0; i < 20; i++) update(s, [], SIM_DT); // ~0.35 s
    // Screen-up is world (-1,-1) normalized, so up moves x and y equally —
    // parallel to the screen's vertical axis, not a single world grid line.
    const per = (21 * SIM_DT * PLAYER_SPEED) * Math.SQRT1_2;
    expect(s.player.pos.x).toBeCloseTo(start.x - per, 5);
    expect(s.player.pos.y).toBeCloseTo(start.y - per, 5);
  });

  it('map blocks borders and water, spawn area is free', () => {
    expect(isBlocked(0, 0)).toBe(true); // border forest
    expect(isBlocked(5, 30)).toBe(true); // lake
    expect(isBlocked(24, 39)).toBe(false); // spawn
    expect(isBlocked(-1, 5)).toBe(true); // out of bounds
  });
});

describe('save roundtrip (v2)', () => {
  it('restores positioned inventory, gold and equipment through JSON serialization', () => {
    const a = newGame(5);
    a.player.level = 4;
    a.player.xp = 123;
    a.player.hp = 55;
    a.player.mp = 40;
    a.player.pos = { x: 20, y: 20 };
    a.player.inventory = [
      { defId: 'slime_gel', qty: 7, x: 0, y: 0 },
      { defId: 'claymore', qty: 1, x: 3, y: 0 },
    ];
    a.player.gold = 42;
    a.player.equipment.weapon = { defId: 'iron_sword', qty: 1 };
    a.bossKilled = true;
    const save = makeSave(a);
    expect(save.v).toBe(2);
    const b = newGame(9);
    applySave(b, JSON.parse(JSON.stringify(save)));
    expect(b.player.level).toBe(4);
    expect(b.player.xp).toBe(123);
    expect(b.player.hp).toBe(55);
    expect(b.player.mp).toBe(40);
    expect(b.player.pos).toEqual({ x: 20, y: 20 });
    expect(b.player.inventory).toEqual(a.player.inventory); // v2 loads positions as-is
    expect(b.player.gold).toBe(42);
    expect(b.player.equipment.weapon).toEqual({ defId: 'iron_sword', qty: 1 });
    expect(b.player.overflow).toEqual([]);
    expect(b.player.leech).toBe(1); // re-init full (never persisted)
    expect(b.bossKilled).toBe(true);
  });

  it('migrates a v1 save: grid placement, copper_coin→gold, empty equipment', () => {
    const v1: SaveData = {
      v: 1, savedAt: '2020-01-01T00:00:00.000Z',
      player: {
        name: 'Old', classId: 'warrior', level: 3, xp: 10, hp: 40, mp: 20,
        pos: { x: 24, y: 39 },
        inventory: [
          { defId: 'slime_gel', qty: 7 },
          { defId: 'copper_coin', qty: 5 },
          { defId: 'iron_sword', qty: 1 },
        ],
      },
      bossKilled: false,
    };
    const s = newGame(1);
    applySave(s, v1);
    // copper_coin converts to gold and never enters the bag
    expect(s.player.inventory.some((it) => it.defId === 'copper_coin')).toBe(false);
    expect(s.player.gold).toBe(5 * GOLD_PER_COIN);
    // the rest are auto-placed row-major with coordinates
    const gel = s.player.inventory.find((it) => it.defId === 'slime_gel')!;
    const sword = s.player.inventory.find((it) => it.defId === 'iron_sword')!;
    expect(gel).toMatchObject({ x: 0, y: 0 });        // 1x1 first
    expect(sword).toMatchObject({ x: 1, y: 0 });      // 1x2 skips the taken cell
    expect(s.player.equipment.weapon).toBeNull();     // v1 had no equipment
    expect(s.player.overflow).toEqual([]);
    expect(s.player.leech).toBe(1);
  });
});

describe('inventory grid', () => {
  it('firstFreeCell fills row-major and skips multi-cell footprints', () => {
    const placed: { defId: string; x: number; y: number }[] = [];
    expect(firstFreeCell(placed, 1, 1)).toEqual({ x: 0, y: 0 });
    placed.push({ defId: 'slime_gel', x: 0, y: 0 });
    expect(firstFreeCell(placed, 1, 2)).toEqual({ x: 1, y: 0 }); // iron_sword can't start on the taken cell
    placed.push({ defId: 'iron_sword', x: 1, y: 0 });            // occupies (1,0) and (1,1)
    expect(firstFreeCell(placed, 1, 1)).toEqual({ x: 2, y: 0 });
  });

  it('firstFreeCell returns null when the grid is full', () => {
    const placed: { defId: string; x: number; y: number }[] = [];
    for (let y = 0; y < INV_H; y++)
      for (let x = 0; x < INV_W; x++) placed.push({ defId: 'slime_gel', x, y });
    expect(firstFreeCell(placed, 1, 1)).toBeNull();
  });

  it('addToInventory fills the grid then leaves the rest un-taken (no overflow)', () => {
    const s = newGame(1);
    // iron_sword is 1x2 (2 cells); each 10x6 page holds 30, so all pages hold
    // exactly INV_W*INV_H/2 (the 6-row pages divide evenly by the sword's height).
    const cap = (INV_W * INV_H) / 2;
    for (let i = 0; i < cap; i++) expect(addToInventory(s.player, 'iron_sword', 1)).toBe(1);
    expect(s.player.inventory).toHaveLength(cap);
    expect(s.player.overflow).toHaveLength(0);
    expect(addToInventory(s.player, 'iron_sword', 1)).toBe(0); // cap+1 — no room, taken = 0
    expect(s.player.inventory).toHaveLength(cap);
    expect(s.player.overflow).toHaveLength(0); // overflow is no longer written by pickups
  });

  it('placement never spans a page boundary', () => {
    // Fill page 1 rows 0..4 solid, leaving only row 5 open on that page: a 1x2
    // item must NOT start at y=5 (it would tear across the page-1/page-2 seam)
    // and lands at the top of page 2 instead.
    const placed: { defId: string; x: number; y: number }[] = [];
    for (let y = 0; y < INV_PAGE_H - 1; y++)
      for (let x = 0; x < INV_W; x++) placed.push({ defId: 'slime_gel', x, y });
    expect(firstFreeCell(placed, 1, 2)).toEqual({ x: 0, y: INV_PAGE_H });
    expect(rectFree(placed, 0, INV_PAGE_H - 1, 1, 2)).toBe(false); // crosses the seam
    expect(rectFree(placed, 0, INV_PAGE_H, 1, 2)).toBe(true);      // clean on page 2
  });

  it('addToInventory stacks stackables into a single 1x1 cell', () => {
    const s = newGame(1);
    addToInventory(s.player, 'slime_gel', 5);
    addToInventory(s.player, 'slime_gel', 3);
    expect(s.player.inventory).toHaveLength(1);
    expect(s.player.inventory[0]).toMatchObject({ defId: 'slime_gel', qty: 8, x: 0, y: 0 });
  });
});

describe('attributes: attackSpeed', () => {
  const CLASSES = ['warrior', 'ninja', 'wizard', 'priest'] as const;
  const noStats = { VIT: 0, INT: 0, STR: 0, DEX: 0 };

  it('every class has a positive attackSpeed base', () => {
    for (const c of CLASSES) expect(baseAttributes(c).attackSpeed).toBeGreaterThan(0);
  });

  it('effectiveAttributes folds spent DEX into attackSpeed', () => {
    const base = baseAttributes('ninja').attackSpeed;
    const withDex = effectiveAttributes('ninja', { ...noStats, DEX: 10 }).attackSpeed;
    expect(withDex).toBeGreaterThan(base);
  });

  it('DEX raises attackSpeed per the class DEX modifier (ninja > warrior)', () => {
    const dex = 10;
    const gain = (c: 'ninja' | 'warrior') =>
      effectiveAttributes(c, { ...noStats, DEX: dex }).attackSpeed - baseAttributes(c).attackSpeed;
    // STAT_EFFECTS.DEX.attackSpeed = 1/pt; ninja DEX modifier 130%, warrior 90%
    expect(gain('ninja')).toBeCloseTo(dex * 1.30);
    expect(gain('warrior')).toBeCloseTo(dex * 0.90);
    expect(gain('ninja')).toBeGreaterThan(gain('warrior'));
  });
});

describe('maxHp/maxMp unification (v3-1)', () => {
  const ALL: ClassId[] = ['warrior', 'ninja', 'wizard', 'priest'];

  it('at 0 stats + no gear equals class base + level scaling (parity with the old formula)', () => {
    for (const c of ALL) {
      const s = newGame(1, 'H', c);
      for (const L of [1, 5, 10]) {
        s.player.level = L;
        s.player.stats = emptyStats();
        expect(maxHp(s.player)).toBe(CLASSES[c].baseHp + CLASSES[c].hpPerLevel * (L - 1));
        expect(maxMp(s.player)).toBe(CLASSES[c].baseMp + CLASSES[c].mpPerLevel * (L - 1));
      }
    }
  });

  it('VIT now raises max HP (the previously-broken disconnect)', () => {
    const s = newGame(1);
    const before = maxHp(s.player);
    s.player.stats = { ...emptyStats(), VIT: 10 };
    expect(maxHp(s.player)).toBeGreaterThan(before);
  });

  it('an equipped weapon folds its gear stats into physicalDamage (gear-aware combat)', () => {
    const s = newGame(1);
    const bare = typingDamage(s.player);
    s.player.equipment.weapon = { defId: 'claymore', qty: 1 };
    expect(typingDamage(s.player)).toBeGreaterThan(bare);
  });
});

describe('equipment events', () => {
  const bare = (s: GameState): void => { s.mobs = []; s.drops = []; };

  it('equip moves an inventory item into its slot and frees its cells', () => {
    const s = newGame(1); bare(s);
    s.player.level = 5;
    s.player.inventory = [{ defId: 'iron_sword', qty: 1, x: 0, y: 0 }];
    update(s, [{ type: 'equip', index: 0 }], SIM_DT);
    expect(s.player.equipment.weapon).toEqual({ defId: 'iron_sword', qty: 1 });
    expect(s.player.inventory).toHaveLength(0);
  });

  it('equip is a silent no-op under the required level', () => {
    const s = newGame(1); bare(s);
    s.player.level = 2; // iron_sword reqLevel 3
    s.player.inventory = [{ defId: 'iron_sword', qty: 1, x: 0, y: 0 }];
    update(s, [{ type: 'equip', index: 0 }], SIM_DT);
    expect(s.player.equipment.weapon).toBeNull();
    expect(s.player.inventory).toHaveLength(1);
  });

  it('equipping into an occupied slot swaps the old item back into the bag', () => {
    const s = newGame(1); bare(s);
    s.player.level = 5;
    s.player.equipment.weapon = { defId: 'iron_sword', qty: 1 };
    s.player.inventory = [{ defId: 'claymore', qty: 1, x: 0, y: 0 }];
    update(s, [{ type: 'equip', index: 0 }], SIM_DT);
    expect(s.player.equipment.weapon!.defId).toBe('claymore');
    expect(s.player.inventory).toHaveLength(1);
    expect(s.player.inventory[0].defId).toBe('iron_sword');
  });

  it('unequip drops the item into the first free cell', () => {
    const s = newGame(1); bare(s);
    s.player.equipment.weapon = { defId: 'iron_sword', qty: 1 };
    s.player.inventory = [];
    update(s, [{ type: 'unequip', slot: 'weapon' }], SIM_DT);
    expect(s.player.equipment.weapon).toBeNull();
    expect(s.player.inventory).toEqual([{ defId: 'iron_sword', qty: 1, x: 0, y: 0 }]);
  });

  it('unequip is a silent no-op when the bag has no room', () => {
    const s = newGame(1); bare(s);
    s.player.inventory = [];
    for (let y = 0; y < INV_H; y++) for (let x = 0; x < INV_W; x++)
      s.player.inventory.push({ defId: 'slime_gel', qty: 1, x, y });
    s.player.equipment.weapon = { defId: 'iron_sword', qty: 1 };
    update(s, [{ type: 'unequip', slot: 'weapon' }], SIM_DT);
    expect(s.player.equipment.weapon).toEqual({ defId: 'iron_sword', qty: 1 });
    expect(s.player.inventory).toHaveLength(INV_W * INV_H);
  });

  it('unequip lands on the targeted cell when x/y are given and free', () => {
    const s = newGame(1); bare(s);
    s.player.inventory = [];
    s.player.equipment.weapon = { defId: 'iron_sword', qty: 1 };
    update(s, [{ type: 'unequip', slot: 'weapon', x: 4, y: 2 }], SIM_DT);
    expect(s.player.equipment.weapon).toBeNull();
    expect(s.player.inventory[0]).toMatchObject({ defId: 'iron_sword', x: 4, y: 2 });
  });

  it('targeted unequip rejects an occupied or page-crossing cell silently', () => {
    const s = newGame(1); bare(s);
    s.player.inventory = [{ defId: 'slime_gel', qty: 1, x: 4, y: 2 }];
    s.player.equipment.weapon = { defId: 'iron_sword', qty: 1 }; // 1x2
    update(s, [{ type: 'unequip', slot: 'weapon', x: 4, y: 2 }], SIM_DT);  // blocked by the gel
    expect(s.player.equipment.weapon).not.toBeNull();
    update(s, [{ type: 'unequip', slot: 'weapon', x: 0, y: INV_PAGE_H - 1 }], SIM_DT); // crosses the page seam
    expect(s.player.equipment.weapon).not.toBeNull();
    expect(s.player.inventory).toHaveLength(1);
  });

  it('moveItem repositions when the footprint is clear', () => {
    const s = newGame(1); bare(s);
    s.player.inventory = [{ defId: 'slime_gel', qty: 1, x: 0, y: 0 }];
    update(s, [{ type: 'moveItem', index: 0, x: 5, y: 3 }], SIM_DT);
    expect(s.player.inventory[0]).toMatchObject({ x: 5, y: 3 });
  });

  it('moveItem rejects a colliding target (multi-cell footprint honored)', () => {
    const s = newGame(1); bare(s);
    s.player.inventory = [
      { defId: 'iron_sword', qty: 1, x: 0, y: 0 }, // 1x2 spans (0,0) and (0,1)
      { defId: 'slime_gel', qty: 1, x: 2, y: 0 },
    ];
    update(s, [{ type: 'moveItem', index: 1, x: 0, y: 1 }], SIM_DT); // lands on the sword's 2nd cell
    expect(s.player.inventory[1]).toMatchObject({ x: 2, y: 0 }); // unchanged
  });

  it('moveItem rejects an out-of-bounds target', () => {
    const s = newGame(1); bare(s);
    s.player.inventory = [{ defId: 'iron_sword', qty: 1, x: 0, y: 0 }]; // 1x2
    update(s, [{ type: 'moveItem', index: 0, x: 0, y: INV_H - 1 }], SIM_DT); // y+2 > INV_H
    expect(s.player.inventory[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('currency & bag-full pickups', () => {
  it('copper_coin converts to gold on pickup and never enters the bag', () => {
    const s = newGame(1); s.mobs = [];
    const g0 = s.player.gold;
    s.drops = [{ id: 1, defId: 'copper_coin', qty: 3, pos: { ...s.player.pos }, age: 0 }];
    update(s, [], SIM_DT);
    expect(s.player.gold).toBe(g0 + 3 * GOLD_PER_COIN);
    expect(s.player.inventory.some((i) => i.defId === 'copper_coin')).toBe(false);
    expect(s.drops).toHaveLength(0);
  });

  it('a full bag leaves the drop on the ground and toasts "Bag full"', () => {
    const s = newGame(1); s.mobs = [];
    s.player.inventory = [];
    for (let y = 0; y < INV_H; y++) for (let x = 0; x < INV_W; x++)
      s.player.inventory.push({ defId: 'slime_gel', qty: 1, x, y });
    s.drops = [{ id: 1, defId: 'iron_sword', qty: 1, pos: { ...s.player.pos }, age: 0.99 }];
    update(s, [], SIM_DT); // age crosses 1.0s → the ~1/sec toast fires
    expect(s.drops).toHaveLength(1);
    expect(s.player.inventory).toHaveLength(INV_W * INV_H);
    expect(s.fx.some((f) => f.kind === 'pickup' && f.text === 'Bag full')).toBe(true);
  });
});

describe('dropItem (throw out of the bag)', () => {
  it('moves the stack to a ground drop at the player, re-armed against auto-pickup', () => {
    const s = newGame(1); s.mobs = [];
    s.player.inventory = [{ defId: 'slime_gel', qty: 7, x: 0, y: 0 }];
    update(s, [{ type: 'dropItem', index: 0 }], SIM_DT);
    expect(s.player.inventory).toHaveLength(0);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]).toMatchObject({ defId: 'slime_gel', qty: 7, rearm: true });
    expect(s.drops[0].pos).toEqual(s.player.pos);
    // standing on it must NOT pick it back up, no matter how long
    for (let i = 0; i < 120; i++) update(s, [], SIM_DT);
    expect(s.drops).toHaveLength(1);
    expect(s.player.inventory).toHaveLength(0);
    // step out of the pickup radius once → the drop re-arms…
    s.player.pos = { x: s.drops[0].pos.x + PICKUP_RADIUS + DROP_REARM_MARGIN + 0.1, y: s.drops[0].pos.y };
    update(s, [], SIM_DT);
    expect(s.drops[0].rearm).toBe(false);
    // …and walking back picks it up again
    s.player.pos = { ...s.drops[0].pos };
    update(s, [], SIM_DT);
    expect(s.drops).toHaveLength(0);
    expect(s.player.inventory[0]).toMatchObject({ defId: 'slime_gel', qty: 7 });
  });

  it('is a silent no-op on an invalid index', () => {
    const s = newGame(1); s.mobs = [];
    update(s, [{ type: 'dropItem', index: 3 }], SIM_DT);
    expect(s.drops).toHaveLength(0);
  });
});

describe('defense & dodge (seeded melee mitigation)', () => {
  it('applies defense mitigation when the seeded roll does not dodge', () => {
    const s = newGame(1); // warrior base defense 5, dodge 3
    s.rng = 999;
    const a = effectiveAttributes(s.player.classId, s.player.stats, s.player.equipment);
    const roll = rand({ rng: s.rng }) * 100; // probe the same roll without consuming s.rng
    const expected = roll < a.dodge ? 0 : Math.round(50 * 100 / (100 + a.defense));
    expect(meleeMitigatedDamage(s, 50)).toBe(expected);
  });

  it('dodge negates the hit entirely when dodge exceeds any roll', () => {
    const s = newGame(1);
    s.rng = 999;
    s.player.stats = { ...emptyStats(), DEX: 300 }; // dodge >> 100, so every [0,100) roll dodges
    expect(effectiveAttributes(s.player.classId, s.player.stats, s.player.equipment).dodge).toBeGreaterThan(100);
    expect(meleeMitigatedDamage(s, 50)).toBe(0);
  });
});

describe('movementSpeed derivation', () => {
  it('is PLAYER_SPEED at the class baseline (0 stats/gear)', () => {
    const s = newGame(1);
    expect(moveSpeed(s.player)).toBeCloseTo(PLAYER_SPEED);
  });

  it('scales up with DEX over the class base and clamps at 1.8x', () => {
    const s = newGame(1); // warrior DEX→movementSpeed 1 * 0.9 mod = +0.9/pt
    s.player.stats = { ...emptyStats(), DEX: 20 }; // +18 movementSpeed over base
    expect(moveSpeed(s.player)).toBeCloseTo(PLAYER_SPEED * (1 + 18 * MOVE_PER_POINT));
    s.player.stats = { ...emptyStats(), DEX: 10000 };
    expect(moveSpeed(s.player)).toBeCloseTo(PLAYER_SPEED * 1.8);
  });
});

describe('arrowsPerCharsInterval derivation (bow tempo helper)', () => {
  it('is the base chars/arrow at the class baseline', () => {
    const s = newGame(1);
    expect(arrowsPerCharsInterval(s.player)).toBe(5);
  });

  it('drops with attackSpeed and clamps to [2,5]', () => {
    const s = newGame(1); // warrior DEX→attackSpeed 0.9/pt
    s.player.stats = { ...emptyStats(), DEX: 20 }; // +18 attackSpeed → round(5 - 1.8) = 3
    expect(arrowsPerCharsInterval(s.player)).toBe(3);
    s.player.stats = { ...emptyStats(), DEX: 10000 };
    expect(arrowsPerCharsInterval(s.player)).toBe(2);
  });
});

describe('routeKeydown (pure keystroke router)', () => {
  const k = (over: Partial<KeyInfo> & { code: string }): KeyInfo =>
    ({ key: '', altKey: false, ctrlKey: false, metaKey: false, ...over });

  it('travel: a digit enters fight and selects that fire mode', () => {
    const r = routeKeydown('travel', false, k({ code: 'Digit2', key: '2' }));
    expect(r.mode).toBe('fight');
    expect(r.clearHeld).toBe(true);
    expect(r.events).toEqual([{ type: 'setMode', mode: 'fight' }, { type: 'setFireMode', fireMode: 2 }]);
    expect(r.events.some((e) => e.type === 'char')).toBe(false);
  });

  it('travel: Space enters fight with fire mode 1', () => {
    const r = routeKeydown('travel', false, k({ code: 'Space', key: ' ' }));
    expect(r.mode).toBe('fight');
    expect(r.events).toEqual([{ type: 'setMode', mode: 'fight' }, { type: 'setFireMode', fireMode: 1 }]);
  });

  it('travel: WSAD/arrows are movement, other printables are inert (no typing)', () => {
    expect(routeKeydown('travel', false, k({ code: 'KeyW', key: 'w' })).movePress).toBe(0);
    expect(routeKeydown('travel', false, k({ code: 'ArrowLeft' })).movePress).toBe(3);
    const q = routeKeydown('travel', false, k({ code: 'KeyQ', key: 'q' }));
    expect(q.movePress).toBeNull();
    expect(q.events).toEqual([]); // letters don't type in travel
  });

  it('travel: i/c toggle windows without typing', () => {
    expect(routeKeydown('travel', false, k({ code: 'KeyI', key: 'i' })).ui).toBe('toggleInventory');
    expect(routeKeydown('travel', false, k({ code: 'KeyC', key: 'c' })).ui).toBe('toggleCharacter');
  });

  it('fight: Space types a space', () => {
    const r = routeKeydown('fight', false, k({ code: 'Space', key: ' ' }));
    expect(r.mode).toBe('fight');
    expect(r.preventDefault).toBe(true);
    expect(r.events).toEqual([{ type: 'char', ch: ' ' }]);
  });

  it('fight: a plain digit types (prompts may contain them)', () => {
    expect(routeKeydown('fight', false, k({ code: 'Digit2', key: '2' })).events).toEqual([{ type: 'char', ch: '2' }]);
  });

  it('fight: Alt+digit selects the fire mode and does NOT type', () => {
    const r = routeKeydown('fight', false, k({ code: 'Digit3', key: '3', altKey: true }));
    expect(r.events).toEqual([{ type: 'setFireMode', fireMode: 3 }]);
    expect(r.events.some((e) => e.type === 'char')).toBe(false);
    expect(r.mode).toBe('fight');
  });

  it('fight: Esc exits to travel', () => {
    const r = routeKeydown('fight', false, k({ code: 'Escape', key: 'Escape' }));
    expect(r.mode).toBe('travel');
    expect(r.events).toEqual([{ type: 'setMode', mode: 'travel' }]);
  });

  it('fight: Backspace is inert — it does not exit fight (no delete-buffer to erase)', () => {
    const r = routeKeydown('fight', false, k({ code: 'Backspace', key: 'Backspace' }));
    expect(r.mode).toBe('fight');
    expect(r.events).toEqual([]);
  });

  it('fight: Esc closes an open window before it exits fight', () => {
    const r = routeKeydown('fight', true, k({ code: 'Escape', key: 'Escape' }));
    expect(r.ui).toBe('closeWindows');
    expect(r.mode).toBe('fight'); // still in fight — a second Esc (no window) exits
    expect(r.events).toEqual([]);
  });

  it('backtick returns to travel from fight without typing', () => {
    const r = routeKeydown('fight', false, k({ code: 'Backquote', key: '`' }));
    expect(r.mode).toBe('travel');
    expect(r.events).toEqual([{ type: 'setMode', mode: 'travel' }]);
  });
});

describe('control modes (travel / fight)', () => {
  it('typing does nothing in travel — no prompt, no damage', () => {
    const s = stateWith([{ defId: 'slime', pos: NEAR }]); // stateWith puts us in fight
    s.mode = 'travel';
    syncCombat(s);
    expect(s.combat).toBeNull();
    const hp0 = s.mobs[0].hp;
    resolveKeystroke(s, 'a');
    expect(s.mobs[0].hp).toBe(hp0); // inert
  });

  it('entering fight builds the prompt; leaving hides it but keeps aggro', () => {
    const s = newGame(1);
    s.mobs = [{
      id: 1, defId: 'slime', pos: { ...NEAR }, hp: MOBS.slime.hp,
      state: 'aggro', spotIdx: 0, home: { ...NEAR }, shield: false, shieldsUsed: 0,
    }];
    update(s, [{ type: 'setMode', mode: 'fight' }], SIM_DT);
    expect(s.mode).toBe('fight');
    expect(s.combat).not.toBeNull();
    update(s, [{ type: 'setMode', mode: 'travel' }], SIM_DT);
    expect(s.combat).toBeNull();
    expect(s.mobs[0].state).toBe('aggro'); // aggro persists across the boundary
  });

  it('setFireMode records the selected mode', () => {
    const s = newGame(1);
    update(s, [{ type: 'setFireMode', fireMode: 3 }], SIM_DT);
    expect(s.fireMode).toBe(3);
  });

  it('movement is gated to travel — held keys do not move in fight', () => {
    const s = newGame(1); s.mobs = [];
    s.mode = 'fight';
    const start = { ...s.player.pos };
    update(s, [{ type: 'move', dirs: [0] }], SIM_DT);
    for (let i = 0; i < 20; i++) update(s, [], SIM_DT);
    expect(s.player.pos).toEqual(start); // stayed put while typing
  });
});
