#!/usr/bin/env python3
"""Build public/data/land.json: a land/water grid for placing the area hint circle.

Run by hand from the project root, after build_geo.py has downloaded Natural Earth:

    python3 pipeline/build_land.py

The 1:50m land polygons minus the 1:50m lakes are rasterised onto an equirectangular grid of
RES-degree cells (a cell is land when its centre is). Rows run north to south from 90°N,
columns west to east from 180°W. The grid is packed 8 cells per byte (most significant bit
first, row-major) and stored base64-encoded:

    {"res": 0.25, "width": 1440, "height": 720, "bits": "<base64>"}

The core reads it to keep the dashed hint circle mostly over land (see docs/SPEC.md -> Hints).
"""

from __future__ import annotations

import base64
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline" / "raw" / "ne"
OUT = ROOT / "public" / "data" / "land.json"
RES = 0.25


def to_geojson(name: str) -> dict:
    """Convert a downloaded Natural Earth shapefile to GeoJSON with mapshaper."""
    shp = RAW / name / f"{name}.shp"
    if not shp.exists():
        sys.exit(f"{shp} is missing: run `python3 pipeline/build_geo.py` first.")
    out = RAW / f"{name}.geojson"
    if not out.exists():
        cmd = ["npx", "--no-install", "mapshaper", "-i", str(shp), "-o", "format=geojson", str(out)]
        subprocess.run(cmd, check=True, cwd=ROOT)
    return json.loads(out.read_text(encoding="utf-8"))


def rings(fc: dict):
    for f in fc["features"]:
        g = f.get("geometry")
        if not g:
            continue
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for poly in polys:
            yield from poly


def rasterise(all_rings, width: int, height: int) -> bytearray:
    """Even-odd scanline fill at each row's centre latitude. Land rings and lake rings are
    filled together, so lakes (inside land) come out as water."""
    crossings: list[list[float]] = [[] for _ in range(height)]
    for ring in all_rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if y1 == y2:
                continue
            lo, hi = min(y1, y2), max(y1, y2)
            # Rows whose centre latitude lies in [lo, hi)
            r_first = max(0, math.floor((90 - hi) / RES - 0.5))
            r_last = min(height - 1, math.ceil((90 - lo) / RES))
            for r in range(r_first, r_last + 1):
                lat = 90 - (r + 0.5) * RES
                if lo <= lat < hi:
                    crossings[r].append(x1 + (lat - y1) * (x2 - x1) / (y2 - y1))
    bits = bytearray((width * height + 7) // 8)
    for r, xs in enumerate(crossings):
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            # Cells whose centre longitude lies between the two crossings
            c0 = max(0, math.ceil((a + 180) / RES - 0.5))
            c1 = min(width - 1, math.floor((b + 180) / RES - 0.5))
            for c in range(c0, c1 + 1):
                i = r * width + c
                bits[i >> 3] |= 0x80 >> (i & 7)
    return bits


def main() -> None:
    width, height = round(360 / RES), round(180 / RES)
    land = to_geojson("ne_50m_land")
    lakes = to_geojson("ne_50m_lakes")
    bits = rasterise(list(rings(land)) + list(rings(lakes)), width, height)
    share = sum(bin(b).count("1") for b in bits) / (width * height)
    OUT.write_text(
        json.dumps({"res": RES, "width": width, "height": height, "bits": base64.b64encode(bytes(bits)).decode()}),
        encoding="utf-8",
    )
    print(f"  {OUT.name}: {OUT.stat().st_size / 1e3:.0f} kB, {share:.1%} of cells are land")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(f"mapshaper failed ({e.returncode}). Did you run `npm install`?")
