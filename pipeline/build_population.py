#!/usr/bin/env python3
"""Build public/data/population.json: people per country per 0.25° square, for Countries mode.

Run by hand from the project root, after build_geo.py has downloaded Natural Earth. Unlike the
other pipeline scripts it needs numpy and rasterio, installed in a virtual environment:

    python3 -m venv pipeline/.venv
    pipeline/.venv/bin/pip install -r pipeline/requirements.txt
    pipeline/.venv/bin/python pipeline/build_population.py

Source: GHS-POP R2023A, epoch 2025, 30 arc-second grid in WGS84 (GHS_POP_E2025_GLOBE_R2023A_4326_30ss),
European Commission JRC. Downloaded into pipeline/raw/ghsl/ (git-ignored) on first run.

Steps:
1. The Natural Earth 1:50m countries are drawn onto a 2.5′ grid (country index per square,
   smaller countries drawn last so they aren't swallowed). Squares the simplified coastline
   leaves at sea are given to the nearest country within DILATE_STEPS squares, so coastal
   cities keep their people.
2. The population grid is read in strips of 0.25°. Each 30″ pixel takes the country of the
   2.5′ square it lies in; people are summed per 0.25° square and country.
3. Output (rows from 90°N, columns from 180°W; a square's index is row × width + column):
       {"res": 0.25, "width": 1440, "height": 720,
        "countries": {"FR": [index, people, index, people, ...], ...},
        "territories": {"PR": "US", ...}}
   Indexes are delta-encoded per country (each is the difference from the previous one) and
   people rounded to whole numbers; squares with under MIN_PEOPLE are dropped.
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.windows import Window

from build_geo import western_sahara_args

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline" / "raw"
NE = RAW / "ne"
GHSL = RAW / "ghsl"
OUT = ROOT / "public" / "data" / "population.json"

POP_NAME = "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0"
POP_URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/"
    f"GHS_POP_E2025_GLOBE_R2023A_4326_30ss/V1-0/{POP_NAME}.zip"
)

OUT_RES = 0.25  # degrees per output square
COUNTRY_RES = 2.5 / 60  # degrees per country-grid square
DILATE_STEPS = 6  # country-grid squares (~28 km) that sea squares can borrow a country from
MIN_PEOPLE = 1

# Natural Earth areas without a 2-letter code (ISO_A2_EH = -99), counted with the country that
# administers them, as GeoNames does.
NO_CODE = {"Somaliland": "SO", "N. Cyprus": "CY", "Baikonur": "KZ", "Siachen Glacier": "IN", "Kosovo": "XK"}

# Countries mode plays the 193 UN members and the 2 observers (Holy See VA, Palestine PS), plus
# three places whose status is disputed and which the game keeps as their own entries rather
# than take a side: Taiwan (TW), Kosovo (XK) and Western Sahara (EH). Every other territory
# Natural Earth maps separately counts toward the country that governs it. Their people are kept
# under their own code in the output (so the game can say "Bermuda (UK)"), with this map
# written alongside; the game adds them to their country.
TERRITORY_OF = {
    # United Kingdom
    "AI": "GB", "BM": "GB", "FK": "GB", "GG": "GB", "IM": "GB", "JE": "GB", "KY": "GB",
    "MS": "GB", "SH": "GB", "TC": "GB", "VG": "GB",
    # United States
    "AS": "US", "GU": "US", "MP": "US", "PR": "US", "VI": "US",
    # France
    "BL": "FR", "MF": "FR", "NC": "FR", "PF": "FR", "PM": "FR", "WF": "FR",
    # Netherlands (the Kingdom's constituent countries)
    "AW": "NL", "CW": "NL", "SX": "NL",
    # Denmark
    "FO": "DK", "GL": "DK",
    # China
    "HK": "CN", "MO": "CN",
    # Finland
    "AX": "FI",
    # Australia
    "NF": "AU",
    # New Zealand (free association)
    "CK": "NZ", "NU": "NZ",
}


def population_tif() -> Path:
    tif = GHSL / f"{POP_NAME}.tif"
    if tif.exists():
        return tif
    zip_path = GHSL / f"{POP_NAME}.zip"
    if not zip_path.exists():
        GHSL.mkdir(parents=True, exist_ok=True)
        print("Downloading GHS-POP (484 MB) ...")
        urllib.request.urlretrieve(POP_URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.endswith(".tif"))
        z.extract(name, GHSL)
        (GHSL / name).rename(tif)
    return tif


def countries_geojson() -> dict:
    shp = NE / "ne_50m_admin_0_countries" / "ne_50m_admin_0_countries.shp"
    if not shp.exists():
        sys.exit(f"{shp} is missing: run `python3 pipeline/build_geo.py` first.")
    # Same countries as the globe, with the whole of Western Sahara (see build_geo.py)
    out = NE / "ne_50m_admin_0_countries_ws.geojson"
    if not out.exists():
        cmd = ["npx", "--no-install", "mapshaper", "-i", str(shp), "encoding=utf8",
               "-rename-layers", "countries",
               "-each", "cc = ISO_A2_EH, name = NAME", "-filter-fields", "cc,name",
               *western_sahara_args("countries"),
               "-o", "format=geojson", str(out)]
        subprocess.run(cmd, check=True, cwd=ROOT)
    return json.loads(out.read_text(encoding="utf-8"))


def country_grid(fc: dict) -> tuple[np.ndarray, list[str]]:
    """Country index (1-based into the returned code list; 0 = none) per 2.5′ square."""
    width, height = round(360 / COUNTRY_RES), round(180 / COUNTRY_RES)
    shapes: dict[str, list[dict]] = {}
    for f in fc["features"]:
        cc = f["properties"].get("cc")
        if not cc or cc == "-99":
            cc = NO_CODE.get(f["properties"].get("name", ""))
        if not cc or not f.get("geometry"):
            print(f"  skipped (no code): {f['properties'].get('name')}")
            continue
        shapes.setdefault(cc, []).append(f["geometry"])
    codes = sorted(shapes)
    if len(codes) > 254:
        sys.exit("more than 254 countries: widen the country grid type")

    def extent(geoms: list[dict]) -> float:
        xs: list[float] = []
        ys: list[float] = []

        def walk(c):
            if isinstance(c[0], (int, float)):
                xs.append(c[0])
                ys.append(c[1])
            else:
                for part in c:
                    walk(part)

        for g in geoms:
            walk(g["coordinates"])
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    # Largest first, so a small country drawn later keeps its squares (Singapore, Monaco).
    order = sorted(codes, key=lambda cc: -extent(shapes[cc]))
    transform = from_origin(-180, 90, COUNTRY_RES, COUNTRY_RES)
    grid = np.zeros((height, width), dtype=np.uint8)
    for cc in order:
        idx = codes.index(cc) + 1
        mask = rasterize(((g, 1) for g in shapes[cc]), out_shape=grid.shape, transform=transform,
                         all_touched=True, fill=0, dtype=np.uint8)
        grid[mask == 1] = idx
    # Let sea squares next to land borrow the neighbouring country, a step at a time.
    for _ in range(DILATE_STEPS):
        empty = grid == 0
        if not empty.any():
            break
        fill = np.zeros_like(grid)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            shifted = np.roll(grid, (dy, dx), axis=(0, 1))
            fill = np.where((fill == 0) & (shifted != 0), shifted, fill)
        grid = np.where(empty, fill, grid)
    return grid, codes


def main() -> None:
    tif = population_tif()
    countries, codes = country_grid(countries_geojson())
    out_w, out_h = round(360 / OUT_RES), round(180 / OUT_RES)
    n = len(codes) + 1
    # Country index -> lists of (square index, people), filled one 0.25° row at a time
    cells: list[list[int]] = [[] for _ in range(n)]
    people: list[list[float]] = [[] for _ in range(n)]
    world = 0.0
    unassigned = 0.0

    with rasterio.open(tif) as src:
        px = src.transform.a  # degrees per pixel
        left, top = src.transform.c, src.transform.f
        per_country_sq = round(COUNTRY_RES / px)  # 5 pixels per 2.5′ square
        per_out_sq = round(OUT_RES / px)  # 30 pixels per 0.25° square
        col0 = round((left + 180) / px)  # the grid may not start at 180°W / 90°N
        row0 = round((90 - top) / px)
        nodata = src.nodata
        print(f"  population grid {src.width}×{src.height}, {px * 3600:.0f}″ pixels, "
              f"origin {left:.3f},{top:.3f}, nodata {nodata}")
        full_w = round(360 / px)
        for out_row in range(out_h):
            # Pixel rows of this 0.25° band, in the file's own numbering
            r_start = out_row * per_out_sq - row0
            r_end = r_start + per_out_sq
            if r_end <= 0 or r_start >= src.height:
                continue
            a, b = max(0, r_start), min(src.height, r_end)
            data = src.read(1, window=Window(0, a, src.width, b - a)).astype(np.float64)
            if nodata is not None:
                data[data == nodata] = 0
            data[data < 0] = 0
            band = np.zeros((per_out_sq, full_w))
            # The file may overhang 180° by a pixel on each side: keep only what falls inside
            # one turn of the globe.
            s0 = max(0, -col0)
            g0 = col0 + s0
            n_cols = min(src.width - s0, full_w - g0)
            band[a - r_start: b - r_start, g0: g0 + n_cols] = data[:, s0: s0 + n_cols]
            # Sum 5×5 pixels into 2.5′ squares
            sq = band.reshape(per_out_sq // per_country_sq, per_country_sq, full_w // per_country_sq,
                              per_country_sq).sum(axis=(1, 3))
            c_rows = slice(out_row * (per_out_sq // per_country_sq), (out_row + 1) * (per_out_sq // per_country_sq))
            cc_idx = countries[c_rows, :]
            out_col = np.arange(sq.shape[1]) // (per_out_sq // per_country_sq)
            key = out_col[None, :] * n + cc_idx
            sums = np.bincount(key.ravel(), weights=sq.ravel(), minlength=out_w * n)
            world += sums.sum()
            unassigned += sums[0::n].sum()
            for k in np.nonzero(sums >= MIN_PEOPLE)[0]:
                c, i = divmod(int(k), n)
                if i:
                    cells[i].append(out_row * out_w + c)
                    people[i].append(float(sums[k]))
            if out_row % 60 == 0:
                print(f"  row {out_row}/{out_h}")

    print(f"World population {world / 1e9:.2f} B; not in any country {unassigned / 1e6:.1f} M "
          f"({unassigned / world:.2%})")
    result: dict[str, list[int]] = {}
    for i, cc in enumerate(codes, start=1):
        if not cells[i]:
            continue
        idx = np.array(cells[i], dtype=np.int64)  # already in increasing order (row by row)
        flat = np.empty(len(idx) * 2, dtype=np.int64)
        flat[0::2] = np.diff(idx, prepend=0)
        flat[1::2] = np.rint(people[i]).astype(np.int64)
        result[cc] = flat.tolist()
    top = sorted(((sum(v[1::2]), cc) for cc, v in result.items()), reverse=True)[:8]
    print("  largest: " + ", ".join(f"{cc} {p / 1e6:.0f}M" for p, cc in top))
    # Territories that count toward another country, so the game can accept their names too
    # ("Puerto Rico" -> United States).
    OUT.write_text(json.dumps({"res": OUT_RES, "width": out_w, "height": out_h, "countries": result,
                               "territories": TERRITORY_OF}, separators=(",", ":")), encoding="utf-8")
    entries = sum(len(v) // 2 for v in result.values())
    print(f"  {OUT.name}: {OUT.stat().st_size / 1e6:.2f} MB, {len(result)} countries, {entries:,} squares")


if __name__ == "__main__":
    main()
