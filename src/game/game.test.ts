// Unit tests for the pure simulation core (no DOM, fully seeded).
import { describe, expect, it } from 'vitest';
import { baseAttributes, effectiveAttributes } from './attributes';
import { classOf, maxHp } from './classes';
import {
  damageMob, grantXp, radiusFor, resolveKeystroke, syncCombat,
} from './combat';
import {
  BOSS_ENRAGE_TYPO_MULT, GOLD_PER_COIN, INV_H, INV_W,
  PLAYER_SPEED, PROMPT_MP_REWARD, RADIUS_BASE, RADIUS_MAX, SIM_DT, XP_CURVE,
} from './constants';
import { addToInventory, firstFreeCell } from './items';
import { rollDrops } from './loot';
import { isBlocked } from './map';
import { MOBS } from './mobs';
import { applySave, makeSave, newGame, update } from './sim';
import type { GameState, Mob, SaveData, Vec2 } from './types';

/** A controlled state: player at spawn, exactly these mobs, combat synced. */
function stateWith(mobs: { defId: string; pos: Vec2; hp?: number; shield?: boolean; shieldsUsed?: number }[]): GameState {
  const s = newGame(42);
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
    resolveKeystroke(s, s.combat!.prompt[0]);
    expect(s.mobs[0].hp).toBe(MOBS.slime.hp - classOf(s.player).baseDamage);
    expect(s.mobs[1].hp).toBe(MOBS.slime.hp);
    expect(s.combat!.streak).toBe(1);
    expect(s.combat!.typed).toBe(1);
  });

  it('a typo resets the streak and hurts by the hardest engaged tier', () => {
    const s = stateWith([
      { defId: 'slime', pos: NEAR },
      { defId: 'cultist', pos: { x: 23, y: 38 } },
    ]);
    s.combat!.streak = 12;
    const hp = s.player.hp;
    resolveKeystroke(s, MISS);
    expect(hp - s.player.hp).toBe(MOBS.cultist.typoDamage);
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

  it('punishes typos 1.5x harder when enraged (≤50% HP)', () => {
    const s = stateWith([{ defId: 'typhon', pos: NEAR, hp: 150 }]);
    const hp = s.player.hp;
    resolveKeystroke(s, MISS);
    expect(hp - s.player.hp).toBe(Math.round(MOBS.typhon.typoDamage * BOSS_ENRAGE_TYPO_MULT));
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

  it('addToInventory places gear in the grid and overflows past capacity', () => {
    const s = newGame(1);
    // iron_sword is 1x2 (2 cells); the 10x6 grid holds exactly 30 of them.
    for (let i = 0; i < 30; i++) addToInventory(s.player, 'iron_sword', 1);
    expect(s.player.inventory).toHaveLength(30);
    expect(s.player.overflow).toHaveLength(0);
    addToInventory(s.player, 'iron_sword', 1); // 31st — no room
    expect(s.player.inventory).toHaveLength(30);
    expect(s.player.overflow).toEqual([{ defId: 'iron_sword', qty: 1 }]);
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
