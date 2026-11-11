// Holds the one game state object for the UI (a useReducer around core/game.ts) plus the
// loaded data and the setup settings. Components read it with useGame().

import { createContext, useCallback, useContext, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { GameData } from '../../core/data.ts';
import { newGame, nextRing, skipRing, submitGuess, useHint as takeHint, type GuessOutcome } from '../../core/game.ts';
import { loadSettings, saveSettings, type KeyValueStorage } from '../../core/history.ts';
import type { MatchIndex } from '../../core/matching.ts';
import type { GameState, Settings } from '../../core/types.ts';

interface State {
  game: GameState | null;
  /** The last guess's outcome; seq changes on every guess so repeats still show. */
  outcome: { result: GuessOutcome; seq: number } | null;
}

type Action =
  | { type: 'start'; settings: Settings; seed: number; now: Date }
  | { type: 'guess'; cityId: number }
  | { type: 'hint' }
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'quit' };

function makeReducer(data: GameData) {
  return (state: State, action: Action): State => {
    switch (action.type) {
      case 'start':
        return { game: newGame(data, action.settings, action.seed, action.now), outcome: null };
      case 'guess': {
        if (!state.game) return state;
        const r = submitGuess(data, state.game, action.cityId);
        return { game: r.state, outcome: { result: r.outcome, seq: (state.outcome?.seq ?? 0) + 1 } };
      }
      case 'hint':
        return state.game ? { ...state, game: takeHint(data, state.game) } : state;
      case 'skip':
        return state.game ? { game: skipRing(state.game), outcome: null } : state;
      case 'next':
        return state.game ? { game: nextRing(state.game), outcome: null } : state;
      case 'quit':
        return { game: null, outcome: null };
    }
  };
}

/** localStorage, or null when the browser blocks it (private mode, etc.). */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A fresh random seed for a new game (seeded randomness lives in core/random.ts). */
function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export interface GameContextValue {
  data: GameData;
  index: MatchIndex;
  /** Settings chosen on the setup screen (remembered between games). */
  settings: Settings;
  setSettings: (s: Settings) => void;
  game: GameState | null;
  outcome: State['outcome'];
  /** Start a new game with these settings (or the current ones) and a new seed. */
  start: (settings?: Settings) => void;
  guess: (cityId: number) => void;
  hint: () => void;
  next: () => void;
  /** Give up on the current ring. */
  skip: () => void;
  quit: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ data, index, children }: { data: GameData; index: MatchIndex; children: ReactNode }) {
  const reducer = useMemo(() => makeReducer(data), [data]);
  const [state, dispatch] = useReducer(reducer, { game: null, outcome: null });
  const [settings, setSettings] = useState<Settings>(() => loadSettings(browserStorage()));

  const start = useCallback(
    (s?: Settings) => {
      const chosen = s ?? settings;
      setSettings(chosen);
      saveSettings(browserStorage(), chosen);
      dispatch({ type: 'start', settings: chosen, seed: newSeed(), now: new Date() });
    },
    [settings],
  );

  const changeSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(browserStorage(), s);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      data,
      index,
      settings,
      setSettings: changeSettings,
      game: state.game,
      outcome: state.outcome,
      start,
      guess: (cityId) => dispatch({ type: 'guess', cityId }),
      hint: () => dispatch({ type: 'hint' }),
      next: () => dispatch({ type: 'next' }),
      skip: () => dispatch({ type: 'skip' }),
      quit: () => dispatch({ type: 'quit' }),
    }),
    [data, index, settings, changeSettings, state, start],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame() outside <GameProvider>');
  return ctx;
}
