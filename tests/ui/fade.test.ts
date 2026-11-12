import { describe, expect, it } from 'vitest';
import { HINT_FADE_MS } from '../../src/config.ts';
import { fadeAlpha, updateFading } from '../../src/ui/globe/fade.ts';

const key = (s: string) => s;

describe('hint fading', () => {
  it('fades in when shown, keeps going while unchanged', () => {
    const a = updateFading(null, 'IN', key, 1000)!;
    expect(fadeAlpha(a, 1000)).toBe(0);
    expect(fadeAlpha(a, 1000 + HINT_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(updateFading(a, 'IN', key, 1200)).toBe(a); // same hint: no restart
    expect(fadeAlpha(a, 1000 + HINT_FADE_MS * 2)).toBe(1);
  });

  it('fades out when removed, then is gone', () => {
    const shown = updateFading(null, 'IN', key, 0)!;
    const out = updateFading(shown, undefined, key, 5000)!;
    expect(out.leaving).toBe(true);
    expect(fadeAlpha(out, 5000)).toBe(1);
    expect(fadeAlpha(out, 5000 + HINT_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(fadeAlpha(out, 5000 + HINT_FADE_MS)).toBeNull();
    expect(updateFading(out, undefined, key, 5100)).toBe(out); // already leaving
  });

  it('fades out from where a half-done fade-in had got to', () => {
    const shown = updateFading(null, 'IN', key, 0)!;
    const out = updateFading(shown, undefined, key, HINT_FADE_MS / 4)!;
    expect(fadeAlpha(out, HINT_FADE_MS / 4)).toBeCloseTo(0.25);
  });

  it('a new hint replaces one that is leaving', () => {
    const out = updateFading(updateFading(null, 'IN', key, 0), undefined, key, 1000);
    const next = updateFading(out, 'PK', key, 1100)!;
    expect(next).toMatchObject({ value: 'PK', leaving: false, at: 1100 });
  });
});
