import { describe, expect, it } from 'vitest';
import { HINT_AREA_MAX_CITIES, HINT_AREA_MIN_RADIUS_KM } from '../../src/config.ts';
import { buildGameData, cityOrThrow, unitIdOf } from '../../src/core/data.ts';
import { destination, distanceKm } from '../../src/core/geo.ts';
import { areaCircle, countryHint, firstLetter, nextHint } from '../../src/core/hints.ts';
import { createRng } from '../../src/core/random.ts';
import { buildRings } from '../../src/core/rings.ts';
import type { City } from '../../src/core/types.ts';
import { idOf, realData, synthetic } from './fixtures.ts';

describe('hint order and simple hints', () => {
  it('unlocks country, then area, then letter', () => {
    expect(nextHint([])).toBe('country');
    expect(nextHint(['country'])).toBe('area');
    expect(nextHint(['country', 'area'])).toBe('letter');
    expect(nextHint(['country', 'area', 'letter'])).toBeNull();
  });

  it('gives the first letter of the display name', () => {
    expect(firstLetter('Tokyo')).toBe('T');
    expect(firstLetter("'s-Hertogenbosch")).toBe('S');
    expect(firstLetter('Łódź')).toBe('Ł');
    expect(firstLetter('ürümqi')).toBe('Ü');
  });

  it("names the answer's country", () => {
    const { data } = synthetic();
    expect(countryHint(data, 9)).toEqual({ cc: 'YY', name: 'Whyland' });
  });
});

/** Checks the area circle contract for many random seeds. */
function checkCircles(data: ReturnType<typeof synthetic>['data'], ring: ReturnType<typeof buildRings>[number]) {
  const answer = cityOrThrow(data, ring.answerId!);
  for (let seed = 0; seed < 300; seed++) {
    const c = areaCircle(data, ring, ring.answerId!, createRng(seed));
    expect(distanceKm(c, answer)).toBeLessThanOrEqual(c.radiusKm * 0.5 + 1e-6);
    expect(c.radiusKm).toBeGreaterThanOrEqual(HINT_AREA_MIN_RADIUS_KM);
    expect(c.radiusKm).toBeLessThanOrEqual((ring.outerKm - ring.innerKm) * 0.25 + 1e-9);
    const inside = ring.unitIds.filter((id) => distanceKm(c, cityOrThrow(data, id)) <= c.radiusKm).length;
    if (c.radiusKm > HINT_AREA_MIN_RADIUS_KM) expect(inside).toBeLessThanOrEqual(HINT_AREA_MAX_CITIES);
  }
}

describe('area circle', () => {
  it('always contains the answer, off-centre, and shrinks in dense regions (real data)', () => {
    const { data } = realData();
    for (const name of ['Tokyo', 'London', 'Lagos', 'Chongqing']) {
      const rings = buildRings(data, idOf(data, name), { widthKm: 200, ringCount: 3, measure: 'city' });
      for (const ring of rings) if (ring.answerId !== null) checkCircles(data, ring);
    }
  });

  it('is repeatable for the same seed', () => {
    const { data } = realData();
    const ring = buildRings(data, idOf(data, 'Tokyo'), { widthKm: 100, ringCount: 1, measure: 'city' })[0]!;
    expect(areaCircle(data, ring, ring.answerId!, createRng(9))).toEqual(
      areaCircle(data, ring, ring.answerId!, createRng(9)),
    );
  });

  it('works across the date line and near the poles', () => {
    const make = (start: { lat: number; lon: number }): City[] => {
      const cities: City[] = [
        { id: 1, name: 'Start', ascii: 'Start', ...start, pop: 1e6, cc: 'XX', admin1: '', aliases: [], wellKnown: true },
      ];
      for (let i = 0; i < 40; i++) {
        const p = destination(start, i * 9, 20 + i * 4);
        cities.push({ id: 2 + i, name: `C${i}`, ascii: `C${i}`, ...p, pop: 1000 * (i + 1), cc: 'XX', admin1: '', aliases: [], wellKnown: false });
      }
      return cities;
    };
    for (const start of [{ lat: 0, lon: 179.9 }, { lat: 88, lon: 30 }, { lat: -85, lon: -170 }]) {
      const data = buildGameData({ cities: make(start), metros: [], countries: {} });
      const startId = unitIdOf(data, 'city', 1);
      for (const ring of buildRings(data, startId, { widthKm: 100, ringCount: 2, measure: 'city' })) {
        if (ring.answerId !== null) checkCircles(data, ring);
      }
    }
  });
});
