import { describe, expect, it } from 'vitest';
import {
  editDistance,
  enterGuess,
  maxDistanceFor,
  normalize,
  resolveGuess,
  suggest,
  type MatchContext,
} from '../../src/core/matching.ts';
import { idOf, nameOf, realData, synthetic } from './fixtures.ts';

const noRing: MatchContext = { measure: 'city', inRing: () => false };

describe('normalize', () => {
  it('lowercases, strips accents and punctuation, and collapses spaces', () => {
    expect(normalize('São-Paulo')).toBe('sao paulo');
    expect(normalize('  sao   paulo ')).toBe('sao paulo');
    expect(normalize('Xi’an')).toBe('xi an');
    expect(normalize("Xi'an")).toBe('xi an');
    expect(normalize('St. John’s')).toBe('st john s');
    expect(normalize('Zürich')).toBe('zurich');
    expect(normalize('MÜNCHEN!')).toBe('munchen');
    expect(normalize('...')).toBe('');
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('tokyo', 'tokoy')).toBe(1); // swap
    expect(editDistance('paris', 'pariss')).toBe(1);
    expect(editDistance('paris', 'pars')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('stops early above the limit', () => {
    expect(editDistance('london', 'tokyo', 2)).toBe(3);
  });

  it('allows more typos in longer names', () => {
    expect(maxDistanceFor(3)).toBe(0);
    expect(maxDistanceFor(5)).toBe(1);
    expect(maxDistanceFor(8)).toBe(2);
    expect(maxDistanceFor(12)).toBe(3);
  });
});

describe('resolveGuess (synthetic)', () => {
  const { data, index } = synthetic();

  it('matches names and aliases exactly', () => {
    expect(resolveGuess(index, data, 'alpha', noRing)).toEqual({ kind: 'match', unitId: 3 });
    expect(resolveGuess(index, data, 'ALF', noRing)).toEqual({ kind: 'match', unitId: 3 });
  });

  it('picks the much larger of two same-named cities when neither is in the ring', () => {
    // 155k vs 60k: below AMBIGUOUS_POP_RATIO, so no picker (real Springfields do tie; see below).
    expect(resolveGuess(index, data, 'springfield', noRing)).toEqual({ kind: 'match', unitId: 11 });
  });

  it('asks which one when both same-named cities are in the ring', () => {
    const r = resolveGuess(index, data, 'Springfield', { measure: 'city', inRing: () => true });
    expect(r).toEqual({ kind: 'ambiguous', unitIds: [11, 10] });
  });

  it('prefers the in-ring city when names tie', () => {
    const r = resolveGuess(index, data, 'Springfield', { measure: 'city', inRing: (id) => id === 10 });
    expect(r).toEqual({ kind: 'match', unitId: 10 });
  });

  it('maps member cities to their metro in Metro mode', () => {
    expect(resolveGuess(index, data, 'Delta', { measure: 'metro', inRing: () => false })).toEqual({
      kind: 'match',
      unitId: 7,
    });
  });

  it('returns none for unknown text', () => {
    expect(resolveGuess(index, data, 'Zzzzzz', noRing)).toEqual({ kind: 'none' });
    expect(resolveGuess(index, data, '', noRing)).toEqual({ kind: 'none' });
  });
});

describe('resolveGuess (real data)', () => {
  const { data, index } = realData();
  const resolved = (text: string, ctx = noRing) => {
    const r = resolveGuess(index, data, text, ctx);
    return r.kind === 'match' ? nameOf(data, r.unitId) : r.kind;
  };

  it('handles accents and case', () => {
    expect(resolved('sao paulo')).toBe('São Paulo');
    expect(resolved('ZURICH')).toBe('Zürich');
  });

  it('handles aliases and abbreviations', () => {
    expect(resolved('NYC')).toBe('New York City');
    expect(resolved('Bombay')).toBe('Mumbai');
    expect(resolved('Peking')).toBe('Beijing');
    expect(resolved('DC')).toBe('Washington');
    expect(resolved('München')).toBe('Munich');
  });

  it('corrects typos', () => {
    expect(resolved('Tokoy')).toBe('Tokyo');
    expect(resolved('Nwe Yokr')).toBe('New York City');
    expect(resolved('Philadelpia')).toBe('Philadelphia');
    expect(resolved('Barcelonna')).toBe('Barcelona');
  });

  it('does not fuzzy-match very short names', () => {
    expect(resolved('Xqz')).toBe('none');
  });
});

describe('enterGuess (autocorrect on Enter)', () => {
  const { data, index } = realData();

  it('submits text that is already the display name', () => {
    const tokyo = idOf(data, 'Tokyo');
    expect(enterGuess(index, data, 'Tokyo', noRing)).toEqual({ kind: 'submit', unitId: tokyo });
    expect(enterGuess(index, data, 'tokyo ', noRing)).toEqual({ kind: 'submit', unitId: tokyo });
  });

  it('corrects typos and aliases to the display name first', () => {
    const nyc = idOf(data, 'New York City');
    expect(enterGuess(index, data, 'Nwe Yokr', noRing)).toEqual({ kind: 'correct', text: 'New York City', unitId: nyc });
    expect(enterGuess(index, data, 'NYC', noRing)).toEqual({ kind: 'correct', text: 'New York City', unitId: nyc });
  });

  it('corrects a member city to its metro in Metro mode', () => {
    const metro: MatchContext = { measure: 'metro', inRing: () => false };
    expect(enterGuess(index, data, 'Newark', metro)).toMatchObject({ kind: 'correct', text: 'New York City' });
    expect(enterGuess(index, data, 'Yokohama', metro)).toMatchObject({ kind: 'correct', text: 'Tokyo' });
  });

  it('reports unknown text, and asks only when same-named cities are similar in size', () => {
    expect(enterGuess(index, data, 'Qwertyuiop', noRing)).toEqual({ kind: 'notFound' });
    const springfield = enterGuess(index, data, 'Springfield', noRing);
    expect(springfield.kind).toBe('pick');
    if (springfield.kind === 'pick') {
      expect(springfield.unitIds.map((id) => data.byId.get(id)!.admin1)).toEqual(
        expect.arrayContaining(['Missouri', 'Massachusetts', 'Illinois']),
      );
    }
    expect(enterGuess(index, data, 'Paris', noRing)).toEqual({ kind: 'submit', unitId: idOf(data, 'Paris', 'FR') });
    expect(enterGuess(index, data, 'Newark', noRing)).toEqual({ kind: 'submit', unitId: idOf(data, 'Newark', 'US') });
  });
});

describe('suggest', () => {
  const { data, index } = realData();

  it('needs at least two characters', () => {
    expect(suggest(index, data, 't', 'city')).toEqual([]);
  });

  it('ranks prefix matches by population', () => {
    const names = suggest(index, data, 'tok', 'city').map((id) => nameOf(data, id));
    expect(names[0]).toBe('Tokyo');
    expect(names.length).toBeLessThanOrEqual(6);
  });

  it('falls back to fuzzy matches', () => {
    expect(nameOf(data, suggest(index, data, 'Barcelonna', 'city')[0] ?? null)).toBe('Barcelona');
  });

  it('lists each metro once in Metro mode', () => {
    const ids = suggest(index, data, 'new', 'metro');
    expect(new Set(ids).size).toBe(ids.length);
  });
});
