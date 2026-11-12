// Game state and actions. Every action takes a state and returns a new one; nothing is
// mutated. The UI keeps the state in one useReducer and redraws from it.

import {
  CITIES_TO_FIND,
  CONTINENT_BALANCE_EXPONENT,
  FAR_SIDE_KM,
  GUESSES_PER_RING,
  HINTS_PER_RING,
  RING_COUNT,
  RING_WIDTH_KM,
} from '../config.ts';
import { cityOrThrow, unitIdOf, type GameData } from './data.ts';
import { distanceKm, distanceOutsideKm } from './geo.ts';
import { areaCircle, countryFocus, countryHint, firstLetter, nextHint } from './hints.ts';
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
    hints: true,
    measure: 'city',
    mode: 'population',
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
    hints: typeof s.hints === 'boolean' ? s.hints : d.hints,
    measure: s.measure === 'metro' ? 'metro' : 'city',
    mode: 'population',
  };
}

function emptyRingState(ring: Ring): RingState {
  return { guesses: [], hints: { used: [] }, status: ring.answerId === null ? 'empty' : 'playing' };
}

/** A random start city from the well-known pool, balanced across continents: first a
 *  continent, weighted by its number of start cities ^ CONTINENT_BALANCE_EXPONENT, then a
 *  city in it. Purely proportional picks would put about 57% of starts in Asia. */
export function randomStartCity(data: GameData, seed: number): number {
  const byContinent = new Map<string, number[]>();
  for (const c of data.cities) {
    if (!c.wellKnown) continue;
    const continent = data.countries[c.cc]?.continent ?? '?';
    const list = byContinent.get(continent) ?? [];
    list.push(c.id);
    byContinent.set(continent, list);
  }
  const rng = createRng(deriveSeed(seed, SALT_START));
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
  let startCityId = settings.startCityId;
  if (startCityId === null || !data.byId.has(startCityId)) {
    startCityId = randomStartCity(data, seed);
  }
  const startId = unitIdOf(data, settings.measure, startCityId);
  const rings = buildRings(data, startId, {
    widthKm: settings.ringWidthKm,
    ringCount: resolveRingCount(settings),
    measure: settings.measure,
  });
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

/** The biggest target not found yet (what the hints are about), or null. */
export function nextTarget(state: GameState): number | null {
  const rs = currentRingState(state);
  const found = new Set(rs.guesses.filter((g) => g.result === 'correct').map((g) => g.unitId));
  return targetsOf(currentRing(state), state.settings).find((t) => !found.has(t)) ?? null;
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
): { state: GameState; outcome: GuessOutcome } {
  const unitId = unitIdOf(data, state.settings.measure, cityId);
  if (state.phase !== 'playing') return { state, outcome: { kind: 'ignored', unitId } };
  if (unitId === state.startId) return { state, outcome: { kind: 'start', unitId } };
  const ring = currentRing(state);
  const rs = currentRingState(state);
  if (rs.guesses.some((g) => g.unitId === unitId)) return { state, outcome: { kind: 'repeat', unitId } };

  if (!ring.unitIds.includes(unitId)) {
    const d = distanceKm(cityOrThrow(data, state.startId), cityOrThrow(data, unitId));
    const outsideKm = Math.round(distanceOutsideKm(d, ring.innerKm, ring.outerKm));
    const guesses: Guess[] = [...rs.guesses, { unitId, result: 'outside' }];
    return { state: withRing(state, { ...rs, guesses }), outcome: { kind: 'outside', unitId, outsideKm } };
  }

  const targets = targetsOf(ring, state.settings);
  const correct = targets.includes(unitId);
  const guesses: Guess[] = [...rs.guesses, { unitId, result: correct ? 'correct' : 'wrong' }];
  const found = guesses.filter((g) => g.result === 'correct').length;
  const misses = guesses.filter((g) => g.result === 'wrong').length;
  let status: RingStatus = 'playing';
  if (found >= targets.length) status = 'solved';
  else if (misses >= state.settings.guessesPerRing) status = 'missed';
  // Finding the city the shown hints are about clears them; the next hint starts over for
  // the next target.
  const hints: HintState = correct && rs.hints.for === unitId ? { used: rs.hints.used } : rs.hints;
  const next = withRing(state, { ...rs, guesses, hints, status }, status === 'playing' ? 'playing' : 'ringOver');
  const outcome: GuessOutcome = correct
    ? { kind: 'correct', unitId, rank: ring.unitIds.indexOf(unitId) + 1 }
    : { kind: 'wrong', unitId };
  return { state: next, outcome };
}

/** Unlocks the next hint for the current ring, about the biggest target not found yet:
 *  country, then area circle, then its dot and first letter. HINTS_PER_RING in all per ring. */
export function useHint(data: GameData, state: GameState): GameState {
  if (state.phase !== 'playing' || !state.settings.hints || hintsLeft(state) <= 0) return state;
  const ring = currentRing(state);
  const rs = currentRingState(state);
  const target = nextTarget(state);
  if (target === null) return state;
  // Hints shown for an earlier target (now found) don't carry over.
  const same = rs.hints.for === target;
  const shown = same ? (rs.hints.shown ?? rs.hints.used) : [];
  const kind = nextHint(shown);
  if (kind === null) return state;
  const hints: HintState = {
    ...(same ? rs.hints : {}),
    used: [...rs.hints.used, kind],
    for: target,
    shown: [...shown, kind],
  };
  if (kind === 'country') {
    const country = countryHint(data, target);
    const focus = countryFocus(data, ring, country.cc);
    hints.country = focus ? { ...country, focus } : country;
  }
  if (kind === 'area') {
    // One random stream per ring and target (the first target keeps the original stream).
    const rank = ring.unitIds.indexOf(target);
    const rng = createRng(rank === 0 ? deriveSeed(state.seed, SALT_HINT, ring.index) : deriveSeed(state.seed, SALT_HINT, ring.index, rank));
    hints.area = areaCircle(data, ring, target, cityOrThrow(data, state.startId), rng);
  }
  if (kind === 'letter') hints.letter = firstLetter(cityOrThrow(data, target).name);
  return withRing(state, { ...rs, hints });
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
