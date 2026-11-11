// Reads the globe's colours, line widths and marker styles from the CSS variables in
// tokens.css, so the canvas renderer never hard-codes a colour (see CLAUDE.md).

export interface GlobeTheme {
  ocean: string;
  land: string;
  coast: string;
  countryLine: string;
  graticule: string;
  coastWidth: number;
  borderWidth: number;
  graticuleWidth: number;
  subdivisionLine: string;
  subdivisionWidth: number;
  ring: string;
  ringFillOpacity: number;
  ringWidth: number;
  ringPastOpacity: number;
  accent: string;
  correct: string;
  wrong: string;
  outside: string;
  text: string;
  markerOutline: string;
  markerSize: number;
  markerFadedOpacity: number;
  /** CSS font shorthand for marker labels. */
  labelFont: string;
}

export function readGlobeTheme(el: Element = document.documentElement): GlobeTheme {
  const css = getComputedStyle(el);
  const color = (name: string) => css.getPropertyValue(name).trim();
  const num = (name: string, fallback = 1) => {
    const v = Number.parseFloat(css.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    ocean: color('--ocean'),
    land: color('--land'),
    coast: color('--coast'),
    countryLine: color('--country-line'),
    graticule: color('--graticule'),
    coastWidth: num('--globe-coast-width'),
    borderWidth: num('--globe-border-width'),
    graticuleWidth: num('--globe-graticule-width'),
    subdivisionLine: color('--subdivision-line'),
    subdivisionWidth: num('--globe-subdivision-width', 0.6),
    ring: color('--ring'),
    ringFillOpacity: num('--ring-fill-opacity', 0.15),
    ringWidth: num('--ring-width'),
    ringPastOpacity: num('--ring-past-opacity', 0.35),
    accent: color('--accent'),
    correct: color('--correct'),
    wrong: color('--wrong'),
    outside: color('--outside'),
    text: color('--text'),
    markerOutline: color('--marker-outline'),
    markerSize: num('--marker-size', 8),
    markerFadedOpacity: num('--marker-faded-opacity', 0.45),
    labelFont: `${num('--marker-label-size', 11)}px ${css.getPropertyValue('--font-body').trim()}`,
  };
}
