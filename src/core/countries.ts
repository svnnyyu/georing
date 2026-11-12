// Countries mode (see docs/SPEC.md -> Countries mode): each ring's answer is the country with
// the most people living inside the ring, counted from a population grid (population.json:
// people per country per 0.25° square, from GHS-POP).
//
// A country is played as a "unit" like a city: it gets a stable id (countryUnitId) and a
// City-shaped entry (name, aliases, the centre of its people, its total population) so the
// matching, history, reveal and summary code work unchanged.

import { COUNTRY_MIN_PEOPLE_IN_RING } from '../config.ts';
import { distanceKm, distanceOutsideKm, ringNumberFor, type LatLon } from './geo.ts';
import type { City, Country, PopulationFile, Ring, RingArea } from './types.ts';

/** Country unit ids sit far above every GeoNames id and come from the two letters of the
 *  country code, so they stay the same when the data is rebuilt (history keeps them). */
const COUNTRY_ID_BASE = 1_000_000_000;

export function countryUnitId(cc: string): number {
  return COUNTRY_ID_BASE + (cc.charCodeAt(0) - 65) * 26 + (cc.charCodeAt(1) - 65);
}

export function isCountryUnit(id: number): boolean {
  return id >= COUNTRY_ID_BASE;
}

/** GeoNames continent codes. */
export const CONTINENT_NAMES: Record<string, string> = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

/** One area's populated squares: centre of each square and the people in it. An area is a
 *  country, or a territory that counts toward one (of: that country's code). */
export interface CountryCells {
  lat: Float32Array;
  lon: Float32Array;
  pop: Float32Array;
  total: number;
  of?: string;
}

/** Area code -> its squares. */
export type CountryGrid = Map<string, CountryCells>;

/** The country an area's people count toward. */
const unitCc = (cc: string, cells: CountryCells) => cells.of ?? cc;

export function decodeGrid(f: PopulationFile): CountryGrid {
  const grid: CountryGrid = new Map();
  for (const [cc, flat] of Object.entries(f.countries)) {
    const n = flat.length / 2;
    const lat = new Float32Array(n);
    const lon = new Float32Array(n);
    const pop = new Float32Array(n);
    let index = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      index += flat[2 * i]!;
      const row = Math.floor(index / f.width);
      const col = index % f.width;
      lat[i] = 90 - (row + 0.5) * f.res;
      lon[i] = -180 + (col + 0.5) * f.res;
      pop[i] = flat[2 * i + 1]!;
      total += pop[i]!;
    }
    const of = f.territories?.[cc];
    grid.set(cc, { lat, lon, pop, total, ...(of ? { of } : {}) });
  }
  return grid;
}

/** The centre of a set of weighted points, averaged as directions on the sphere (so it works
 *  across the date line). */
class Centre {
  private x = 0;
  private y = 0;
  private z = 0;
  add(lat: number, lon: number, w: number): void {
    const r = Math.PI / 180;
    this.x += w * Math.cos(lat * r) * Math.cos(lon * r);
    this.y += w * Math.cos(lat * r) * Math.sin(lon * r);
    this.z += w * Math.sin(lat * r);
  }
  get(): LatLon {
    const r = Math.PI / 180;
    return { lat: Math.atan2(this.z, Math.hypot(this.x, this.y)) / r, lon: Math.atan2(this.y, this.x) / r };
  }
}

/** A territory counted as part of another country (Puerto Rico, part of the United States). */
export interface Territory {
  cc: string;
  name: string;
  aliases: string[];
  /** The country it counts toward. */
  of: string;
}

/** The territories in the population file that have a name, for matching. */
export function territoryList(territories: Record<string, string>, countries: Record<string, Country>): Territory[] {
  return Object.entries(territories).flatMap(([cc, of]) => {
    const t = countries[cc];
    return t ? [{ cc, name: t.name, aliases: t.aliases, of }] : [];
  });
}

/** City-shaped entries for every country with people in the grid and a name. A territory's
 *  names become aliases of its country, so "Puerto Rico" matches the United States. */
export function countryUnits(grid: CountryGrid, countries: Record<string, Country>, territories: Territory[] = []): City[] {
  const byUnit = new Map<string, { total: number; centre: Centre }>();
  for (const [cc, cells] of grid) {
    const u = unitCc(cc, cells);
    let acc = byUnit.get(u);
    if (!acc) byUnit.set(u, (acc = { total: 0, centre: new Centre() }));
    acc.total += cells.total;
    for (let i = 0; i < cells.pop.length; i++) acc.centre.add(cells.lat[i]!, cells.lon[i]!, cells.pop[i]!);
  }
  const units: City[] = [];
  for (const [cc, { total, centre }] of byUnit) {
    const country = countries[cc];
    if (!country || total <= 0) continue;
    const at = centre.get();
    units.push({
      id: countryUnitId(cc),
      name: country.name,
      ascii: country.name,
      lat: at.lat,
      lon: at.lon,
      pop: Math.round(total),
      cc,
      admin1: '',
      aliases: [...country.aliases, ...territories.filter((t) => t.of === cc).flatMap((t) => [t.name, ...t.aliases])],
      wellKnown: false,
      isCountry: true,
    });
  }
  return units.sort((a, b) => b.pop - a.pop);
}

