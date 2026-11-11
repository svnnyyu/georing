// Reads the globe's colours and line widths from the CSS variables in tokens.css, so the
// canvas renderer never hard-codes a colour (see CLAUDE.md).

export interface GlobeTheme {
  ocean: string;
  land: string;
  coast: string;
  countryLine: string;
  graticule: string;
  coastWidth: number;
  borderWidth: number;
  graticuleWidth: number;
}

export function readGlobeTheme(el: Element = document.documentElement): GlobeTheme {
  const css = getComputedStyle(el);
  const color = (name: string) => css.getPropertyValue(name).trim();
  const num = (name: string) => Number.parseFloat(css.getPropertyValue(name)) || 1;
  return {
    ocean: color('--ocean'),
    land: color('--land'),
    coast: color('--coast'),
    countryLine: color('--country-line'),
    graticule: color('--graticule'),
    coastWidth: num('--globe-coast-width'),
    borderWidth: num('--globe-border-width'),
    graticuleWidth: num('--globe-graticule-width'),
  };
}
