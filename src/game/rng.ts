// mulberry32-style PRNG whose state lives in the game state (determinism).
export interface RngCarrier { rng: number }

export function rand(s: RngCarrier): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (s: RngCarrier, min: number, max: number): number =>
  min + Math.floor(rand(s) * (max - min + 1));

export const pick = <T>(s: RngCarrier, arr: readonly T[]): T =>
  arr[Math.floor(rand(s) * arr.length)];