export interface CountryRingSpec {
  widthKm: number;
  ringCount: number;
  /** A country to leave out of every ring, or null (the game counts every country). */
  excludeCc: string | null;
}

/** Builds every ring: the countries with at least COUNTRY_MIN_PEOPLE_IN_RING people inside it
 *  (their territories' people included), most people first, with those people's numbers
 *  (pops), where they live (points), and the split by area (areas). */
export function buildCountryRings(grid: CountryGrid, start: LatLon, spec: CountryRingSpec): Ring[] {
  type Acc = { pop: number; areas: Map<string, { pop: number; centre: Centre }> };
  const perRing = Array.from({ length: spec.ringCount }, () => new Map<string, Acc>());
  for (const [cc, cells] of grid) {
    const u = unitCc(cc, cells);
    if (u === spec.excludeCc) continue;
    for (let i = 0; i < cells.pop.length; i++) {
      const p = { lat: cells.lat[i]!, lon: cells.lon[i]! };
      // People right at the start point are in ring 1 (a distance of 0 is "no ring" for cities).
      const k = ringNumberFor(Math.max(distanceKm(start, p), 1e-9), spec.widthKm, spec.ringCount);
      if (k === null) continue;
      const ring = perRing[k - 1]!;
      let acc = ring.get(u);
      if (!acc) ring.set(u, (acc = { pop: 0, areas: new Map() }));
      let area = acc.areas.get(cc);
      if (!area) acc.areas.set(cc, (area = { pop: 0, centre: new Centre() }));
      acc.pop += cells.pop[i]!;
      area.pop += cells.pop[i]!;
      area.centre.add(p.lat, p.lon, cells.pop[i]!);
    }
  }
  return perRing.map((ring, i) => {
    const rows = [...ring]
      .filter(([, a]) => a.pop >= COUNTRY_MIN_PEOPLE_IN_RING)
      .sort((a, b) => b[1].pop - a[1].pop || a[0].localeCompare(b[0]));
    const unitIds = rows.map(([cc]) => countryUnitId(cc));
    // Each country's areas in the ring, most people first; areas with only a few people are
    // left out, but never the largest.
    const areas: RingArea[][] = rows.map(([, a]) =>
      [...a.areas]
        .map(([cc, area]) => ({ cc, pop: Math.round(area.pop), ...area.centre.get() }))
        .sort((x, y) => y.pop - x.pop || x.cc.localeCompare(y.cc))
        .filter((area, j) => j === 0 || area.pop >= COUNTRY_MIN_PEOPLE_IN_RING),
    );
    return {
      index: i,
      innerKm: i * spec.widthKm,
      outerKm: (i + 1) * spec.widthKm,
      unitIds,
      answerId: unitIds[0] ?? null,
      pops: rows.map(([, a]) => Math.round(a.pop)),
      points: areas.map((list) => ({ lat: list[0]!.lat, lon: list[0]!.lon })),
      areas,
    };
  });
}

/** How far a country's nearest people are from a ring it isn't in (km), for "Not in this
 *  ring: Chile is 1,200 km outside". null if it has no people in the grid. */
export function countryOutsideKm(grid: CountryGrid, cc: string, start: LatLon, ring: Ring): number | null {
  let best = Infinity;
  for (const [area, cells] of grid) {
    if (unitCc(area, cells) !== cc) continue;
    for (let i = 0; i < cells.pop.length; i++) {
      const d = distanceKm(start, { lat: cells.lat[i]!, lon: cells.lon[i]! });
      best = Math.min(best, distanceOutsideKm(d, ring.innerKm, ring.outerKm));
    }
  }
  return Number.isFinite(best) ? best : null;
}

/** The centre of an area's people (a country's or a territory's), or null if it has none. */
export function areaCentre(grid: CountryGrid, cc: string): LatLon | null {
  const cells = grid.get(cc);
  if (!cells) return null;
  const centre = new Centre();
  for (let i = 0; i < cells.pop.length; i++) centre.add(cells.lat[i]!, cells.lon[i]!, cells.pop[i]!);
  return cells.total > 0 ? centre.get() : null;
}

/** Where a unit's people in the ring live (Countries mode), or null if it has none there. */
export function pointInRing(ring: Ring, unitId: number): LatLon | null {
  const i = ring.unitIds.indexOf(unitId);
  return i === -1 || !ring.points ? null : ring.points[i]!;
}
