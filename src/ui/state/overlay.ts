// Turns the game state into what the globe draws: rings so far and city markers.

import { cityOrThrow, type GameData } from '../../core/data.ts';
import type { GameState } from '../../core/types.ts';
import type { GlobeMarker, GlobeOverlay, MarkerKind } from '../globe/overlay.ts';

/** Marker ids: "start", "<ring>:<unitId>" for guesses, "<ring>:answer" for a revealed answer. */
export type MarkerRef = { kind: 'start' } | { kind: 'guess' | 'answer'; ring: number; unitId: number };

export function parseMarkerId(game: GameState, id: string): MarkerRef | null {
  if (id === 'start') return { kind: 'start' };
  const [ringText, rest] = id.split(':');
  const ring = Number(ringText);
  if (!Number.isInteger(ring) || !game.rings[ring]) return null;
  if (rest === 'answer') {
    const unitId = game.rings[ring]!.answerId;
    return unitId === null ? null : { kind: 'answer', ring, unitId };
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
    if (rs.status === 'missed' && ring.answerId !== null) {
      const c = cityOrThrow(data, ring.answerId);
      markers.push({ id: `${i}:answer`, lon: c.lon, lat: c.lat, kind: 'correct', label: c.name, faded });
    }
  });
  return { rings, markers };
}
