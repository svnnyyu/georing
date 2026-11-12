// The in-game box at the top centre of the screen: ring, misses left, Hint, Skip, the start
// city (with the progress on the same line when there are several cities to find), the guess
// box and the last guess's outcome. It slides in when a game starts.

import { useEffect, useMemo } from 'react';
import { EMPTY_RING_ADVANCE_MS } from '../../config.ts';
import { foundCount, guessesLeft, hintsLeft as hintsLeftOf, nextTarget, targetsOf, type GuessOutcome } from '../../core/game.ts';
import type { GameState } from '../../core/types.ts';
import { GuessInput } from '../components/GuessInput.tsx';
import { BulbIcon } from '../components/Icons.tsx';
import { formatKm, formatKmRange, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

/** toFind: the ring's number of cities to find (1 = just the biggest). */
function outcomeMessage(outcome: GuessOutcome, name: string, toFind: number): { text: string; tone: string } {
  switch (outcome.kind) {
    case 'correct':
      return { text: toFind === 1 ? `${name} is right!` : `${name} is #${outcome.rank} in the ring!`, tone: 'correct' };
    case 'wrong':
      return {
        text: toFind === 1 ? `${name} is in the ring, but not the biggest` : `${name} is in the ring, but not in the top ${toFind}`,
        tone: 'wrong',
      };
    case 'outside':
      return { text: `Not in this ring: ${name} is ${formatKm(outcome.outsideKm)} outside`, tone: 'outside' };
    case 'repeat':
      return { text: `Already guessed ${name}`, tone: 'info' };
    case 'start':
      return { text: `${name} is the start city`, tone: 'info' };
    case 'ignored':
      return { text: '', tone: 'info' };
  }
}

export function Hud({ game }: { game: GameState }) {
  const { data, outcome, guess, next, skip, hint, settings } = useGame();
  const ring = game.rings[game.current]!;
  const rs = game.ringStates[game.current]!;
  const inRing = useMemo(() => new Set(ring.unitIds), [ring]);
  const left = guessesLeft(game);
  const start = data.byId.get(game.startId)!;
  const playing = game.phase === 'playing';
  const hintsLeft = hintsLeftOf(game);
  const toFind = targetsOf(ring, game.settings).length;
  const found = foundCount(rs);

  // An empty ring shows "No cities in this ring" briefly, then moves on by itself.
  useEffect(() => {
    if (game.phase !== 'ringOver' || rs.status !== 'empty') return;
    const t = window.setTimeout(next, EMPTY_RING_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [game.phase, rs.status, game.current, next]);

  const message =
    outcome && playing
      ? outcomeMessage(outcome.result, data.byId.get(outcome.result.unitId)?.name ?? '', toFind)
      : null;

  return (
    <section className="hud" aria-label="Game">
      <div className="hud-top">
        <span className="hud-ring">
          Ring {game.current + 1}
          <span className="dim">/{game.rings.length}</span>
        </span>
        <span className="dim small hud-band">
          {formatKmRange(ring.innerKm, ring.outerKm)}
          {game.settings.measure === 'metro' ? ' · metro areas' : ''}
        </span>
        <span className="hud-actions">
          <span className="row squares" aria-label={`${left} misses left`}>
            {Array.from({ length: game.settings.guessesPerRing }, (_, i) => (
              <span key={i} className={i < game.settings.guessesPerRing - left ? 'sq wrong' : 'sq unused'} />
            ))}
          </span>
          {/* Hint and Skip stay (greyed out) once the ring is over, so the box keeps its
              shape; only the guess box goes. */}
          {game.settings.hints && (
            <button
              type="button"
              className="text-btn hint-btn"
              data-sound="hint"
              onClick={hint}
              disabled={!playing || hintsLeft <= 0 || nextTarget(game) === null}
              aria-label={`Hint, ${hintsLeft} left`}
              title="About the biggest city you haven't found: its country, then an area around it, then its dot and first letter"
            >
              <BulbIcon />
              {hintsLeft}
            </button>
          )}
          <button
            type="button"
            className="text-btn skip"
            data-sound="skip"
            disabled={!playing}
            onClick={skip}
            aria-label="Skip this ring"
            title="Give up on this ring and see the answer"
          >
            Skip
          </button>
        </span>
      </div>
      {/* The start city (its populations are on the globe: hover its diamond), and with
          several cities to find, the progress on the right. */}
      <div className="hud-start small">
        <span>
          <span className="hud-label">From</span> <span className="start-name">{start.name}</span>{' '}
          <span className="dim">{placeOf(data, start.id, { regions: settings.subdivisions })}</span>
        </span>
        {toFind > 1 && (
          <span className="dim">
            Find the top {toFind} · <span className={found > 0 ? 'text-correct' : undefined}>{found} found</span>
          </span>
        )}
      </div>
      {/* Keys are prefixed so the box (per ring) and the message (per guess) can never share one. */}
      {playing && <GuessInput key={`ring-${game.current}`} inRing={inRing} onGuess={guess} />}
      {message && (
        <p key={`msg-${outcome!.seq}`} className={`message ${message.tone}`} aria-live="polite">
          {message.text}
        </p>
      )}
    </section>
  );
}
