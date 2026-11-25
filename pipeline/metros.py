"""Join cities to GHSL urban centres ("metros") by point-in-polygon.

Used by build_cities.py. Source: GHSL Urban Centre Database R2024A (CC BY 4.0), downloaded
into pipeline/raw/ghsl/. An urban centre is a continuous built-up area of at least 50,000
people, measured the same way worldwide from satellite data (population for 2025).

Each city whose point lies inside an urban centre gets that metro. One member city is the
metro's "main" city: it stands for the whole metro in Metro mode (Newark -> New York City).

A few urban centres join cities that are usually counted as separate metros (the Pearl River
Delta: Guangzhou and Shenzhen). pipeline/metro_splits.csv lists an anchor city for each part
(and, with 'joins', a city placed by hand); every other member city joins its nearest anchor, and the centre's population is shared between the
parts in proportion to their cities' own populations.
Standard library only: GeoPackage is SQLite, and the geometry is parsed by hand.
"""

from __future__ import annotations

import csv
import math
import sqlite3
import struct
import urllib.request
import zipfile
from pathlib import Path

GHSL_DIR = Path(__file__).resolve().parent / "raw" / "ghsl"
SPLITS_CSV = Path(__file__).resolve().parent / "metro_splits.csv"
# Ids for the extra parts of a split centre: far above every GHSL id (about 12,000).
SPLIT_ID_BASE = 1_000_000
GHSL_ZIP = "GHS_UCDB_GLOBE_R2024A_V1_2.zip"
GHSL_URL = ("https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_UCDB_GLOBE_R2024A/"
            "GHS_UCDB_GLOBE_R2024A/V1-2/" + GHSL_ZIP)
GPKG = "GHS_UCDB_GLOBE_R2024A.gpkg"
TABLE = "GHSL_UCDB_THEME_GENERAL_CHARACTERISTICS_GLOBE_R2024A"
GRID_M = 100_000  # bucket size for the bounding-box index, in projected metres
# The GHSL main name picks the main city if that city is at least this share of the
# largest member (so "Guangzhou" beats slightly larger Shenzhen, but "New Delhi" doesn't beat Delhi).
MAIN_NAME_MIN_SHARE = 0.5

Ring = list[tuple[float, float]]


def ensure_gpkg() -> Path:
    path = GHSL_DIR / GPKG
    if path.exists():
        return path
    GHSL_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = GHSL_DIR / GHSL_ZIP
    if not zip_path.exists():
        print(f"Downloading {GHSL_ZIP} (264 MB) ...")
        urllib.request.urlretrieve(GHSL_URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extract(GPKG, GHSL_DIR)
    return path


def mollweide(lat: float, lon: float) -> tuple[float, float]:
    """WGS84 lat/lon -> ESRI:54009 World Mollweide metres (the GeoPackage's projection)."""
    r = 6378137.0
    phi, lam = math.radians(lat), math.radians(lon)
    if abs(abs(phi) - math.pi / 2) < 1e-12:
        theta = math.copysign(math.pi / 2, phi)
    else:
        theta = phi
        target = math.pi * math.sin(phi)
        for _ in range(50):
            delta = (2 * theta + math.sin(2 * theta) - target) / (2 + 2 * math.cos(2 * theta))
            theta -= delta
            if abs(delta) < 1e-12:
                break
    x = r * 2 * math.sqrt(2) / math.pi * lam * math.cos(theta)
    y = r * math.sqrt(2) * math.sin(theta)
    return x, y


def parse_gpkg_geometry(blob: bytes) -> list[list[Ring]]:
    """GeoPackage binary -> list of polygons, each a list of rings (outer first)."""
    flags = blob[3]
    envelope_bytes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 0b111]
    return parse_wkb(blob, 8 + envelope_bytes)[0]


