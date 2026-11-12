import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM, FAR_SIDE_KM, MIN_VIEW_WIDTH_KM, RING_FIT_FRACTION } from '../../src/config.ts';
import {
  angleBetween,
  flyPath,
  interpolateCenter,
  ringView,
  scaleExtent,
  scaleForRadius,
  wholeEarthScale,
} from '../../src/ui/globe/camera.ts';

describe('camera scales', () => {
  const vp = { width: 1200, height: 800 };

  it('fits the whole Earth and limits the closest zoom', () => {
    expect(wholeEarthScale(vp)).toBeCloseTo(360);
    const [min, max] = scaleExtent(vp);
    expect(min).toBeLessThan(wholeEarthScale(vp));
    // At the max scale, the shorter side shows MIN_VIEW_WIDTH_KM.
    expect((800 * EARTH_RADIUS_KM) / max).toBeCloseTo(MIN_VIEW_WIDTH_KM);
  });

  it('fits a ring to RING_FIT_FRACTION of the shorter side', () => {
    for (const km of [100, 500, 3000]) {
      const s = scaleForRadius(km, vp);
      const projected = s * Math.sin(km / EARTH_RADIUS_KM);
      expect(projected * 2).toBeCloseTo(RING_FIT_FRACTION * 800, 3);
    }
  });
});

describe('fly-to path', () => {
  const vp = { width: 1000, height: 1000 };

  it('turns smoothly when leaving a pole, with a finite duration', () => {
    const from = { center: [10, 90] as [number, number], scale: 400 };
    const to = { center: [139.7, 35.7] as [number, number], scale: 9000 };
    const path = flyPath(from, to, vp);
    expect(Number.isFinite(path.durationMs)).toBe(true);
    expect(path.durationMs).toBeLessThanOrEqual(2600);
    // Early in the flight the longitude has only moved a little (no snap to the target).
    const early = path.at(0.05).center;
    expect(Math.abs(early[0] - 10)).toBeLessThan(5);
    // It turns steadily: longitude moves monotonically towards the target.
    let prev = 10;
    for (let t = 0.1; t <= 1; t += 0.1) {
      const lon = path.at(t).center[0];
      expect(lon).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = lon;
    }
    // Exactly at a pole on both ends: still finite.
    expect(Number.isFinite(flyPath(from, { center: [-170, -90], scale: 400 }, vp).durationMs)).toBe(true);
  });

  it('interpolates the shorter way round', () => {
    const f = interpolateCenter([170, 0], [-170, 0]);
    const mid = f(0.5);
    expect(Math.abs(mid[0])).toBeCloseTo(180, 6); // crosses the date line, not Africa
    expect(angleBetween(f(0), [170, 0])).toBeCloseTo(0, 9);
    expect(angleBetween(f(1), [-170, 0])).toBeCloseTo(0, 9);
  });

  it('starts and ends at the requested views', () => {
    const from = { center: [0, 0] as [number, number], scale: 400 };
    const to = { center: [139.7, 35.7] as [number, number], scale: 9000 };
    const path = flyPath(from, to, vp);
    expect(path.at(0).scale).toBeCloseTo(400, 6);
    expect(path.at(1).scale).toBeCloseTo(9000, 6);
    expect(angleBetween(path.at(1).center, to.center)).toBeCloseTo(0, 9);
    expect(path.durationMs).toBeGreaterThan(0);
  });

  it('pulls back mid-flight on long hops between close-ups', () => {
    const a = { center: [-74, 40.7] as [number, number], scale: 20_000 };
    const b = { center: [139.7, 35.7] as [number, number], scale: 20_000 };
    const mid = flyPath(a, b, vp).at(0.5).scale;
    expect(mid).toBeLessThan(2000);
  });
});

describe('ring view', () => {
  it('looks at near rings from the start and far rings from the antipode', () => {
    expect(ringView(51.5, -0.1, 0, 1000)).toEqual({ lat: 51.5, lon: -0.1, radiusKm: 1000 });
    const far = ringView(51.5, -0.1, 16000, 18000);
    expect(far.lat).toBe(-51.5);
    expect(far.lon).toBeCloseTo(179.9);
    expect(far.radiusKm).toBeCloseTo(FAR_SIDE_KM - 16000);
    expect(ringView(-33.9, 151.2, 14000, 16000).lon).toBeCloseTo(-28.8);
  });
});
