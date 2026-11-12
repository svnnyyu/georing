// A finished game's score and ring-by-ring results, drawn from its history record, so the
// end-of-game popup and a game opened from History look the same.

import { unitPop } from '../../core/data.ts';
import { gameScore, ringScore, type GameRecord, type RingRecord } from '../../core/history.ts';
import { formatKmRange, formatPop, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';
import { SectionLabel } from './Controls.tsx';

/** Square colour for a ring: green all found, yellow some found, red none, grey empty. */
export function ringSquare(ring: RingRecord): string {
  if (ring.status === 'empty') return 'sq empty';
  const { targets, found } = ringScore(ring);
  return found >= targets ? 'sq correct' : found > 0 ? 'sq partial' : 'sq wrong';
}

function ringStatus(r: RingRecord): string {
  const { targets, found } = ringScore(r);
  let base: string;
  if (r.status === 'empty') base = 'empty';
  else if (targets === 1) {
    base = r.status === 'solved' ? `solved in ${r.guessesUsed ?? r.guesses.length}` : r.skipped ? 'skipped' : 'missed';
  } else {
    base = `found ${found}/${targets}${r.skipped ? ' · skipped' : ''}`;
  }
  const h = r.hints.length;
  return h > 0 ? `${base} · ${h} hint${h > 1 ? 's' : ''}` : base;
}

export function GameSummary({ record }: { record: GameRecord }) {
  const { data, settings } = useGame();
  const { found, targets } = gameScore(record);
  // One city per ring reads as rings solved; several as cities found.
  const countries = record.settings.mode === 'countries';
  const unit = (record.settings.citiesToFind ?? 1) > 1 ? (countries ? 'countries found' : 'cities found') : 'rings solved';
  const from = data.byId.get(record.startId);

  return (
    <>
      <p className="score">
        <span className="score-number text-correct">{found}</span>{' '}
        <span className="dim">
          of {targets} {unit}
          {from ? ` from ${from.name}` : ''}
        </span>
      </p>

      <section>
        <SectionLabel>Rings</SectionLabel>
        <div className="log">
          {record.rings.map((ring, i) => {
            const answer = ring.answerId === null ? undefined : data.byId.get(ring.answerId);
            return (
              <div key={i} className="log-row">
                <span className={ringSquare(ring)} />
                <span className="name">
                  {answer ? (
                    <>
                      <span className="city">{answer.name}</span>{' '}
                      {placeOf(data, answer.id, { regions: settings.subdivisions })}
                    </>
                  ) : (
                    countries ? 'No countries' : 'No cities'
                  )}
                  <br />
                  {formatKmRange(ring.innerKm, ring.outerKm)}
                  {/* Countries mode: the answer's people inside the ring. */}
                  {answer ? ` · ${formatPop(ring.answerPop ?? unitPop(data, record.settings.measure, answer.id))}` : ''}
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
