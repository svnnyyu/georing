// Turning typed text into a city (see docs/SPEC.md -> Guess matching).
// Pure functions: normalize, exact name/alias lookup, Damerau-Levenshtein fuzzy matching,
// the Krillion-style "autocorrect on Enter" step, and the optional suggestions dropdown.

import { AMBIGUOUS_POP_RATIO, FUZZY_THRESHOLDS, SUGGESTIONS_MAX, SUGGESTIONS_MIN_CHARS } from '../config.ts';
import { cityOrThrow, unitIdOf, type GameData } from './data.ts';
import type { City, PopulationMeasure } from './types.ts';

/** Lowercase, strip accents, hyphens/apostrophes to spaces, drop other punctuation,
 *  collapse whitespace. "São-Paulo" and "sao paulo" both become "sao paulo". */
export function normalize(text: string): string {
  // Most names are plain letters: skip the slower accent and punctuation steps for them.
  if (/^[A-Za-z0-9 ]*$/.test(text)) return text.toLowerCase().replace(/\s+/g, ' ').trim();
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[-'‘’`]/g, ' ')
    .replace(/[^\p{L}\p{N}\s_]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type EntryKind = 'name' | 'alias';

interface NameEntry {
  key: string;
  cityId: number;
  kind: EntryKind;
  /** Key length without spaces: what the fuzzy thresholds are measured on. */
  letters: number;
}

export interface MatchIndex {
  exact: Map<string, NameEntry[]>;
  /** Entries grouped by key length, for fast fuzzy candidate lookup. */
  byLength: Map<number, NameEntry[]>;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Precompute normalized names once at load. */
export function buildMatchIndex(cities: City[]): MatchIndex {
  const exact = new Map<string, NameEntry[]>();
  const byLength = new Map<number, NameEntry[]>();
  for (const c of cities) {
    const seen = new Set<string>();
    const add = (text: string, kind: EntryKind) => {
      const key = normalize(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      const entry: NameEntry = { key, cityId: c.id, kind, letters: key.replace(/ /g, '').length };
      pushTo(exact, key, entry);
      pushTo(byLength, key.length, entry);
    };
    add(c.name, 'name');
    add(c.ascii, 'name');
    for (const a of c.aliases) add(a, 'alias');
  }
  return { exact, byLength };
}

/** Optimal-string-alignment Damerau-Levenshtein distance (insert, delete, substitute,
 *  swap two neighbours). Returns max + 1 as soon as the distance must exceed max. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2]! + 1);
      }
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Largest accepted edit distance for a name with this many letters (0 = exact only). */
export function maxDistanceFor(letters: number): number {
  for (const t of FUZZY_THRESHOLDS) {
    if (letters >= t.minLength && letters <= t.maxLength) return t.maxDistance;
  }
  return 0;
}

export interface MatchContext {
  measure: PopulationMeasure;
  /** Is this unit in the current ring? Used only to break ties, as the spec says. */
  inRing: (unitId: number) => boolean;
}

export type Resolution =
  | { kind: 'none' }
  | { kind: 'match'; unitId: number }
  /** Several cities match equally (two Springfields): show a picker. */
  | { kind: 'ambiguous'; unitIds: number[] };

const MAX_FUZZY_DISTANCE = Math.max(...FUZZY_THRESHOLDS.map((t) => t.maxDistance));

/** How strongly a matched name points at its unit: the population of the city whose name
 *  matched, not of the unit it stands for. In Metro mode a small town can belong to a huge
 *  metro (Perth Amboy to New York); ranking by the metro's size would put New York City
 *  above Perth for "perth". (In City mode the two are the same.) */
const matchedPop = (data: GameData, e: NameEntry) => cityOrThrow(data, e.cityId).pop;

/** The units these entries point at, each with its strongest matched population, strongest
 *  first. */
function rankUnits(data: GameData, measure: PopulationMeasure, entries: NameEntry[]): { unitId: number; pop: number }[] {
  const best = new Map<number, number>();
  for (const e of entries) {
    const unitId = unitIdOf(data, measure, e.cityId);
    best.set(unitId, Math.max(best.get(unitId) ?? 0, matchedPop(data, e)));
  }
  return [...best].map(([unitId, pop]) => ({ unitId, pop })).sort((a, b) => b.pop - a.pop);
}

/** Resolve typed text to one unit: exact names, then aliases, then fuzzy. */
export function resolveGuess(index: MatchIndex, data: GameData, text: string, ctx: MatchContext): Resolution {
  const key = normalize(text);
  if (!key) return { kind: 'none' };
  const hits = index.exact.get(key);
  if (hits) {
    const names = hits.filter((e) => e.kind === 'name');
    const units = rankUnits(data, ctx.measure, names.length > 0 ? names : hits);
    // Prefer in-ring cities; among the candidates, ask only if another is at least
    // AMBIGUOUS_POP_RATIO of the largest's size (two Springfields), not for Dhaka vs a small
    // Dhāka in Bihar.
    const inRing = units.filter((u) => ctx.inRing(u.unitId));
    const pool = inRing.length > 0 ? inRing : units;
    const top = pool[0]!.pop;
    const ties = pool.filter((u) => u.pop >= AMBIGUOUS_POP_RATIO * top).map((u) => u.unitId);
    if (names.length > 0 && ties.length > 1) return { kind: 'ambiguous', unitIds: ties.slice(0, SUGGESTIONS_MAX) };
    return { kind: 'match', unitId: pool[0]!.unitId };
  }

  // Fuzzy: best (smallest) distance within each candidate's own threshold.
  let best: { entry: NameEntry; d: number; unitId: number }[] = [];
  let bestD = Infinity;
  for (let len = key.length - MAX_FUZZY_DISTANCE; len <= key.length + MAX_FUZZY_DISTANCE; len++) {
    for (const entry of index.byLength.get(len) ?? []) {
      const max = maxDistanceFor(entry.letters);
      if (max === 0) continue;
      const d = editDistance(key, entry.key, Math.min(max, bestD));
      if (d > max || d > bestD) continue;
      const unitId = unitIdOf(data, ctx.measure, entry.cityId);
      if (d < bestD) {
        bestD = d;
        best = [];
      }
      best.push({ entry, d, unitId });
    }
  }
  if (best.length === 0) return { kind: 'none' };
  best.sort(
    (a, b) =>
      Number(ctx.inRing(b.unitId)) - Number(ctx.inRing(a.unitId)) ||
      Number(b.entry.kind === 'name') - Number(a.entry.kind === 'name') ||
      matchedPop(data, b.entry) - matchedPop(data, a.entry),
  );
  return { kind: 'match', unitId: best[0]!.unitId };
}

export type EnterAction =
  | { kind: 'notFound' }
  /** The text is already the city's display name: submit it as a guess. */
  | { kind: 'submit'; unitId: number }
  /** Replace the text in the box with the display name; the next Enter submits it. */
  | { kind: 'correct'; text: string; unitId: number }
  | { kind: 'pick'; unitIds: number[] };

/** What pressing Enter (or the submit button) does with the typed text (Krillion-style):
 *  "Nwe Yokr", "NYC" or, in Metro mode, "Newark" first become "New York City". */
export function enterGuess(index: MatchIndex, data: GameData, text: string, ctx: MatchContext): EnterAction {
  const r = resolveGuess(index, data, text, ctx);
  if (r.kind === 'none') return { kind: 'notFound' };
  if (r.kind === 'ambiguous') return { kind: 'pick', unitIds: r.unitIds };
  const name = data.byId.get(r.unitId)?.name ?? '';
  return normalize(text) === normalize(name)
    ? { kind: 'submit', unitId: r.unitId }
    : { kind: 'correct', text: name, unitId: r.unitId };
}

export interface Suggestion {
  unitId: number;
  /** In Metro mode, the member city whose name matched when it isn't the unit itself
   *  ("buen" -> Los Angeles via Buena Park), so the list can say why it's there. */
  viaCityId: number | null;
}

/** The optional suggestions dropdown: up to SUGGESTIONS_MAX units from the whole world,
 *  ranked by prefix match, then fuzzy distance, then the population of the city whose name
 *  matched (see matchedPop). Never uses ring membership. */
export function suggest(index: MatchIndex, data: GameData, text: string, measure: PopulationMeasure): number[] {
  return suggestions(index, data, text, measure).map((s) => s.unitId);
}

/** suggest(), with the member city each suggestion was found through (see Suggestion). */
export function suggestions(index: MatchIndex, data: GameData, text: string, measure: PopulationMeasure): Suggestion[] {
  const key = normalize(text);
  if (key.length < SUGGESTIONS_MIN_CHARS) return [];
  // unit id -> its best match: score (lower is better), then matched population (higher is
  // better), and the city whose name matched
  const best = new Map<number, { s: number; pop: number; cityId: number }>();
  const consider = (e: NameEntry, s: number) => {
    const unitId = unitIdOf(data, measure, e.cityId);
    const pop = matchedPop(data, e);
    const old = best.get(unitId);
    if (!old || s < old.s || (s === old.s && pop > old.pop)) best.set(unitId, { s, pop, cityId: e.cityId });
  };
  for (const [k, entries] of index.exact) {
    if (!k.startsWith(key)) continue;
    for (const e of entries) consider(e, e.kind === 'name' ? 0 : 1);
  }
  if (best.size < SUGGESTIONS_MAX) {
    const max = maxDistanceFor(key.replace(/ /g, '').length);
    for (let len = key.length - max; len <= key.length + max; len++) {
      for (const e of index.byLength.get(len) ?? []) {
        const d = editDistance(key, e.key, max);
        if (d <= max) consider(e, 2 + d);
      }
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[1].s - b[1].s || b[1].pop - a[1].pop)
    .slice(0, SUGGESTIONS_MAX)
    .map(([unitId, m]) => ({ unitId, viaCityId: m.cityId === unitId ? null : m.cityId }));
}
