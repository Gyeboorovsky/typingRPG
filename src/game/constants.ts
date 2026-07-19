// Every gameplay tuning number lives here.
import type { Tier } from './types';

export const SIM_DT = 1 / 60;

// world / movement
export const TILE_W = 64;
export const TILE_H = 32;
export const PLAYER_SPEED = 4.5;      // tiles per second, free continuous movement
export const PLAYER_RADIUS = 0.3;     // collision radius vs blocked tiles
export const CAMERA_LERP = 0.15;
export const MOVE_PER_POINT = 0.02;   // movementSpeed above class base scales PLAYER_SPEED 2%/point (clamped 0.6–1.8×)

// combat / typing
// AoE damage-ring dynamics (tiles). The ring is a live value on CombatState.aoe:
// it grows as you type, shrinks when you stop, and drops on a miss — decoupled
// from `streak` (which now only drives the ultimate).
export const AOE_MIN = 1.5;            // ring floor / starting radius
export const AOE_MAX = 5.0;            // ring cap
export const AOE_GROWTH_PER_CHAR = 0.05; // ring grows this much per correct keystroke
export const AOE_DECAY_PER_SEC = 0.6;  // ring shrinks this fast while idle
export const AOE_DECAY_DELAY = 1.0;    // seconds of no typing before the shrink starts
export const AOE_DROP_ON_MISS = 0.25;  // fraction of the ring lost on a typo
export const PHYS_DAMAGE_SCALE = 0.25; // per-correct-char dmg = round(physicalDamage * this); warrior base 8 → 2/char
export const WEAPON_ILVL_DMG = 0.5;    // equipped weapon adds itemLevel*this to physicalDamage (ilvl5 → +2.5)
export const DEFENSE_K = 100;          // melee mitigation: dmg * K/(K+defense); base def 5 → ~4.8% off
export const BOSS_ENRAGE_HP = 0.5;    // fraction of max HP
export const BOSS_ENRAGE_TYPO_MULT = 1.5;
export const BOSS_SHIELD_AT = [0.66, 0.33]; // HP fractions triggering shield phases
export const PROMPT_MP_REWARD = 5;    // mana per completed prompt
// HP regenerated per completed prompt, scaled by the prompt's tier (tier * this):
// tier1 → 2 HP … tier4 → 8 HP. Tougher prompt heals more. NOTE: unconditional
// single-player heal today — a future PvP mode must NOT heal the attacker off an
// opponent's prompt; gate this when PvP lands.
export const PROMPT_HP_REWARD_PER_TIER = 2;
export const PROMPT_TARGET_LEN: Record<number, number> = { 1: 5, 2: 10, 3: 18, 4: 28 };

// Prompt word tier when no mob is aggroed (the "Chill", no-target state).
export const CHILL_FALLBACK_TIER: Tier = 1;

// controls / input
// NOTE: milliseconds — unlike the second-based timers elsewhere here; dt is converted where it's ticked.
export const ESC_HOLD_EXIT_FIGHT_MS = 1000; // Esc held this long in fight (no window open) exits to travel

// ultimate
export const ULT_DAMAGE = 25;
export const ULT_RADIUS_MULT = 1.5;

// player
export const XP_CURVE = (level: number): number => Math.round(100 * Math.pow(level, 1.5));
export const RESPAWN_FULL = true;     // future knob: XP loss on death
export const MAX_LEVEL = 120;         // Metin2's cap. Used ONLY as the set-level cheat's clamp — natural levelling is unbounded.

// mobs
export const LEASH_DIST = 10;         // tiles from home before mob resets
export const MOB_STOP_DIST = 0.8;     // melee mobs stop this close to the player
// Ranged AI: a mob stops approaching at max(MOB_STOP_DIST, attackRange − this margin),
// so archer-types hold position just inside their own attack range (Metin2-style).
export const RANGED_APPROACH_MARGIN = 0.5;
// On-miss volley jitter (seconds): each triggered mob lands its special after a small
// random-feeling delay so a pack's punishment reads as a stream, not one frame-slam.
// Derived from a per-mob hash, NOT state.rng — combat timing must never shift loot rolls.
export const MOB_ONMISS_JITTER_MIN = 0.05;
export const MOB_ONMISS_JITTER_MAX = 0.2;
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
