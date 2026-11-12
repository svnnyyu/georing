import { describe, expect, it } from 'vitest';
import { CONTINENT_BALANCE_EXPONENT, FAR_SIDE_KM, GUESSES_PER_RING, RING_CAP } from '../../src/config.ts';
import {
  currentRing,
  currentRingState,
  defaultSettings,
  foundCount,
  guessesLeft,
  newGame,
  nextTarget,
  randomStartCity,
  resolveRingCount,
  nextRing,
  sanitizeSettings,
  skipRing,
  submitGuess,
  targetsOf,
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
      ringWidthKm: 500,
      ringCount: 3,
      guessesPerRing: 3,
      citiesToFind: 1,
      suggestions: false,
      subdivisions: false,
      sound: true,
      hints: true,
      measure: 'city',
      mode: 'population',
    });
  });

  it('clamps and snaps values to the slider ranges', () => {
    const s = sanitizeSettings({ ringWidthKm: 3333, ringCount: 99, guessesPerRing: 5, measure: 'metro' });
    expect(s.ringWidthKm).toBe(2000); // the widest option
    expect(s.ringCount).toBe(RING_CAP);
    expect(s.guessesPerRing).toBe(GUESSES_PER_RING.max); // fixed at 3
    expect(s.measure).toBe('metro');
    expect(sanitizeSettings({ ringWidthKm: 120 }).ringWidthKm).toBe(250); // the narrowest option
    expect(sanitizeSettings({ ringCount: 'all' }).ringCount).toBe('all');
    expect(sanitizeSettings({ ringCount: 'lots' as never }).ringCount).toBe(3);
    expect(sanitizeSettings({ ringWidthKm: 1400 }).ringWidthKm).toBe(1500);
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
  });
});

describe('ring count', () => {
  const { data } = synthetic();

  it("with 'all', fits every ring that ends before the far side of the Earth", () => {
    expect(resolveRingCount({ ringCount: 'all', ringWidthKm: 2000 })).toBe(10); // 20,000 km < 20,015
    expect(resolveRingCount({ ringCount: 'all', ringWidthKm: 1500 })).toBe(13); // 19,500 km; a 14th would pass it
    expect(resolveRingCount({ ringCount: 'all', ringWidthKm: 250 })).toBe(80);
    expect(resolveRingCount({ ringCount: 4, ringWidthKm: 250 })).toBe(4);
    for (const w of [250, 500, 750, 1000, 1500, 2000]) {
      expect(resolveRingCount({ ringCount: 'all', ringWidthKm: w }) * w).toBeLessThanOrEqual(FAR_SIDE_KM);
    }
  });

  it('builds that many rings', () => {
    const s = newGame(data, { startCityId: 1, ringWidthKm: 2000, ringCount: 'all' }, 1, NOW);
    expect(s.rings).toHaveLength(10);
    expect(s.rings.at(-1)!.outerKm).toBe(20000);
    expect(s.settings.ringCount).toBe('all');
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

  it('balances random start cities across continents (weighted by sqrt of city counts)', () => {
    const { data } = realData();
    const pool = new Map<string, number>();
    for (const c of data.cities) if (c.wellKnown) pool.set(data.countries[c.cc]!.continent!, (pool.get(data.countries[c.cc]!.continent!) ?? 0) + 1);
    const weights = new Map([...pool].map(([k, n]) => [k, n ** CONTINENT_BALANCE_EXPONENT]));
    const total = [...weights.values()].reduce((a, b) => a + b, 0);
    const counts = new Map<string, number>();
    const n = 3000;
    for (let seed = 0; seed < n; seed++) {
      const continent = data.countries[data.byId.get(randomStartCity(data, seed))!.cc]!.continent!;
      counts.set(continent, (counts.get(continent) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(['AF', 'AS', 'EU', 'NA', 'OC', 'SA']);
    for (const [k, c] of counts) {
      const expected = (n * weights.get(k)!) / total;
      expect(Math.abs(c - expected)).toBeLessThan(0.2 * expected + 20);
    }
    // Asia stays the most likely, Oceania the least, but Asia is well under half.
    expect(counts.get('AS')! / n).toBeLessThan(0.45);
    expect(counts.get('OC')!).toBeLessThan(counts.get('AF')!);
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
    newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 5, guessesPerRing: 3, ...overrides }, 7, NOW);

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

  it('skips a ring: missed, answer revealed, then on to the next', () => {
    let s = submitGuess(data, start(), 3).state;
    s = skipRing(s);
    expect(currentRingState(s)).toMatchObject({ status: 'missed', skipped: true });
    expect(s.phase).toBe('ringOver');
    expect(skipRing(s)).toBe(s); // only while playing
    expect(nextRing(s).current).toBe(1);
  });

  it('accepts a member city as its metro in Metro mode', () => {
    let s = start({ measure: 'metro' });
    s = nextRing(submitGuess(data, s, 3).state); // Alpha solves ring 1 (Suburb is part of the start metro)
    const r = submitGuess(data, s, 6); // Delta -> Echo's metro, ring 2's answer
    expect(r.outcome).toEqual({ kind: 'correct', unitId: 7, rank: 1 });
  });
});

describe('rings, hints and the end of the game', () => {
  const { data } = synthetic();

  it('moves through rings, auto-skips empty ones, and finishes', () => {
    let s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 5 }, 7, NOW);
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
    const s = newGame(data, { startCityId: 9, ringWidthKm: 500, ringCount: 2 }, 1, NOW); // Golf is over 1,000 km from all
    expect(s.phase).toBe('ringOver');
    expect(s.ringStates.every((r) => r.status === 'empty')).toBe(true);
  });

  it('gives the three hints in order, then no more', () => {
    let s: GameState = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3 }, 7, NOW);
    s = useHint(data, s);
    expect(currentRingState(s).hints).toEqual({
      used: ['country'],
      for: 2,
      shown: ['country'],
      country: { cc: 'XX', name: 'Exland', focus: expect.objectContaining({ lat: expect.any(Number) }) },
    });
    s = useHint(data, s);
    const area = currentRingState(s).hints.area!;
    expect(distanceKm(area, data.byId.get(currentRing(s).answerId!)!)).toBeLessThan(area.radiusKm);
    s = useHint(data, s);
    expect(currentRingState(s).hints.letter).toBe('S');
    expect(useHint(data, s)).toBe(s);
  });

  it('gives no hints when they are switched off', () => {
    const s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, hints: false }, 7, NOW);
    expect(useHint(data, s)).toBe(s);
  });

  it('gives the same hint circle when a game is replayed', () => {
    const play = () => useHint(data, useHint(data, newGame(data, { startCityId: 1 }, 99, NOW)));
    expect(currentRingState(play()).hints.area).toEqual(currentRingState(play()).hints.area);
  });
});

