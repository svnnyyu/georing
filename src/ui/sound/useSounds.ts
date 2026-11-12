// Wires the sound effects to the page and the game (see docs/SPEC.md -> Sound):
// - every button click plays "click", unless the button names its own sound with
//   data-sound="hint" (etc.), or data-sound="none" when a game event will make the sound;
// - moving a slider ticks (a softer sound than a click); toggles name their own on/off sound;
// - guesses, the end of a ring and the end of the game play their own sounds.

import { useEffect, useRef } from 'react';
import { GAME_WON_SHARE, type SoundName } from '../../config.ts';
import { foundCount, targetsOf, type GuessOutcome } from '../../core/game.ts';
import type { GameState } from '../../core/types.ts';
import { playSound, setSoundEnabled } from './sound.ts';

/** Clicks and slider ticks, for the whole page. */
export function useUiSounds(enabled: boolean): void {
  useEffect(() => setSoundEnabled(enabled), [enabled]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const name = el.getAttribute('data-sound');
      if (name === 'none') return;
      // data-sound-always: the Sound effects toggle itself, heard even when switching it on.
      playSound((name as SoundName | null) ?? 'click', el.hasAttribute('data-sound-always'));
    };
    const onInput = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.type === 'range') playSound('tick');
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('input', onInput, true);
    };
  }, []);
}

const OUTCOME_SOUND: Record<GuessOutcome['kind'], SoundName | null> = {
  correct: 'correct',
  wrong: 'wrong',
  outside: 'outside',
  repeat: 'info',
  start: 'info',
  ignored: null,
};

/** Guess results, rings ending and the game ending. */
export function useGameSounds(game: GameState | null, outcome: { result: GuessOutcome; seq: number } | null): void {
  // A guess: its result, then (after it) a fanfare or a sad fall if it ended the ring.
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!outcome) {
      lastSeq.current = null; // the count restarts with each ring
      return;
    }
    if (outcome.seq === lastSeq.current || !game) return;
    lastSeq.current = outcome.seq;
    const sound = OUTCOME_SOUND[outcome.result.kind];
    if (sound) playSound(sound);
    const rs = game.ringStates[game.current]!;
    if (rs.status === 'solved') playSound('ringSolved');
    else if (rs.status === 'missed' && !rs.skipped) playSound('ringMissed');
  }, [outcome, game]);

  // The game ends (the summary opens): a fanfare for at least GAME_WON_SHARE of the cities.
  const finished = useRef<string | null>(null);
  useEffect(() => {
    if (!game || game.phase !== 'finished') return;
    const key = `${game.seed}:${game.createdAt}`;
    if (finished.current === key) return;
    finished.current = key;
    let found = 0;
    let targets = 0;
    game.rings.forEach((ring, i) => {
      found += foundCount(game.ringStates[i]!);
      targets += targetsOf(ring, game.settings).length;
    });
    playSound(targets > 0 && found / targets >= GAME_WON_SHARE ? 'gameWon' : 'gameLost');
  }, [game]);
}
