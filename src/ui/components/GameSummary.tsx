// A finished game's score and ring-by-ring results, drawn from its history record, so the
// end-of-game popup and a game opened from History look the same.

import { unitPop } from '../../core/data.ts';
import type { GameRecord, RingRecord } from '../../core/history.ts';
import { formatKm, formatPop, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';
import { SectionLabel } from './Controls.tsx';

export function ringSquare(status: RingRecord['status']): string {
  return status === 'solved' ? 'sq correct' : status === 'missed' ? 'sq wrong' : 'sq empty';
}

function ringStatus(r: RingRecord): string {
  const base =
    r.status === 'empty'
      ? 'empty'
      : r.status === 'solved'
        ? `solved in ${r.guessesUsed ?? r.guesses.length}`
        : r.skipped
          ? 'skipped'
          : 'missed';
  const h = r.hints.length;
  return h > 0 ? `${base} · ${h} hint${h > 1 ? 's' : ''}` : base;
}

export function GameSummary({ record }: { record: GameRecord }) {
  const { data, settings } = useGame();
  const solved = record.rings.filter((r) => r.status === 'solved').length;
  const played = record.rings.filter((r) => r.status !== 'empty').length;
  const from = data.byId.get(record.startId);

  return (
    <>
      <p className="score">
        <span className="score-number text-correct">{solved}</span>{' '}
        <span className="dim">
          of {played} rings solved{from ? ` from ${from.name}` : ''}
        </span>
      </p>

      <section>
        <SectionLabel>Rings</SectionLabel>
        <div className="log">
          {record.rings.map((ring, i) => {
            const answer = ring.answerId === null ? undefined : data.byId.get(ring.answerId);
            return (
              <div key={i} className="log-row">
                <span className={ringSquare(ring.status)} />
                <span className="name">
                  {answer ? (
                    <>
                      <span className="city">{answer.name}</span>{' '}
                      {placeOf(data, answer.id, { regions: settings.subdivisions })}
                    </>
                  ) : (
                    'No cities'
                  )}
                  <br />
                  {formatKm(ring.innerKm)}–{formatKm(ring.outerKm)}
                  {answer ? ` · ${formatPop(unitPop(data, record.settings.measure, answer.id))}` : ''}
                </span>
                <span className="num">{ringStatus(ring)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
