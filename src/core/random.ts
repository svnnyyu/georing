// Seeded random numbers, so any game can be replayed exactly from its seed.
// Never use Math.random() in the game (see CLAUDE.md).

/** A function returning floats in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast, good enough for games. Same seed, same sequence. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new seed derived from a seed and a label, e.g. one stream per ring's hints. */
export function deriveSeed(seed: number, ...salt: number[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const s of salt) {
    h = Math.imul(h ^ (s >>> 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h;
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from an empty list');
  return items[randInt(rng, items.length)] as T;
}
