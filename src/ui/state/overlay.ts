// Turns the game state into what the globe draws: rings so far, city markers and hints.

import { cityOrThrow, type GameData } from '../../core/data.ts';
import { targetsOf } from '../../core/game.ts';
import type { GameState } from '../../core/types.ts';
import type { GlobeMarker, GlobeOverlay, MarkerKind } from '../globe/overlay.ts';

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
  game.rings.slice(0, game.current + 1).forEach((ring, i) => {
    const rs = game.ringStates[i]!;
    const faded = i < game.current || game.phase === 'finished';
    for (const g of rs.guesses) {
      const c = cityOrThrow(data, g.unitId);
      const kind: MarkerKind = g.result;
      markers.push({ id: `${i}:${g.unitId}`, lon: c.lon, lat: c.lat, kind, label: c.name, faded });
    }
    // A lost ring reveals every target the player didn't find, in green.
    if (rs.status === 'missed') {
      const guessed = new Set(rs.guesses.map((g) => g.unitId));
      for (const t of targetsOf(ring, game.settings)) {
        if (guessed.has(t)) continue;
        const c = cityOrThrow(data, t);
        markers.push({ id: `${i}:answer:${t}`, lon: c.lon, lat: c.lat, kind: 'correct', label: c.name, faded });
      }
    }
  });
  // Hints for the ring being played (cleared when the next ring starts).
  const hints = game.phase === 'finished' ? undefined : game.ringStates[game.current]!.hints;
  // Letter hint: the hinted city's dot, labelled with only its first letter ("N****"; always
  // four stars, so they don't give away the name's length). Gone once the ring is over, when
  // the answers themselves are shown.
  if (hints?.letter && hints.for !== undefined && game.phase === 'playing') {
    const c = cityOrThrow(data, hints.for);
    markers.push({ id: 'hint', lon: c.lon, lat: c.lat, kind: 'hint', label: `${hints.letter}${LETTER_HINT_MASK}` });
  }
  return {
    rings,
    markers,
    ...(hints?.country ? { hintCountry: hints.country.cc } : {}),
    ...(hints?.area ? { hintArea: hints.area } : {}),
  };
}
