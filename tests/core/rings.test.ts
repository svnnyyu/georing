import { describe, expect, it } from 'vitest';
import { buildRings, rankInRing, topUnits } from '../../src/core/rings.ts';
import { unitIdOf } from '../../src/core/data.ts';
import { idOf, nameOf, realData, synthetic } from './fixtures.ts';

describe('buildRings (synthetic)', () => {
  const { data } = synthetic();
  const rings = buildRings(data, 1, { widthKm: 500, ringCount: 5, measure: 'city' });

  it('builds full-width rings', () => {
    expect(rings.map((r) => [r.innerKm, r.outerKm])).toEqual([
      [0, 500],
      [500, 1000],
      [1000, 1500],
      [1500, 2000],
      [2000, 2500],
    ]);
  });

  it('respects boundaries and excludes the start city', () => {
    expect(rings[0]!.unitIds).toContain(4); // Bravo at 499.5 km
    expect(rings[1]!.unitIds).toContain(5); // Charlie at 500.4 km
    expect(rings[0]!.unitIds).not.toContain(1);
    const all = rings.flatMap((r) => r.unitIds);
    expect(new Set(all).size).toBe(all.length); // no city in two rings
  });

  it('sorts each ring by population and picks the largest as the answer', () => {
    expect(rings[0]!.unitIds).toEqual([2, 3, 4, 10]);
    expect(rings[0]!.answerId).toBe(2);
    expect(rings[1]!.answerId).toBe(7);
    expect(rings[2]!.answerId).toBe(11);
    expect(rings[4]!.answerId).toBe(9);
  });

  it('marks empty rings with a null answer', () => {
    expect(rings[3]!.unitIds).toEqual([]);
    expect(rings[3]!.answerId).toBeNull();
  });

  it('merges metros in Metro mode', () => {
    const m = buildRings(data, unitIdOf(data, 'metro', 1), { widthKm: 500, ringCount: 3, measure: 'metro' });
    expect(m[0]!.unitIds).not.toContain(2); // Suburb is part of the start metro
    expect(m[0]!.answerId).toBe(3); // Alpha
    expect(m[1]!.unitIds).toEqual([7, 5]); // Echo's metro (with Delta), then Charlie
  });

  it('ranks units and lists the top ones', () => {
    expect(rankInRing(rings[0]!, 3)).toBe(2);
    expect(rankInRing(rings[0]!, 9)).toBeNull();
    expect(topUnits(data, rings[1]!, 'city', 2)).toEqual([
      { unitId: 7, pop: 600_000 },
      { unitId: 5, pop: 500_000 },
    ]);
  });
});

describe('buildRings (real data, known start cities)', () => {
  const { data } = realData();
  const answers = (start: string, measure: 'city' | 'metro', widthKm = 100, ringCount = 3) => {
    const startId = unitIdOf(data, measure, idOf(data, start));
    return buildRings(data, startId, { widthKm, ringCount, measure }).map((r) => nameOf(data, r.answerId));
  };

  it('New York City', () => {
    expect(answers('New York City', 'city')).toEqual(['Newark', 'Philadelphia', 'Baltimore']);
    expect(answers('New York City', 'metro')).toEqual(['Bridgeport', 'Philadelphia', 'Baltimore']);
  });

  it('London', () => {
    expect(answers('London', 'city')).toEqual(['Reading', 'Birmingham', 'Manchester']);
    expect(answers('London', 'city', 300, 4)).toEqual(['Birmingham', 'Paris', 'Hamburg', 'Berlin']);
  });

  it('Tokyo, Lagos and Chongqing', () => {
    expect(answers('Tokyo', 'city')).toEqual(['Yokohama', 'Shizuoka', 'Nagoya']);
    expect(answers('Lagos', 'city')[1]).toBe('Ibadan');
    expect(answers('Chongqing', 'city')).toEqual(['Yongchuan', 'Nanchong', 'Chengdu']);
  });
});