describe('finding several cities per ring', () => {
  const { data } = synthetic();
  // City measure, ring 1 (0-500 km): Suburb (2) > Alpha (3) > Bravo (4) > Springfield (10).
  const start = (citiesToFind: number) =>
    newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 2, citiesToFind }, 7, NOW);

  it('targets the top N, found in any order; finds are free and the ring ends when all are found', () => {
    let s = start(3);
    expect(targetsOf(currentRing(s), s.settings)).toEqual([2, 3, 4]);
    let r = submitGuess(data, s, 4); // Bravo, the 3rd
    expect(r.outcome).toEqual({ kind: 'correct', unitId: 4, rank: 3 });
    s = r.state;
    s = submitGuess(data, s, 10).state; // Springfield: in the ring but not a target
    expect(guessesLeft(s)).toBe(2);
    s = submitGuess(data, s, 2).state;
    expect(s.phase).toBe('playing');
    r = submitGuess(data, s, 3);
    expect(r.state.phase).toBe('ringOver');
    expect(currentRingState(r.state).status).toBe('solved');
    expect(foundCount(currentRingState(r.state))).toBe(3);
  });

  it('ends after 3 misses, keeping the ones found', () => {
    let s = start(2);
    s = submitGuess(data, s, 3).state; // Alpha: a target
    for (const id of [4, 10]) s = submitGuess(data, s, id).state; // two misses
    expect(s.phase).toBe('playing');
    s = submitGuess(data, s, 5).state; // outside: doesn't count
    expect(s.phase).toBe('playing');
    s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 2, citiesToFind: 1 }, 7, NOW);
    for (const id of [3, 4, 10]) s = submitGuess(data, s, id).state;
    expect(currentRingState(s).status).toBe('missed');
  });

  it('caps the targets at the cities in the ring', () => {
    const s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, citiesToFind: 5 }, 7, NOW);
    expect(targetsOf(s.rings[2]!, s.settings)).toHaveLength(2); // ring 3 holds 2 cities
  });

  it('points hints at the biggest target not found, starting over when it is found', () => {
    let s = start(2);
    s = useHint(data, s);
    expect(currentRingState(s).hints).toMatchObject({ for: 2, shown: ['country'] });
    s = submitGuess(data, s, 2).state; // found the hinted city: its hints clear
    expect(currentRingState(s).hints).toEqual({ used: ['country'] });
    expect(nextTarget(s)).toBe(3);
    s = useHint(data, s);
    expect(currentRingState(s).hints).toMatchObject({ used: ['country', 'country'], for: 3, shown: ['country'] });
    s = useHint(data, s);
    expect(currentRingState(s).hints.shown).toEqual(['country', 'area']);
    expect(useHint(data, s)).toBe(s); // 3 hints per ring in all
  });
});
