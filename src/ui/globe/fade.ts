// Fading for things drawn on the globe that come and go (the country and area hints): they
// fade in when they appear and fade out when they are removed, over HINT_FADE_MS.

import { HINT_FADE_MS } from '../../config.ts';

/** Something drawn that fades in when it appears and fades out when it is removed. */
export interface Fading<T> {
  value: T;
  key: string;
  /** When it appeared, or when it started to leave. */
  at: number;
  leaving: boolean;
}

export function updateFading<T>(cur: Fading<T> | null, next: T | undefined, keyOf: (v: T) => string, now: number): Fading<T> | null {
  if (next !== undefined) {
    const key = keyOf(next);
    return cur && cur.key === key && !cur.leaving ? cur : { value: next, key, at: now, leaving: false };
  }
  if (!cur || cur.leaving) return cur;
  // Start fading out from wherever the fade-in had got to.
  const shown = Math.min(1, (now - cur.at) / HINT_FADE_MS);
  return { ...cur, at: now - (1 - shown) * HINT_FADE_MS, leaving: true };
}

/** Opacity of a fading item now, or null once it has fully faded out (or there is none). */
export function fadeAlpha(f: Fading<unknown> | null, now: number): number | null {
  if (!f) return null;
  const t = Math.min(1, (now - f.at) / HINT_FADE_MS);
  if (f.leaving) return t >= 1 ? null : 1 - t;
  return t;
}
