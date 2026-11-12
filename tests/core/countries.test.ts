import { describe, expect, it } from 'vitest';
import { buildCountryRings, countryOutsideKm, countryUnitId, decodeGrid, isCountryUnit } from '../../src/core/countries.ts';
import { buildGameData } from '../../src/core/data.ts';
import { currentRingState, newGame, submitGuess, useHint } from '../../src/core/game.ts';
import { guessInfo } from '../../src/core/guessInfo.ts';
import { toRecord } from '../../src/core/history.ts';
import type { City, Country, PopulationFile } from '../../src/core/types.ts';

const NOW = new Date('2026-11-12T12:00:00Z');

/** A 1° population grid with people at the centres of the given squares. */
function grid(people: Record<string, [lat: number, lon: number, n: number][]>): PopulationFile {
  const width = 360;
  const countries: Record<string, number[]> = {};
  for (const [cc, cells] of Object.entries(people)) {
    const idx = cells
      .map(([lat, lon, n]) => [Math.floor(90 - lat) * width + Math.floor(lon + 180), n] as const)
      .sort((a, b) => a[0] - b[0]);
    let prev = 0;
    countries[cc] = idx.flatMap(([i, n]) => {
      const d = i - prev;
      prev = i;
      return [d, n];
    });
  }
  return { res: 1, width, height: 180, countries };
}

// Start in Homeland at (0.5, 0.5). 1° of longitude at the equator is about 111 km.
const POP = grid({
  XX: [[0.5, 0.5, 900_000]], // the start country, around the start city
  AA: [[0.5, 2.5, 50_000]], // ~222 km
  BB: [
    [0.5, 3.5, 80_000], // ~333 km
    [0.5, 10.5, 10_000], // ~1,112 km
  ],
  CC: [[0.5, 4.5, 30_000]], // ~445 km
  DD: [[0.5, 40.5, 5_000_000]], // ~4,450 km: outside every ring below
  EE: [[0.5, 1.5, 400]], // in ring 1 but under COUNTRY_MIN_PEOPLE_IN_RING
});
const COUNTRIES: Record<string, Country> = {
  XX: { name: 'Homeland', continent: 'AF', aliases: [] },
  AA: { name: 'Aland', continent: 'AF', aliases: [] },
  BB: { name: 'Bland', continent: 'EU', aliases: ['BL'] },
  CC: { name: 'Cland', continent: 'AF', aliases: [] },
  DD: { name: 'Dland', continent: 'AS', aliases: [] },
  EE: { name: 'Eland', continent: 'AF', aliases: [] },
};
const START: City = { id: 1, name: 'Start', ascii: 'Start', lat: 0.5, lon: 0.5, pop: 1e6, cc: 'XX', admin1: '', aliases: [], wellKnown: true };
const data = buildGameData({ cities: [START], metros: [], countries: COUNTRIES, population: POP });
const id = countryUnitId;

describe('population grid', () => {
  it('decodes squares and totals', () => {
    const g = decodeGrid(POP);
    expect(g.get('BB')!.total).toBe(90_000);
    expect(g.get('BB')!.lat[0]).toBeCloseTo(0.5);
    expect(g.get('BB')!.lon[1]).toBeCloseTo(10.5);
  });

  it('gives each country a stable id and a city-shaped entry', () => {
    expect(id('FR')).toBe(id('FR'));
    expect(id('FR')).not.toBe(id('FI'));
    expect(isCountryUnit(id('FR'))).toBe(true);
    expect(isCountryUnit(1_234_567)).toBe(false);
    const bb = data.byId.get(id('BB'))!;
    expect(bb).toMatchObject({ name: 'Bland', cc: 'BB', pop: 90_000, isCountry: true, aliases: ['BL'] });
    expect(data.cities).toHaveLength(1); // country entries are never cities
  });
});

describe('country rings', () => {
  it('ranks countries by their people inside each ring, leaving out the start country and tiny ones', () => {
    const rings = buildCountryRings(data.grid!, START, { widthKm: 500, ringCount: 3, excludeCc: 'XX' });
    expect(rings[0]!.unitIds).toEqual([id('BB'), id('AA'), id('CC')]);
    expect(rings[0]!.pops).toEqual([80_000, 50_000, 30_000]);
    expect(rings[0]!.answerId).toBe(id('BB'));
    expect(rings[0]!.points![0]!.lon).toBeCloseTo(3.5, 1); // where Bland's people in the ring live
    expect(rings[1]!.unitIds).toEqual([]);
    expect(rings[2]!.unitIds).toEqual([id('BB')]); // Bland's 10,000 at ~1,112 km
    expect(rings[2]!.pops).toEqual([10_000]);
  });

  it('measures how far a country is from a ring it is not in', () => {
    const ring = buildCountryRings(data.grid!, START, { widthKm: 500, ringCount: 1, excludeCc: 'XX' })[0]!;
    expect(countryOutsideKm(data.grid!, 'DD', START, ring)).toBeCloseTo(4448 - 500, -1);
    expect(countryOutsideKm(data.grid!, 'ZZ', START, ring)).toBeNull();
  });
});

