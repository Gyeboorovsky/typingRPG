// Every gameplay tuning number lives here.
import type { Tier, WeaponType } from './types';

export const SIM_DT = 1 / 60;

// world / movement
export const TILE_W = 64;
export const TILE_H = 32;
export const PLAYER_SPEED = 4.5;      // tiles per second, free continuous movement
export const PLAYER_RADIUS = 0.3;     // collision radius vs blocked tiles
export const CAMERA_LERP = 0.15;
export const MOVE_PER_POINT = 0.02;   // movementSpeed above class base scales PLAYER_SPEED 2%/point (clamped 0.6–1.8×)

// combat / typing
// Attack-range ring (tiles) — ONE model for every weapon (decision 2026-07-19).
// The live radius is per-weapon state on the Player (attackRanges): it persists
// across pack clears and weapon switches WITHIN a fight session; an explicit fight
// exit resets it. Growth is driven by an extensible per-SOURCE config: a rate per
// source, 0 = disabled — any future idea ("grows while moving") is a config entry.
export interface RingGrowth {
  onHit: number;           // per correct char that actually hit ≥1 mob
  onCorrectType: number;   // per correct char, hit or not (typing into the air)
  whileMoving: number;     // per second while moving
  whileStationary: number; // per second while standing still
}
export interface RingConfig {
  min: number; max: number;
  dropOnMiss: number;  // fraction of the ring lost on a typo — flagged for live tuning
                       // (combined with on-miss volleys the total may be too harsh)
  decayDelay: number;  // seconds of no typing before idle decay starts
  decayPerSec: number; // idle shrink rate (also the background rate for unequipped weapons)
  growth: RingGrowth;
}
export const RING_DEFAULT: RingConfig = {
  min: 1.5, max: 5.0,
  dropOnMiss: 0.25,
  decayDelay: 2.75, decayPerSec: 0.4,
  growth: { onHit: 0.05, onCorrectType: 0, whileMoving: 0, whileStationary: 0 },
};
// Per-weapon overrides, merged over RING_DEFAULT. The bow's static-range entry
// (all rates 0) arrives with the weapon-styles stage; until then every weapon
// rings like a sword.
export const RING_BY_WEAPON:
  Partial<Record<WeaponType | 'unarmed', Partial<Omit<RingConfig, 'growth'>> & { growth?: Partial<RingGrowth> }>> = {};

// streak — a bare counter for now (deliberate; the current ult consumes it until the
// per-class ult rebuild). When it grows is a CONFIG choice (decision 2026-07-19).
export const STREAK_GROWTH: 'onAttempt' | 'onHit' = 'onAttempt';
export const STREAK_IDLE_DECAY_DELAY = 5;   // seconds of no typing before the streak starts decaying
export const STREAK_IDLE_DECAY_PER_SEC = 3; // decay rate (float; HUD floors the display)
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
