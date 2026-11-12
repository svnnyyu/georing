// Every tunable number in the game lives here (see docs/SPEC.md).
// Nothing tunable should be hard-coded anywhere else.

// --- Geometry ---
export const EARTH_RADIUS_KM = 6371;
export const RING_CAP = 8; // with the widest rings, 8 × 2,000 km stays short of the far side of the Earth

// --- Setup sliders: [min, max, step, default] ---
// Ring width choices, roughly log-spaced (each step ×1.33–1.5) so the slider moves evenly
// from "regional" to "continental".
export const RING_WIDTH_KM = { options: [500, 750, 1000, 1500, 2000], default: 500 } as const;
export const RING_COUNT = { min: 1, max: RING_CAP, step: 1, default: 3 } as const;
// Fixed at 3 for now (min = max, so there is no slider).
export const GUESSES_PER_RING = { min: 3, max: 3, step: 1, default: 3 } as const;

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
// Area hint: a circle whose diameter is 60% of the ring width, placed so the answer is
// somewhere inside, up to this share of the radius from the centre.
export const HINT_AREA_RADIUS_FRACTION = 0.3; // of ring width
export const HINT_AREA_MAX_OFFSET_FRACTION = 0.8; // of circle radius
// It is also placed so most of it lies inside the ring and over land: up to TRIES random
// placements are measured at SAMPLES points spread evenly over the circle, and the first that
// meets both shares wins (else the closest one, e.g. for a small island).
export const HINT_AREA_MIN_IN_RING = 0.7; // share of the circle's area inside the ring
export const HINT_AREA_MIN_LAND = 0.5; // share of the circle's area over land
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
