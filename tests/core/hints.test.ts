import { describe, expect, it } from 'vitest';
import {
  HINT_AREA_MAX_OFFSET_FRACTION,
  HINT_AREA_MIN_IN_RING,
  HINT_AREA_MIN_LAND,
  HINT_AREA_RADIUS_FRACTION,
} from '../../src/config.ts';
import { buildGameData, cityOrThrow, unitIdOf } from '../../src/core/data.ts';
import { destination, distanceKm } from '../../src/core/geo.ts';
import { areaCircle, circleShares, countryFocus, firstLetter, nextHint } from '../../src/core/hints.ts';
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

});

/** Checks the area circle contract for many random seeds. */
function checkCircles(
  data: ReturnType<typeof synthetic>['data'],
  ring: ReturnType<typeof buildRings>[number],
  startId: number,
) {
  const answer = cityOrThrow(data, ring.answerId!);
  const start = cityOrThrow(data, startId);
  const radius = HINT_AREA_RADIUS_FRACTION * (ring.outerKm - ring.innerKm);
  let maxOffset = 0;
  for (let seed = 0; seed < 100; seed++) {
    const c = areaCircle(data, ring, answer, start, createRng(seed));
    expect(c.radiusKm).toBeCloseTo(radius, 6); // diameter = 2 × the fraction of the ring width
    const d = distanceKm(c, answer);
    expect(d).toBeLessThanOrEqual(c.radiusKm * HINT_AREA_MAX_OFFSET_FRACTION + 1e-6); // answer inside
    maxOffset = Math.max(maxOffset, d / c.radiusKm);
  }
  expect(maxOffset).toBeGreaterThan(0.3); // not always in the middle
}

describe('area circle', () => {
  it('always contains the answer, anywhere inside, at the configured size (real data)', () => {
    const { data } = realData();
    for (const name of ['Tokyo', 'London', 'Lagos', 'Chongqing']) {
      const startId = idOf(data, name);
      const rings = buildRings(data, startId, { widthKm: 1000, ringCount: 3, measure: 'city' });
      for (const ring of rings) if (ring.answerId !== null) checkCircles(data, ring, startId);
    }
  });

  it('lies mostly inside the ring and over land when it can (real data)', () => {
    const { data } = realData();
    // Coastal starts, where a careless circle would sit half in the sea or over the ring edge.
    // (Not Tokyo: Japan is too narrow for a 750 km circle to be half land; it gets the closest fit.)
    for (const name of ['Delhi', 'Lagos', 'Lima', 'Sydney', 'Brussels', 'Mumbai']) {
      const startId = idOf(data, name);
      const start = cityOrThrow(data, startId);
      for (const ring of buildRings(data, startId, { widthKm: 1000, ringCount: 2, measure: 'city' })) {
        if (ring.answerId === null) continue;
        let ok = 0;
        for (let seed = 0; seed < 20; seed++) {
          const c = areaCircle(data, ring, cityOrThrow(data, ring.answerId), start, createRng(seed));
          const s = circleShares(data, c, ring, start);
          if (s.inRing >= HINT_AREA_MIN_IN_RING && s.land >= HINT_AREA_MIN_LAND) ok++;
        }
        expect(ok, `${name} ring ${ring.index + 1}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('still gives a circle around a small island, the best it can', () => {
    const { data } = realData();
    const startId = idOf(data, 'Honolulu');
    const ring = buildRings(data, startId, { widthKm: 500, ringCount: 1, measure: 'city' })[0]!;
    if (ring.answerId !== null) checkCircles(data, ring, startId);
  });

  it('is repeatable for the same seed', () => {
    const { data } = realData();
    const startId = idOf(data, 'Tokyo');
    const start = cityOrThrow(data, startId);
    const ring = buildRings(data, startId, { widthKm: 500, ringCount: 1, measure: 'city' })[0]!;
    const answer = cityOrThrow(data, ring.answerId!);
    expect(areaCircle(data, ring, answer, start, createRng(9))).toEqual(
      areaCircle(data, ring, answer, start, createRng(9)),
    );
  });

  it('works across the date line and near the poles (no land grid)', () => {
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
        if (ring.answerId !== null) checkCircles(data, ring, startId);
      }
    }
  });
});

describe('country focus', () => {
  it("is where the country lies within the ring, not the country's own middle", () => {
    const { data } = realData();
    const startId = idOf(data, 'Helsinki');
    const ring = buildRings(data, startId, { widthKm: 1000, ringCount: 1, measure: 'city' })[0]!;
    const f = countryFocus(data, ring, 'RU')!;
    // Russia's cities within 1,000 km of Helsinki are around St Petersburg and Moscow, far west
    // of Russia's middle in Siberia.
    expect(distanceKm(f, cityOrThrow(data, startId))).toBeLessThan(1000);
    expect(f.lon).toBeGreaterThan(25);
    expect(f.lon).toBeLessThan(45);
    expect(countryFocus(data, ring, 'BR')).toBeNull();
  });

  it('averages across the date line', () => {
    const cities: City[] = [
      { id: 1, name: 'Start', ascii: 'Start', lat: 0, lon: 179, pop: 1e6, cc: 'XX', admin1: '', aliases: [], wellKnown: true },
      { id: 2, name: 'East', ascii: 'East', lat: 0, lon: 179.5, pop: 2e5, cc: 'YY', admin1: '', aliases: [], wellKnown: false },
      { id: 3, name: 'West', ascii: 'West', lat: 0, lon: -179.5, pop: 1e5, cc: 'YY', admin1: '', aliases: [], wellKnown: false },
    ];
    const data = buildGameData({ cities, metros: [], countries: {} });
    const ring = buildRings(data, 1, { widthKm: 500, ringCount: 1, measure: 'city' })[0]!;
    expect(Math.abs(countryFocus(data, ring, 'YY')!.lon)).toBeCloseTo(180, 5);
  });
});
