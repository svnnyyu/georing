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
  it('uses commuting zones as metros, so suburbs and neighbouring cities count', () => {
    const { data } = realData();
    const unit = (name: string, cc: string) => data.byId.get(unitIdOf(data, 'metro', idOf(data, name, cc)))!.name;
    const pop = (name: string, cc: string) => unitPop(data, 'metro', idOf(data, name, cc));
    // The dense core alone was 0.6M: most of Atlanta's people live in low-density suburbs
    expect(pop('Atlanta', 'US')).toBeGreaterThan(5_500_000);
    expect(pop('Chicago', 'US')).toBeGreaterThan(8_500_000);
    expect(unit('Fort Worth', 'US')).toBe('Dallas');
    expect(unit('Mesa', 'US')).toBe('Phoenix');
    expect(unit('Marietta', 'US')).toBe('Atlanta');
    // The Pearl River Delta's commuting zones keep its cities apart
    expect(unit('Shenzhen', 'CN')).toBe('Shenzhen');
    expect(unit('Foshan', 'CN')).toBe('Guangzhou');
    expect(unit('Dongguan', 'CN')).toBe('Dongguan');
    // ... and pipeline/metro_splits.csv separates two that GHSL joins
    expect(unit('Wuxi', 'CN')).toBe('Wuxi');
    expect(unit('Shaoxing', 'CN')).toBe('Shaoxing');
  });

  it('merges Newark into New York City in Metro mode', () => {
    const { data } = realData();
    const nyc = idOf(data, 'New York City');
    expect(unitIdOf(data, 'metro', idOf(data, 'Newark', 'US'))).toBe(nyc);
    expect(unitPop(data, 'metro', nyc)).toBeGreaterThan(unitPop(data, 'city', nyc));
  });
});
