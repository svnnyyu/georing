// Great-circle geometry on a sphere of radius EARTH_RADIUS_KM.

import { EARTH_RADIUS_KM } from '../config.ts';

const RAD = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Haversine distance in km. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const dp = p2 - p1;
  const dl = (b.lon - a.lon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point reached by going distanceKm from start along an initial bearing (degrees from north). */
export function destination(start: LatLon, bearingDeg: number, distKm: number): LatLon {
  const d = distKm / EARTH_RADIUS_KM;
  const b = bearingDeg * RAD;
  const p1 = start.lat * RAD;
  const l1 = start.lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  const lon = ((((l2 / RAD + 540) % 360) + 360) % 360) - 180;
  return { lat: p2 / RAD, lon };
}

/** Angular radius in degrees of a circle of radiusKm on the Earth (for d3.geoCircle). */
export function kmToDegrees(km: number): number {
  return (km / EARTH_RADIUS_KM) * (180 / Math.PI);
}

/** 1-based ring number containing distance d, or null if outside all rings.
 *  Ring k covers inner < d <= outer, so no point is ever in two rings. */
export function ringNumberFor(d: number, widthKm: number, ringCount: number): number | null {
  if (d <= 0) return null;
  const k = Math.ceil(d / widthKm);
  return k >= 1 && k <= ringCount ? k : null;
}

/** How far d lies outside the band (inner, outer], in km (0 if inside). */
export function distanceOutsideKm(d: number, innerKm: number, outerKm: number): number {
  if (d > outerKm) return d - outerKm;
  if (d <= innerKm) return innerKm - d;
  return 0;
}
