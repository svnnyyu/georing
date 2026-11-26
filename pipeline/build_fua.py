#!/usr/bin/env python3
"""Build pipeline/fua_2025.csv: the 2025 population of every GHSL Functional Urban Area.

Metro mode's metros are GHSL Functional Urban Areas (FUAs): a dense urban centre plus the
commuting zone around it, drawn the same way worldwide (GHS-FUA R2019A, CC BY 4.0). The
dataset's own figures are for 2015, so this script sums the 2025 population grid (GHS-POP
R2023A, the one build_population.py uses) inside each FUA's outline. build_cities.py (standard
library only) then reads the outlines from the GeoPackage and the populations from this file.

Run by hand from the project root, in the pipeline's virtual environment (numpy, rasterio):

    pipeline/.venv/bin/python pipeline/build_fua.py

Downloads the FUA GeoPackage (3 MB) into pipeline/raw/ghsl/fua/ on first run, and the
population grid (484 MB, shared with build_population.py) if it isn't there yet.
"""

from __future__ import annotations

import csv
import math
import sqlite3
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_population import population_tif  # noqa: E402
from metros import FUA_GPKG, FUA_TABLE, fix_text, parse_gpkg_geometry  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FUA_URL = ("https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_FUA_UCDB2015_GLOBE_R2019A/V1-0/"
           "GHS_FUA_UCDB2015_GLOBE_R2019A_54009_1K_V1_0.zip")
OUT = ROOT / "pipeline" / "fua_2025.csv"
MOLLWEIDE_R = 6378137.0  # ESRI:54009 uses the WGS84 semi-major axis as its sphere radius


def ensure_fua() -> Path:
    if FUA_GPKG.exists():
        return FUA_GPKG
    FUA_GPKG.parent.mkdir(parents=True, exist_ok=True)
    zip_path = FUA_GPKG.with_suffix(".zip")
    print("Downloading GHS-FUA (3 MB) ...")
    urllib.request.urlretrieve(FUA_URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(FUA_GPKG.parent)
    return FUA_GPKG


def lonlat(x: float, y: float) -> tuple[float, float]:
    """ESRI:54009 World Mollweide metres -> lon, lat (the inverse of metros.mollweide)."""
    r = MOLLWEIDE_R
    theta = math.asin(max(-1.0, min(1.0, y / (r * math.sqrt(2)))))
    lat = math.asin(max(-1.0, min(1.0, (2 * theta + math.sin(2 * theta)) / math.pi)))
    cos_t = math.cos(theta)
    lon = math.pi * x / (2 * r * math.sqrt(2) * cos_t) if cos_t > 1e-12 else 0.0
    return math.degrees(lon), math.degrees(lat)


def main() -> None:
    tif = population_tif()
    db = sqlite3.connect(ensure_fua())
    rows = db.execute(f'SELECT eFUA_ID, eFUA_name, Cntry_ISO, FUA_p_2015, geom FROM "{FUA_TABLE}"').fetchall()
    out = []
    with rasterio.open(tif) as src:
        for i, (fid, name, iso, p2015, geom) in enumerate(rows):
            if geom is None:
                continue
            polys = [[[lonlat(x, y) for x, y in ring] for ring in poly] for poly in parse_gpkg_geometry(geom)]
            xs = [p[0] for poly in polys for p in poly[0]]
            ys = [p[1] for poly in polys for p in poly[0]]
            pad = 0.01  # a pixel or so, so edge pixels are never cut off
            window = from_bounds(min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad, src.transform)
            window = window.round_offsets().round_lengths()
            data = src.read(1, window=window, boundless=True, fill_value=0).astype(np.float64)
            data[data < 0] = 0
            mask = rasterize([({"type": "Polygon", "coordinates": poly}, 1) for poly in polys],
                             out_shape=data.shape, transform=src.window_transform(window), fill=0, dtype=np.uint8)
            out.append((int(fid), fix_text(name), iso, round(float(data[mask == 1].sum())), round(p2015 or 0)))
            if i % 1000 == 0:
                print(f"  {i}/{len(rows)}")
    out.sort(key=lambda r: r[0])
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "iso3", "pop2025", "pop2015"])
        w.writerows(out)
    total25 = sum(r[3] for r in out)
    total15 = sum(r[4] for r in out)
    print(f"{OUT.name}: {len(out):,} areas; people in them {total15 / 1e9:.2f} B (2015) -> {total25 / 1e9:.2f} B (2025)")
    for r in sorted(out, key=lambda r: -r[3])[:15]:
        print(f"  {r[1]}, {r[2]}: {r[3] / 1e6:.1f}M (2015: {r[4] / 1e6:.1f}M)")


if __name__ == "__main__":
    main()
