// Turns the game state into what the globe draws: rings so far, city markers and hints.

import { cityOrThrow, type GameData } from '../../core/data.ts';
import { areaCentre, pointInRing } from '../../core/countries.ts';
import { territoryLabel } from '../format.ts';
import { targetsOf } from '../../core/game.ts';
import type { GameState, Ring } from '../../core/types.ts';
import type { GlobeMarker, GlobeOverlay, MarkerKind, RingClip } from '../globe/overlay.ts';

/** Marker ids: "start", "<ring>:<unitId>" for guesses, "<ring>:answer:<unitId>" for a
 *  revealed target the player didn't find. Countries mode adds "@<cc>" for a label over one of
 *  the country's territories (area: "BM" for Bermuda, part of the United Kingdom). */
export type MarkerRef =
  | { kind: 'start' }
  | { kind: 'guess' | 'answer'; ring: number; unitId: number; area?: string };

const LETTER_HINT_MASK = '****';

export function parseMarkerId(game: GameState, id: string): MarkerRef | null {
  if (id === 'start') return { kind: 'start' };
  const [base, area] = id.split('@') as [string, string | undefined];
  const ref = parseBase(game, base);
  return ref && area && ref.kind !== 'start' ? { ...ref, area } : ref;
}

function parseBase(game: GameState, id: string): MarkerRef | null {
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
  // Countries mode: a country's shapes include the territories that count toward it
  // (the Netherlands with Aruba, Curaçao and Sint Maarten), which the map draws separately.
  const withTerritories = (cc: string) => [cc, ...data.territories.filter((t) => t.of === cc).map((t) => t.cc)];
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
    const add = (id: string, unitId: number, kind: MarkerKind, typedAs?: string) => {
      const c = cityOrThrow(data, unitId);
      if (!c.isCountry) {
        markers.push({ id, lon: c.lon, lat: c.lat, kind, label: c.name, faded });
        return;
      }
      // Countries mode: the name sits where the country's people in this ring live (its own
      // middle when it has none there), and only its part inside the ring is tinted. A
      // territory with people in the ring gets its own label: "Bermuda (United Kingdom)".
      const areas = ring.areas?.[ring.unitIds.indexOf(unitId)];
      if (typedAs) {
        // Guessed as a territory: only that territory is labelled and tinted (it still counts
        // as its country). Its label sits over its people in the ring, or its middle.
        const inRing = areas?.find((a) => a.cc === typedAs);
        const p = inRing ?? (data.grid && areaCentre(data.grid, typedAs)) ?? c;
        const label = territoryLabel(data, typedAs, c);
        markers.push({ id: `${id}@${typedAs}`, lon: p.lon, lat: p.lat, kind, label, faded, labelOnly: true });
        if (kind !== 'outside') countryFills.push({ cc: typedAs, kind, faded, clip: clipOf(ring) });
        return;
      }
      if (areas?.length) {
        for (const a of areas) {
          const own = a.cc === c.cc;
          const label = own ? c.name : territoryLabel(data, a.cc, c);
          markers.push({ id: own ? id : `${id}@${a.cc}`, lon: a.lon, lat: a.lat, kind, label, faded, labelOnly: true });
        }
      } else {
        const p = pointInRing(ring, unitId) ?? c;
        markers.push({ id, lon: p.lon, lat: p.lat, kind, label: c.name, faded, labelOnly: true });
      }
      if (kind !== 'outside') {
        for (const cc of withTerritories(c.cc)) countryFills.push({ cc, kind, faded, clip: clipOf(ring) });
      }
    };
    for (const g of rs.guesses) add(`${i}:${g.unitId}`, g.unitId, g.result, g.area);
    // A lost ring reveals every target the player didn't find, in green.
    if (rs.status === 'missed') {
      const guessed = new Set(rs.guesses.map((g) => g.unitId));
      for (const t of targetsOf(ring, game.settings)) if (!guessed.has(t)) add(`${i}:answer:${t}`, t, 'correct');
    }
  });
  // Hints for the ring being played (cleared when the next ring starts). Circles and letters
  // are for targets not found yet: each goes when its target is found.
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
      ? {
          hintCountries: {
            ccs: game.settings.mode === 'countries' ? hints.countries.ccs.flatMap(withTerritories) : hints.countries.ccs,
          },
        }
      : {}),
    ...(hintAreas.length ? { hintAreas } : {}),
  };
}
