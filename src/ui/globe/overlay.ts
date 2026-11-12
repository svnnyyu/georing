// Draws the game layer on top of the map: rings and city markers (see docs/SPEC.md ->
// Globe -> Layers 6-8 and Markers). Called from Globe.draw() with resampling on.

import { geoCircle, geoDistance, type GeoPath, type GeoProjection } from 'd3-geo';
import { HINT_FADE_MS, MARKER_PULSE_MS } from '../../config.ts';
import { kmToDegrees } from '../../core/geo.ts';
import type { GlobeTheme } from './theme.ts';

export interface GlobeRing {
  lon: number;
  lat: number;
  innerKm: number;
  outerKm: number;
  /** The ring being played: filled donut. Others: faint outlines. */
  current: boolean;
}

/** hint: the answer's dot shown by the letter hint (labelled with the first letter only). */
export type MarkerKind = 'start' | 'outside' | 'wrong' | 'correct' | 'hint';

export interface GlobeMarker {
  id: string;
  lon: number;
  lat: number;
  kind: MarkerKind;
  label: string;
  /** Markers from earlier rings are drawn faded. */
  faded?: boolean;
  /** Just the name, centred, in the marker's colour (Countries mode: a country's name over
   *  where its people in the ring live). */
  labelOnly?: boolean;
}

/** A ring band (around lat, lon) that a country tint is clipped to. */
export interface RingClip {
  lat: number;
  lon: number;
  innerKm: number;
  outerKm: number;
}

export interface GlobeOverlay {
  rings: GlobeRing[];
  markers: GlobeMarker[];
  /** Country hint: the countries to outline and tint, whole (not cut to the ring). */
  hintCountries?: { ccs: string[] };
  /** Countries mode: guessed and revealed countries, tinted in their result's colour inside
   *  the ring they were guessed in. */
  countryFills?: { cc: string; kind: MarkerKind; faded: boolean; clip?: RingClip }[];
  /** Area hint: dashed circles, one around each target not found yet. */
  hintAreas?: { lat: number; lon: number; radiusKm: number }[];
}

export interface ProjectedMarker {
  id: string;
  x: number;
  y: number;
}

// Circle outlines are the same every frame, so they are built once (a game with 250 km rings
// can have 200 of them) and kept until the cache grows past CIRCLE_CACHE_MAX.
const CIRCLE_CACHE_MAX = 1000;
const circles = new Map<string, ReturnType<ReturnType<typeof geoCircle>>>();
const circle = (lon: number, lat: number, km: number) => {
  const key = `${lon},${lat},${km}`;
  let c = circles.get(key);
  if (!c) {
    if (circles.size >= CIRCLE_CACHE_MAX) circles.clear();
    c = geoCircle().center([lon, lat]).radius(kmToDegrees(km)).precision(1)();
    circles.set(key, c);
  }
  return c;
};

/** Can any of a circle's outline be on screen? Its points are all between |d - r| and d + r
 *  from the view centre (d: centre to centre, r: radius, in radians); the visible cap ends at
 *  cap. */
const outlineVisible = (lon: number, lat: number, km: number, view: { center: [number, number]; cap: number }) =>
  Math.abs(geoDistance(view.center, [lon, lat]) - (kmToDegrees(km) * Math.PI) / 180) <= view.cap;

/** The circle of radius km around a ring clip's centre (for clipping tints to a ring band). */
export const ringCircle = (clip: RingClip, km: number) => circle(clip.lon, clip.lat, km);

