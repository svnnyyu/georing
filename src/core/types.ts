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
  /** Countries mode: this entry stands for a whole country (see data.ts countryUnitId). */
  isCountry?: true;
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
  /** GeoNames continent code: AF, AN, AS, EU, NA, OC or SA. */
  continent?: string;
  aliases: string[];
}

/** Land/water grid (public/data/land.json), decoded: one bit per res-degree cell. */
export interface LandMask {
  res: number;
  width: number;
  height: number;
  bits: Uint8Array;
}

/** population.json: people per country per res-degree square (Countries mode). For each
 *  country, a flat list [square, people, square, people, ...] where each square index is the
 *  difference from the previous one; square index = row × width + column, rows from 90°N,
 *  columns from 180°W. */
export interface PopulationFile {
  res: number;
  width: number;
  height: number;
  countries: Record<string, number[]>;
  /** Territories whose people count toward another country: territory code -> country code
   *  (PR -> US). Their names are accepted as that country's. */
  territories?: Record<string, string>;
}

/** The data files, as loaded. */
export interface RawData {
  cities: City[];
  metros: Metro[];
  countries: Record<string, Country>;
  /** Optional: without it the area hint ignores land and water. */
  land?: LandMask;
  /** Optional: needed for Countries mode. */
  population?: PopulationFile;
}

/** City = each city on its own; Metro = cities merged into their GHSL urban centre. */
export type PopulationMeasure = 'city' | 'metro';
/** cities: name the most populous city in each ring. countries: name the country with the most
 *  people living inside the ring (only the part of it inside the ring counts). */
export type GameMode = 'cities' | 'countries';

export interface Settings {
  /** null = random from the well-known pool (drawn with the game's seed). */
  startCityId: number | null;
  ringWidthKm: number;
  /** A number of rings, or 'all': as many as fit before the far side of the Earth. */
  ringCount: number | 'all';
  /** Wrong in-ring guesses allowed per ring. */
  guessesPerRing: number;
  /** Find this many of the ring's most populous cities (1 = just the biggest). */
  citiesToFind: number;
  suggestions: boolean;
  /** Show states/provinces: their borders on the globe, and in place names. */
  subdivisions: boolean;
  /** Sound effects for buttons and game events. */
  sound: boolean;
  /** Offer the three hints (country, area circle, first letter) in each ring. */
  hints: boolean;
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
  /** Countries mode: people of each unit inside the ring (same order as unitIds) ... */
  pops?: number[];
  /** ... and where they live: the centre of the unit's people inside the ring (of its largest
   *  area there, so it falls on land; see areas). */
  points?: { lat: number; lon: number }[];
  /** ... split by area: the country itself and each territory that counts toward it (Bermuda
   *  for the United Kingdom), most people first, each with the centre of its people. */
  areas?: RingArea[][];
}

/** Countries mode: the part of a country's people in a ring that live in one area. */
export interface RingArea {
  /** The country's own code, or a territory's (BM). */
  cc: string;
  pop: number;
  lat: number;
  lon: number;
}

export type GuessResult = 'correct' | 'wrong' | 'outside';

export interface Guess {
  unitId: number;
  result: GuessResult;
  /** Countries mode: the territory the guess was typed as ("Bermuda" for the United Kingdom),
   *  so the globe shows that territory. It still counts as its country. */
  area?: string;
}

export type HintKind = 'country' | 'area' | 'letter';

export interface AreaCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

/** The hints taken in a ring. Each covers every target not yet found when it was taken (up
 *  to Number of cities / countries); a target's circle and letter go once it is found. */
export interface HintState {
  /** Every hint taken this ring, in order (the per-ring budget, and history). */
  used: HintKind[];
  /** Hint 1: countries to tint. Cities mode: the countries of the targets left; Countries
   *  mode: every country with people in the ring (outlined whole). focus: where the camera
   *  glides. */
  countries?: { ccs: string[]; focus?: { lat: number; lon: number } };
  /** Hint 2: a circle around each target left. */
  areas?: { unitId: number; circle: AreaCircle }[];
  /** Hint 3: each target left as a dot with its first letter (at the city, or where the
   *  country's people in the ring live). */
  letters?: { unitId: number; letter: string; at: { lat: number; lon: number } }[];
}

export type RingStatus = 'playing' | 'solved' | 'missed' | 'empty';

export interface RingState {
  guesses: Guess[];
  hints: HintState;
  status: RingStatus;
  /** The player pressed Skip (the ring counts as missed). */
  skipped?: boolean;
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
