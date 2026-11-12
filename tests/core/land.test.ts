import { describe, expect, it } from 'vitest';
import { isLand } from '../../src/core/land.ts';
import { realData } from './fixtures.ts';

describe('land grid', () => {
  const land = realData().data.land!;

  it('knows land from sea', () => {
    for (const [lat, lon] of [
      [48.86, 2.35], // Paris
      [23, 12], // Sahara
      [-25, 134], // central Australia
      [62, 100], // Siberia
      [-80, 0], // Antarctica
      [-12.05, -77.0], // Lima, on the coast
    ]) {
      expect(isLand(land, { lat: lat!, lon: lon! }), `${lat},${lon}`).toBe(true);
    }
    for (const [lat, lon] of [
      [30, -40], // mid-Atlantic
      [0, -150], // Pacific
      [-40, 80], // Indian Ocean
      [47.7, -87.5], // Lake Superior (a lake inside land)
      [43, 34], // Black Sea
    ]) {
      expect(isLand(land, { lat: lat!, lon: lon! }), `${lat},${lon}`).toBe(false);
    }
  });

  it('wraps longitudes and clamps the poles', () => {
    expect(isLand(land, { lat: 48.86, lon: 2.35 + 360 })).toBe(true);
    expect(() => isLand(land, { lat: 90, lon: 180 })).not.toThrow();
    expect(() => isLand(land, { lat: -90, lon: -180 })).not.toThrow();
  });
});
