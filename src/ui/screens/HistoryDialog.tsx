// The History popup (see docs/SPEC.md -> History screen): totals, past games newest first,
// and Clear history (with a confirmation step). Opening a game shows its summary, with
// Replay this game.

import { useState, type CSSProperties } from 'react';
import { gameScore, historyStats, type GameRecord } from '../../core/history.ts';
import { SectionLabel } from '../components/Controls.tsx';
import { GameSummary } from '../components/GameSummary.tsx';
import { Modal } from '../components/Modal.tsx';
import { formatKm } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function playedAt(record: GameRecord): string {
  const d = new Date(record.playedAt);
  return Number.isNaN(d.getTime()) ? '' : when.format(d);
}

export function HistoryDialog({
  onClose,
  onReplay,
}: {
  /** Back to where it was opened from (the menu or the summary). */
  onClose: () => void;
  /** A game was replayed: close every popup. */
  onReplay: () => void;
}) {
  const { data, history, replay, clearHistory } = useGame();
  const [open, setOpen] = useState<GameRecord | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (open) {
    return (
      // Closing a past game steps back to the list, like its Back button.
      <Modal kicker={`History · ${playedAt(open)}`} title="Past game" onClose={() => setOpen(null)}>
        <GameSummary record={open} />
        <div className="dialog-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              replay(open);
              onReplay();
            }}
          >
            Replay this game
          </button>
          <button type="button" className="btn" onClick={() => setOpen(null)}>
            Back
          </button>
        </div>
      </Modal>
    );
  }

  const stats = historyStats(history);
  return (
    <Modal kicker="GeoRing" title="History" onClose={onClose}>
      {history.length === 0 ? (
        <p className="dim">No games yet. Finished games show up here.</p>
      ) : (
        <>
          <p className="score">
            <span className="score-number text-correct">{stats.foundPct}%</span>{' '}
            <span className="dim">
              of cities found in {stats.games} game{stats.games === 1 ? '' : 's'}
            </span>
          </p>
          <section>
            <SectionLabel>Games</SectionLabel>
            <div className="log">
              {history.map((r, i) => {
                const from = data.byId.get(r.startId);
                return (
                  <button key={`${r.playedAt}:${r.seed}:${i}`} type="button" className="log-row history-row" onClick={() => setOpen(r)}>
                    <span className="name">
                      <span className="city">{from?.name ?? 'Unknown city'}</span>{' '}
                      {r.rings.length} × {formatKm(r.settings.ringWidthKm)}
                      {(r.settings.citiesToFind ?? 1) > 1 ? ` · top ${r.settings.citiesToFind}` : ''}
                      {r.settings.mode === 'countries' ? ' · countries' : r.settings.measure === 'metro' ? ' · metro' : ''}
                      <br />
                      {playedAt(r)}
                    </span>
                    {/* The score: found / to find, coloured from red (none) to green (all). */}
                    {(() => {
                      const { found, targets } = gameScore(r);
                      return (
                        <span
                          className="num history-score"
                          style={{ '--score': targets > 0 ? found / targets : 0 } as CSSProperties}
                          aria-label={`${found} of ${targets} found`}
                        >
                          {found}/{targets}
                        </span>
                      );
                    })()}
                  </button>
                );
              })}
            </div>
          </section>
          {confirming ? (
            <div className="confirm">
              <p className="message wrong">Delete all {history.length} saved games? This can't be undone.</p>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    clearHistory();
                    setConfirming(false);
                  }}
                >
                  Clear history
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn full" onClick={() => setConfirming(true)}>
              Clear history
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
