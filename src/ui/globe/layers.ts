// Prepares the world layers for fast drawing: every polygon and border line gets a bounding
// circle, so each frame only projects the shapes that can be on screen.

import { geoCentroid, geoDistance, type GeoPermissibleObjects } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, LineString, Position } from 'geojson';
import type { WorldLayers } from '../../data/loadGeo.ts';

export interface Item {
  geo: GeoPermissibleObjects;
  centroid: [number, number];
  /** Angular radius in radians: every vertex lies within this distance of the centroid. */
  radius: number;
}

export interface PreparedWorld {
  land: Item[];
  /** Land outlines without the artificial cut lines (see coastlines()). */
  coast: Item[];
  lakes: Item[];
  borders: Item[];
  /** Country polygons by ISO code (cc), for the country hint. */
  countries: Map<string, Item[]>;
}

/** Natural Earth cuts polygons that cross the 180° meridian (Antarctica, Chukotka) along it,
 *  and closes Antarctica along the South Pole. Those edges are real polygon edges for
 *  filling, but drawing them as coastline shows a line from the coast to the pole. This
 *  keeps every edge except ones lying on the 180° meridian or at the pole. */
export function coastlines(polygonItems: Item[]): Item[] {
  // Tolerances because TopoJSON quantization moves 180 to e.g. 179.99996.
  const onCut = (lon: number) => Math.abs(lon) > 179.999;
  const atPole = (lat: number) => lat < -89.999;
  const artificial = (a: Position, b: Position) =>
    (onCut(a[0]!) && onCut(b[0]!)) || (atPole(a[1]!) && atPole(b[1]!));
  return polygonItems.map((it) => {
    const geometry = (it.geo as Feature).geometry;
    const rings = geometry?.type === 'Polygon' ? geometry.coordinates : [];
    const lines: Position[][] = [];
    for (const ring of rings) {
      let line: Position[] = [];
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!;
        const b = ring[i]!;
        if (artificial(a, b)) {
          if (line.length > 1) lines.push(line);
          line = [];
        } else {
          if (line.length === 0) line.push(a);
          line.push(b);
        }
      }
      if (line.length > 1) lines.push(line);
    }
    return { ...it, geo: { type: 'MultiLineString', coordinates: lines } };
  });
}

function positions(g: Geometry): Position[] {
  switch (g.type) {
    case 'Point':
      return [g.coordinates];
    case 'MultiPoint':
    case 'LineString':
      return g.coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return g.coordinates.flat();
    case 'MultiPolygon':
      return g.coordinates.flat(2);
    case 'GeometryCollection':
      return g.geometries.flatMap(positions);
  }
}

function item(geo: Feature | LineString): Item {
  const geometry = geo.type === 'Feature' ? geo.geometry : geo;
  const centroid = geoCentroid(geo);
  let radius = 0;
  for (const p of positions(geometry)) radius = Math.max(radius, geoDistance(centroid, p as [number, number]));
  return { geo, centroid, radius };
}

function features(layer: FeatureCollection | Feature | null): Feature[] {
  if (!layer) return [];
  return layer.type === 'FeatureCollection' ? layer.features : [layer];
}

/** Splits multi-part features into single polygons so small islands are culled separately. */
function polygons(layer: FeatureCollection | Feature | null): Item[] {
  return features(layer).flatMap((f) => {
    if (f.geometry?.type === 'MultiPolygon') {
      return f.geometry.coordinates.map((coordinates) =>
        item({ type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates } }),
      );
    }
    return f.geometry ? [item(f)] : [];
  });
}

function countriesByCode(world: WorldLayers): Map<string, Item[]> {
  const out = new Map<string, Item[]>();
  for (const f of world.countries.features) {
    const cc = (f.properties as { cc?: string } | null)?.cc;
    if (!cc || cc === '-99') continue;
    out.set(cc, [...(out.get(cc) ?? []), ...polygons(f)]);
  }
  return out;
}

export function prepareWorld(world: WorldLayers): PreparedWorld {
  const land = polygons(world.land);
  return {
    land,
    coast: coastlines(land),
    lakes: polygons(world.lakes),
    countries: countriesByCode(world),
    borders: world.borders.coordinates.map((coordinates) => item({ type: 'LineString', coordinates })),
  };
}

/** Items whose bounding circle overlaps the visible cap (centre, angular radius in radians). */
export function visible(items: Item[], center: [number, number], capRadius: number): Item[] {
  return items.filter((it) => geoDistance(center, it.centroid) <= capRadius + it.radius);
}

/** Line features (e.g. subdivision borders) as cullable items. */
export function prepareLines(fc: FeatureCollection): Item[] {
  return fc.features.filter((f) => f.geometry).map((f) => item(f));
}
