// Number and place-name formatting for the UI.

import { countryName, type GameData } from '../core/data.ts';
import { normalize } from '../core/matching.ts';

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const formatPop = (n: number) => int.format(n);
export const formatKm = (n: number) => `${int.format(n)} km`;
/** A distance band with one unit and thin spaces around the dash: "0 – 1,000 km". */
export const formatKmRange = (inner: number, outer: number) => `${int.format(inner)}\u2009–\u2009${formatKm(outer)}`;

/** Normalized city names used by more than one city (computed once per data set). */
const sharedNames = new WeakMap<GameData, Set<string>>();

function shared(data: GameData): Set<string> {
  let set = sharedNames.get(data);
  if (!set) {
    const seen = new Set<string>();
    set = new Set<string>();
    for (const c of data.cities) {
      const key = normalize(c.name);
      if (seen.has(key)) set.add(key);
      else seen.add(key);
    }
    sharedNames.set(data, set);
  }
  return set;
}

/** Where a city is: the country, plus the state or province when
 *  - the Subdivisions setting is on (regions), or
 *  - in a pick-list (search, picker, suggestions) another city shares the name, so namesakes
 *    can be told apart ("Dhaka Division, Bangladesh" vs "Bihar, India").
 *  A region that repeats the city or country name is left out. */
export function placeOf(data: GameData, cityId: number, opts: { regions?: boolean; list?: boolean } = {}): string {
  const c = data.byId.get(cityId);
  if (!c) return '';
  const country = countryName(data, c.cc);
  const usable = c.admin1 && c.admin1 !== c.name && c.admin1 !== country;
  const show = usable && (opts.regions || (opts.list && shared(data).has(normalize(c.name))));
  return show ? `${c.admin1}, ${country}` : country;
}
