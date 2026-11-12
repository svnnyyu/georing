// Every tunable number in the game lives here (see docs/SPEC.md).
// Nothing tunable should be hard-coded anywhere else.

// --- Geometry ---
export const EARTH_RADIUS_KM = 6371;
export const RING_CAP = 10; // with the widest rings, 10 × 2,000 km stays just short of the far side of the Earth
// The far side of the Earth (the start city's antipode) is half the circumference away.
export const FAR_SIDE_KM = Math.PI * EARTH_RADIUS_KM; // about 20,015 km

// --- Setup sliders: [min, max, step, default] ---
// Ring width choices, roughly log-spaced (each step ×1.33–1.5) so the slider moves evenly
// from "regional" to "continental".
export const RING_WIDTH_KM = { options: [250, 500, 750, 1000, 1500, 2000], default: 500 } as const;
// 1 to RING_CAP rings, or 'all': rings keep coming until the next one would pass the far side
// of the Earth (so floor(FAR_SIDE_KM / width) rings).
export const RING_COUNT = { min: 1, max: RING_CAP, step: 1, default: 3 } as const;
// Wrong in-ring guesses allowed per ring (finding a target is free). Fixed at 3 for now
// (min = max, so there is no slider).
export const GUESSES_PER_RING = { min: 3, max: 3, step: 1, default: 3 } as const;
// Countries mode: a country counts as "in" a ring only with at least this many people inside
// it (stray grid squares at a border shouldn't make it an answer).
export const COUNTRY_MIN_PEOPLE_IN_RING = 1000;
// How many of each ring's most populous cities the player must find (the "targets").
export const CITIES_TO_FIND = { min: 1, max: 5, step: 1, default: 1 } as const;

// --- City data ---
export const MIN_CITY_POPULATION = 15_000;
export const WELL_KNOWN_POPULATION = 500_000; // or a national capital
// Random starts pick a continent first, weighted by (number of start cities) ^ this exponent:
// 0 = every continent equally likely, 1 = proportional to cities (57% Asia). 0.5 gives roughly
// Asia 35%, Africa 17%, Europe 15%, North America 14%, South America 12%, Oceania 6%.
export const CONTINENT_BALANCE_EXPONENT = 0.5;
export const REVEAL_TOP_N = 5; // cities listed in the reveal panel

// --- Hints ---
export const HINTS_PER_RING = 3;
// Area hint: a circle whose diameter is 0.75 × the ring width, placed so the answer is
// somewhere inside, up to this share of the radius from the centre.
export const HINT_AREA_RADIUS_FRACTION = 0.375; // of ring width
export const HINT_AREA_MAX_OFFSET_FRACTION = 0.8; // of circle radius
// It is also placed so most of it lies inside the ring and over land: up to TRIES random
// placements are measured at SAMPLES points spread evenly over the circle, and the first that
// meets both shares wins (else the closest one, e.g. for a small island).
export const HINT_AREA_MIN_IN_RING = 0.7; // share of the circle's area inside the ring
export const HINT_AREA_MIN_LAND = 0.5; // share of the circle's area over land
// Countries mode: a much larger circle (1.5 × the ring width across), so it spans several
// countries rather than just the answer; it can't then sit 70% inside the ring, so less is asked.
export const HINT_AREA_COUNTRIES = { radiusFraction: 0.75, minInRing: 0.5 } as const;
export const HINT_AREA_TRIES = 40;
export const HINT_AREA_SAMPLES = 64;
export const HINT_FADE_MS = 600; // hints on the globe fade in and out
export const HINT_PAN_MS = 1200; // the camera glides to the area circle when it appears

// --- Guess matching (max edit distance by name length) ---
export const FUZZY_THRESHOLDS = [
  { minLength: 4, maxLength: 5, maxDistance: 1 },
  { minLength: 6, maxLength: 9, maxDistance: 2 },
  { minLength: 10, maxLength: Infinity, maxDistance: 3 },
] as const;
// Same-named cities outside the ring count as a tie (picker shown) only if their population
// is at least this share of the largest one's: Springfield MO/MA/IL tie, Paris FR/TX doesn't.
export const AMBIGUOUS_POP_RATIO = 0.5;
export const SUGGESTIONS_MIN_CHARS = 2;
export const SUGGESTIONS_MAX = 6;

