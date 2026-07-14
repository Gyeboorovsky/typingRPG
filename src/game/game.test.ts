// Unit tests for the pure simulation core (no DOM, fully seeded).
import { describe, expect, it } from 'vitest';
import { classOf, maxHp } from './classes';
import {
  damageMob, grantXp, radiusFor, resolveKeystroke, syncCombat,
} from './combat';
import {
  BOSS_ENRAGE_TYPO_MULT, PROMPT_MP_REWARD, RADIUS_BASE, RADIUS_MAX, SIM_DT, XP_CURVE,
} from './constants';
import { rollDrops } from './loot';
import { isBlocked } from './map';
import { MOBS } from './mobs';
import { applySave, makeSave, newGame, update } from './sim';
import type { GameState, Mob, Vec2 } from './types';

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
  it('grid-hops toward a held direction', () => {
    const s = newGame(3);
    s.mobs = [];
    update(s, [{ type: 'move', dirs: [0] }], SIM_DT); // hold ArrowUp
    for (let i = 0; i < 20; i++) update(s, [], SIM_DT); // ~0.35 s
    expect(s.player.pos.y).toBe(37); // two hops at 4.5 tiles/s
  });

  it('map blocks borders and water, spawn area is free', () => {
    expect(isBlocked(0, 0)).toBe(true); // border forest
    expect(isBlocked(5, 30)).toBe(true); // lake
    expect(isBlocked(24, 39)).toBe(false); // spawn
    expect(isBlocked(-1, 5)).toBe(true); // out of bounds
  });
});

describe('save roundtrip', () => {
  it('restores progress through JSON serialization', () => {
    const a = newGame(5);
    a.player.level = 4;
    a.player.xp = 123;
    a.player.hp = 55;
    a.player.mp = 40;
    a.player.pos = { x: 20, y: 20 };
    a.player.inventory = [{ defId: 'slime_gel', qty: 7 }, { defId: 'claymore', qty: 1 }];
    a.bossKilled = true;
    const b = newGame(9);
    applySave(b, JSON.parse(JSON.stringify(makeSave(a))));
    expect(b.player.level).toBe(4);
    expect(b.player.xp).toBe(123);
    expect(b.player.hp).toBe(55);
    expect(b.player.mp).toBe(40);
    expect(b.player.pos).toEqual({ x: 20, y: 20 });
    expect(b.player.inventory).toEqual(a.player.inventory);
    expect(b.bossKilled).toBe(true);
  });
});
