import { geoOrthographic } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { INERTIA } from '../../src/config.ts';
import {
  decay,
  degreesPerPixel,
  isTrackpadPan,
  panRotation,
  rotationFor,
  VelocityTracker,
  wheelPanPixels,
} from '../../src/ui/globe/motion.ts';

const centre = (r: number[]) => [-r[0]!, -r[1]!];

describe('north-up panning', () => {
  it('keeps north up (no roll) and wraps longitude', () => {
    const r = panRotation(rotationFor(170, 10), -200, 0, 300);
    expect(r[2]).toBe(0);
    const [lon] = centre(r);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
  });

  it('can spin all the way around the axis', () => {
    let r = rotationFor(0, 30);
    for (let i = 0; i < 100; i++) r = panRotation(r, 50, 0, 300);
    expect(centre(r)[1]).toBeCloseTo(30, 9); // latitude unchanged by sideways drags
  });

  it('tilts up to a pole but never past it', () => {
    let r = rotationFor(0, 80);
    r = panRotation(r, 0, 10_000, 300);
    expect(centre(r)[1]).toBe(90);
    r = panRotation(r, 0, -100_000, 300);
    expect(centre(r)[1]).toBe(-90);
  });

  it('moves the centre with the pointer at mid latitudes', () => {
    const scale = 2000;
    const start = rotationFor(10, 45);
    const after = panRotation(start, 40, -25, scale);
    // The point that was at the centre should now be ~40px right and ~25px up.
    const p = geoOrthographic().scale(scale).translate([0, 0]).rotate(after)([10, 45])!;
    expect(p[0]).toBeCloseTo(40, 0);
    expect(p[1]).toBeCloseTo(-25, 0);
  });

  it('moves less per pixel when zoomed in', () => {
    expect(degreesPerPixel(4000)).toBeCloseTo(degreesPerPixel(400) / 10);
  });
});

describe('momentum', () => {
  it('measures a flick', () => {
    const v = new VelocityTracker();
    for (let t = 0; t <= 80; t += 16) v.add(t, t * 2, -t);
    const [vx, vy] = v.velocity(80);
    expect(vx).toBeCloseTo(2);
    expect(vy).toBeCloseTo(-1);
  });

  it('gives no momentum if the pointer stopped before release', () => {
    const v = new VelocityTracker();
    for (let t = 0; t <= 80; t += 16) v.add(t, t * 2, 0);
    expect(v.velocity(80 + INERTIA.sampleWindowMs + 50)).toEqual([0, 0]);
  });

  it('ignores slow releases and caps very fast ones', () => {
    const slow = new VelocityTracker();
    slow.add(0, 0, 0);
    slow.add(50, 2, 0);
    expect(slow.velocity(50)).toEqual([0, 0]);
    const fast = new VelocityTracker();
    fast.add(0, 0, 0);
    fast.add(10, 1000, 0);
    expect(Math.hypot(...fast.velocity(10))).toBeCloseTo(INERTIA.maxSpeed);
  });

  it('slows down smoothly', () => {
    const [vx] = decay([1, 0], INERTIA.decayMs);
    expect(vx).toBeCloseTo(1 / Math.E);
  });
});

describe('wheel events', () => {
  const ev = (deltaX: number, deltaY: number, extra: Partial<{ deltaMode: number; ctrlKey: boolean }> = {}) => ({
    deltaX,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    ...extra,
  });

  it('treats two-finger swipes as panning', () => {
    expect(isTrackpadPan(ev(12, 0))).toBe(true);
    expect(isTrackpadPan(ev(0, 3.5))).toBe(true);
    expect(isTrackpadPan(ev(0, 7))).toBe(true);
  });

  it('treats mouse wheels and pinches as zooming', () => {
    expect(isTrackpadPan(ev(0, 100))).toBe(false);
    expect(isTrackpadPan(ev(0, -120))).toBe(false);
    expect(isTrackpadPan(ev(0, 3, { deltaMode: 1 }))).toBe(false);
    expect(isTrackpadPan(ev(5, 5, { ctrlKey: true }))).toBe(false);
  });

  it('pans in the direction of the wheel deltas', () => {
    expect(wheelPanPixels(ev(10, -4))).toEqual([10, -4]);
  });
});
