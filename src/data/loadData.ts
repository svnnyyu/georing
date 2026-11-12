// Fetches the static data files once at startup and indexes them for the core.
// This is the only place that fetches; src/core/ never touches the network.

import { buildGameData, type GameData } from '../core/data.ts';
import { buildMatchIndex, type MatchIndex } from '../core/matching.ts';
import type { City, Country, LandMask, Metro } from '../core/types.ts';

export interface LoadedData {
  data: GameData;
  index: MatchIndex;
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
  const [cities, metros, countries, land] = await Promise.all([
    getJson<City[]>('cities.json'),
    getJson<Metro[]>('metros.json'),
    getJson<Record<string, Country>>('countries.json'),
    getJson<LandFile>('land.json'),
  ]);
  const data = buildGameData({ cities, metros, countries, land: decodeLand(land) });
  return { data, index: buildMatchIndex(cities) };
}
