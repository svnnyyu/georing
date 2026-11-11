// How the globe moves: north always stays up. Dragging sideways spins the Earth around its
// own axis (any amount); dragging up/down tilts the view between the poles but never past
// them, so the globe can't flip upside down. Pure functions, plus a small velocity tracker
// for momentum after a flick.

import { INERTIA, MAX_CENTER_LAT, MIN_LON_SPEED_COS, WHEEL } from '../../config.ts';

/** d3-geo rotation [lambda, phi, gamma]: the view centre is (lon, lat) = (-lambda, -phi). */
export type Rotation = [number, number, number];

/** Degrees of arc per screen pixel at the centre of the globe. */
export function degreesPerPixel(scale: number): number {
  return 180 / (Math.PI * scale);
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Moves the view as if the globe were dragged by (dx, dy) screen pixels at the centre.
 *  Sideways speed is divided by cos(latitude) so the centre follows the pointer at any
 *  latitude, capped near the poles. The centre latitude is clamped to ±MAX_CENTER_LAT. */
export function panRotation([lambda, phi]: Rotation, dx: number, dy: number, scale: number): Rotation {
  const k = degreesPerPixel(scale);
  const lat = -phi;
  const cos = Math.max(MIN_LON_SPEED_COS, Math.cos((lat * Math.PI) / 180));
  const nextLat = Math.max(-MAX_CENTER_LAT, Math.min(MAX_CENTER_LAT, lat + dy * k));
  return [wrapLon(lambda + (dx * k) / cos), -nextLat, 0];
}

/** Rotation that centres the view on (lon, lat), north up. */
export function rotationFor(lon: number, lat: number): Rotation {
  return [wrapLon(-lon), -Math.max(-MAX_CENTER_LAT, Math.min(MAX_CENTER_LAT, lat)), 0];
}

/** Velocity of the pointer over the last INERTIA.sampleWindowMs, in px/ms. A pointer that
 *  stopped before release has no recent samples, so it gets no momentum. */
export class VelocityTracker {
  private samples: { t: number; x: number; y: number }[] = [];

  reset(): void {
    this.samples = [];
  }

  add(t: number, x: number, y: number): void {
    this.samples.push({ t, x, y });
    const cutoff = t - INERTIA.sampleWindowMs;
    while (this.samples.length > 2 && this.samples[0]!.t < cutoff) this.samples.shift();
  }

  velocity(now: number): [number, number] {
    const recent = this.samples.filter((s) => s.t >= now - INERTIA.sampleWindowMs);
    if (recent.length < 2) return [0, 0];
    const a = recent[0]!;
    const b = recent[recent.length - 1]!;
    const dt = b.t - a.t;
    if (dt <= 0) return [0, 0];
    let vx = (b.x - a.x) / dt;
    let vy = (b.y - a.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < INERTIA.minStartSpeed) return [0, 0];
    if (speed > INERTIA.maxSpeed) {
      vx *= INERTIA.maxSpeed / speed;
      vy *= INERTIA.maxSpeed / speed;
    }
    return [vx, vy];
  }
}

/** Velocity after dt ms of friction. */
export function decay([vx, vy]: [number, number], dt: number): [number, number] {
  const f = Math.exp(-dt / INERTIA.decayMs);
  return [vx * f, vy * f];
}

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}

/** Is this wheel event a trackpad two-finger swipe (pan) rather than a mouse wheel or a
 *  pinch (zoom)? Pinches arrive as ctrl+wheel. Mouse wheels report lines, or large whole
 *  numbers with no sideways part. Call once per gesture (see WHEEL.burstGapMs). */
export function isTrackpadPan(e: WheelLike): boolean {
  if (e.ctrlKey) return false;
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  return !(Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= WHEEL.mouseMinDelta);
}

/** Wheel deltas as a pan in pixels. Swipes move the view the way the wheel deltas point
 *  (like scrolling a page), the opposite of dragging the content. */
export function wheelPanPixels(e: WheelLike): [number, number] {
  const k = e.deltaMode === 1 ? WHEEL.lineHeightPx : 1;
  return [e.deltaX * k, e.deltaY * k];
}
