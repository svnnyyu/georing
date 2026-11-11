import { describe, expect, it } from 'vitest';
import { countryName, unitIdOf, unitPop } from '../../src/core/data.ts';
import { idOf, realData, synthetic } from './fixtures.ts';

describe('units', () => {
  const { data } = synthetic();

  it('treats every city as its own unit in City mode', () => {
    expect(unitIdOf(data, 'city', 2)).toBe(2);
    expect(unitPop(data, 'city', 7)).toBe(600_000);
    expect(data.units.city).toHaveLength(11);
  });

  it('merges metro members into the main city in Metro mode', () => {
    expect(unitIdOf(data, 'metro', 2)).toBe(1); // Suburb -> Start
    expect(unitIdOf(data, 'metro', 6)).toBe(7); // Delta -> Echo
    expect(unitIdOf(data, 'metro', 3)).toBe(3); // Alpha has no metro
    expect(unitPop(data, 'metro', 7)).toBe(2_000_000);
    expect(unitPop(data, 'metro', 3)).toBe(200_000);
    expect(data.units.metro).not.toContain(2);
    expect(data.units.metro).not.toContain(6);
    expect(data.units.metro).toHaveLength(9);
  });

  it('sorts units by population, largest first', () => {
    const pops = data.units.metro.map((id) => unitPop(data, 'metro', id));
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
    expect(data.units.city[0]).toBe(9); // Golf, 10M
  });

  it('indexes metro members and country names', () => {
    expect(data.metroMembers.get(102)?.sort()).toEqual([6, 7]);
    expect(countryName(data, 'XX')).toBe('Exland');
    expect(countryName(data, 'ZZ')).toBe('ZZ');
  });
});

describe('real data', () => {
  it('merges Newark into New York City in Metro mode', () => {
    const { data } = realData();
    const nyc = idOf(data, 'New York City');
    expect(unitIdOf(data, 'metro', idOf(data, 'Newark', 'US'))).toBe(nyc);
    expect(unitPop(data, 'metro', nyc)).toBeGreaterThan(unitPop(data, 'city', nyc));
  });
});
