// Contents of the guess info card shown when hovering a guessed city's marker
// (see docs/SPEC.md -> Guess info card).

import { CONTINENT_NAMES, countryOutsideKm } from './countries.ts';
import { cityOrThrow, countryName, unitPop, type GameData } from './data.ts';
import { distanceKm, distanceOutsideKm } from './geo.ts';
import { rankInRing } from './rings.ts';
import type { GameState, GuessResult, PopulationMeasure } from './types.ts';

export interface GuessInfo {
  unitId: number;
  name: string;
  admin1: string;
  country: string;
  result: GuessResult | null;
  /** The city's own (city-proper) population. */
  cityPop: number;
  /** The metro the city is in, if any. */
  metro: { pop: number; members: number } | null;
  /** Which of the two figures is highlighted. */
  measure: PopulationMeasure;
  /** Population under the current measure (what the ring is ranked by). */
  pop: number;
  /** "#2 of 14": position in the ring and the ring's size. null for outside guesses. */
  rank: { position: number; of: number } | null;
  /** "120 km outside": for guesses outside the ring. */
  outsideKm: number | null;
  /** Countries mode: pop is the people inside the ring, cityPop the whole country's. */
  isCountry: boolean;
}

export function guessInfo(data: GameData, state: GameState, ringIndex: number, unitId: number): GuessInfo {
  const ring = state.rings[ringIndex];
  if (!ring) throw new Error(`No ring ${ringIndex}`);
  const city = cityOrThrow(data, unitId);
  const metro = city.metro === undefined ? undefined : data.metros.get(city.metro);
  const measure = state.settings.measure;
  const guess = state.ringStates[ringIndex]?.guesses.find((g) => g.unitId === unitId);
  const position = rankInRing(ring, unitId);
  const start = cityOrThrow(data, state.startId);
  if (city.isCountry) {
    const continent = data.countries[city.cc]?.continent ?? '';
    const outside = position === null ? countryOutsideKm(data.grid ?? new Map(), city.cc, start, ring) : null;
    return {
      unitId,
      name: city.name,
      admin1: '',
      country: CONTINENT_NAMES[continent] ?? continent,
      result: guess?.result ?? null,
      cityPop: city.pop,
      metro: null,
      measure,
      pop: position === null ? 0 : (ring.pops?.[position - 1] ?? 0),
      rank: position === null ? null : { position, of: ring.unitIds.length },
      outsideKm: outside === null ? null : Math.round(outside),
      isCountry: true,
    };
  }
  const d = distanceKm(start, city);
  return {
    unitId,
    name: city.name,
    admin1: city.admin1,
    country: countryName(data, city.cc),
    result: guess?.result ?? null,
    cityPop: city.pop,
    metro: metro ? { pop: metro.pop, members: metro.members } : null,
    measure,
    pop: unitPop(data, measure, unitId),
    rank: position === null ? null : { position, of: ring.unitIds.length },
    outsideKm: position === null ? Math.round(distanceOutsideKm(d, ring.innerKm, ring.outerKm)) : null,
    isCountry: false,
  };
}
