// Every gameplay tuning number lives here.
export const SIM_DT = 1 / 60;

// world / movement
export const TILE_W = 64;
export const TILE_H = 32;
export const PLAYER_SPEED = 4.5;      // tiles per second, free continuous movement
export const PLAYER_RADIUS = 0.3;     // collision radius vs blocked tiles
export const CAMERA_LERP = 0.15;
export const MOVE_PER_POINT = 0.02;   // movementSpeed above class base scales PLAYER_SPEED 2%/point (clamped 0.6–1.8×)

// combat / typing
export const RADIUS_BASE = 1.5;       // damage radius at streak 0 (tiles)
export const RADIUS_PER_STREAK = 0.05;
export const RADIUS_MAX = 5.0;
export const PHYS_DAMAGE_SCALE = 0.25; // per-correct-char dmg = round(physicalDamage * this); warrior base 8 → 2/char
export const WEAPON_ILVL_DMG = 0.5;    // equipped weapon adds itemLevel*this to physicalDamage (ilvl5 → +2.5)
export const DEFENSE_K = 100;          // melee mitigation: dmg * K/(K+defense); base def 5 → ~4.8% off
export const BOSS_ENRAGE_HP = 0.5;    // fraction of max HP
export const BOSS_ENRAGE_TYPO_MULT = 1.5;
export const BOSS_SHIELD_AT = [0.66, 0.33]; // HP fractions triggering shield phases
export const PROMPT_MP_REWARD = 5;    // mana per completed prompt
export const PROMPT_TARGET_LEN: Record<number, number> = { 1: 5, 2: 10, 3: 18, 4: 28 };

// controls / input
// NOTE: milliseconds — unlike the second-based timers elsewhere here; dt is converted where it's ticked.
export const ESC_HOLD_EXIT_FIGHT_MS = 1000; // Esc held this long in fight (no window open) exits to travel

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
export const INV_PAGE_H = 6;             // visible rows per bag page
export const INV_PAGES = 3;              // Metin2-style bag pages (I/II/III)
// Total logical rows. Items never span a page boundary (items.ts enforces it).
// 180 cells > old flat ≤30, so v1 bags always fit on migration.
export const INV_H = INV_PAGE_H * INV_PAGES;
export const GOLD_PER_COIN = 1;          // copper_coin → gold conversion rate (provisional)
export const DROP_REARM_MARGIN = 0.25;   // player-thrown drops re-arm for pickup this far beyond PICKUP_RADIUS

// combat rebuild — provisional stubs, tuned in A2/C1/C2 (life-leech & attack speed)
export const LEECH_CAP = 0.10;           // max fraction of dealt damage returned as HP (C1)
export const LEECH_GAIN_PER_CHAR = 0.01; // meter rise per correct keystroke (C1)
export const LEECH_DRAIN_PER_HP = 0.01;  // meter drop per HP lost when hit (C1)
export const LEECH_TYPO_PENALTY = 0.5;   // meter drop on a typo (C1)
export const LEECH_REGEN_DELAY = 10;     // seconds after last damage before out-of-combat refill (C1)
export const LEECH_REGEN_PER_S = 0.1;    // refill rate per second once regen starts (C1)
export const BOW_BASE_CHARS_PER_ARROW = 5; // correct letters per arrow, reduced by attackSpeed (A2/C2)
export const ATK_PER_POINT = 0.1;        // attackSpeed above class base cuts chars/arrow: +10 → −1 char (clamped 2–5)

// save
export const AUTOSAVE_SECONDS = 10;
export const MAX_CHARACTERS = 4;
