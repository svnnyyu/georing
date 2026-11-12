// The "Share results" text (see docs/SPEC.md -> End of game -> Sharing): a short, spoiler-free
// summary of a finished game, built from its history record, e.g.
//
//   GeoRing 🌍 Cities
//   📍 Paris · 3 rings of 500 km
//   🟩🟨🟥
//   2 of 3 rings solved · 💡 2
//
// One square per ring, in the summary's colours: 🟩 every target found, 🟨 some, 🟥 none,
// ⬜ a ring with nothing in it.

import { SHARE } from '../config.ts';
import { gameScore, ringScore, type GameRecord, type RingRecord } from './history.ts';

export function ringEmoji(ring: RingRecord): string {
  if (ring.status === 'empty') return '⬜';
  const { targets, found } = ringScore(ring);
  return found >= targets ? '🟩' : found > 0 ? '🟨' : '🟥';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function shareText(record: GameRecord, opts: { startName?: string } = {}): string {
  const countries = record.settings.mode === 'countries';
  const { found, targets } = gameScore(record);
  const several = (record.settings.citiesToFind ?? 1) > 1;
  const unit = several ? (countries ? 'countries found' : 'cities found') : 'rings solved';
  const width = record.rings[0] ? record.rings[0].outerKm - record.rings[0].innerKm : record.settings.ringWidthKm;
  const setup = `${plural(record.rings.length, 'ring')} of ${width.toLocaleString('en-US')} km`;

  const squares = record.rings.slice(0, SHARE.maxSquares).map(ringEmoji);
  const lines: string[] = [];
  for (let i = 0; i < squares.length; i += SHARE.squaresPerLine) {
    lines.push(squares.slice(i, i + SHARE.squaresPerLine).join(''));
  }
  const more = record.rings.length - squares.length;
  if (more > 0) lines.push(`+${more} more`);

  const hints = record.rings.reduce((n, r) => n + r.hints.length, 0);
  return [
    `GeoRing 🌍 ${countries ? 'Countries' : 'Cities'}`,
    opts.startName ? `📍 ${opts.startName} · ${setup}` : setup,
    ...lines,
    `${found} of ${targets} ${unit}${hints > 0 ? ` · 💡 ${hints}` : ''}`,
  ].join('\n');
}
