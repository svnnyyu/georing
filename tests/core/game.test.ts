import { describe, expect, it } from 'vitest';
import { GUESSES_PER_RING, RING_WIDTH_KM } from '../../src/config.ts';
import {
  currentRing,
  currentRingState,
  defaultSettings,
  guessesLeft,
  newGame,
  nextRing,
  sanitizeSettings,
  submitGuess,
  useHint,
} from '../../src/core/game.ts';
import { distanceKm } from '../../src/core/geo.ts';
import type { GameState } from '../../src/core/types.ts';
import { realData, synthetic } from './fixtures.ts';

const NOW = new Date('2026-11-11T12:00:00Z');

describe('settings', () => {
  it('has the spec defaults', () => {
    expect(defaultSettings()).toEqual({
      startCityId: null,
      ringWidthKm: 100,
      ringCount: 3,
      guessesPerRing: 4,
      suggestions: false,
      measure: 'city',
      mode: 'population',
    });
  });

  it('clamps and snaps values to the slider ranges', () => {
    const s = sanitizeSettings({ ringWidthKm: 333, ringCount: 99, guessesPerRing: 1, measure: 'metro' });
    expect(s.ringWidthKm).toBe(RING_WIDTH_KM.max);
    expect(s.ringCount).toBe(10);
    expect(s.guessesPerRing).toBe(GUESSES_PER_RING.min);
    expect(s.measure).toBe('metro');
    expect(sanitizeSettings({ ringWidthKm: 120 }).ringWidthKm).toBe(100);
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
  });
});

describe('newGame', () => {
  it('is fully determined by the seed', () => {
    const { data } = realData();
    const a = newGame(data, {}, 12345, NOW);
    const b = newGame(data, {}, 12345, NOW);
    expect(b).toEqual(a);
    expect(data.byId.get(a.startId)?.wellKnown).toBe(true);
    const starts = new Set(Array.from({ length: 20 }, (_, i) => newGame(data, {}, i, NOW).startId));
    expect(starts.size).toBeGreaterThan(10);
  });

  it('uses a chosen start city, and its metro in Metro mode', () => {
    const { data } = synthetic();
    expect(newGame(data, { startCityId: 2 }, 1, NOW).startId).toBe(2);
    expect(newGame(data, { startCityId: 2, measure: 'metro' }, 1, NOW).startId).toBe(1);
  });
});

describe('guessing', () => {
  const { data } = synthetic();
  const start = (overrides = {}) =>
    newGame(data, { startCityId: 1, ringWidthKm: 100, ringCount: 5, guessesPerRing: 3, ...overrides }, 7, NOW);

  it('places outside guesses without using a guess', () => {
    const r = submitGuess(data, start(), 5); // Charlie is in ring 2
    expect(r.outcome).toEqual({ kind: 'outside', unitId: 5, outsideKm: 0 });
    expect(guessesLeft(r.state)).toBe(3);
    expect(currentRingState(r.state).guesses).toEqual([{ unitId: 5, result: 'outside' }]);
  });

  it('ignores repeats and the start city', () => {
    let s = start();
    s = submitGuess(data, s, 3).state;
    const again = submitGuess(data, s, 3);
    expect(again.outcome.kind).toBe('repeat');
    expect(again.state).toBe(s);
    expect(submitGuess(data, s, 1).outcome.kind).toBe('start');
  });

  it('solves a ring with the right answer', () => {
    const r = submitGuess(data, start(), 2);
    expect(r.outcome.kind).toBe('correct');
    expect(currentRingState(r.state).status).toBe('solved');
    expect(r.state.phase).toBe('ringOver');
    expect(submitGuess(data, r.state, 3).outcome.kind).toBe('ignored');
  });

  it('misses a ring when guesses run out', () => {
    let s = start();
    for (const id of [3, 4]) s = submitGuess(data, s, id).state;
    expect(s.phase).toBe('playing');
    expect(guessesLeft(s)).toBe(1);
    s = submitGuess(data, s, 10).state;
    expect(currentRingState(s).status).toBe('missed');
    expect(s.phase).toBe('ringOver');
  });

  it('accepts a member city as its metro in Metro mode', () => {
    let s = start({ measure: 'metro' });
    s = nextRing(submitGuess(data, s, 3).state); // Alpha solves ring 1 (Suburb is part of the start metro)
    const r = submitGuess(data, s, 6); // Delta -> Echo's metro, ring 2's answer
    expect(r.outcome).toEqual({ kind: 'correct', unitId: 7 });
  });
});

describe('rings, hints and the end of the game', () => {
  const { data } = synthetic();

  it('moves through rings, auto-skips empty ones, and finishes', () => {
    let s = newGame(data, { startCityId: 1, ringWidthKm: 100, ringCount: 5 }, 7, NOW);
    s = submitGuess(data, s, 2).state;
    s = nextRing(s);
    expect([s.current, s.phase]).toEqual([1, 'playing']);
    expect(nextRing(s)).toBe(s); // can't skip a ring in play
    s = nextRing(submitGuess(data, s, 7).state);
    s = nextRing(submitGuess(data, s, 11).state);
    expect([s.current, s.phase, currentRingState(s).status]).toEqual([3, 'ringOver', 'empty']);
    s = nextRing(s);
    expect([s.current, s.phase]).toEqual([4, 'playing']);
    s = nextRing(submitGuess(data, s, 9).state);
    expect(s.phase).toBe('finished');
  });

  it('starts in ringOver when ring 1 is empty', () => {
    const s = newGame(data, { startCityId: 9, ringWidthKm: 50, ringCount: 2 }, 1, NOW); // Golf is far from all
    expect(s.phase).toBe('ringOver');
    expect(s.ringStates.every((r) => r.status === 'empty')).toBe(true);
  });

  it('gives the three hints in order, then no more', () => {
    let s: GameState = newGame(data, { startCityId: 1, ringWidthKm: 100, ringCount: 3 }, 7, NOW);
    s = useHint(data, s);
    expect(currentRingState(s).hints).toEqual({ used: ['country'], country: { cc: 'XX', name: 'Exland' } });
    s = useHint(data, s);
    const area = currentRingState(s).hints.area!;
    expect(distanceKm(area, data.byId.get(currentRing(s).answerId!)!)).toBeLessThan(area.radiusKm);
    s = useHint(data, s);
    expect(currentRingState(s).hints.letter).toBe('S');
    expect(useHint(data, s)).toBe(s);
  });

  it('gives the same hint circle when a game is replayed', () => {
    const play = () => useHint(data, useHint(data, newGame(data, { startCityId: 1 }, 99, NOW)));
    expect(currentRingState(play()).hints.area).toEqual(currentRingState(play()).hints.area);
  });
});
