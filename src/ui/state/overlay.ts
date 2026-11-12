// Turns the game state into what the globe draws: rings so far, city markers and hints.

import { cityOrThrow, type GameData } from '../../core/data.ts';
import { pointInRing } from '../../core/countries.ts';
import { targetsOf } from '../../core/game.ts';
import type { GameState, Ring } from '../../core/types.ts';
import type { GlobeMarker, GlobeOverlay, MarkerKind, RingClip } from '../globe/overlay.ts';

/** Marker ids: "start", "<ring>:<unitId>" for guesses, "<ring>:answer:<unitId>" for a
 *  revealed target the player didn't find. */
export type MarkerRef = { kind: 'start' } | { kind: 'guess' | 'answer'; ring: number; unitId: number };

const LETTER_HINT_MASK = '****';

export function parseMarkerId(game: GameState, id: string): MarkerRef | null {
  if (id === 'start') return { kind: 'start' };
  const [ringText, rest, answerText] = id.split(':');
  const ring = Number(ringText);
  if (!Number.isInteger(ring) || !game.rings[ring]) return null;
  if (rest === 'answer') {
    const unitId = answerText === undefined ? game.rings[ring]!.answerId : Number(answerText);
    return unitId === null || !Number.isInteger(unitId) ? null : { kind: 'answer', ring, unitId };
  }
  const unitId = Number(rest);
  return Number.isInteger(unitId) ? { kind: 'guess', ring, unitId } : null;
}

export function buildOverlay(data: GameData, game: GameState | null): GlobeOverlay {
  if (!game) return { rings: [], markers: [] };
  const start = cityOrThrow(data, game.startId);
  const rings = game.rings.slice(0, game.current + 1).map((r, i) => ({
    lon: start.lon,
    lat: start.lat,
    innerKm: r.innerKm,
    outerKm: r.outerKm,
    current: i === game.current && game.phase !== 'finished',
  }));
  const markers: GlobeMarker[] = [{ id: 'start', lon: start.lon, lat: start.lat, kind: 'start', label: start.name }];
  const countryFills: NonNullable<GlobeOverlay['countryFills']> = [];
  const clipOf = (r: Ring): RingClip => ({ lat: start.lat, lon: start.lon, innerKm: r.innerKm, outerKm: r.outerKm });
  game.rings.slice(0, game.current + 1).forEach((ring, i) => {
    const rs = game.ringStates[i]!;
    const faded = i < game.current || game.phase === 'finished';
    const add = (id: string, unitId: number, kind: MarkerKind) => {
      const c = cityOrThrow(data, unitId);
      if (!c.isCountry) {
        markers.push({ id, lon: c.lon, lat: c.lat, kind, label: c.name, faded });
        return;
      }
      // Countries mode: the name sits where the country's people in this ring live (its own
      // middle when it has none there), and only its part inside the ring is tinted.
      const p = pointInRing(ring, unitId) ?? c;
      markers.push({ id, lon: p.lon, lat: p.lat, kind, label: c.name, faded, labelOnly: true });
      if (kind !== 'outside') countryFills.push({ cc: c.cc, kind, faded, clip: clipOf(ring) });
    };
    for (const g of rs.guesses) add(`${i}:${g.unitId}`, g.unitId, g.result);
    // A lost ring reveals every target the player didn't find, in green.
    if (rs.status === 'missed') {
      const guessed = new Set(rs.guesses.map((g) => g.unitId));
      for (const t of targetsOf(ring, game.settings)) if (!guessed.has(t)) add(`${i}:answer:${t}`, t, 'correct');
    }
  });
  // Hints for the ring being played (cleared when the next ring starts). Circles and letters
  // are for targets not found yet: each goes when its target is found.
  const ring = game.rings[game.current]!;
  const rs = game.ringStates[game.current]!;
  const hints = game.phase === 'finished' ? undefined : rs.hints;
  const found = new Set(rs.guesses.filter((g) => g.result === 'correct').map((g) => g.unitId));
  // Letter hint: each target's dot, labelled with only its first letter ("N****"; always four
  // stars, so they don't give away the name's length). Gone once the ring is over, when the
  // answers themselves are shown.
  if (game.phase === 'playing') {
    for (const l of hints?.letters ?? []) {
      if (found.has(l.unitId)) continue;
      // (Countries mode: just the letter over the area, like the country names.)
      markers.push({
        id: `hint:${l.unitId}`,
        lon: l.at.lon,
        lat: l.at.lat,
        kind: 'hint',
        label: `${l.letter}${LETTER_HINT_MASK}`,
        ...(game.settings.mode === 'countries' ? { labelOnly: true } : {}),
      });
    }
  }
  const hintAreas = (hints?.areas ?? []).filter((a) => !found.has(a.unitId)).map((a) => a.circle);
  return {
    rings,
    markers,
    ...(countryFills.length ? { countryFills } : {}),
    ...(hints?.countries
      ? { hintCountries: { ccs: hints.countries.ccs, ...(hints.countries.inRing ? { clip: clipOf(ring) } : {}) } }
      : {}),
    ...(hintAreas.length ? { hintAreas } : {}),
  };
}
