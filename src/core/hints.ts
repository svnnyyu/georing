// The three hints, unlocked in a fixed order (see docs/SPEC.md -> Hints).

import {
  HINT_AREA_MAX_OFFSET_FRACTION,
  HINT_AREA_MIN_IN_RING,
  HINT_AREA_MIN_LAND,
  HINT_AREA_RADIUS_FRACTION,
  HINT_AREA_SAMPLES,
  HINT_AREA_TRIES,
} from '../config.ts';
import { cityOrThrow, type GameData } from './data.ts';
import { destination, distanceKm, type LatLon } from './geo.ts';
import { isLand } from './land.ts';
import type { Rng } from './random.ts';
import type { AreaCircle, HintKind, Ring } from './types.ts';

export const HINT_ORDER: readonly HintKind[] = ['country', 'area', 'letter'];

export function nextHint(used: readonly HintKind[]): HintKind | null {
  return HINT_ORDER.find((h) => !used.includes(h)) ?? null;
}

const GOLDEN_ANGLE = 180 * (3 - Math.sqrt(5)); // degrees

/** How much of a circle lies inside the ring (around start) and over land, as shares of its
 *  area, measured at HINT_AREA_SAMPLES points spread evenly over it (a sunflower pattern).
 *  Without a land grid, land counts as 1. */
export function circleShares(data: GameData, circle: AreaCircle, ring: Ring, start: LatLon): { inRing: number; land: number } {
  let inRing = 0;
  let land = 0;
  for (let i = 0; i < HINT_AREA_SAMPLES; i++) {
    const p = destination(circle, i * GOLDEN_ANGLE, circle.radiusKm * Math.sqrt((i + 0.5) / HINT_AREA_SAMPLES));
    const d = distanceKm(start, p);
    if (d >= ring.innerKm && d <= ring.outerKm) inRing++;
    if (!data.land || isLand(data.land, p)) land++;
  }
  return { inRing: inRing / HINT_AREA_SAMPLES, land: land / HINT_AREA_SAMPLES };
}

/** Where a country lies within a ring: the average position of the ring's units in that
 *  country (averaged as directions on the sphere, so it works across the date line). A big
 *  country's own middle can be far from the ring (Russia's is in Siberia), which is why this
 *  uses only the part inside the ring. null if the ring has none there. */
export function countryFocus(data: GameData, ring: Ring, cc: string): LatLon | null {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  const rad = Math.PI / 180;
  for (const id of ring.unitIds) {
    const c = cityOrThrow(data, id);
    if (c.cc !== cc) continue;
    const lat = c.lat * rad;
    const lon = c.lon * rad;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
    n++;
  }
  if (n === 0) return null;
  return { lat: Math.atan2(z, Math.hypot(x, y)) / rad, lon: Math.atan2(y, x) / rad };
}

/** Hint 2: a circle that contains the answer. Its diameter is 2 × HINT_AREA_RADIUS_FRACTION
 *  of the ring width, and its centre is offset from the answer in a random direction, by a
 *  random share of the radius up to HINT_AREA_MAX_OFFSET_FRACTION (spread evenly over the
 *  disc), so the answer can be anywhere inside, not just in the middle. Placements are tried
 *  until one lies mostly inside the ring and over land (HINT_AREA_MIN_IN_RING,
 *  HINT_AREA_MIN_LAND); if none does, the one that comes closest is used. */
export interface AreaCircleSize {
  /** Radius as a share of the ring width. */
  radiusFraction: number;
  /** Share of the circle that must lie inside the ring. */
  minInRing: number;
}

/** Cities mode's circle; Countries mode passes HINT_AREA_COUNTRIES. */
export const CITY_AREA_CIRCLE: AreaCircleSize = { radiusFraction: HINT_AREA_RADIUS_FRACTION, minInRing: HINT_AREA_MIN_IN_RING };

export function areaCircle(
  data: GameData,
  ring: Ring,
  answer: LatLon,
  start: LatLon,
  rng: Rng,
  size: AreaCircleSize = CITY_AREA_CIRCLE,
): AreaCircle {
  const radiusKm = size.radiusFraction * (ring.outerKm - ring.innerKm);
  let best: AreaCircle | null = null;
  let bestShort = Infinity;
  for (let t = 0; t < HINT_AREA_TRIES; t++) {
    const bearing = rng() * 360;
    const offsetKm = Math.sqrt(rng()) * HINT_AREA_MAX_OFFSET_FRACTION * radiusKm;
    const centre = destination(answer, bearing, offsetKm);
    const circle = { lat: centre.lat, lon: centre.lon, radiusKm };
    const s = circleShares(data, circle, ring, start);
    const short = Math.max(0, size.minInRing - s.inRing) + Math.max(0, HINT_AREA_MIN_LAND - s.land);
    if (short === 0) return circle;
    if (short < bestShort) {
      best = circle;
      bestShort = short;
    }
  }
  return best!;
}

/** Hint 3: the first letter of the answer's display name ("Starts with T"). */
export function firstLetter(name: string): string {
  const m = name.match(/\p{L}/u);
  return (m ? m[0] : name.charAt(0)).toUpperCase();
}