def parse_wkb(b: bytes, pos: int) -> tuple[list[list[Ring]], int]:
    endian = "<" if b[pos] == 1 else ">"
    (gtype,) = struct.unpack_from(endian + "I", b, pos + 1)
    pos += 5
    dims = 3 if gtype // 1000 in (1, 2) else 4 if gtype // 1000 == 3 else 2
    base = gtype % 1000
    if base == 3:  # Polygon
        (nrings,) = struct.unpack_from(endian + "I", b, pos)
        pos += 4
        rings = []
        for _ in range(nrings):
            (npts,) = struct.unpack_from(endian + "I", b, pos)
            pos += 4
            coords = struct.unpack_from(endian + "d" * (npts * dims), b, pos)
            pos += 8 * npts * dims
            rings.append([(coords[i], coords[i + 1]) for i in range(0, len(coords), dims)])
        return [rings], pos
    if base == 6:  # MultiPolygon
        (n,) = struct.unpack_from(endian + "I", b, pos)
        pos += 4
        polygons = []
        for _ in range(n):
            polys, pos = parse_wkb(b, pos)
            polygons.extend(polys)
        return polygons, pos
    raise ValueError(f"Unsupported WKB geometry type {gtype}")


def point_in_rings(x: float, y: float, rings: list[Ring]) -> bool:
    """Even-odd rule over all rings, so holes are handled."""
    inside = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def fix_text(s: str | None) -> str:
    """Some GHSL names are UTF-8 read as Latin-1 ('ParaÃ±aque'); undo that when it applies."""
    if not s:
        return ""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def load_urban_centres() -> list[dict]:
    db = sqlite3.connect(ensure_gpkg())
    rows = db.execute(f'SELECT ID_UC_G0, GC_UCN_MAI_2025, GC_POP_TOT_2025, geom FROM "{TABLE}"')
    centres = []
    for uc_id, name, pop, geom in rows:
        if geom is None:
            continue
        polygons = parse_gpkg_geometry(geom)
        xs = [x for poly in polygons for x, _ in poly[0]]
        ys = [y for poly in polygons for _, y in poly[0]]
        centres.append({
            "id": int(uc_id),
            "name": fix_text(name),
            "pop": int(round(pop or 0)),
            "polygons": polygons,
            "bbox": (min(xs), min(ys), max(xs), max(ys)),
        })
    return centres


def distance_to_rings(x: float, y: float, rings: list[Ring]) -> float:
    best = math.inf
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            dx, dy = x2 - x1, y2 - y1
            t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
            best = min(best, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return best


def clean_name(name: str) -> str:
    """'Rotterdam [The Hague]' -> 'Rotterdam'."""
    return name.split("[")[0].strip()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.pi / 180
    a = (math.sin((lat2 - lat1) * r / 2) ** 2
         + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lon2 - lon1) * r / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(a))


def split_anchors(cities: list[dict]) -> tuple[dict[int, list[dict]], dict[int, int]]:
    """metro_splits.csv as (urban centre id -> its anchor cities, in file order: the first keeps
    the centre's id; city id -> the anchor it is placed with by hand). Every anchor of a group
    must lie in the same centre."""
    by_id = {c["id"]: c for c in cities}
    groups: dict[str, list[dict]] = {}
    placed: dict[int, int] = {}
    with SPLITS_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            city = by_id.get(int(row["geonameid"]))
            if not city:
                raise SystemExit(f"metro_splits.csv: no city {row['geonameid']} ({row['note']})")
            if row["joins"]:
                placed[city["id"]] = int(row["joins"])
            else:
                groups.setdefault(row["group"], []).append(city)
    out: dict[int, list[dict]] = {}
    for name, anchors in groups.items():
        ids = {a.get("metro") for a in anchors}
        if len(ids) != 1 or None in ids:
            raise SystemExit(f"metro_splits.csv: {name}'s anchors aren't in one urban centre: "
                             + ", ".join(f"{a['name']} -> {a.get('metro')}" for a in anchors))
        out[ids.pop()] = anchors
    return out, placed


