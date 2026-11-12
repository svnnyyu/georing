// Indexing the loaded data, and "units": what a ring answer can be.
//
// City measure: every city is its own unit (unit id = city id).
// Metro measure: a city inside a metro is represented by the metro's main city
// (Newark -> New York City), and the unit's population is the metro's. Cities outside
// every metro are their own unit with their city population.

import type { City, Country, LandMask, Metro, PopulationMeasure, RawData } from './types.ts';

export interface GameData {
  cities: City[];
  byId: Map<number, City>;
  metros: Map<number, Metro>;
  countries: Record<string, Country>;
  /** Metro id -> member city ids. */
  metroMembers: Map<number, number[]>;
  /** Unit ids per measure, most populous first (computed once). */
  units: Record<PopulationMeasure, number[]>;
  land?: LandMask;
}

export function buildGameData(raw: RawData): GameData {
  const byId = new Map(raw.cities.map((c) => [c.id, c]));
  const metros = new Map(raw.metros.map((m) => [m.id, m]));
  const metroMembers = new Map<number, number[]>();
  for (const c of raw.cities) {
    if (c.metro !== undefined && metros.has(c.metro)) {
      const list = metroMembers.get(c.metro) ?? [];
      list.push(c.id);
      metroMembers.set(c.metro, list);
    }
  }
  const partial = { cities: raw.cities, byId, metros, countries: raw.countries, metroMembers };
  const units = {
    city: listUnits(partial, 'city'),
    metro: listUnits(partial, 'metro'),
  };
  return { ...partial, units, ...(raw.land ? { land: raw.land } : {}) };
}

type DataWithoutUnits = Omit<GameData, 'units'>;

function metroOf(data: DataWithoutUnits, city: City): Metro | undefined {
  return city.metro === undefined ? undefined : data.metros.get(city.metro);
}

/** The unit a city belongs to under a measure (its own id, or its metro's main city). */
export function unitIdOf(data: DataWithoutUnits, measure: PopulationMeasure, cityId: number): number {
  if (measure === 'city') return cityId;
  const city = data.byId.get(cityId);
  const metro = city && metroOf(data, city);
  return metro ? metro.main : cityId;
}

/** Population of a unit under a measure. */
export function unitPop(data: DataWithoutUnits, measure: PopulationMeasure, unitId: number): number {
  const city = data.byId.get(unitId);
  if (!city) return 0;
  if (measure === 'metro') {
    const metro = metroOf(data, city);
    if (metro && metro.main === city.id) return metro.pop;
  }
  return city.pop;
}

function listUnits(data: DataWithoutUnits, measure: PopulationMeasure): number[] {
  const ids = new Set<number>();
  for (const c of data.cities) ids.add(unitIdOf(data, measure, c.id));
  return [...ids].sort((a, b) => unitPop(data, measure, b) - unitPop(data, measure, a));
}

export function cityOrThrow(data: Pick<GameData, 'byId'>, id: number): City {
  const city = data.byId.get(id);
  if (!city) throw new Error(`Unknown city id ${id}`);
  return city;
}

export function countryName(data: Pick<GameData, 'countries'>, cc: string): string {
  return data.countries[cc]?.name ?? cc;
}
