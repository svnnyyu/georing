// Shown after each ring: the result, the ring's top 5 with the player's guesses coloured, and
// the Next ring button.

import { REVEAL_TOP_N } from '../../config.ts';
import { guessesUsed } from '../../core/game.ts';
import { topUnits } from '../../core/rings.ts';
import type { GameState } from '../../core/types.ts';
import { formatPop, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';
import { SectionLabel } from './Controls.tsx';

export function RevealPanel({ game, onNext }: { game: GameState; onNext: () => void }) {
  const { data, settings } = useGame();
  const ring = game.rings[game.current]!;
  const rs = game.ringStates[game.current]!;
  const last = game.current === game.rings.length - 1;
  const answer = ring.answerId === null ? null : data.byId.get(ring.answerId)!;

  let headline: React.ReactNode;
  if (rs.status === 'empty') headline = <span className="dim">No cities in this ring</span>;
  else if (rs.status === 'solved') {
    const n = guessesUsed(rs);
    headline = (
      <span className="text-correct">
        Solved in {n} {n === 1 ? 'guess' : 'guesses'}
      </span>
    );
  } else headline = <span className="text-wrong">{rs.skipped ? 'Skipped' : 'Missed'}: it was {answer?.name}</span>;

  const guessed = new Map(rs.guesses.map((g) => [g.unitId, g.result]));

  return (
    <section className="popup reveal" aria-live="polite">
      <p className="reveal-headline">{headline}</p>
      {rs.status !== 'empty' && (
        <>
          <SectionLabel>Top {REVEAL_TOP_N} in this ring</SectionLabel>
          <div className="log">
            {topUnits(data, ring, game.settings.measure, REVEAL_TOP_N).map(({ unitId, pop }, i) => {
              const c = data.byId.get(unitId)!;
              const result = guessed.get(unitId);
              return (
                <div key={unitId} className="log-row">
                  <span className="num">{i + 1}</span>
                  {/* Cities you guessed are coloured: green for the right one, red otherwise. The
                      place is dim, and so is the "…" when a long one is cut off. */}
                  <span className="name">
                    <span className={result ? `city text-${result}` : 'city'} aria-label={result ? `${c.name} (your guess)` : undefined}>
                      {c.name}
                    </span>{' '}
                    {placeOf(data, c.id, { regions: settings.subdivisions })}
                  </span>
                  <span className="num">{formatPop(pop)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {rs.status !== 'empty' && (
        <button type="button" className="btn primary full" onClick={onNext} autoFocus>
          {last ? 'See summary' : 'Next ring'}
        </button>
      )}
    </section>
  );
}
