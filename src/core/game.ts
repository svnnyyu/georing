// Game state and actions. Every action takes a state and returns a new one; nothing is
// mutated. The UI keeps the state in one useReducer and redraws from it.

import {
  CITIES_TO_FIND,
  CONTINENT_BALANCE_EXPONENT,
  FAR_SIDE_KM,
  GUESSES_PER_RING,
  HINT_AREA_COUNTRIES,
  HINTS_PER_RING,
  RING_COUNT,
  RING_WIDTH_KM,
  START_REPICKS,
} from '../config.ts';
import { cityOrThrow, unitIdOf, type GameData } from './data.ts';
import { buildCountryRings, countryOutsideKm, pointInRing } from './countries.ts';
import { distanceKm, distanceOutsideKm, sphereCentre, type LatLon } from './geo.ts';
import { areaCircle, CITY_AREA_CIRCLE, countryFocus, firstLetter, nextHint } from './hints.ts';
import { createRng, deriveSeed, pick, weightedIndex } from './random.ts';
import { buildRings } from './rings.ts';
import type { GameState, Guess, HintState, Ring, RingState, RingStatus, Settings } from './types.ts';

// Salts for the separate random streams, so adding one never changes another.
const SALT_START = 1;
const SALT_HINT = 2;

export function defaultSettings(): Settings {
  return {
    startCityId: null,
    ringWidthKm: RING_WIDTH_KM.default,
    ringCount: RING_COUNT.default,
    guessesPerRing: GUESSES_PER_RING.default,
    citiesToFind: CITIES_TO_FIND.default,
    suggestions: false,
    subdivisions: false,
    sound: true,
    hints: true,
    measure: 'city',
    mode: 'cities',
  };
}

/** The allowed option nearest to value (or the default). */
function nearestOption(value: unknown, r: { options: readonly number[]; default: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return r.default;
  return r.options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best));
}

function clampStep(value: unknown, r: { min: number; max: number; step: number; default: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return r.default;
  const stepped = r.min + Math.round((value - r.min) / r.step) * r.step;
  return Math.min(r.max, Math.max(r.min, stepped));
}

/** Fills in and clamps settings (e.g. from storage or an old save) to the allowed ranges. */
export function sanitizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const d = defaultSettings();
  const s = input ?? {};
  return {
    startCityId: typeof s.startCityId === 'number' ? s.startCityId : null,
    ringWidthKm: nearestOption(s.ringWidthKm, RING_WIDTH_KM),
    ringCount: s.ringCount === 'all' ? 'all' : clampStep(s.ringCount, RING_COUNT),
    guessesPerRing: clampStep(s.guessesPerRing, GUESSES_PER_RING),
    citiesToFind: clampStep(s.citiesToFind, CITIES_TO_FIND),
    suggestions: typeof s.suggestions === 'boolean' ? s.suggestions : d.suggestions,
    subdivisions: typeof s.subdivisions === 'boolean' ? s.subdivisions : d.subdivisions,
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
    hints: typeof s.hints === 'boolean' ? s.hints : d.hints,
    measure: s.measure === 'metro' ? 'metro' : 'city',
    // 'population' was the only mode before Countries mode existed: it means cities.
    mode: s.mode === 'countries' ? 'countries' : 'cities',
  };
}

function emptyRingState(ring: Ring): RingState {
  return { guesses: [], hints: { used: [] }, status: ring.answerId === null ? 'empty' : 'playing' };
}

/** A random start city from the well-known pool, balanced across continents: first a
 *  continent, weighted by its number of start cities ^ CONTINENT_BALANCE_EXPONENT, then a
 *  city in it. Purely proportional picks would put about 57% of starts in Asia. */
