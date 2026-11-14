import { describe, expect, it } from 'vitest';
import type { GameRecord, RingRecord } from '../../src/core/history.ts';
import { flagOf, ringEmoji, shareText } from '../../src/core/share.ts';
import type { Settings } from '../../src/core/types.ts';

const ring = (i: number, r: Partial<RingRecord>): RingRecord => ({
  innerKm: i * 500,
  outerKm: (i + 1) * 500,
  answerId: 1,
  guesses: [],
  status: 'solved',
  targets: 1,
  found: 1,
  hints: [],
  ...r,
});
const record = (rings: RingRecord[], settings: Partial<Settings> = {}): GameRecord => ({
  v: 1,
  playedAt: '2026-11-12T12:00:00Z',
  seed: 1,
  startId: 1,
  settings: { ringWidthKm: 500, ringCount: rings.length, mode: 'cities', citiesToFind: 1, ...settings } as Settings,
  rings,
});

// Unit 1 is in Mexico, 2 in the United States; the start (startId 1) too is in Mexico.
const CC: Record<number, string> = { 1: 'MX', 2: 'US' };
const ccOf = (id: number) => CC[id];

describe('share text', () => {
  it('makes flags from country codes', () => {
    expect(flagOf('MX')).toBe('🇲🇽');
    expect(flagOf('GB')).toBe('🇬🇧');
    expect(flagOf(undefined)).toBe('🏳️');
  });

  it("shows a solved ring's answer flag, and how the others went", () => {
    expect(ringEmoji(ring(0, { answerId: 2 }), ccOf)).toBe('🇺🇸');
    expect(ringEmoji(ring(0, { status: 'missed', targets: 3, found: 1 }), ccOf)).toBe('🟨');
    expect(ringEmoji(ring(0, { status: 'missed', found: 0 }), ccOf)).toBe('❌');
    expect(ringEmoji(ring(0, { status: 'empty', answerId: null, targets: 0, found: 0 }), ccOf)).toBe('⬜');
  });

  it('sums up a game', () => {
    const r = record([ring(0, { hints: ['country'] }), ring(1, { status: 'missed', found: 0, hints: ['country', 'area'] }), ring(2, { answerId: 2 })]);
    expect(shareText(r, { startName: 'Matamoros', ccOf })).toBe(
      ['GeoRing 🌍 Cities', '📍 🇲🇽 Matamoros · 3 rings of 500 km', '🇲🇽❌🇺🇸', '2/3 rings solved · 💡 3'].join('\n'),
    );
  });

  it('counts countries found, and leaves out hints when none were used', () => {
    const r = record([ring(0, { targets: 2, found: 1 })], { mode: 'countries', citiesToFind: 2 });
    expect(shareText(r, { ccOf }).split('\n')).toEqual(['GeoRing 🌍 Countries', '1 ring of 500 km', '🟨', '1/2 countries found']);
  });

  it('shows at most 10 rings and counts the rest', () => {
    const r = record(Array.from({ length: 20 }, (_, i) => ring(i, {})));
    expect(shareText(r, { ccOf }).split('\n')[2]).toBe(`${'🇲🇽'.repeat(10)} +10`);
  });
});
