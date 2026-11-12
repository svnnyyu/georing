// Land or water at a point, from the grid in public/data/land.json (built by
// pipeline/build_land.py). Used to keep the area hint circle mostly over land.

import type { LatLon } from './geo.ts';
import type { LandMask } from './types.ts';

/** True if the grid cell containing this point is land. Rows run north to south from 90°N,
 *  columns west to east from 180°W, 8 cells per byte, most significant bit first. */
export function isLand(mask: LandMask, p: LatLon): boolean {
  const row = Math.min(mask.height - 1, Math.max(0, Math.floor((90 - p.lat) / mask.res)));
  const lon = ((((p.lon + 180) % 360) + 360) % 360) - 180;
  const col = Math.min(mask.width - 1, Math.max(0, Math.floor((lon + 180) / mask.res)));
  const i = row * mask.width + col;
  return ((mask.bits[i >> 3]! >> (7 - (i & 7))) & 1) === 1;
}
