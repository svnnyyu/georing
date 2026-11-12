import { describe, expect, it } from 'vitest';
import { newGame, nextRing, skipRing, submitGuess, useHint } from '../../src/core/game.ts';
import { buildOverlay, parseMarkerId } from '../../src/ui/state/overlay.ts';
import { synthetic } from '../core/fixtures.ts';

const NOW = new Date('2026-11-11T12:00:00Z');

describe('globe overlay from game state', () => {
  const { data } = synthetic();

  it('shows the start city and the current ring before any guess', () => {
    const game = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3 }, 1, NOW);
    const o = buildOverlay(data, game);
    expect(o.rings).toEqual([expect.objectContaining({ innerKm: 0, outerKm: 500, current: true })]);
    expect(o.markers.map((m) => m.id)).toEqual(['start']);
  });

  it('adds a marker per guess, reveals a missed answer, and fades earlier rings', () => {
    let game = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, guessesPerRing: 3 }, 1, NOW);
    for (const id of [5, 3, 4, 10]) game = submitGuess(data, game, id).state; // outside, then 3 wrong
    let o = buildOverlay(data, game);
    expect(o.markers.map((m) => [m.id, m.kind])).toEqual([
      ['start', 'start'],
      ['0:5', 'outside'],
      ['0:3', 'wrong'],
      ['0:4', 'wrong'],
      ['0:10', 'wrong'],
      ['0:answer:2', 'correct'],
    ]);
    game = nextRing(game);
    o = buildOverlay(data, game);
    expect(o.rings.map((r) => r.current)).toEqual([false, true]);
    expect(o.markers.filter((m) => m.id.startsWith('0:')).every((m) => m.faded)).toBe(true);
  });

  it('shows the current ring\'s country and area hints', () => {
    let game = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3 }, 1, NOW);
    expect(buildOverlay(data, game).hintCountries).toBeUndefined();
    game = useHint(data, useHint(data, game));
    const o = buildOverlay(data, game);
    expect(o.hintCountries).toEqual({ ccs: ['XX'] }); // whole countries in Cities mode
    expect(o.hintAreas?.[0]?.radiusKm).toBeGreaterThan(0);
  });

  it("drops a target's circle and letter once it is found", () => {
    let game = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, citiesToFind: 2 }, 1, NOW);
    for (let i = 0; i < 3; i++) game = useHint(data, game);
    let o = buildOverlay(data, game);
    expect(o.hintAreas).toHaveLength(2);
    expect(o.markers.filter((m) => m.kind === 'hint')).toHaveLength(2);
    game = submitGuess(data, game, 2).state; // Suburb, one of the two
    o = buildOverlay(data, game);
    expect(o.hintAreas).toHaveLength(1);
    expect(o.markers.filter((m) => m.kind === 'hint').map((m) => m.id)).toEqual(['hint:3']);
  });

  it('parses marker ids back to rings and cities', () => {
    let game = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, guessesPerRing: 3 }, 1, NOW);
    for (const id of [3, 4, 10]) game = submitGuess(data, game, id).state;
    expect(parseMarkerId(game, 'start')).toEqual({ kind: 'start' });
    expect(parseMarkerId(game, '0:3')).toEqual({ kind: 'guess', ring: 0, unitId: 3 });
    expect(parseMarkerId(game, '0:answer:2')).toEqual({ kind: 'answer', ring: 0, unitId: 2 });
    expect(parseMarkerId(game, '0:answer')).toEqual({ kind: 'answer', ring: 0, unitId: 2 });
    expect(parseMarkerId(game, '9:3')).toBeNull();
  });

  it('reveals every target not found in a lost ring', () => {
    let game = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, citiesToFind: 3 }, 1, NOW);
    for (const id of [3, 10]) game = submitGuess(data, game, id).state; // Alpha found, a miss
    game = skipRing(game);
    const answers = buildOverlay(data, game).markers.filter((m) => m.id.includes('answer')).map((m) => m.id);
    expect(answers).toEqual(['0:answer:2', '0:answer:4']);
  });
});
