// Loads the Natural Earth TopoJSON files from public/data/geo/ and turns them into the
// GeoJSON layers the globe draws. 1:110m is a tiny placeholder; "50m-lo" (1:50m simplified,
// every island and lake kept) is used zoomed out and full 1:50m zoomed in.

import type { Feature, FeatureCollection, MultiLineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

export type Detail = '110m' | '50m-lo' | '50m';

export interface WorldLayers {
  land: FeatureCollection | Feature;
  /** Borders between countries only (no coastlines). */
  borders: MultiLineString;
  /** Countries keep cc (ISO_A2_EH) and name, for the country hint later. */
  countries: FeatureCollection;
  lakes: FeatureCollection | Feature | null;
}

type Objects = { land: GeometryCollection; countries: GeometryCollection; lakes?: GeometryCollection };

const cache = new Map<Detail, Promise<WorldLayers>>();

export function loadWorld(detail: Detail): Promise<WorldLayers> {
  let p = cache.get(detail);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/geo/world-${detail}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load world-${detail}.json (${res.status})`);
        return res.json() as Promise<Topology<Objects>>;
      })
      .then((topo) => ({
        land: feature(topo, topo.objects.land),
        countries: feature(topo, topo.objects.countries) as FeatureCollection,
        borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
        lakes: topo.objects.lakes ? feature(topo, topo.objects.lakes) : null,
      }));
    p.catch(() => cache.delete(detail)); // allow a retry after a failed load
    cache.set(detail, p);
  }
  return p;
}
