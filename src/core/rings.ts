// Ring list and answers from the settings (see docs/SPEC.md -> Ring geometry).

import { distanceKm, ringNumberFor } from './geo.ts';
import { cityOrThrow, unitPop, type GameData } from './data.ts';
import type { PopulationMeasure, Ring } from './types.ts';

export interface RingSpec {
  widthKm: number;
  ringCount: number;
  measure: PopulationMeasure;
}

/** Builds every ring around the start unit. Ring k covers (k-1)·w < d <= k·w; the start
 *  unit itself is excluded. Each ring's units are sorted most populous first. */
export function buildRings(data: GameData, startId: number, spec: RingSpec): Ring[] {
  const start = cityOrThrow(data, startId);
  const buckets: number[][] = Array.from({ length: spec.ringCount }, () => []);
  for (const unitId of data.units[spec.measure]) {
    if (unitId === startId) continue;
    const k = ringNumberFor(distanceKm(start, cityOrThrow(data, unitId)), spec.widthKm, spec.ringCount);
    if (k !== null) buckets[k - 1]!.push(unitId);
  }
  // data.units is already sorted by population, so each bucket is too.
  return buckets.map((unitIds, i) => ({
    index: i,
    innerKm: i * spec.widthKm,
    outerKm: (i + 1) * spec.widthKm,
    unitIds,
    answerId: unitIds[0] ?? null,
  }));
}

/** Rank of a unit within a ring: 1 = most populous. null if not in the ring. */
export function rankInRing(ring: Ring, unitId: number): number | null {
  const i = ring.unitIds.indexOf(unitId);
  return i === -1 ? null : i + 1;
}

/** The ring's top units with their populations, for the reveal panel. */
export function topUnits(data: GameData, ring: Ring, measure: PopulationMeasure, n: number) {
  // Countries mode: the people inside the ring, not the whole country.
  return ring.unitIds.slice(0, n).map((id, i) => ({ unitId: id, pop: ring.pops?.[i] ?? unitPop(data, measure, id) }));
}
