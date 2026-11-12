// Test data: a small synthetic world with cities at exact distances, and a loader for the
// real data files in public/data/.

import { readFileSync } from 'node:fs';
import { buildGameData, type GameData } from '../../src/core/data.ts';
import { destination } from '../../src/core/geo.ts';
import { buildMatchIndex, type MatchIndex } from '../../src/core/matching.ts';
import type { City, Country, LandMask, Metro } from '../../src/core/types.ts';

export const START = { lat: 10, lon: 20 };

function city(id: number, name: string, bearing: number, km: number, pop: number, extra: Partial<City> = {}): City {
  const p = km === 0 ? START : destination(START, bearing, km);
  return {
    id,
    name,
    ascii: name,
    lat: p.lat,
    lon: p.lon,
    pop,
    cc: 'XX',
    admin1: 'Region',
    aliases: [],
    wellKnown: false,
    ...extra,
  };
}

/** Ring width 500 km. City measure: ring 1 = Suburb > Alpha > Bravo > Springfield (north);
 *  ring 2 = Echo > Charlie > Delta; ring 3 = Springfield (south) > Foxtrot; ring 4 empty;
 *  ring 5 = Golf. Metro measure: Suburb merges into Start, Delta into Echo. */
export function syntheticCities(): City[] {
  return [
    city(1, 'Start', 0, 0, 1_000_000, { wellKnown: true, metro: 101 }),
    city(2, 'Suburb', 90, 10, 300_000, { metro: 101 }),
    city(3, 'Alpha', 90, 250, 200_000, { aliases: ['ALF'] }),
    city(4, 'Bravo', 0, 499.5, 150_000),
    city(5, 'Charlie', 180, 500.4, 500_000),
    city(6, 'Delta', 270, 750, 400_000, { metro: 102 }),
    city(7, 'Echo', 270, 775, 600_000, { metro: 102 }),
    city(8, 'Foxtrot', 45, 1250, 50_000),
    city(9, 'Golf', 135, 2250, 10_000_000, { cc: 'YY' }),
    city(10, 'Springfield', 0, 150, 60_000, { admin1: 'North' }),
    city(11, 'Springfield', 180, 1300, 155_000, { admin1: 'South' }),
  ];
}

export function syntheticMetros(): Metro[] {
  return [
    { id: 101, name: 'Start', pop: 1_500_000, ghslPop: 1_500_000, main: 1, cc: 'XX', members: 2 },
    { id: 102, name: 'Echo', pop: 2_000_000, ghslPop: 2_000_000, main: 7, cc: 'XX', members: 2 },
  ];
}

export const COUNTRIES: Record<string, Country> = {
  XX: { name: 'Exland', aliases: [] },
  YY: { name: 'Whyland', aliases: [] },
};

export function synthetic(): { data: GameData; index: MatchIndex } {
  const cities = syntheticCities();
  return { data: buildGameData({ cities, metros: syntheticMetros(), countries: COUNTRIES }), index: buildMatchIndex(cities) };
}

let real: { data: GameData; index: MatchIndex } | null = null;

/** The real data in public/data/ (loaded once per test file). */
export function realData(): { data: GameData; index: MatchIndex } {
  if (!real) {
    const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8')) as T;
    const cities = read<City[]>('cities.json');
    const landFile = read<Omit<LandMask, 'bits'> & { bits: string }>('land.json');
    const land: LandMask = { ...landFile, bits: new Uint8Array(Buffer.from(landFile.bits, 'base64')) };
    real = {
      data: buildGameData({
        cities,
        metros: read<Metro[]>('metros.json'),
        countries: read<Record<string, Country>>('countries.json'),
        land,
      }),
      index: buildMatchIndex(cities),
    };
  }
  return real;
}

/** Id of the most populous real city with this exact display name (and country, if given). */
export function idOf(data: GameData, name: string, cc?: string): number {
  const c = data.cities.find((x) => x.name === name && (cc === undefined || x.cc === cc));
  if (!c) throw new Error(`No city named ${name}`);
  return c.id;
}

export function nameOf(data: GameData, id: number | null): string | undefined {
  return id === null ? undefined : data.byId.get(id)?.name;
}