export function randomStartCity(data: GameData, seed: number, attempt = 0): number {
  const byContinent = new Map<string, number[]>();
  for (const c of data.cities) {
    if (!c.wellKnown) continue;
    const continent = data.countries[c.cc]?.continent ?? '?';
    const list = byContinent.get(continent) ?? [];
    list.push(c.id);
    byContinent.set(continent, list);
  }
  // Attempt 0 keeps the original seed's pick, so existing seeds give the same start.
  const rng = createRng(attempt === 0 ? deriveSeed(seed, SALT_START) : deriveSeed(seed, SALT_START, attempt));
  const continents = [...byContinent.keys()].sort();
  const weights = continents.map((k) => byContinent.get(k)!.length ** CONTINENT_BALANCE_EXPONENT);
  const continent = continents[weightedIndex(rng, weights)]!;
  return pick(rng, byContinent.get(continent)!.sort((a, b) => a - b));
}

/** How many rings a game has: the setting, or with 'all' every ring that fits before the far
 *  side of the Earth (a ring that would reach past it is left out). */
export function resolveRingCount(settings: Pick<Settings, 'ringCount' | 'ringWidthKm'>): number {
  if (settings.ringCount !== 'all') return settings.ringCount;
  return Math.max(1, Math.floor(FAR_SIDE_KM / settings.ringWidthKm));
}

/** Starts a game. The seed decides the random start city and the hint circles, so the same
 *  seed and settings always give the same game. */
export function newGame(data: GameData, settingsIn: Partial<Settings>, seed: number, now: Date): GameState {
  const settings = sanitizeSettings(settingsIn);
  const countries = settings.mode === 'countries';
  const ringCount = resolveRingCount(settings);
  const chosen = settings.startCityId !== null && data.byId.has(settings.startCityId);
  const build = (cityId: number) => {
    // Countries mode starts from the city itself (its metro doesn't matter there).
    const startId = countries ? cityId : unitIdOf(data, settings.measure, cityId);
    const start = cityOrThrow(data, startId);
    const rings = countries
      ? buildCountryRings(data.grid ?? new Map(), start, {
          widthKm: settings.ringWidthKm,
          ringCount,
          // The start city's own country counts too: it is often the answer near home.
          excludeCc: null,
        })
      : buildRings(data, startId, { widthKm: settings.ringWidthKm, ringCount, measure: settings.measure });
    return { cityId, startId, rings };
  };
  let game = build(chosen ? settings.startCityId! : randomStartCity(data, seed));
  // Countries mode: a random start where every ring has the same answer isn't much of a game;
  // try the next random start (a chosen start city is kept as it is).
  for (let attempt = 1; !chosen && countries && ringCount > 1 && oneAnswer(game.rings) && attempt <= START_REPICKS; attempt++) {
    game = build(randomStartCity(data, seed, attempt));
  }
  const { cityId: startCityId, startId, rings } = game;
  const ringStates = rings.map(emptyRingState);
  return {
    seed,
    createdAt: now.toISOString(),
    settings: { ...settings, startCityId },
    startId,
    rings,
    ringStates,
    current: 0,
    phase: ringStates[0]!.status === 'empty' ? 'ringOver' : 'playing',
  };
}

/** Do all the rings with an answer have the same one? */
function oneAnswer(rings: Ring[]): boolean {
  return new Set(rings.map((r) => r.answerId).filter((id) => id !== null)).size <= 1;
}

export function currentRing(state: GameState): Ring {
  return state.rings[state.current]!;
}

export function currentRingState(state: GameState): RingState {
  return state.ringStates[state.current]!;
}

/** The ring's targets: its citiesToFind most populous units (fewer if the ring holds fewer),
 *  most populous first. The first is ring.answerId. */
export function targetsOf(ring: Ring, settings: Settings): number[] {
  return ring.unitIds.slice(0, settings.citiesToFind);
}

/** Targets found so far in this ring. */
export function foundCount(rs: RingState): number {
  return rs.guesses.filter((g) => g.result === 'correct').length;
}

/** In-ring guesses so far, right or wrong (outside-the-ring guesses don't count). */
export function guessesUsed(rs: RingState): number {
  return rs.guesses.filter((g) => g.result !== 'outside').length;
}

