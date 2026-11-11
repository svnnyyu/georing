// End of game popup: each ring's answer and how it went (see docs/SPEC.md -> End of game).
// Saving to history and the History button arrive in milestone 7.

import { guessesUsed } from '../../core/game.ts';
import type { GameState } from '../../core/types.ts';
import { SectionLabel } from '../components/Controls.tsx';
import { Modal } from '../components/Modal.tsx';
import { formatKm, formatPop, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';
import { unitPop } from '../../core/data.ts';

export function SummaryDialog({ game }: { game: GameState }) {
  const { data, start, quit, settings } = useGame();
  const solved = game.ringStates.filter((r) => r.status === 'solved').length;
  const played = game.ringStates.filter((r) => r.status !== 'empty').length;
  const from = data.byId.get(game.startId)!;

  return (
    <Modal kicker="GeoRing" title="Game over">
      <p>
        <span className="text-correct" style={{ fontSize: 'var(--text-xl)' }}>
          {solved}
        </span>{' '}
        <span className="dim">
          of {played} rings solved from {from.name}
        </span>
      </p>

      <section>
        <SectionLabel>Rings</SectionLabel>
        <div className="log">
          {game.rings.map((ring, i) => {
            const rs = game.ringStates[i]!;
            const answer = ring.answerId === null ? null : data.byId.get(ring.answerId)!;
            const status =
              rs.status === 'empty'
                ? 'empty'
                : rs.status === 'solved'
                  ? `solved in ${guessesUsed(rs)}`
                  : rs.skipped
                    ? 'skipped'
                    : 'missed';
            return (
              <div key={i} className="log-row">
                <span className={`sq ${rs.status === 'solved' ? 'correct' : rs.status === 'missed' ? 'wrong' : 'empty'}`} />
                <span className="name">
                  {answer ? (
                    <>
                      {answer.name} <span className="dim">{placeOf(data, answer.id, { regions: settings.subdivisions })}</span>
                    </>
                  ) : (
                    <span className="dim">No cities</span>
                  )}
                  <br />
                  <span className="dim">
                    {formatKm(ring.innerKm)}–{formatKm(ring.outerKm)}
                    {answer ? ` · ${formatPop(unitPop(data, game.settings.measure, answer.id))}` : ''}
                  </span>
                </span>
                <span className="num">
                  {status}
                  {rs.hints.used.length > 0 ? ` · ${rs.hints.used.length} hint${rs.hints.used.length > 1 ? 's' : ''}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="dialog-actions">
        <button type="button" className="btn primary" onClick={() => start()} autoFocus>
          Play again
        </button>
        <button type="button" className="btn" onClick={quit}>
          Main menu
        </button>
      </div>
    </Modal>
  );
}
