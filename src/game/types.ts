// All shared shapes of the pure simulation. No DOM, no canvas, no Date.
import type { AttributeId, StatId } from './attributes';

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
  ult: { id: string; name: string; manaCost: number; streakThreshold: number; cooldown: number };
}

export type ItemKind = 'weapon' | 'armor' | 'material' | 'consumable';

// The six paperdoll slots. EQUIP_SLOTS mirrors STAT_IDS: a stable ordered list
// for building/cloning the equipment record and for the equipment UI (A3).
export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'boots' | 'necklace' | 'ring';
export const EQUIP_SLOTS: readonly EquipSlot[] =
  ['weapon', 'armor', 'helmet', 'boots', 'necklace', 'ring'];
export type WeaponType = 'sword' | 'greatsword' | 'daggers' | 'bow' | 'staff' | 'wand' | 'grimoire';

export interface ItemDef {
  id: string; name: string; icon: string; kind: ItemKind; tier: Tier;
  maxStack: number; // 1 for gear
  weapon?: { dmgPerChar: number; range?: number }; // range (tiles) drives the bow (behavior later)
  consumable?: { heal?: number; mana?: number };
  // Equipment metadata (gear only; absent on materials/consumables):
  slot?: EquipSlot;
  weaponType?: WeaponType;
  size?: { w: number; h: number };       // grid footprint; absent = 1x1
  reqLevel?: number;                      // character level required to equip
  itemLevel?: number;                     // power level scaling its stats (used later)
  reqClass?: ClassId[];                   // class-gate seam only; unset = usable by all
  bonuses?: Partial<Record<AttributeId, number>>; // flat attribute bonuses while equipped
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
  equipment: Record<EquipSlot, ItemStack | null>; // worn gear, one stack per slot
  gold: number;                  // single currency (copper_coin drops convert to it)
  leech: number;                 // 0..1 life-leech meter; on Player (persists across travel/fight), transient (not saved)
  inventory: (ItemStack & { x: number; y: number })[]; // positioned grid (INV_W x INV_H); stackables are 1x1
  overflow: ItemStack[];         // items that didn't fit the grid (migration fallback)
  invRev: number;       // bumped on inventory change (UI rebuild hint)
  dead: boolean;
  godmode: boolean;     // dev cheat: takes zero damage while true. Transient (not saved).
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

export type Mode = 'travel' | 'fight';

// Dev cheat effects (semantic, not the GTA code spelling — see src/cheats.ts registry).
export type CheatCode = 'setLevel' | 'godmode';

export type InputEvent =
  | { type: 'char'; ch: string }
  | { type: 'move'; dirs: Dir[] } // currently held dirs, newest last
  | { type: 'setMode'; mode: Mode }        // travel ↔ fight (typing prompt shows only in fight)
  | { type: 'setFireMode'; fireMode: number } // bow fire mode (1..4); behavior wired later
  | { type: 'setTravelUnlocked'; value: boolean } // combat-modifier held → travel actions/move unlocked in fight
  | { type: 'devCheat'; code: CheatCode; arg?: number } // dev cheat (hesoyam/baguvix); client-trusted — admin-gate before multiplayer
  | { type: 'ult' }
  | { type: 'respawn' }
  | { type: 'allocateStat'; stat: StatId }
  | { type: 'equip'; index: number }         // inventory[index] → its slot
  | { type: 'unequip'; slot: EquipSlot; x?: number; y?: number } // slot → target cell (or first free)
  | { type: 'moveItem'; index: number; x: number; y: number } // grid reposition
  | { type: 'useItem'; index: number }       // consume inventory[index] (travel only)
  | { type: 'dropItem'; index: number };     // throw inventory[index] on the ground

// `rearm`: set on player-thrown drops — auto-pickup stays off until the player
// leaves the pickup radius once, so the item isn't vacuumed straight back up.
// (Upgrade level `plus` is not carried by ground drops yet — revisit with +0..+9.)
export interface GroundDrop { id: number; defId: string; qty: number; pos: Vec2; age: number; rearm?: boolean }

export interface GameState {
  tick: number;
  rng: number; // PRNG state — all randomness flows through this
  player: Player;
  mobs: Mob[];
  drops: GroundDrop[];
  spots: SpotState[];
  combat: CombatState | null;
  mode: Mode;   // travel = free movement, no prompt; fight = typing-combat prompt shown
  fireMode: number; // selected bow fire mode (1..4); behavior wired later. Transient (not saved).
  travelUnlocked: boolean; // combat-modifier held right now → travel actions + movement work in fight. Transient (not saved).
  held: Dir[]; // held movement keys, newest last
  fx: Fx[];
  bossKilled: boolean;
  dirty: boolean; // save needed
  nextId: number;
}

export interface SaveData {
  v: 1 | 2;
  savedAt: string;
  player: {
    name: string; classId: ClassId; level: number; xp: number; hp: number; mp: number;
    pos: Vec2;
    // x/y are present in v2 saves, absent in v1 (flat bag); applySave resolves at runtime.
    inventory: (ItemStack & { x?: number; y?: number })[];
    equipment?: Record<EquipSlot, ItemStack | null>;
    gold?: number;
    overflow?: ItemStack[];
    stats?: Record<StatId, number>; statPoints?: number;
  };
  bossKilled: boolean;
  // NOT persisted: leech (transient, re-init full on load) and any combat/projectile state.
}

// Tiny shared math helpers
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const playerWorldPos = (p: Player): Vec2 => p.pos;
