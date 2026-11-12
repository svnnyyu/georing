// The stars behind the globe. They sit on a sky sphere that turns with the globe (same
// rotation) but doesn't zoom: its visible half is projected to span STARS.skyScale × the
// screen diagonal, centred on the globe. Drawn before the Earth, so the Earth hides the stars
// behind it.

import { geoDistance, geoOrthographic, type GeoProjection } from 'd3-geo';
import { STARS } from '../../config.ts';
import { createRng } from '../../core/random.ts';
import type { GlobeTheme } from './theme.ts';

interface Star {
  lon: number;
  lat: number;
  /** Square side in CSS px. */
  size: number;
  plus: boolean;
  alpha: number;
}

/** STARS.count stars spread evenly over the sky sphere, from a fixed seed (same sky every visit). */
function makeStars(): Star[] {
  const rng = createRng(STARS.seed);
  return Array.from({ length: STARS.count }, () => {
    const lon = rng() * 360 - 180;
    const lat = (Math.asin(2 * rng() - 1) * 180) / Math.PI; // even over the sphere, not bunched at the poles
    const kind = rng();
    const plus = kind < STARS.plusShare;
    const size = plus || kind < STARS.plusShare + STARS.bigShare ? STARS.bigPx : STARS.smallPx;
    const alpha = plus ? STARS.maxAlpha : STARS.minAlpha + rng() * (STARS.maxAlpha - STARS.minAlpha);
    return { lon, lat, size, plus, alpha };
  });
}

export class Sky {
  private readonly stars = makeStars();
  private readonly projection: GeoProjection = geoOrthographic();

  /** Draws the stars for the globe's current rotation, centred on the globe at (cx, cy). */
  draw(
    ctx: CanvasRenderingContext2D,
    theme: GlobeTheme,
    rotation: [number, number, number],
    width: number,
    height: number,
    cx: number,
    cy: number,
    /** The globe's radius on screen: stars behind it aren't drawn. */
    globeRadius = 0,
  ): void {
    this.projection.scale(STARS.skyScale * Math.hypot(width, height)).translate([cx, cy]).rotate(rotation);
    const facing: [number, number] = [-rotation[0], -rotation[1]];
    ctx.fillStyle = theme.star;
    for (const s of this.stars) {
      if (geoDistance([s.lon, s.lat], facing) > Math.PI / 2) continue; // on the far side of the sky
      const p = this.projection([s.lon, s.lat]);
      if (!p || p[0] < 0 || p[1] < 0 || p[0] > width || p[1] > height) continue;
      if (Math.hypot(p[0] - cx, p[1] - cy) < globeRadius - 2 * s.size) continue; // behind the globe
      const k = s.size;
      const x = Math.round(p[0]) - Math.floor(k / 2);
      const y = Math.round(p[1]) - Math.floor(k / 2);
      ctx.globalAlpha = s.alpha;
      ctx.fillRect(x, y, k, k);
      if (s.plus) {
        // Four arms, each one star-square long, at half brightness: a twinkly "+".
        ctx.globalAlpha = s.alpha * 0.5;
        ctx.fillRect(x - k, y, k, k);
        ctx.fillRect(x + k, y, k, k);
        ctx.fillRect(x, y - k, k, k);
        ctx.fillRect(x, y + k, k, k);
      }
    }
    ctx.globalAlpha = 1;
  }
}
