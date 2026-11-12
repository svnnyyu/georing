// The in-game box at the top centre of the screen: ring, guesses left, Skip, the start city,
// the guess box and the last guess's outcome. It slides in when a game starts.

import { useEffect, useMemo } from 'react';
import { EMPTY_RING_ADVANCE_MS, HINTS_PER_RING } from '../../config.ts';
import { guessesLeft, type GuessOutcome } from '../../core/game.ts';
import type { GameState } from '../../core/types.ts';
import { GuessInput } from '../components/GuessInput.tsx';
import { BulbIcon } from '../components/Icons.tsx';
import { metroOf, PopulationInline } from '../components/Population.tsx';
import { formatKm, formatKmRange, placeOf } from '../format.ts';
import { useGame } from '../state/GameProvider.tsx';

function outcomeMessage(outcome: GuessOutcome, name: string): { text: string; tone: string } {
  switch (outcome.kind) {
    case 'correct':
      return { text: `${name} is right!`, tone: 'correct' };
    case 'wrong':
      return { text: `${name} is in the ring, but not the biggest`, tone: 'wrong' };
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
  const hintsLeft = HINTS_PER_RING - rs.hints.used.length;

  // An empty ring shows "No cities in this ring" briefly, then moves on by itself.
  useEffect(() => {
    if (game.phase !== 'ringOver' || rs.status !== 'empty') return;
    const t = window.setTimeout(next, EMPTY_RING_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [game.phase, rs.status, game.current, next]);

  const message =
    outcome && playing ? outcomeMessage(outcome.result, data.byId.get(outcome.result.unitId)?.name ?? '') : null;

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
          <span className="row squares" aria-label={`${left} guesses left`}>
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
              onClick={hint}
              disabled={!playing || hintsLeft === 0}
              aria-label={`Hint, ${hintsLeft} left`}
              title="Shows the answer's country, then an area around it, then its dot and first letter"
            >
              <BulbIcon />
              {hintsLeft}
            </button>
          )}
          <button
            type="button"
            className="text-btn skip"
            disabled={!playing}
            onClick={skip}
            aria-label="Skip this ring"
            title="Give up on this ring and see the answer"
          >
            Skip
          </button>
        </span>
      </div>
      <div className="hud-start small">
        <span>
          From {start.name} <span className="dim">{placeOf(data, start.id, { regions: settings.subdivisions })}</span>
        </span>
        <PopulationInline cityPop={start.pop} metro={metroOf(data, start.id)} measure={game.settings.measure} />
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
