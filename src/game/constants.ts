// Every gameplay tuning number lives here.
export const SIM_DT = 1 / 60;

// world / movement
export const TILE_W = 64;
export const TILE_H = 32;
export const PLAYER_SPEED = 4.5;      // tiles per second, free continuous movement
export const PLAYER_RADIUS = 0.3;     // collision radius vs blocked tiles
export const CAMERA_LERP = 0.15;

// combat / typing
export const RADIUS_BASE = 1.5;       // damage radius at streak 0 (tiles)
export const RADIUS_PER_STREAK = 0.05;
export const RADIUS_MAX = 5.0;
export const TYPO_DAMAGE: Record<number, number> = { 1: 3, 2: 6, 3: 10, 4: 15 };
export const BOSS_ENRAGE_HP = 0.5;    // fraction of max HP
export const BOSS_ENRAGE_TYPO_MULT = 1.5;
export const BOSS_SHIELD_AT = [0.66, 0.33]; // HP fractions triggering shield phases
export const PROMPT_MP_REWARD = 5;    // mana per completed prompt
export const PROMPT_TARGET_LEN: Record<number, number> = { 1: 5, 2: 10, 3: 18, 4: 28 };

// ultimate
export const ULT_DAMAGE = 25;
export const ULT_RADIUS_MULT = 1.5;

// player
export const XP_CURVE = (level: number): number => Math.round(100 * Math.pow(level, 1.5));
export const RESPAWN_FULL = true;     // future knob: XP loss on death

// mobs
export const LEASH_DIST = 10;         // tiles from home before mob resets
export const MOB_STOP_DIST = 0.8;     // mobs stop this close to the player
export const PACK_LINK_RADIUS = 2;    // same-spot mobs this close to an aggroed mob join in
export const MOB_SEPARATION = 0.45;   // min distance between mobs (soft push)
export const RESPAWN_SECONDS = 15;
export const BOSS_RESPAWN_SECONDS = 60;
export const RESPAWN_MIN_PLAYER_DIST = 8; // don't respawn while player is close
export const MOB_RADIUS = 0.35;       // collision radius vs blocked tiles

// loot
export const DROP_DESPAWN_SECONDS = 60;
export const PICKUP_RADIUS = 0.75;

// inventory / currency
export const INV_W = 10;                 // grid columns
export const INV_H = 6;                  // grid rows — 60 cells > old flat ≤30, so v1 bags always fit
export const GOLD_PER_COIN = 1;          // copper_coin → gold conversion rate (provisional)

// combat rebuild — provisional stubs, tuned in A2/C1/C2 (life-leech & attack speed)
export const LEECH_CAP = 0.10;           // max fraction of dealt damage returned as HP (C1)
export const LEECH_GAIN_PER_CHAR = 0.01; // meter rise per correct keystroke (C1)
export const LEECH_DRAIN_PER_HP = 0.01;  // meter drop per HP lost when hit (C1)
export const LEECH_TYPO_PENALTY = 0.5;   // meter drop on a typo (C1)
export const LEECH_REGEN_DELAY = 10;     // seconds after last damage before out-of-combat refill (C1)
export const LEECH_REGEN_PER_S = 0.1;    // refill rate per second once regen starts (C1)
export const BOW_BASE_CHARS_PER_ARROW = 5; // correct letters per arrow, reduced by attackSpeed (A2/C2)

// save
export const AUTOSAVE_SECONDS = 10;
export const MAX_CHARACTERS = 4;