// --- Globe camera ---
export const RING_FIT_FRACTION = 0.5; // outer ring diameter vs shorter screen side
// Mid-flight between two places the camera pulls back until both fit in this share of the
// shorter screen side (larger = less pull-back).
export const FLY_PULLBACK_FIT_FRACTION = 0.75;
export const MIN_VIEW_WIDTH_KM = 100; // closest zoom: this many km across the shorter side
export const GRATICULE_STEP_DEG = 10;
export const GLOBE_FIT_FRACTION = 0.9; // globe diameter vs shorter screen side, whole-Earth view
export const HOME_ZOOM = 1.2; // start screen globe size, relative to the whole-Earth view
// Stars behind the globe: fixed points on a sky sphere that turns with the globe but doesn't
// zoom. The sky is projected so its visible half spans skyScale × the screen's diagonal.
// Placement is seeded, so the sky looks the same every visit.
export const STARS = {
  count: 1000,
  seed: 20261111,
  skyScale: 0.75,
  /** Star sizes in CSS px: most are small squares, some bigger squares, and a few bright
   *  ones a pixel "+" (a square with four arms of the same size). */
  smallPx: 2,
  bigPx: 3,
  bigShare: 0.15,
  plusShare: 0.02,
  /** Brightness range (opacity) of a star; "+" stars are always at the top of it. */
  minAlpha: 0.25,
  maxAlpha: 0.75,
} as const;
export const GLOBE_MIN_ZOOM = 0.8; // furthest zoom out, relative to the whole-Earth view
export const GLOBE_START_VIEW = { lat: 20, lon: 10 } as const;
// perSpinRadian: extra time for turning the view around a pole (spin angle × sin(latitude),
// so it is bounded: at most π × 1 radians, and the total is capped at max anyway).
export const FLY_DURATION_MS = { min: 700, max: 2600, perRadian: 900, perZoomDoubling: 120, perSpinRadian: 300 } as const;

// --- Globe motion (north stays up; see ui/globe/motion.ts) ---
export const MAX_CENTER_LAT = 90; // the view can tilt up to a pole, never past it
export const MIN_LON_SPEED_COS = 0.25; // caps sideways spin speed near the poles
export const INERTIA = {
  sampleWindowMs: 100, // velocity is measured over the last part of a drag
  minStartSpeed: 0.15, // px/ms: slower releases just stop
  maxSpeed: 5, // px/ms
  decayMs: 350, // velocity falls to 1/e in this time
  stopSpeed: 0.01, // px/ms
} as const;
// Wheel events: trackpad two-finger swipes pan, mouse wheels and pinches (ctrl+wheel) zoom.
export const WHEEL = {
  burstGapMs: 150, // events closer than this belong to one gesture, classified once
  mouseMinDelta: 50, // integer deltas at least this big (with no sideways part) are a mouse wheel
  lineHeightPx: 16, // for wheels that report lines instead of pixels
} as const;

// --- Globe detail levels (zoom is relative to the whole-Earth view) ---
// Zoomed out: simplified 1:50m ("50m-lo", every island and lake, fewer points). From this
// zoom up: full 1:50m. 1:110m is only shown for the moment before those load.
export const DETAIL_50M_MIN_ZOOM = 4;
// Borders always show; fainter on the whole-Earth view, full strength from fullAtZoom.
export const BORDER_OPACITY = { min: 0.5, max: 1, fullAtZoom: 3 } as const;
export const VIEW_INFO_INTERVAL_MS = 250; // how often the globe reports zoom/frame time
// State/province lines (Subdivisions setting): invisible below startZoom, fading in to max by fullAtZoom.
// max < 1 keeps them fainter than country borders (which reach full opacity) at any zoom.
export const SUBDIVISION_OPACITY = { startZoom: 1.5, fullAtZoom: 5, max: 0.55 } as const;
// Start screen: the globe turns slowly; a drag pauses it until the player has let go this long.
export const IDLE_SPIN_DEG_PER_SEC = 5;
export const IDLE_RESUME_MS = 2500;