/** Draw order: start first, then faded, then current wrong/outside, then answers on top. */
const ORDER: Record<MarkerKind, number> = { start: 0, hint: 1, outside: 2, wrong: 2, correct: 3 };

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  path: GeoPath,
  projection: GeoProjection,
  theme: GlobeTheme,
  overlay: GlobeOverlay,
  view: { center: [number, number]; cap: number },
  born: Map<string, number>,
  now: number,
  /** Opacity of the area hint (it fades in). */
  areaAlpha = 1,
): { projected: ProjectedMarker[]; animating: boolean } {
  // Rings: earlier ones as faint outlines, fading with age, and the current one as a filled
  // donut. Neighbouring rings share an edge, so each edge is drawn once, in the opacity of the
  // newest ring it belongs to; edges that can't be on screen are skipped.
  const currentIndex = overlay.rings.findIndex((r) => r.current);
  const current = overlay.rings[currentIndex];
  const edges = new Map<string, { lon: number; lat: number; km: number; age: number }>();
  overlay.rings.forEach((r, i) => {
    if (r.current) return;
    const age = currentIndex === -1 ? overlay.rings.length - i : currentIndex - i;
    for (const km of r.innerKm > 0 ? [r.innerKm, r.outerKm] : [r.outerKm]) {
      // The current ring draws its own edges.
      if (current && current.lon === r.lon && current.lat === r.lat && (km === current.innerKm || km === current.outerKm)) {
        continue;
      }
      const key = `${r.lon},${r.lat},${km}`;
      const seen = edges.get(key);
      if (!seen || age < seen.age) edges.set(key, { lon: r.lon, lat: r.lat, km, age });
    }
  });
  ctx.strokeStyle = theme.ring;
  ctx.lineWidth = theme.ringWidth;
  for (const e of edges.values()) {
    if (!outlineVisible(e.lon, e.lat, e.km, view)) continue;
    const t = Math.min(1, (e.age - 1) / Math.max(1, theme.ringFadeRings));
    ctx.globalAlpha = theme.ringPastOpacity + (theme.ringOldOpacity - theme.ringPastOpacity) * t;
    ctx.beginPath();
    path(circle(e.lon, e.lat, e.km));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (current) {
    ctx.beginPath();
    path(circle(current.lon, current.lat, current.outerKm));
    if (current.innerKm > 0) path(circle(current.lon, current.lat, current.innerKm));
    ctx.globalAlpha = theme.ringFillOpacity;
    ctx.fillStyle = theme.ring;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    ctx.stroke();
  }

  // Area hint: dashed circles above the rings, one per target not found yet.
  if (overlay.hintAreas?.length) {
    ctx.beginPath();
    for (const a of overlay.hintAreas) path(circle(a.lon, a.lat, a.radiusKm));
    ctx.setLineDash(theme.hintDash);
    ctx.globalAlpha = areaAlpha;
    ctx.strokeStyle = theme.hint;
    ctx.lineWidth = theme.hintWidth;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  // Markers on the visible side of the globe only.
  const projected: ProjectedMarker[] = [];
  let animating = false;
  const s = theme.markerSize;
  const sorted = [...overlay.markers].sort(
    (a, b) => Number(!a.faded) - Number(!b.faded) || ORDER[a.kind] - ORDER[b.kind],
  );
  ctx.font = theme.labelFont;
  ctx.textBaseline = 'middle';
  for (const m of sorted) {
    if (geoDistance([m.lon, m.lat], view.center) > Math.min(view.cap, Math.PI / 2)) continue;
    const p = projection([m.lon, m.lat]);
    if (!p) continue;
    const [x, y] = p;
    if (m.kind !== 'hint') projected.push({ id: m.id, x, y }); // the hint dot has no info card
    const color =
      m.kind === 'start'
        ? theme.accent
        : m.kind === 'correct'
          ? theme.correct
          : m.kind === 'wrong'
            ? theme.wrong
            : m.kind === 'hint'
              ? theme.hint
              : theme.outside;
    ctx.globalAlpha = m.faded ? theme.markerFadedOpacity : 1;
    // The hint dot fades in.
    const t0 = born.get(m.id);
    if (m.kind === 'hint' && t0 !== undefined && now - t0 < HINT_FADE_MS) {
      ctx.globalAlpha = (now - t0) / HINT_FADE_MS;
      animating = true;
    }

    // Glow pulse for a newly revealed answer.
    if (m.kind === 'correct' && !m.labelOnly && t0 !== undefined && now - t0 < MARKER_PULSE_MS) {
      const p01 = (now - t0) / MARKER_PULSE_MS;
      ctx.save();
      ctx.globalAlpha = (1 - p01) * 0.6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s * (1 + 2.5 * p01), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      animating = true;
    }

    if (m.labelOnly) {
      // Countries mode: just the name, centred, in the result's colour, with a dark halo.
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.markerOutline;
      ctx.strokeText(m.label, x, y);
      ctx.fillStyle = color;
      ctx.fillText(m.label, x, y);
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
      continue;
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = theme.markerOutline;
    ctx.lineWidth = 1;
    if (m.kind === 'start') {
      const d = s * 0.75;
      ctx.beginPath();
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const left = Math.round(x - s / 2) + 0.5;
      const top = Math.round(y - s / 2) + 0.5;
      ctx.fillRect(left, top, s, s);
      ctx.strokeRect(left, top, s, s);
    }

    if (m.label) {
      // Text with a dark halo so it stays readable over land and rings.
      const tx = x + s;
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.markerOutline;
      ctx.strokeText(m.label, tx, y);
      ctx.fillStyle = m.kind === 'hint' ? theme.hint : theme.text;
      ctx.fillText(m.label, tx, y);
    }
    ctx.globalAlpha = 1;
  }
  return { projected, animating };
}

/** The marker under a screen point, if any (topmost first). */
export function hitTest(projected: ProjectedMarker[], x: number, y: number, radius: number): string | null {
  for (let i = projected.length - 1; i >= 0; i--) {
    const p = projected[i]!;
    if (Math.hypot(p.x - x, p.y - y) <= radius) return p.id;
  }
  return null;
}
