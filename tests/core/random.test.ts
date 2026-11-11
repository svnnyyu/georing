import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, pick, randInt, weightedIndex } from '../../src/core/random.ts';

describe('random', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(seqA);
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1)()).not.toEqual(createRng(2)());
  });

  it('stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('derives independent, repeatable seeds per salt', () => {
    expect(deriveSeed(5, 1)).toBe(deriveSeed(5, 1));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(5, 2));
    expect(deriveSeed(5, 2, 0)).not.toBe(deriveSeed(5, 2, 1));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(6, 1));
  });

  it('picks and draws integers within range', () => {
    const r = createRng(3);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 1000; i++) {
      expect(items).toContain(pick(r, items));
      const n = randInt(r, 5);
      expect(n >= 0 && n < 5 && Number.isInteger(n)).toBe(true);
    }
    expect(() => pick(r, [])).toThrow();
  });

  it('picks indices in proportion to their weights', () => {
    const r = createRng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) counts[weightedIndex(r, [1, 2, 7])]!++;
    expect(counts[0]! / 30_000).toBeCloseTo(0.1, 1);
    expect(counts[2]! / 30_000).toBeCloseTo(0.7, 1);
    expect(() => weightedIndex(r, [0, 0])).toThrow();
  });
});
