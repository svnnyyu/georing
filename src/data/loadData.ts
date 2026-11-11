// Fetches the static data files once at startup and indexes them for the core.
// This is the only place that fetches; src/core/ never touches the network.

import { buildGameData, type GameData } from '../core/data.ts';
import { buildMatchIndex, type MatchIndex } from '../core/matching.ts';
import type { City, Country, Metro } from '../core/types.ts';

export interface LoadedData {
  data: GameData;
  index: MatchIndex;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return (await res.json()) as T;
}

export async function loadData(): Promise<LoadedData> {
  const [cities, metros, countries] = await Promise.all([
    getJson<City[]>('cities.json'),
    getJson<Metro[]>('metros.json'),
    getJson<Record<string, Country>>('countries.json'),
  ]);
  const data = buildGameData({ cities, metros, countries });
  return { data, index: buildMatchIndex(cities) };
}