// --- Globe markers ---
export const MARKER_HIT_RADIUS_PX = 14; // hover/tap distance that counts as "on" a marker
export const MARKER_PULSE_MS = 1400; // glow pulse when a correct or revealed answer appears
export const TAP_MAX_MOVE_PX = 6; // a press that moves less than this is a tap, not a drag
export const TAP_MAX_MS = 500;

// --- Game screens ---
export const INFO_CARD = { width: 240, height: 150, offsetPx: 14 } as const; // hover card placement
export const EMPTY_RING_ADVANCE_MS = 1800; // "No cities in this ring" shows this long, then moves on
// Starting a game: the start screen's words leave, the globe rises, then the camera flies to the
// start city, and the guess box slides in. (CSS reads these through variables set in App.tsx.)
export const START_EXIT_MS = 600;
// Page load: the globe rises from below the screen to its resting place (from GLOBE_FROM ×
// the rest offset down), and the start screen comes in: the title drops in, then the tagline,
// mode tiles, Start game and the settings line, each STAGGER_MS after the one before.
export const INTRO = { globeMs: 1700, globeFrom: 2.2, itemMs: 650, firstDelayMs: 150, staggerMs: 110 } as const;
export const GLOBE_RISE_MS = 1800;
export const HUD_ENTER_MS = 450;
// The first flight of a game (to the start city) always takes this long, wherever the city is;
// later flights between rings are timed by distance (FLY_DURATION_MS).
export const FLY_START_MS = 2400;
// d3-geo adaptive resampling (curving long edges), in px. Used for the graticule, the rim and
// (later) rings; the map layers skip it because their edges are already short.
export const RESAMPLE_PRECISION_PX = 0.5;
export const CLIP_MARGIN_DEG = 0.5; // extra clip radius beyond the screen corners

// --- Storage ---
export const STORAGE_KEYS = {
  history: 'ringgame.v1.history',
  settings: 'ringgame.v1.settings',
} as const;
export const HISTORY_CAP = 500;

