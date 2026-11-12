// Saving finished games and settings (see docs/SPEC.md -> History, settings and storage).
// The storage is passed in (localStorage in the browser, a fake in tests); every read and
// write is wrapped in try/catch so the game still plays when storage is unavailable.

import { HISTORY_CAP, STORAGE_KEYS } from '../config.ts';
import { foundCount, guessesUsed, sanitizeSettings, targetsOf } from './game.ts';
import type { GameState, HintKind, RingStatus, Settings } from './types.ts';

/** The part of localStorage the game uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RingRecord {
  innerKm: number;
  outerKm: number;
  answerId: number | null;
  /** Unit ids in the order guessed, outside-the-ring guesses included. */
  guesses: number[];
  status: Exclude<RingStatus, 'playing'>;
  /** In-ring guesses made, right or wrong (outside-the-ring guesses don't count). */
  guessesUsed?: number;
  /** Cities to find in this ring, and how many were found. Older records lack them: they
   *  count as 1 target, found if solved. */
  targets?: number;
  found?: number;
  /** The player pressed Skip. */
  skipped?: boolean;
  hints: HintKind[];
}

export interface GameRecord {
  v: 1;
  playedAt: string;
  seed: number;
  startId: number;
  settings: Settings;
  rings: RingRecord[];
}

/** Turns a finished game into a history record. */
export function toRecord(state: GameState): GameRecord {
  return {
    v: 1,
    playedAt: state.createdAt,
    seed: state.seed,
    startId: state.startId,
    settings: state.settings,
    rings: state.rings.map((ring, i) => {
      const rs = state.ringStates[i]!;
      return {
        innerKm: ring.innerKm,
        outerKm: ring.outerKm,
        answerId: ring.answerId,
        guesses: rs.guesses.map((g) => g.unitId),
        // A ring still 'playing' can only appear in an unfinished game; count it as missed.
        status: rs.status === 'playing' ? 'missed' : rs.status,
        guessesUsed: guessesUsed(rs),
        targets: targetsOf(ring, state.settings).length,
        found: foundCount(rs),
        ...(rs.skipped ? { skipped: true } : {}),
        hints: rs.hints.used,
      };
    }),
  };
}

function read(storage: KeyValueStorage | null, key: string): unknown {
  if (!storage) return null;
  try {
    const text = storage.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function write(storage: KeyValueStorage | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isRecord(x: unknown): x is GameRecord {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Partial<GameRecord>;
  return r.v === 1 && typeof r.seed === 'number' && typeof r.startId === 'number' && Array.isArray(r.rings);
}

/** Past games, newest first. Unreadable or unknown entries are skipped. */
export function loadHistory(storage: KeyValueStorage | null): GameRecord[] {
  const data = read(storage, STORAGE_KEYS.history);
  return Array.isArray(data) ? data.filter(isRecord) : [];
}

/** Adds a finished game (newest first, capped at HISTORY_CAP) and returns the new list. */
export function saveGame(storage: KeyValueStorage | null, record: GameRecord): GameRecord[] {
  const list = [record, ...loadHistory(storage)].slice(0, HISTORY_CAP);
  write(storage, STORAGE_KEYS.history, list);
  return list;
}

export function clearHistory(storage: KeyValueStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEYS.history);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** Cities to find in a ring and how many were found (0 and 0 for an empty ring). */
export function ringScore(ring: RingRecord): { targets: number; found: number } {
  if (ring.status === 'empty') return { targets: 0, found: 0 };
  return {
    targets: ring.targets ?? 1,
    found: ring.found ?? (ring.status === 'solved' ? 1 : 0),
  };
}

/** A game's score: cities found out of cities to find, over all its rings. */
export function gameScore(record: GameRecord): { targets: number; found: number } {
  let targets = 0;
  let found = 0;
  for (const ring of record.rings) {
    const s = ringScore(ring);
    targets += s.targets;
    found += s.found;
  }
  return { targets, found };
}

export interface HistoryStats {
  games: number;
  /** Cities found and cities to find, over every game (partial credit per ring). */
  found: number;
  targets: number;
  /** found as a share of targets, rounded. 0 with no rings. */
  foundPct: number;
}

export function historyStats(records: GameRecord[]): HistoryStats {
  let found = 0;
  let targets = 0;
  for (const r of records) {
    const s = gameScore(r);
    found += s.found;
    targets += s.targets;
  }
  return { games: records.length, found, targets, foundPct: targets ? Math.round((found / targets) * 100) : 0 };
}

/** Seed and settings that replay a saved game exactly. */
export function replayOf(record: GameRecord): { seed: number; settings: Settings } {
  return { seed: record.seed, settings: { ...sanitizeSettings(record.settings), startCityId: record.settings.startCityId } };
}

/** Last-used settings, or the defaults. */
export function loadSettings(storage: KeyValueStorage | null): Settings {
  const s = read(storage, STORAGE_KEYS.settings);
  return sanitizeSettings(typeof s === 'object' && s !== null ? (s as Partial<Settings>) : null);
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): void {
  write(storage, STORAGE_KEYS.settings, settings);
}