/** Wrong in-ring guesses: these are what the per-ring limit counts. */
export function missesUsed(rs: RingState): number {
  return rs.guesses.filter((g) => g.result === 'wrong').length;
}

/** Wrong guesses still allowed in the current ring. */
export function guessesLeft(state: GameState): number {
  return state.settings.guessesPerRing - missesUsed(currentRingState(state));
}

/** The targets not found yet in the current ring, biggest first (what the hints are about). */
export function targetsLeft(state: GameState): number[] {
  const rs = currentRingState(state);
  const found = new Set(rs.guesses.filter((g) => g.result === 'correct').map((g) => g.unitId));
  return targetsOf(currentRing(state), state.settings).filter((t) => !found.has(t));
}

/** The biggest target not found yet, or null. */
export function nextTarget(state: GameState): number | null {
  return targetsLeft(state)[0] ?? null;
}

/** The hints left for the ring, as long as there is a target to give them about. */
export function hintsLeft(state: GameState): number {
  return HINTS_PER_RING - currentRingState(state).hints.used.length;
}

export type GuessOutcome =
  /** correct: one of the targets; rank is its place in the ring (1 = biggest). */
  | { kind: 'correct'; unitId: number; rank: number }
  | { kind: 'wrong'; unitId: number }
  | { kind: 'outside'; unitId: number; outsideKm: number }
  /** Already guessed in this ring: ignored. */
  | { kind: 'repeat'; unitId: number }
  /** The start city (or its metro) is never an answer: ignored. */
  | { kind: 'start'; unitId: number }
  /** Not in a guessing phase: ignored. */
  | { kind: 'ignored'; unitId: number };

function withRing(state: GameState, ringState: RingState, phase = state.phase): GameState {
  const ringStates = state.ringStates.slice();
  ringStates[state.current] = ringState;
  return { ...state, ringStates, phase };
}

/** Submits a resolved guess (a city id; mapped to its unit in Metro mode). */
export function submitGuess(
  data: GameData,
  state: GameState,
  cityId: number,
  /** Countries mode: the territory the guess was typed as (its code), if any. */
  area?: string,
): { state: GameState; outcome: GuessOutcome } {
  const countries = state.settings.mode === 'countries';
  // Countries mode: guesses are country units already.
  const unitId = countries ? cityId : unitIdOf(data, state.settings.measure, cityId);
  const cc = data.byId.get(unitId)?.cc;
  const typedAs = countries && area && data.territories.some((t) => t.cc === area && t.of === cc) ? { area } : {};
  if (state.phase !== 'playing') return { state, outcome: { kind: 'ignored', unitId } };
  const start = cityOrThrow(data, state.startId);
  // The start city is never an answer (in Countries mode its country can be).
  if (!countries && unitId === state.startId) return { state, outcome: { kind: 'start', unitId } };
  const ring = currentRing(state);
  const rs = currentRingState(state);
  if (rs.guesses.some((g) => g.unitId === unitId)) return { state, outcome: { kind: 'repeat', unitId } };

  if (!ring.unitIds.includes(unitId)) {
    const outsideKm = Math.round(
      countries
        ? (countryOutsideKm(data.grid ?? new Map(), cityOrThrow(data, unitId).cc, start, ring) ?? 0)
        : distanceOutsideKm(distanceKm(start, cityOrThrow(data, unitId)), ring.innerKm, ring.outerKm),
    );
    const guesses: Guess[] = [...rs.guesses, { unitId, result: 'outside', ...typedAs }];
    return { state: withRing(state, { ...rs, guesses }), outcome: { kind: 'outside', unitId, outsideKm } };
  }

  const targets = targetsOf(ring, state.settings);
  const correct = targets.includes(unitId);
  const guesses: Guess[] = [...rs.guesses, { unitId, result: correct ? 'correct' : 'wrong', ...typedAs }];
  const found = guesses.filter((g) => g.result === 'correct').length;
  const misses = guesses.filter((g) => g.result === 'wrong').length;
  let status: RingStatus = 'playing';
  if (found >= targets.length) status = 'solved';
  else if (misses >= state.settings.guessesPerRing) status = 'missed';
  const next = withRing(state, { ...rs, guesses, status }, status === 'playing' ? 'playing' : 'ringOver');
  const outcome: GuessOutcome = correct
    ? { kind: 'correct', unitId, rank: ring.unitIds.indexOf(unitId) + 1 }
    : { kind: 'wrong', unitId };
  return { state: next, outcome };
}

