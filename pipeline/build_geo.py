#!/usr/bin/env python3
"""Build public/data/geo/*.json (TopoJSON) from Natural Earth.

Run by hand from the project root (not at runtime), after `npm install`:

    python3 pipeline/build_geo.py

Downloads the Natural Earth shapefiles into pipeline/raw/ne/ (git-ignored), then uses
mapshaper (an npm dev dependency) to convert them to quantized TopoJSON:

    world-110m.json  objects: land, countries          (whole-globe view)
    world-50m.json   objects: land, countries, lakes   (zoomed in)

Countries keep two properties: cc (from ISO_A2_EH, because plain ISO_A2 is -99 for
France, Norway and a few others) and name. See docs/SPEC.md -> Globe -> Detail levels.
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline" / "raw" / "ne"
OUT = ROOT / "public" / "data" / "geo"
NE_URL = "https://naciscdn.org/naturalearth/{scale}/{theme}/{name}.zip"
QUANTIZATION = 100_000

LAYERS = {
    "110m": [("land", "physical"), ("countries", "cultural")],
    "50m": [("land", "physical"), ("countries", "cultural"), ("lakes", "physical")],
}
NE_NAMES = {"land": "land", "countries": "admin_0_countries", "lakes": "lakes"}


def shapefile(scale: str, layer: str, theme: str) -> Path:
    name = f"ne_{scale}_{NE_NAMES[layer]}"
    folder = RAW / name
    shp = folder / f"{name}.shp"
    if shp.exists():
        return shp
    RAW.mkdir(parents=True, exist_ok=True)
    zip_path = RAW / f"{name}.zip"
    if not zip_path.exists():
        print(f"Downloading {name} ...")
        urllib.request.urlretrieve(NE_URL.format(scale=scale, theme=theme, name=name), zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(folder)
    return shp


def build(scale: str) -> Path:
    out = OUT / f"world-{scale}.json"
    inputs = [str(shapefile(scale, layer, theme)) for layer, theme in LAYERS[scale]]
    names = ",".join(layer for layer, _ in LAYERS[scale])
    others = ",".join(layer for layer, _ in LAYERS[scale] if layer != "countries")
    cmd = [
        "npx", "--no-install", "mapshaper",
        "-i", *inputs, "combine-files", "encoding=utf8",
        "-rename-layers", names,
        "-each", "cc = ISO_A2_EH, name = NAME", "target=countries",
        "-filter-fields", "cc,name", "target=countries",
        "-filter-fields", "", f"target={others}",
        "-o", f"format=topojson", f"quantization={QUANTIZATION}", "target=*", str(out),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT)
    return out


def report(path: Path) -> None:
    topo = json.loads(path.read_text(encoding="utf-8"))
    parts = []
    for name, obj in topo["objects"].items():
        parts.append(f"{name}: {len(obj.get('geometries', []))}")
    print(f"  {path.name}: {path.stat().st_size / 1e6:.2f} MB  ({', '.join(parts)})")
    countries = topo["objects"].get("countries", {}).get("geometries", [])
    bad = sorted({g["properties"]["name"] for g in countries if g["properties"].get("cc") in (None, "-99")})
    if bad:
        print(f"    countries without a 2-letter code: {', '.join(bad)}")
    codes = {g["properties"]["cc"]: g["properties"]["name"] for g in countries}
    for cc in ("FR", "NO"):
        print(f"    {cc} -> {codes.get(cc, 'MISSING')}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for scale in LAYERS:
        report(build(scale))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(f"mapshaper failed ({e.returncode}). Did you run `npm install`?")