// --- Sound effects (synthesized with Web Audio, chiptune style; see src/ui/sound/sound.ts) ---
// Each sound is a list of notes: frequency f in Hz (slide to `to` over the note, if given),
// start `at` and length `dur` in seconds, waveform, and loudness (0-1, times SOUND_VOLUME).
export const SOUND_VOLUME = 0.18;
// The game-over sound is the happy one when at least this share of the cities was found.
export const GAME_WON_SHARE = 0.5;
export interface SoundNote {
  f: number;
  at: number;
  dur: number;
  wave: 'square' | 'triangle' | 'sine' | 'sawtooth';
  vol: number;
  to?: number;
}
// Note frequencies (Hz) used below, for readability.
const C4 = 261.6, E4 = 329.6, G4 = 392.0, C5 = 523.3, E5 = 659.3, G5 = 784.0, A5 = 880.0, B5 = 987.8;
const C6 = 1046.5, E6 = 1318.5, A6 = 1760.0;
export const SOUNDS = {
  /** Any button or tile. */
  click: [{ f: 1200, at: 0, dur: 0.025, wave: 'square', vol: 0.25 }],
  /** A slider moving one step: softer and lower than a click, like a detent. */
  tick: [{ f: 640, at: 0, dur: 0.018, wave: 'triangle', vol: 0.45 }],
  /** A toggle switched on (rising) or off (falling). */
  toggleOn: [
    { f: 620, at: 0, dur: 0.03, wave: 'square', vol: 0.22 },
    { f: 930, at: 0.035, dur: 0.04, wave: 'square', vol: 0.22 },
  ],
  toggleOff: [
    { f: 930, at: 0, dur: 0.03, wave: 'square', vol: 0.22 },
    { f: 620, at: 0.035, dur: 0.04, wave: 'square', vol: 0.22 },
  ],
  /** Start game: a quick rising arpeggio. */
  start: [
    { f: C5, at: 0, dur: 0.07, wave: 'square', vol: 0.5 },
    { f: E5, at: 0.07, dur: 0.07, wave: 'square', vol: 0.5 },
    { f: G5, at: 0.14, dur: 0.07, wave: 'square', vol: 0.5 },
    { f: C6, at: 0.21, dur: 0.16, wave: 'square', vol: 0.5 },
  ],
  /** A target found: a two-note "coin". */
  correct: [
    { f: B5, at: 0, dur: 0.07, wave: 'square', vol: 0.5 },
    { f: E6, at: 0.07, dur: 0.22, wave: 'square', vol: 0.5 },
  ],
  /** In the ring, but not a target: a low falling buzz. */
  wrong: [{ f: 220, to: 140, at: 0, dur: 0.22, wave: 'sawtooth', vol: 0.45 }],
  /** Outside the ring (free): a soft two-note "nope". */
  outside: [
    { f: 520, at: 0, dur: 0.07, wave: 'triangle', vol: 0.6 },
    { f: 390, at: 0.08, dur: 0.1, wave: 'triangle', vol: 0.6 },
  ],
  /** Already guessed, or the start city: a short blip. */
  info: [{ f: 600, at: 0, dur: 0.05, wave: 'triangle', vol: 0.5 }],
  /** A hint: a little sparkle. */
  hint: [
    { f: A5, at: 0, dur: 0.06, wave: 'triangle', vol: 0.55 },
    { f: E6, at: 0.05, dur: 0.06, wave: 'triangle', vol: 0.5 },
    { f: A6, at: 0.1, dur: 0.14, wave: 'triangle', vol: 0.45 },
  ],
  /** Skip: three falling notes. */
  skip: [
    { f: G4, at: 0, dur: 0.07, wave: 'square', vol: 0.4 },
    { f: E4, at: 0.07, dur: 0.07, wave: 'square', vol: 0.4 },
    { f: C4, at: 0.14, dur: 0.14, wave: 'square', vol: 0.4 },
  ],
  /** A ring solved (every target found): a short fanfare after the "coin". */
  ringSolved: [
    { f: C5, at: 0.28, dur: 0.08, wave: 'square', vol: 0.4 },
    { f: E5, at: 0.36, dur: 0.08, wave: 'square', vol: 0.4 },
    { f: G5, at: 0.44, dur: 0.08, wave: 'square', vol: 0.4 },
    { f: C6, at: 0.52, dur: 0.2, wave: 'square', vol: 0.4 },
  ],
  /** A ring missed (out of guesses): a sad fall. */
  ringMissed: [
    { f: G4, at: 0.25, dur: 0.12, wave: 'triangle', vol: 0.6 },
    { f: E4, at: 0.37, dur: 0.12, wave: 'triangle', vol: 0.6 },
    { f: C4, to: 196, at: 0.49, dur: 0.3, wave: 'triangle', vol: 0.6 },
  ],
  /** Game over with at least half the cities found. */
  gameWon: [
    { f: C5, at: 0, dur: 0.1, wave: 'square', vol: 0.45 },
    { f: E5, at: 0.1, dur: 0.1, wave: 'square', vol: 0.45 },
    { f: G5, at: 0.2, dur: 0.1, wave: 'square', vol: 0.45 },
    { f: C6, at: 0.3, dur: 0.1, wave: 'square', vol: 0.45 },
    { f: G5, at: 0.4, dur: 0.1, wave: 'square', vol: 0.45 },
    { f: C6, at: 0.5, dur: 0.35, wave: 'square', vol: 0.45 },
  ],
  /** Game over with fewer than half found. */
  gameLost: [
    { f: E5, at: 0, dur: 0.14, wave: 'triangle', vol: 0.55 },
    { f: C5, at: 0.14, dur: 0.14, wave: 'triangle', vol: 0.55 },
    { f: G4, at: 0.28, dur: 0.14, wave: 'triangle', vol: 0.55 },
    { f: C4, at: 0.42, dur: 0.35, wave: 'triangle', vol: 0.55 },
  ],
} satisfies Record<string, SoundNote[]>;
export type SoundName = keyof typeof SOUNDS;
