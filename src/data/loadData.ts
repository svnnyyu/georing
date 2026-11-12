// Fetches the static data files once at startup and indexes them for the core.
// This is the only place that fetches; src/core/ never touches the network.

import { buildGameData, type GameData } from '../core/data.ts';
import { buildMatchIndex, type MatchIndex } from '../core/matching.ts';
import type { City, Country, LandMask, Metro, PopulationFile } from '../core/types.ts';

export interface LoadedData {
  data: GameData;
  /** The city name index, built the first time it's needed (it takes a few hundred ms, so
   *  it isn't built while the page is loading and animating; see App's warm-up). */
  index: () => MatchIndex;
  /** Country names and aliases, for Countries mode. */
  countryIndex: () => MatchIndex;
}

/** A value computed on first use and kept. */
function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return (await res.json()) as T;
}

interface LandFile {
  res: number;
  width: number;
  height: number;
  /** Base64 of the packed bits. */
  bits: string;
}

function decodeLand(f: LandFile): LandMask {
  const bin = atob(f.bits);
  const bits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  return { res: f.res, width: f.width, height: f.height, bits };
}

export async function loadData(): Promise<LoadedData> {
  const [cities, metros, countries, land, population] = await Promise.all([
    getJson<City[]>('cities.json'),
    getJson<Metro[]>('metros.json'),
    getJson<Record<string, Country>>('countries.json'),
    getJson<LandFile>('land.json'),
    getJson<PopulationFile>('population.json'),
  ]);
  const data = buildGameData({ cities, metros, countries, land: decodeLand(land), population });
  return {
    data,
    index: lazy(() => buildMatchIndex(cities)),
    countryIndex: lazy(() => buildMatchIndex(data.countryUnits)),
  };
}
