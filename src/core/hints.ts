// The three hints, unlocked in a fixed order (see docs/SPEC.md -> Hints).

import {
  HINT_AREA_MAX_CITIES,
  HINT_AREA_MAX_OFFSET_FRACTION,
  HINT_AREA_MIN_RADIUS_KM,
  HINT_AREA_SHRINK_FACTOR,
  HINT_AREA_START_FRACTION,
} from '../config.ts';
import { cityOrThrow, countryName, type GameData } from './data.ts';
import { destination, distanceKm } from './geo.ts';
import type { Rng } from './random.ts';
import type { AreaCircle, HintKind, Ring } from './types.ts';

export const HINT_ORDER: readonly HintKind[] = ['country', 'area', 'letter'];

export function nextHint(used: readonly HintKind[]): HintKind | null {
  return HINT_ORDER.find((h) => !used.includes(h)) ?? null;
}

/** Hint 1: the answer's country. */
export function countryHint(data: GameData, answerId: number): { cc: string; name: string } {
  const cc = cityOrThrow(data, answerId).cc;
  return { cc, name: countryName(data, cc) };
}

/** Hint 2: a circle that contains the answer, centred up to half its radius away from it in
 *  a random direction. The radius starts at a quarter of the ring width and shrinks until
 *  the circle holds at most HINT_AREA_MAX_CITIES of the ring's units (minimum 10 km). */
export function areaCircle(data: GameData, ring: Ring, answerId: number, rng: Rng): AreaCircle {
  const answer = cityOrThrow(data, answerId);
  const bearing = rng() * 360;
  const offsetFraction = rng() * HINT_AREA_MAX_OFFSET_FRACTION;
  const ringWidth = ring.outerKm - ring.innerKm;
  const points = ring.unitIds.map((id) => cityOrThrow(data, id));
  let radiusKm = Math.max(HINT_AREA_START_FRACTION * ringWidth, HINT_AREA_MIN_RADIUS_KM);
  for (;;) {
    const centre = destination(answer, bearing, offsetFraction * radiusKm);
    const inside = points.filter((p) => distanceKm(centre, p) <= radiusKm).length;
    if (inside <= HINT_AREA_MAX_CITIES || radiusKm <= HINT_AREA_MIN_RADIUS_KM) {
      return { lat: centre.lat, lon: centre.lon, radiusKm };
    }
    radiusKm = Math.max(HINT_AREA_MIN_RADIUS_KM, radiusKm * HINT_AREA_SHRINK_FACTOR);
  }
}

/** Hint 3: the first letter of the answer's display name ("Starts with T"). */
export function firstLetter(name: string): string {
  const m = name.match(/\p{L}/u);
  return (m ? m[0] : name.charAt(0)).toUpperCase();
}
