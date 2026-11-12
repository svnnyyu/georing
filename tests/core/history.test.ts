import { describe, expect, it } from 'vitest';
import { HISTORY_CAP, STORAGE_KEYS } from '../../src/config.ts';
import { defaultSettings, newGame, nextRing, skipRing, submitGuess, useHint } from '../../src/core/game.ts';
import {
  clearHistory,
  historyStats,
  loadHistory,
  loadSettings,
  replayOf,
  saveGame,
  saveSettings,
  toRecord,
  type GameRecord,
  type KeyValueStorage,
} from '../../src/core/history.ts';
import { synthetic } from './fixtures.ts';

const NOW = new Date('2026-11-11T12:00:00Z');

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const broken: KeyValueStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

function finishedGame(seed = 7) {
  const { data } = synthetic();
  let s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 2, guessesPerRing: 3 }, seed, NOW);
  s = useHint(data, s);
  s = submitGuess(data, s, 5).state; // outside: doesn't use a guess
  for (const id of [3, 4, 10]) s = submitGuess(data, s, id).state; // 3 wrong: ring 1 missed
  s = nextRing(s);
  s = submitGuess(data, s, 6).state; // wrong
  s = submitGuess(data, s, 7).state; // correct: ring 2 solved
  return nextRing(s);
}

describe('records', () => {
  it('captures settings, seed and every ring', () => {
    const state = finishedGame();
    const r = toRecord(state);
    expect(r).toMatchObject({ v: 1, playedAt: NOW.toISOString(), seed: 7, startId: 1 });
    expect(state.phase).toBe('finished');
    expect(r.rings[0]).toEqual({
      innerKm: 0,
      outerKm: 500,
      answerId: 2,
      guesses: [5, 3, 4, 10],
      status: 'missed',
      guessesUsed: 3, // the outside guess doesn't count
      hints: ['country'],
    });
    expect(r.rings[1]).toMatchObject({ answerId: 7, guesses: [6, 7], status: 'solved', guessesUsed: 2, hints: [] });
    expect(r.rings[1]!.skipped).toBeUndefined();
  });

  it('marks skipped rings', () => {
    const { data } = synthetic();
    let s = newGame(data, { startCityId: 1, ringWidthKm: 500, ringCount: 1 }, 3, NOW);
    s = nextRing(skipRing(s));
    expect(toRecord(s).rings[0]).toMatchObject({ status: 'missed', skipped: true, guessesUsed: 0 });
  });

  it('survives a page reload: what is saved reads back the same', () => {
    const storage = memoryStorage();
    const r = toRecord(finishedGame());
    saveGame(storage, r);
    const reloaded = loadHistory(storage); // a fresh read, parsed from the stored text
    expect(reloaded).toEqual([r]);
  });

  it('replays a saved game exactly', () => {
    const { data } = synthetic();
    const state = finishedGame(31);
    const { seed, settings } = replayOf(toRecord(state));
    const replay = newGame(data, settings, seed, NOW);
    expect(replay.rings).toEqual(state.rings);
    expect(replay.startId).toBe(state.startId);
  });
});

describe('history storage', () => {
  it('saves newest first and reloads', () => {
    const storage = memoryStorage();
    const a = { ...toRecord(finishedGame(1)), playedAt: 'a' };
    const b = { ...toRecord(finishedGame(2)), playedAt: 'b' };
    saveGame(storage, a);
    saveGame(storage, b);
    expect(loadHistory(storage).map((r) => r.playedAt)).toEqual(['b', 'a']);
  });

  it(`keeps at most ${HISTORY_CAP} games, dropping the oldest`, () => {
    const storage = memoryStorage();
    const base = toRecord(finishedGame());
    const many: GameRecord[] = Array.from({ length: HISTORY_CAP }, (_, i) => ({ ...base, seed: i }));
    storage.setItem(STORAGE_KEYS.history, JSON.stringify(many));
    const list = saveGame(storage, { ...base, seed: -1 });
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list[0]!.seed).toBe(-1);
    expect(list.at(-1)!.seed).toBe(HISTORY_CAP - 2);
  });

  it('clears history', () => {
    const storage = memoryStorage();
    saveGame(storage, toRecord(finishedGame()));
    clearHistory(storage);
    expect(loadHistory(storage)).toEqual([]);
  });

  it('survives broken or missing storage', () => {
    expect(loadHistory(broken)).toEqual([]);
    expect(() => saveGame(broken, toRecord(finishedGame()))).not.toThrow();
    expect(() => clearHistory(broken)).not.toThrow();
    expect(loadHistory(null)).toEqual([]);
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEYS.history, '{not json');
    expect(loadHistory(storage)).toEqual([]);
    storage.setItem(STORAGE_KEYS.history, JSON.stringify([{ v: 99 }, toRecord(finishedGame())]));
    expect(loadHistory(storage)).toHaveLength(1);
  });

  it('computes totals', () => {
    const r = toRecord(finishedGame());
    expect(historyStats([r, r])).toEqual({ games: 2, solved: 2, missed: 2, solvedPct: 50 });
    expect(historyStats([])).toEqual({ games: 0, solved: 0, missed: 0, solvedPct: 0 });
  });
});

describe('settings storage', () => {
  it('remembers the last-used settings', () => {
    const storage = memoryStorage();
    const s = { ...defaultSettings(), ringWidthKm: 1500, measure: 'metro' as const };
    saveSettings(storage, s);
    expect(loadSettings(storage)).toEqual(s);
  });

  it('falls back to defaults when storage is empty, broken or out of range', () => {
    expect(loadSettings(memoryStorage())).toEqual(defaultSettings());
    expect(loadSettings(broken)).toEqual(defaultSettings());
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ ringCount: 50 }));
    expect(loadSettings(storage).ringCount).toBe(8);
  });
});
