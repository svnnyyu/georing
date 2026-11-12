// Holds the one game state object for the UI (a useReducer around core/game.ts) plus the
// loaded data, the setup settings and the saved history. Components read it with useGame().

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { GameData } from '../../core/data.ts';
import { newGame, nextRing, skipRing, submitGuess, useHint as takeHint, type GuessOutcome } from '../../core/game.ts';
import {
  clearHistory as clearSaved,
  loadHistory,
  loadSettings,
  replayOf,
  saveGame,
  saveSettings,
  toRecord,
  type GameRecord,
  type KeyValueStorage,
} from '../../core/history.ts';
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
  /** Country names and aliases (Countries mode). */
  countryIndex: MatchIndex;
  /** Settings chosen on the setup screen (remembered between games). */
  settings: Settings;
  setSettings: (s: Settings) => void;
  game: GameState | null;
  outcome: State['outcome'];
  /** Start a new game with these settings (or the current ones) and a new seed. */
  start: (settings?: Settings) => void;
  /** Finished games, newest first (saved in local storage). */
  history: GameRecord[];
  /** Play a saved game again: same seed and settings, so the same start city and rings. The
   *  remembered settings for new games are left as they are. */
  replay: (record: GameRecord) => void;
  clearHistory: () => void;
  guess: (cityId: number) => void;
  hint: () => void;
  next: () => void;
  /** Give up on the current ring. */
  skip: () => void;
  quit: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({
  data,
  index,
  countryIndex,
  children,
}: {
  data: GameData;
  /** Built on first use (see loadData). */
  index: () => MatchIndex;
  countryIndex: () => MatchIndex;
  children: ReactNode;
}) {
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

  // History: loaded once; each game is saved once, when it finishes (abandoned games aren't).
  const [history, setHistory] = useState<GameRecord[]>(() => loadHistory(browserStorage()));
  const saved = useRef<string | null>(null);
  useEffect(() => {
    const g = state.game;
    if (!g || g.phase !== 'finished') return;
    const key = `${g.seed}:${g.createdAt}`;
    if (saved.current === key) return;
    saved.current = key;
    setHistory(saveGame(browserStorage(), toRecord(g)));
  }, [state.game]);

  const replay = useCallback((record: GameRecord) => {
    const { seed, settings: s } = replayOf(record);
    dispatch({ type: 'start', settings: s, seed, now: new Date() });
  }, []);

  const clearHistory = useCallback(() => {
    clearSaved(browserStorage());
    setHistory([]);
  }, []);

  const changeSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(browserStorage(), s);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      data,
      // Built the first time a component asks (typing a guess, searching for a city).
      get index() {
        return index();
      },
      get countryIndex() {
        return countryIndex();
      },
      settings,
      setSettings: changeSettings,
      game: state.game,
      outcome: state.outcome,
      start,
      history,
      replay,
      clearHistory,
      guess: (cityId) => dispatch({ type: 'guess', cityId }),
      hint: () => dispatch({ type: 'hint' }),
      next: () => dispatch({ type: 'next' }),
      skip: () => dispatch({ type: 'skip' }),
      quit: () => dispatch({ type: 'quit' }),
    }),
    [data, index, countryIndex, settings, changeSettings, state, start, history, replay, clearHistory],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame() outside <GameProvider>');
  return ctx;
}