/** Unlocks the next hint for the current ring (HINTS_PER_RING in all, in a fixed order).
 *  Each covers every target not found yet: 1. countries (the targets' countries; in Countries
 *  mode every country in the ring), 2. a circle around each, 3. each one's dot and first
 *  letter. */
export function useHint(data: GameData, state: GameState): GameState {
  if (state.phase !== 'playing' || !state.settings.hints || hintsLeft(state) <= 0) return state;
  const ring = currentRing(state);
  const rs = currentRingState(state);
  const left = targetsLeft(state);
  const kind = nextHint(rs.hints.used);
  if (kind === null || left.length === 0) return state;
  const countries = state.settings.mode === 'countries';
  const start = cityOrThrow(data, state.startId);
  // Where a target is: the city, or where the country's people in the ring live.
  const at = (unitId: number): LatLon => (countries && pointInRing(ring, unitId)) || cityOrThrow(data, unitId);
  const hints: HintState = { ...rs.hints, used: [...rs.hints.used, kind] };
  if (kind === 'country') {
    if (countries) {
      // Every country with people in the ring, tinted inside it (naming the answer's own
      // country would give it away).
      const ccs = ring.unitIds.map((id) => cityOrThrow(data, id).cc);
      hints.countries = { ccs, ...centreOf(ring.points ?? [], ring.pops) };
    } else {
      const ccs = [...new Set(left.map((id) => cityOrThrow(data, id).cc))];
      const points = ccs.map((cc) => countryFocus(data, ring, cc)).filter((p): p is LatLon => p !== null);
      hints.countries = { ccs, ...centreOf(points) };
    }
  }
  if (kind === 'area') {
    hints.areas = left.map((unitId) => {
      // One random stream per ring and target (the biggest keeps the original stream).
      const rank = ring.unitIds.indexOf(unitId);
      const seed = rank === 0 ? deriveSeed(state.seed, SALT_HINT, ring.index) : deriveSeed(state.seed, SALT_HINT, ring.index, rank);
      // Countries mode: a much larger circle, spanning several countries.
      const size = countries ? HINT_AREA_COUNTRIES : CITY_AREA_CIRCLE;
      return { unitId, circle: areaCircle(data, ring, at(unitId), start, createRng(seed), size) };
    });
  }
  if (kind === 'letter') {
    hints.letters = left.map((unitId) => {
      const p = at(unitId);
      return { unitId, letter: firstLetter(cityOrThrow(data, unitId).name), at: { lat: p.lat, lon: p.lon } };
    });
  }
  return withRing(state, { ...rs, hints });
}

/** Where the camera glides for a hint: the centre of some points, or nothing. */
function centreOf(points: LatLon[], weights?: number[]): { focus?: LatLon } {
  const c = sphereCentre(points, weights);
  return c ? { focus: c } : {};
}

/** Give up on the current ring: it ends as missed (marked skipped) and the answer is
 *  revealed, as if the guesses had run out. */
export function skipRing(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  return withRing(state, { ...currentRingState(state), status: 'missed', skipped: true }, 'ringOver');
}

/** After the reveal panel: move to the next ring, or finish after the last one. An empty
 *  ring goes straight to 'ringOver' so the UI can show "No cities in this ring" and advance. */
export function nextRing(state: GameState): GameState {
  if (state.phase !== 'ringOver') return state;
  if (state.current >= state.rings.length - 1) return { ...state, phase: 'finished' };
  const current = state.current + 1;
  const phase = state.ringStates[current]!.status === 'empty' ? 'ringOver' : 'playing';
  return { ...state, current, phase };
}
