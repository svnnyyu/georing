import { describe, expect, it } from 'vitest';
import { destination, distanceKm, distanceOutsideKm, kmToDegrees, ringNumberFor } from '../../src/core/geo.ts';

describe('distanceKm', () => {
  it('matches known great-circle distances', () => {
    const london = { lat: 51.5074, lon: -0.1278 };
    const paris = { lat: 48.8566, lon: 2.3522 };
    const nyc = { lat: 40.7128, lon: -74.006 };
    const la = { lat: 34.0522, lon: -118.2437 };
    expect(distanceKm(london, paris)).toBeCloseTo(344, -1);
    expect(distanceKm(nyc, la)).toBeCloseTo(3936, -1);
    expect(distanceKm(nyc, nyc)).toBe(0);
  });

  it('handles the date line and the poles', () => {
    expect(distanceKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeCloseTo(111.2, 0);
    expect(distanceKm({ lat: 90, lon: 0 }, { lat: 90, lon: 120 })).toBeCloseTo(0, 6);
    expect(distanceKm({ lat: 89, lon: 0 }, { lat: 89, lon: 180 })).toBeCloseTo(222.4, 0);
  });
});

describe('destination', () => {
  it('lands at the requested distance in any direction', () => {
    const start = { lat: 35, lon: 139 };
    for (const bearing of [0, 45, 90, 180, 270, 333]) {
      for (const km of [1, 50, 999]) {
        expect(distanceKm(start, destination(start, bearing, km))).toBeCloseTo(km, 6);
      }
    }
  });

  it('wraps longitude across the date line', () => {
    const p = destination({ lat: 0, lon: 179.9 }, 90, 100);
    expect(p.lon).toBeLessThan(-179);
    expect(p.lon).toBeGreaterThanOrEqual(-180);
  });

  it('works near the poles', () => {
    const p = destination({ lat: 89.5, lon: 10 }, 0, 200);
    expect(distanceKm({ lat: 89.5, lon: 10 }, p)).toBeCloseTo(200, 6);
  });
});

describe('ring membership', () => {
  it('puts a point in ring k when inner < d <= outer', () => {
    expect(ringNumberFor(0, 100, 3)).toBeNull();
    expect(ringNumberFor(0.001, 100, 3)).toBe(1);
    expect(ringNumberFor(100, 100, 3)).toBe(1);
    expect(ringNumberFor(100.0001, 100, 3)).toBe(2);
    expect(ringNumberFor(200, 100, 3)).toBe(2);
    expect(ringNumberFor(300, 100, 3)).toBe(3);
    expect(ringNumberFor(300.0001, 100, 3)).toBeNull();
  });

  it('measures how far a point is outside a band', () => {
    expect(distanceOutsideKm(250, 100, 200)).toBe(50);
    expect(distanceOutsideKm(60, 100, 200)).toBe(40);
    expect(distanceOutsideKm(150, 100, 200)).toBe(0);
    expect(distanceOutsideKm(100, 100, 200)).toBe(0);
  });

  it('converts km to degrees of arc', () => {
    expect(kmToDegrees(6371 * Math.PI)).toBeCloseTo(180, 9);
    expect(kmToDegrees(111.19)).toBeCloseTo(1, 3);
  });
});
