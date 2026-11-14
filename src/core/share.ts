// The "Share results" text (see docs/SPEC.md -> End of game -> Sharing): a short summary of a
// finished game, built from its history record, e.g.
//
//   GeoRing 🌍 Countries
//   📍 🇲🇽 Heroica Matamoros · 20 rings of 1,000 km
//   🇲🇽🇺🇸🇺🇸❌🇨🇺🇬🇹🇨🇴🇧🇷🇧🇷🇧🇷 +10
//   17/18 rings solved · 💡 4
//
// One emoji per ring, up to SHARE.maxRings: the flag of a solved ring's answer (the country, or
// in Cities mode the city's country), 🟨 when some of several targets were found, ❌ when none
// were, ⬜ for a ring with nothing in it.

import { SHARE } from '../config.ts';
import { gameScore, ringScore, type GameRecord, type RingRecord } from './history.ts';

/** A country's flag emoji from its two-letter code (regional indicator letters). */
export function flagOf(cc: string | undefined): string {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** ccOf: the country code of a unit (a city's country, or a country itself). */
export function ringEmoji(ring: RingRecord, ccOf: (unitId: number) => string | undefined): string {
  if (ring.status === 'empty' || ring.answerId === null) return '⬜';
  const { targets, found } = ringScore(ring);
  return found >= targets ? flagOf(ccOf(ring.answerId)) : found > 0 ? '🟨' : '❌';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function shareText(
  record: GameRecord,
  opts: { ccOf: (unitId: number) => string | undefined; startName?: string },
): string {
  const countries = record.settings.mode === 'countries';
  const { found, targets } = gameScore(record);
  const several = (record.settings.citiesToFind ?? 1) > 1;
  const unit = several ? (countries ? 'countries found' : 'cities found') : 'rings solved';
  const width = record.rings[0] ? record.rings[0].outerKm - record.rings[0].innerKm : record.settings.ringWidthKm;
  const setup = `${plural(record.rings.length, 'ring')} of ${width.toLocaleString('en-US')} km`;
  const start = opts.startName ? `📍 ${flagOf(opts.ccOf(record.startId))} ${opts.startName} · ${setup}` : setup;

  const shown = record.rings.slice(0, SHARE.maxRings).map((r) => ringEmoji(r, opts.ccOf));
  const more = record.rings.length - shown.length;

  const hints = record.rings.reduce((n, r) => n + r.hints.length, 0);
  return [
    `GeoRing 🌍 ${countries ? 'Countries' : 'Cities'}`,
    start,
    shown.join('') + (more > 0 ? ` +${more}` : ''),
    `${found}/${targets} ${unit}${hints > 0 ? ` · 💡 ${hints}` : ''}`,
  ].join('\n');
}