describe('a Countries game', () => {
  const start = () => newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, mode: 'countries' }, 7, NOW);

  it('judges country guesses', () => {
    let s = start();
    // The start city's own country counts: Homeland's 900,000 are in ring 1.
    expect(s.rings[0]!.unitIds.slice(0, 2)).toEqual([id('XX'), id('BB')]);
    let r = submitGuess(data, s, id('DD'));
    expect(r.outcome).toMatchObject({ kind: 'outside' });
    expect(r.outcome.kind === 'outside' && r.outcome.outsideKm).toBeGreaterThan(3900);
    r = submitGuess(data, r.state, id('AA'));
    expect(r.outcome.kind).toBe('wrong');
    r = submitGuess(data, r.state, id('XX'));
    expect(r.outcome).toEqual({ kind: 'correct', unitId: id('XX'), rank: 1 });
    expect(currentRingState(r.state).status).toBe('solved');
    s = r.state;
    const info = guessInfo(data, s, 0, id('AA'));
    expect(info).toMatchObject({ isCountry: true, name: 'Aland', country: 'Africa', pop: 50_000, cityPop: 50_000 });
    expect(info.rank).toEqual({ position: 3, of: 4 });
  });

  it('hints: every country in the ring, then circles and letters where the people live', () => {
    let s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 3, mode: 'countries', citiesToFind: 2 }, 7, NOW);
    s = useHint(data, s);
    expect(currentRingState(s).hints.countries).toMatchObject({ ccs: ['XX', 'BB', 'AA', 'CC'], inRing: true });
    s = useHint(data, useHint(data, s));
    const h = currentRingState(s).hints;
    expect(h.areas!.map((a) => a.unitId)).toEqual([id('XX'), id('BB')]);
    expect(h.letters!.map((l) => l.letter)).toEqual(['H', 'B']);
    expect(h.letters![1]!.at.lon).toBeCloseTo(3.5, 1); // Bland's people in the ring
  });

  it("records the answer's people inside the ring", () => {
    let s = start();
    s = submitGuess(data, s, id('XX')).state;
    expect(toRecord(s).rings[0]).toMatchObject({ answerId: id('XX'), answerPop: 900_000, status: 'solved' });
  });

  it('keeps old saves working: "population" mode means cities', () => {
    const s = newGame(data, { startCityId: 1, mode: 'population' as never }, 7, NOW);
    expect(s.settings.mode).toBe('cities');
  });
});

describe('Countries mode on the real data', () => {
  it('ranks by people inside the ring (Paris, 1,000 km rings)', async () => {
    const { realData, idOf } = await import('./fixtures.ts');
    const { data: real } = realData();
    const s = newGame(real, { startCityId: idOf(real, 'Paris'), ringWidthKm: 1000, ringCount: 2, mode: 'countries' }, 1, NOW);
    const names = (i: number) => s.rings[i]!.unitIds.slice(0, 2).map((u) => real.byId.get(u)!.name);
    expect(names(0)).toEqual(['Germany', 'United Kingdom']);
    // The start country counts too: France's ~65 million are in the ring, third.
    expect(real.byId.get(s.rings[0]!.unitIds[2]!)!.name).toBe('France');
    expect(s.rings[0]!.pops![0]).toBeGreaterThan(70_000_000);
    expect(s.rings[1]!.unitIds.map((u) => real.byId.get(u)!.name)).toContain('Spain');
  });

  it('matches country names, aliases and typos', async () => {
    const { realData } = await import('./fixtures.ts');
    const { buildMatchIndex, resolveGuess } = await import('../../src/core/matching.ts');
    const { data: real } = realData();
    const index = buildMatchIndex(real.countryUnits);
    const name = (t: string) => {
      const r = resolveGuess(index, real, t, { measure: 'city', inRing: () => false });
      return r.kind === 'match' ? real.byId.get(r.unitId)!.name : r.kind;
    };
    expect(name('usa')).toBe('United States');
    expect(name('Türkiye')).toBe('Turkey');
    expect(name('germny')).toBe('Germany');
    // Hand-checked abbreviations (pipeline/country_aliases.csv)
    expect(name('drc')).toBe('Democratic Republic of the Congo');
    expect(name('DR Congo')).toBe('Democratic Republic of the Congo');
    expect(name('uae')).toBe('United Arab Emirates');
    expect(name('ksa')).toBe('Saudi Arabia');
    expect(name('dprk')).toBe('North Korea');
    expect(name('png')).toBe('Papua New Guinea');
    expect(name('car')).toBe('Central African Republic');
    expect(name('uk')).toBe('United Kingdom');
    // ...and GeoNames' wrong short codes are gone: "USA" was also South Africa's, "RU" the UK's.
    expect(name('USA')).toBe('United States');
    expect(name('ru')).not.toBe('United Kingdom');
  });
});
