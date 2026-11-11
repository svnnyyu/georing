// Game state and actions. Every action takes a state and returns a new one; nothing is
// mutated. The UI keeps the state in one useReducer and redraws from it.

import { GUESSES_PER_RING, RING_COUNT, RING_WIDTH_KM } from '../config.ts';
import { cityOrThrow, unitIdOf, type GameData } from './data.ts';
import { distanceKm, distanceOutsideKm } from './geo.ts';
import { areaCircle, countryHint, firstLetter, nextHint } from './hints.ts';
import { createRng, deriveSeed, pick } from './random.ts';
import { buildRings } from './rings.ts';
import type { GameState, Guess, HintKind, Ring, RingState, RingStatus, Settings } from './types.ts';

// Salts for the separate random streams, so adding one never changes another.
const SALT_START = 1;
const SALT_HINT = 2;

export function defaultSettings(): Settings {
  return {
    startCityId: null,
    ringWidthKm: RING_WIDTH_KM.default,
    ringCount: RING_COUNT.default,
    guessesPerRing: GUESSES_PER_RING.default,
    suggestions: false,
    measure: 'city',
    mode: 'population',
  };
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
    ringWidthKm: clampStep(s.ringWidthKm, RING_WIDTH_KM),
    ringCount: clampStep(s.ringCount, RING_COUNT),
    guessesPerRing: clampStep(s.guessesPerRing, GUESSES_PER_RING),
    suggestions: typeof s.suggestions === 'boolean' ? s.suggestions : d.suggestions,
    measure: s.measure === 'metro' ? 'metro' : 'city',
    mode: 'population',
  };
}

function emptyRingState(ring: Ring): RingState {
  return { guesses: [], hints: { used: [] }, status: ring.answerId === null ? 'empty' : 'playing' };
}

/** Starts a game. The seed decides the random start city and the hint circles, so the same
 *  seed and settings always give the same game. */
export function newGame(data: GameData, settingsIn: Partial<Settings>, seed: number, now: Date): GameState {
  const settings = sanitizeSettings(settingsIn);
  let startCityId = settings.startCityId;
  if (startCityId === null || !data.byId.has(startCityId)) {
    const pool = data.cities.filter((c) => c.wellKnown).map((c) => c.id).sort((a, b) => a - b);
    startCityId = pick(createRng(deriveSeed(seed, SALT_START)), pool);
  }
  const startId = unitIdOf(data, settings.measure, startCityId);
  const rings = buildRings(data, startId, {
    widthKm: settings.ringWidthKm,
    ringCount: settings.ringCount,
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

/** Guesses that count against the limit (outside-the-ring guesses don't). */
export function guessesUsed(rs: RingState): number {
  return rs.guesses.filter((g) => g.result !== 'outside').length;
}

export function guessesLeft(state: GameState): number {
  return state.settings.guessesPerRing - guessesUsed(currentRingState(state));
}

export type GuessOutcome =
  | { kind: 'correct' | 'wrong'; unitId: number }
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

  const correct = unitId === ring.answerId;
  const guesses: Guess[] = [...rs.guesses, { unitId, result: correct ? 'correct' : 'wrong' }];
  let status: RingStatus = 'playing';
  if (correct) status = 'solved';
  else if (guesses.filter((g) => g.result !== 'outside').length >= state.settings.guessesPerRing) status = 'missed';
  const next = withRing(state, { ...rs, guesses, status }, status === 'playing' ? 'playing' : 'ringOver');
  return { state: next, outcome: { kind: correct ? 'correct' : 'wrong', unitId } };
}

/** Unlocks the next hint for the current ring (country, then area circle, then first letter). */
export function useHint(data: GameData, state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const ring = currentRing(state);
  const rs = currentRingState(state);
  const kind = nextHint(rs.hints.used);
  if (kind === null || ring.answerId === null) return state;
  const used: HintKind[] = [...rs.hints.used, kind];
  const hints = { ...rs.hints, used };
  if (kind === 'country') hints.country = countryHint(data, ring.answerId);
  if (kind === 'area') {
    hints.area = areaCircle(data, ring, ring.answerId, createRng(deriveSeed(state.seed, SALT_HINT, ring.index)));
  }
  if (kind === 'letter') hints.letter = firstLetter(cityOrThrow(data, ring.answerId).name);
  return withRing(state, { ...rs, hints });
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
