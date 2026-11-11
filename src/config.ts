// Every tunable number in the game lives here (see docs/SPEC.md).
// Nothing tunable should be hard-coded anywhere else.

// --- Geometry ---
export const EARTH_RADIUS_KM = 6371;
export const RING_CAP = 10;

// --- Setup sliders: [min, max, step, default] ---
export const RING_WIDTH_KM = { min: 50, max: 300, step: 50, default: 100 } as const;
export const RING_COUNT = { min: 1, max: RING_CAP, step: 1, default: 3 } as const;
export const GUESSES_PER_RING = { min: 3, max: 5, step: 1, default: 4 } as const;

// --- City data ---
export const MIN_CITY_POPULATION = 15_000;
export const WELL_KNOWN_POPULATION = 500_000; // or a national capital
export const REVEAL_TOP_N = 5; // cities listed in the reveal panel

// --- Hints ---
export const HINTS_PER_RING = 3;
export const HINT_AREA_START_FRACTION = 0.25; // of ring width
export const HINT_AREA_MAX_CITIES = 5;
export const HINT_AREA_MIN_RADIUS_KM = 10;
export const HINT_AREA_MAX_OFFSET_FRACTION = 0.5; // of circle radius
export const HINT_AREA_SHRINK_FACTOR = 0.8; // radius multiplier per shrink step

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
export const RING_FIT_FRACTION = 0.8; // outer ring diameter vs shorter screen side
export const MIN_VIEW_WIDTH_KM = 100; // closest zoom: this many km across the shorter side
export const GRATICULE_STEP_DEG = 10;
export const GLOBE_FIT_FRACTION = 0.9; // globe diameter vs shorter screen side, whole-Earth view
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
