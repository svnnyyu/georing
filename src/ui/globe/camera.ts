// Camera maths for the orthographic globe: scales for "whole Earth", "fit this ring" and
// "closest zoom", and the smooth fly-to path between two views. Pure functions.

import {
  EARTH_RADIUS_KM,
  FLY_DURATION_MS,
  GLOBE_FIT_FRACTION,
  GLOBE_MIN_ZOOM,
  MIN_VIEW_WIDTH_KM,
  RING_FIT_FRACTION,
} from '../../config.ts';

export interface Viewport {
  width: number;
  height: number;
}

/** A camera position: the point at the centre of the screen and the projection scale. */
export interface View {
  center: [number, number]; // [lon, lat]
  scale: number;
}

const shorter = (v: Viewport) => Math.max(1, Math.min(v.width, v.height));

/** Scale at which the whole globe fills GLOBE_FIT_FRACTION of the shorter side. */
export function wholeEarthScale(v: Viewport): number {
  return (GLOBE_FIT_FRACTION * shorter(v)) / 2;
}

/** Allowed scale range: a bit smaller than whole-Earth, down to MIN_VIEW_WIDTH_KM across. */
export function scaleExtent(v: Viewport): [number, number] {
  return [wholeEarthScale(v) * GLOBE_MIN_ZOOM, (shorter(v) * EARTH_RADIUS_KM) / MIN_VIEW_WIDTH_KM];
}

/** Scale at which a circle of radiusKm spans RING_FIT_FRACTION of the shorter side.
 *  On an orthographic globe a circle of angular radius a has projected radius scale·sin(a). */
export function scaleForRadius(radiusKm: number, v: Viewport): number {
  const a = Math.min(radiusKm / EARTH_RADIUS_KM, Math.PI / 2);
  const s = (RING_FIT_FRACTION * shorter(v)) / 2 / Math.max(Math.sin(a), 1e-9);
  const [min, max] = scaleExtent(v);
  return Math.min(max, Math.max(min, s));
}

/** Great-circle angle between two [lon, lat] points, in radians. */
export function angleBetween(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point a fraction t along the great circle from a to b. */
export function interpolateCenter(a: [number, number], b: [number, number]): (t: number) => [number, number] {
  const r = Math.PI / 180;
  const d = angleBetween(a, b);
  if (d < 1e-9) return () => b;
  const [x0, y0, z0] = [Math.cos(a[1] * r) * Math.cos(a[0] * r), Math.cos(a[1] * r) * Math.sin(a[0] * r), Math.sin(a[1] * r)];
  const [x1, y1, z1] = [Math.cos(b[1] * r) * Math.cos(b[0] * r), Math.cos(b[1] * r) * Math.sin(b[0] * r), Math.sin(b[1] * r)];
  return (t) => {
    const k0 = Math.sin((1 - t) * d) / Math.sin(d);
    const k1 = Math.sin(t * d) / Math.sin(d);
    const x = k0 * x0 + k1 * x1;
    const y = k0 * y0 + k1 * y1;
    const z = k0 * z0 + k1 * z1;
    return [Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r];
  };
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface FlyPath {
  durationMs: number;
  at(t: number): View;
}

/** A smooth path between two views. Long hops pull back far enough to show both ends, so
 *  the camera never races across a close-up map; scale changes are interpolated in log space. */
export function flyPath(from: View, to: View, v: Viewport): FlyPath {
  const angle = angleBetween(from.center, to.center);
  const center = interpolateCenter(from.center, to.center);
  const logFrom = Math.log(from.scale);
  const logTo = Math.log(to.scale);
  // Scale at which both ends fit on screen at once (mid-flight).
  const both = (RING_FIT_FRACTION * shorter(v)) / 2 / Math.max(Math.sin(Math.min(angle / 2, Math.PI / 2)), 1e-9);
  const logBoth = Math.log(Math.max(scaleExtent(v)[0], both));
  const dip = Math.max(0, Math.min(logFrom, logTo) - logBoth);
  const doublings = Math.abs(logTo - logFrom) / Math.LN2 + (2 * dip) / Math.LN2;
  const durationMs = Math.min(
    FLY_DURATION_MS.max,
    Math.max(FLY_DURATION_MS.min, angle * FLY_DURATION_MS.perRadian + doublings * FLY_DURATION_MS.perZoomDoubling),
  );
  return {
    durationMs,
    at(t: number): View {
      const e = easeInOutCubic(Math.min(1, Math.max(0, t)));
      const logScale = logFrom + (logTo - logFrom) * e - dip * Math.sin(Math.PI * e);
      return { center: center(e), scale: Math.exp(logScale) };
    },
  };
}
