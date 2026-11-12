import { describe, expect, it } from 'vitest';
import type { GameRecord, RingRecord } from '../../src/core/history.ts';
import { ringEmoji, shareText } from '../../src/core/share.ts';
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

describe('share text', () => {
  it('colours each ring like the summary', () => {
    expect(ringEmoji(ring(0, {}))).toBe('🟩');
    expect(ringEmoji(ring(0, { status: 'missed', targets: 3, found: 1 }))).toBe('🟨');
    expect(ringEmoji(ring(0, { status: 'missed', found: 0 }))).toBe('🟥');
    expect(ringEmoji(ring(0, { status: 'empty', answerId: null, targets: 0, found: 0 }))).toBe('⬜');
  });

  it('sums up a game without naming any answer', () => {
    const r = record([ring(0, { hints: ['country'] }), ring(1, { status: 'missed', found: 0, hints: ['country', 'area'] }), ring(2, {})]);
    expect(shareText(r, { startName: 'Paris' })).toBe(
      ['GeoRing 🌍 Cities', '📍 Paris · 3 rings of 500 km', '🟩🟥🟩', '2 of 3 rings solved · 💡 3'].join('\n'),
    );
  });

  it('counts countries found, and leaves out hints when none were used', () => {
    const r = record([ring(0, { targets: 2, found: 1 })], { mode: 'countries', citiesToFind: 2 });
    expect(shareText(r).split('\n')).toEqual(['GeoRing 🌍 Countries', '1 ring of 500 km', '🟨', '1 of 2 countries found']);
  });

  it('wraps long games and sums up the rest', () => {
    const r = record(Array.from({ length: 80 }, (_, i) => ring(i, {})));
    const lines = shareText(r).split('\n');
    expect(lines.slice(2, 7).every((l) => [...l].length === 10)).toBe(true);
    expect(lines[7]).toBe('+30 more');
  });
});