def assign_metros(cities: list[dict], normalize, snap_min_pop: int, snap_km: float) -> tuple[list[dict], dict]:
    """Adds 'metro' (urban centre id) to each city inside one, and returns
    (metros, stats). Each metro: id, name, pop, main (city id), cc, members.
    Cities of snap_min_pop or more that sit just outside a centre (within snap_km of its
    edge, e.g. Dubai's GeoNames point) are attached to the nearest one. A city with
    'metroMain' set (from overrides.csv) is always its metro's main city."""
    centres = load_urban_centres()
    grid: dict[tuple[int, int], list[dict]] = {}
    for uc in centres:
        x0, y0, x1, y1 = uc["bbox"]
        for gx in range(int(x0 // GRID_M), int(x1 // GRID_M) + 1):
            for gy in range(int(y0 // GRID_M), int(y1 // GRID_M) + 1):
                grid.setdefault((gx, gy), []).append(uc)

    members: dict[int, list[dict]] = {}
    snapped = 0
    snap_m = snap_km * 1000
    for c in cities:
        x, y = mollweide(c["lat"], c["lon"])
        nearby = grid.get((int(x // GRID_M), int(y // GRID_M)), [])
        hit = None
        for uc in nearby:
            x0, y0, x1, y1 = uc["bbox"]
            if x0 <= x <= x1 and y0 <= y <= y1 and any(point_in_rings(x, y, p) for p in uc["polygons"]):
                hit = uc
                break
        if hit is None and c["pop"] >= snap_min_pop:
            candidates = []
            for uc in nearby:
                x0, y0, x1, y1 = uc["bbox"]
                if x0 - snap_m <= x <= x1 + snap_m and y0 - snap_m <= y <= y1 + snap_m:
                    d = min(distance_to_rings(x, y, p) for p in uc["polygons"])
                    if d <= snap_m:
                        candidates.append((d, uc))
            if candidates:
                hit = min(candidates, key=lambda t: t[0])[1]
                snapped += 1
        if hit:
            c["metro"] = hit["id"]
            members.setdefault(hit["id"], []).append(c)

    # Split centres: (centre id, name, population, member cities, anchor) per part
    parts: list[tuple[int, str, int, list[dict], dict | None]] = []
    splits, placed = split_anchors(cities)
    for uc in centres:
        group = members.get(uc["id"])
        if not group:
            continue
        anchors = splits.get(uc["id"])
        if not anchors:
            parts.append((uc["id"], clean_name(uc["name"]), uc["pop"], group, None))
            continue
        by_anchor: dict[int, list[dict]] = {a["id"]: [] for a in anchors}
        for c in group:
            if placed.get(c["id"]) in by_anchor:
                by_anchor[placed[c["id"]]].append(c)
                continue
            nearest = min(anchors, key=lambda a: haversine_km(c["lat"], c["lon"], a["lat"], a["lon"]))
            by_anchor[nearest["id"]].append(c)
        total = sum(c["pop"] for c in group)
        for k, a in enumerate(anchors):
            sub = by_anchor[a["id"]]
            share = sum(c["pop"] for c in sub) / total
            pid = uc["id"] if k == 0 else SPLIT_ID_BASE + uc["id"] * 10 + k
            for c in sub:
                c["metro"] = pid
            parts.append((pid, a["name"], round(uc["pop"] * share), sub, a))
            print(f"  split {clean_name(uc['name'])}: {a['name']} {round(uc['pop'] * share):,} "
                  f"({len(sub)} cities: {', '.join(c['name'] for c in sorted(sub, key=lambda c: -c['pop'])[:4])})")

    metros = []
    for uid, uc_label, uc_pop, group, anchor in parts:
        largest = max(group, key=lambda c: c["pop"])
        main = largest
        uc_name = normalize(uc_label)
        forced = [anchor] if anchor else [c for c in group if c.get("metroMain")]
        if forced:
            main = forced[0]
        else:
            for c in sorted(group, key=lambda c: -c["pop"]):
                names = {normalize(c["name"]), normalize(c["ascii"])} | {normalize(a) for a in c.get("aliases", [])}
                if uc_name in names and c["pop"] >= MAIN_NAME_MIN_SHARE * largest["pop"]:
                    main = c
                    break
        # A metro is never smaller than its main city. GHSL's density method undercounts some
        # cities (Chengdu: 5.6M urban centre vs 13.6M census urban population).
        pop = max(uc_pop, main["pop"])
        metros.append({"id": uid, "name": uc_label, "pop": pop, "ghslPop": uc_pop,
                       "main": main["id"], "cc": main["cc"], "members": len(group)})
    stats = {
        "centres": len(centres),
        "with_cities": len(metros),
        "without_cities": len(centres) - len(metros),
        "pop_without_cities": sum(uc["pop"] for uc in centres if uc["id"] not in members),
        "splits": sum(1 for p in parts if p[4] is not None),
        "cities_in_metros": sum(len(g) for g in members.values()),
        "snapped": snapped,
    }
    return metros, stats
