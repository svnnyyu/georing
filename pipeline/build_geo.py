#!/usr/bin/env python3
"""Build public/data/geo/*.json (TopoJSON) from Natural Earth.

Run by hand from the project root (not at runtime), after `npm install`:

    python3 pipeline/build_geo.py

Downloads the Natural Earth shapefiles into pipeline/raw/ne/ (git-ignored), then uses
mapshaper (an npm dev dependency) to convert them to quantized TopoJSON:

    world-110m.json     placeholder while the others load
    world-50m-lo.json   1:50m simplified, all islands and lakes kept (zoomed out)
    world-50m.json      full 1:50m (zoomed in)
  each with objects land, countries and lakes
    subdivisions.json   borders between states/provinces inside each country (1:10m admin-1,
                        simplified), drawn only when the Subdivisions setting is on

Countries keep two properties: cc (from ISO_A2_EH, because plain ISO_A2 is -99 for
France, Norway and a few others) and name. See docs/SPEC.md -> Globe -> Detail levels.

Western Sahara: Natural Earth draws who controls the ground, so most of the territory is
inside Morocco and "W. Sahara" is only the strip east of the berm. Like most globes and UN
maps, the game draws the whole territory instead: everything of Morocco's south of 27°40'N
becomes Western Sahara (western_sahara_args, also used by build_population.py).
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

LAYERS = [("land", "physical"), ("countries", "cultural"), ("lakes", "physical")]
# Output name -> (Natural Earth scale, simplification). "50m-lo" keeps every island and lake
# of 1:50m but drops most vertices, for fast drawing when zoomed out.
OUTPUTS = {
    "110m": ("110m", None),
    "50m-lo": ("50m", "12%"),
    "50m": ("50m", None),
}
NE_NAMES = {"land": "land", "countries": "admin_0_countries", "lakes": "lakes", "admin1": "admin_1_states_provinces"}


# Morocco's southern border with Western Sahara runs along 27°40'N. Nothing of Morocco's lies
# south of it, so a box south of that line (and west of the Algerian border) cuts it cleanly.
WESTERN_SAHARA_BOX = "-20,20,-8,27.6666667"


def western_sahara_args(layer: str) -> list[str]:
    """mapshaper commands that move Morocco's part south of 27°40'N into Western Sahara, on a
    countries layer that already has cc and name."""
    return [
        # Morocco on its own layer, cut in two: the part south of the line becomes Western Sahara
        "-filter", "cc == 'MA'", "+", "name=ma", f"target={layer}",
        "-filter", "cc != 'MA'", f"target={layer}",
        "-clip", f"bbox={WESTERN_SAHARA_BOX}", "+", "name=ma_south", "target=ma",
        "-each", "cc = 'EH', name = 'W. Sahara'", "target=ma_south",
        "-erase", f"bbox={WESTERN_SAHARA_BOX}", "target=ma",
        "-merge-layers", f"target={layer},ma,ma_south", "force", f"name={layer}",
        # Join the two Western Sahara pieces; every other shape stays as it was
        "-each", "key = cc == 'EH' ? 'EH' : String(this.id)", f"target={layer}",
        "-dissolve", "key", "copy-fields=cc,name", f"target={layer}",
        "-filter-fields", "cc,name", f"target={layer}",
    ]


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


def build(name: str) -> Path:
    scale, simplify = OUTPUTS[name]
    out = OUT / f"world-{name}.json"
    inputs = [str(shapefile(scale, layer, theme)) for layer, theme in LAYERS]
    names = ",".join(layer for layer, _ in LAYERS)
    others = ",".join(layer for layer, _ in LAYERS if layer != "countries")
    simplify_args = ["-simplify", simplify, "keep-shapes"] if simplify else []
    cmd = [
        "npx", "--no-install", "mapshaper",
        "-i", *inputs, "combine-files", "encoding=utf8",
        *simplify_args,
        "-rename-layers", names,
        "-each", "cc = ISO_A2_EH, name = NAME", "target=countries",
        "-filter-fields", "cc,name", "target=countries",
        *western_sahara_args("countries"),
        "-filter-fields", "", f"target={others}",
        "-o", f"format=topojson", f"quantization={QUANTIZATION}", "target=*", str(out),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT)
    return out


SUBDIVISION_SIMPLIFY = "6%"


def build_subdivisions() -> Path:
    """Lines between first-level subdivisions of the same country (country borders are
    already in the world files)."""
    out = OUT / "subdivisions.json"
    shp = shapefile("10m", "admin1", "cultural")
    cmd = [
        "npx", "--no-install", "mapshaper",
        "-i", str(shp), "encoding=utf8",
        "-simplify", SUBDIVISION_SIMPLIFY, "keep-shapes",
        "-innerlines", "where=A.adm0_a3 == B.adm0_a3",
        "-rename-layers", "subdivisions",
        "-filter-fields", "",
        "-o", "format=topojson", f"quantization={QUANTIZATION}", str(out),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT)
    print(f"  {out.name}: {out.stat().st_size / 1e6:.2f} MB")
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
    for name in OUTPUTS:
        report(build(name))
    build_subdivisions()


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(f"mapshaper failed ({e.returncode}). Did you run `npm install`?")
