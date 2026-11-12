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
}

export interface GlobeOverlay {
  rings: GlobeRing[];
  markers: GlobeMarker[];
  /** Country hint: ISO code of the country to outline and tint. */
  hintCountry?: string;
  /** Area hint: a dashed circle that contains the answer. */
  hintArea?: { lat: number; lon: number; radiusKm: number };
}

export interface ProjectedMarker {
  id: string;
  x: number;
  y: number;
}

const circle = (lon: number, lat: number, km: number) =>
  geoCircle().center([lon, lat]).radius(kmToDegrees(km)).precision(1)();

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
  // Rings: earlier ones as faint outlines, the current one as a filled donut.
  for (const r of overlay.rings) {
    ctx.beginPath();
    path(circle(r.lon, r.lat, r.outerKm));
    if (r.innerKm > 0) path(circle(r.lon, r.lat, r.innerKm));
    if (r.current) {
      ctx.globalAlpha = theme.ringFillOpacity;
      ctx.fillStyle = theme.ring;
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = theme.ringPastOpacity;
    }
    ctx.strokeStyle = theme.ring;
    ctx.lineWidth = theme.ringWidth;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Area hint: dashed circle above the rings.
  if (overlay.hintArea) {
    const a = overlay.hintArea;
    ctx.beginPath();
    path(circle(a.lon, a.lat, a.radiusKm));
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
    if (m.kind === 'correct' && t0 !== undefined && now - t0 < MARKER_PULSE_MS) {
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
