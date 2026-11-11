import { describe, expect, it } from 'vitest';
import { newGame, submitGuess } from '../../src/core/game.ts';
import { guessInfo } from '../../src/core/guessInfo.ts';
import { synthetic } from './fixtures.ts';

const NOW = new Date('2026-11-11T12:00:00Z');

describe('guessInfo', () => {
  const { data } = synthetic();

  it('shows rank in the ring for in-ring guesses', () => {
    let state = newGame(data, { startCityId: 1, ringWidthKm: 100, ringCount: 3 }, 1, NOW);
    state = submitGuess(data, state, 3).state; // Alpha, 2nd of 4
    const info = guessInfo(data, state, 0, 3);
    expect(info).toMatchObject({
      name: 'Alpha',
      admin1: 'Region',
      country: 'Exland',
      result: 'wrong',
      cityPop: 200_000,
      metro: null,
      measure: 'city',
      pop: 200_000,
      rank: { position: 2, of: 4 },
      outsideKm: null,
    });
  });

  it('shows the distance outside the ring for outside guesses', () => {
    let state = newGame(data, { startCityId: 1, ringWidthKm: 100, ringCount: 3 }, 1, NOW);
    state = submitGuess(data, state, 5).state; // Charlie at 100.1 km
    const info = guessInfo(data, state, 0, 5);
    expect(info.result).toBe('outside');
    expect(info.rank).toBeNull();
    expect(info.outsideKm).toBe(0); // 0.1 km, rounded
    const golf = guessInfo(data, submitGuess(data, state, 9).state, 0, 9);
    expect(golf.outsideKm).toBe(350);
  });

  it('shows both figures and highlights the metro one in Metro mode', () => {
    let state = newGame(data, { startCityId: 1, ringWidthKm: 100, ringCount: 3, measure: 'metro' }, 1, NOW);
    state = submitGuess(data, state, 3).state;
    const info = guessInfo(data, state, 1, 7); // Echo's metro in ring 2
    expect(info).toMatchObject({
      name: 'Echo',
      cityPop: 600_000,
      metro: { pop: 2_000_000, members: 2 },
      measure: 'metro',
      pop: 2_000_000,
      rank: { position: 1, of: 2 },
      result: null,
    });
  });
});
