// All shared shapes of the pure simulation. No DOM, no canvas, no Date.
import type { StatId } from './attributes';

export type Vec2 = { x: number; y: number };
export type Dir = 0 | 1 | 2 | 3; // 0 up 1 right 2 down 3 left, always screen-relative
// World-space vectors for each screen-relative direction: with the isometric
// projection screenX=(wx-wy), screenY=(wx+wy), moving "left" must decrease
// wx and increase wy equally to move purely left on screen instead of
// running parallel to a world grid line. Fixed to the current (unrotated)
// camera; when camera rotation is added, rotate these by the camera's
// facing angle instead of hardcoding them here.
export const DIR_VECS: readonly Vec2[] = [
  { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 },
];

export type Tier = 1 | 2 | 3 | 4;
export type ClassId = 'warrior' | 'ninja' | 'wizard' | 'priest';

export interface ClassDef {
  id: ClassId; name: string;
  baseHp: number; hpPerLevel: number; baseMp: number; mpPerLevel: number;
  hpRegen: number; hpRegenCombat: number; mpRegen: number;
  baseDamage: number;
  ult: { id: string; name: string; manaCost: number; streakThreshold: number; cooldown: number };
}

export type ItemKind = 'weapon' | 'armor' | 'material' | 'consumable';
export interface ItemDef {
  id: string; name: string; icon: string; kind: ItemKind; tier: Tier;
  maxStack: number; // 1 for gear
  weapon?: { dmgPerChar: number };
  consumable?: { heal?: number; mana?: number };
  // Reserved seams for future upgrade (+0..+9) and crafting systems:
  upgradable?: boolean;
  upgradeMats?: { itemId: string; qty: number }[];
  recipe?: { inputs: { itemId: string; qty: number }[] };
}
export interface ItemStack { defId: string; qty: number; plus?: number }

export interface MobDef {
  id: string; name: string; tier: Tier;
  hp: number; typoDamage: number; xp: number;
  speed: number; aggroRadius: number;
  boss?: boolean;
  drops: { itemId: string; chance: number; min: number; max: number }[];
}

export interface Mob {
  id: number; defId: string;
  pos: Vec2; // float tile coords
  hp: number;
  state: 'idle' | 'aggro' | 'leash';
  spotIdx: number;
  home: Vec2;
  shield: boolean;      // boss: immune until a flawless prompt
  shieldsUsed: number;  // boss: shield phases consumed (max 2)
}

export interface SpawnSpot { defId: string; center: Vec2; count: number; radius: number }
export interface SpotState { pending: number[] } // respawn countdowns in seconds

export interface Player {
  name: string;
  classId: ClassId;
  pos: Vec2;            // continuous world position (tile units)
  dir: Dir;              // facing, for sprite/attack direction
  hp: number; mp: number;
  level: number; xp: number;
  stats: Record<StatId, number>; // spent VIT/INT/STR/DEX points
  statPoints: number;            // unspent points available to allocate
  inventory: ItemStack[];
  invRev: number;       // bumped on inventory change (UI rebuild hint)
  dead: boolean;
  ultCooldown: number;  // seconds
  animT: number;
}

export interface CombatState {
  prompt: string;
  typed: number;   // correct chars so far
  streak: number;
  tier: Tier;
  errorFlash: number; // seconds remaining
}

// Transient render/UI events emitted by the sim, drained each frame.
export type Fx =
  | { kind: 'dmg'; pos: Vec2; value: number }        // damage dealt to a mob
  | { kind: 'hurt'; pos: Vec2; value: number }       // damage taken by player
  | { kind: 'xp'; pos: Vec2; value: number }
  | { kind: 'ult'; pos: Vec2; radius: number }
  | { kind: 'pickup'; text: string }
  | { kind: 'levelup'; level: number }
  | { kind: 'shieldbreak'; pos: Vec2 }
  | { kind: 'death' };

export type InputEvent =
  | { type: 'char'; ch: string }
  | { type: 'move'; dirs: Dir[] } // currently held dirs, newest last
  | { type: 'ult' }
  | { type: 'respawn' }
  | { type: 'allocateStat'; stat: StatId };

export interface GroundDrop { id: number; defId: string; qty: number; pos: Vec2; age: number }

export interface GameState {
  tick: number;
  rng: number; // PRNG state — all randomness flows through this
  player: Player;
  mobs: Mob[];
  drops: GroundDrop[];
  spots: SpotState[];
  combat: CombatState | null;
  held: Dir[]; // held movement keys, newest last
  fx: Fx[];
  bossKilled: boolean;
  dirty: boolean; // save needed
  nextId: number;
}

export interface SaveData {
  v: 1;
  savedAt: string;
  player: {
    name: string; classId: ClassId; level: number; xp: number; hp: number; mp: number;
    pos: Vec2; inventory: ItemStack[];
    stats?: Record<StatId, number>; statPoints?: number;
  };
  bossKilled: boolean;
}

// Tiny shared math helpers
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const playerWorldPos = (p: Player): Vec2 => p.pos;
