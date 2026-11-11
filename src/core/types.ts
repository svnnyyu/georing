// Shared types for the game core. No DOM, no React, no browser APIs (see CLAUDE.md).

/** One city as stored in public/data/cities.json. */
export interface City {
  id: number;
  name: string;
  ascii: string;
  lat: number;
  lon: number;
  pop: number;
  cc: string;
  admin1: string;
  aliases: string[];
  wellKnown: boolean;
  /** GHSL urban-centre id, when the city lies inside one. */
  metro?: number;
}

/** One metro (GHSL urban centre) as stored in public/data/metros.json. */
export interface Metro {
  id: number;
  name: string;
  pop: number;
  ghslPop: number;
  /** City id of the metro's main city, which stands for the metro in Metro mode. */
  main: number;
  cc: string;
  members: number;
}

export interface Country {
  name: string;
  aliases: string[];
}

/** The three data files, as loaded. */
export interface RawData {
  cities: City[];
  metros: Metro[];
  countries: Record<string, Country>;
}

/** City = each city on its own; Metro = cities merged into their GHSL urban centre. */
export type PopulationMeasure = 'city' | 'metro';
export type GameMode = 'population';

export interface Settings {
  /** null = random from the well-known pool (drawn with the game's seed). */
  startCityId: number | null;
  ringWidthKm: number;
  ringCount: number;
  guessesPerRing: number;
  suggestions: boolean;
  measure: PopulationMeasure;
  mode: GameMode;
}

export interface Ring {
  index: number;
  innerKm: number;
  outerKm: number;
  /** Unit ids (see data.ts) inside the ring, most populous first. */
  unitIds: number[];
  /** Most populous unit, or null for an empty ring. */
  answerId: number | null;
}

export type GuessResult = 'correct' | 'wrong' | 'outside';

export interface Guess {
  unitId: number;
  result: GuessResult;
}

export type HintKind = 'country' | 'area' | 'letter';

export interface AreaCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface HintState {
  used: HintKind[];
  country?: { cc: string; name: string };
  area?: AreaCircle;
  letter?: string;
}

export type RingStatus = 'playing' | 'solved' | 'missed' | 'empty';

export interface RingState {
  guesses: Guess[];
  hints: HintState;
  status: RingStatus;
}

/** playing: guessing in the current ring. ringOver: reveal panel shown, waiting for Next ring.
 *  finished: the last ring is over (summary screen). */
export type GamePhase = 'playing' | 'ringOver' | 'finished';

/** The whole game: one plain object, replaced (never mutated) by the actions in game.ts. */
export interface GameState {
  seed: number;
  createdAt: string;
  settings: Settings;
  /** Unit id at the centre of every ring (the start city, or its metro's main city). */
  startId: number;
  rings: Ring[];
  ringStates: RingState[];
  current: number;
  phase: GamePhase;
}
