#!/usr/bin/env python3
"""Build public/data/cities.json and countries.json from GeoNames.

Run by hand from the project root (not at runtime):

    python3 pipeline/build_cities.py

Downloads missing raw files into pipeline/raw/ (git-ignored), applies
pipeline/overrides.csv and pipeline/aliases_extra.csv, writes the JSON files and
prints a sanity report. See docs/SPEC.md -> Data. Uses only the standard library.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

import metros as metro_join

ROOT = Path(__file__).resolve().parent.parent
PIPELINE = ROOT / "pipeline"
RAW = PIPELINE / "raw"
OUT = ROOT / "public" / "data"
GEONAMES_URL = "https://download.geonames.org/export/dump/"
RAW_FILES = ["cities15000.zip", "countryInfo.txt", "admin1CodesASCII.txt", "alternateNamesV2.zip"]

DROP_FEATURE_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}
MAX_ALIASES = 10
MAX_ALIAS_LENGTH = 40
MAX_UNLABELLED_ALIASES = 3
# alternateNamesV2 "language" values that are not names (links, codes, postcodes...).
NON_NAME_LANGS = {"link", "wkdt", "post", "iata", "icao", "faac", "fr_1793", "unlc", "phon", "piny", "tcid"}
MAJOR_LATIN_LANGS = ["fr", "de", "es", "pt", "it", "nl"]
EARTH_RADIUS_KM = 6371.0
# Chinese cities on neither list in china_urban_2020.csv have an urban population below
# this (citypopulation.de lists every city above it), but GeoNames often gives the whole
# prefecture. Interim upper bound until real figures are found; see docs/SPEC.md.
CN_UNLISTED_CAP = 750_000
# Metro join (see metros.py): big cities whose point sits just outside an urban centre's
# edge are attached to it if within this distance.
METRO_SNAP_MIN_POP = 100_000
METRO_SNAP_KM = 5
# GeoNames sometimes lists one place twice (Kashan, La Ceiba, Komárno). Two entries with the
# same name, region and country are treated as one when they are this close, or have exactly
# the same population (then one is usually a different small place that GeoNames gave the
# other's figure, as with the two Sahiwals). The bigger one is kept; on a tie, the one GeoNames
# ranks higher as an administrative seat (capital, then province, district... seat), then the
# lower id.
DUPLICATE_KM = 10


# --- Shared numbers come from src/config.ts (the single place for tunables) ---

def read_config_number(name: str) -> float:
    text = (ROOT / "src" / "config.ts").read_text(encoding="utf-8")
    m = re.search(rf"export const {name}\s*=\s*([0-9_.]+)\s*;", text)
    if not m:
        sys.exit(f"Could not find {name} in src/config.ts")
    return float(m.group(1).replace("_", ""))


MIN_POP = int(read_config_number("MIN_CITY_POPULATION"))
WELL_KNOWN_POP = int(read_config_number("WELL_KNOWN_POPULATION"))


# --- Text helpers (normalize matches the rule in docs/SPEC.md -> Guess matching) ---

def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[-'’‘`]", " ", s)
    s = re.sub(r"[^\w\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def is_latin(s: str) -> bool:
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all("LATIN" in unicodedata.name(c, "") for c in letters)


def usable_alias(s: str, lang: str) -> bool:
    if not s or len(s) > MAX_ALIAS_LENGTH or any(c.isdigit() for c in s):
        return False
    if not is_latin(s):
        return False
    # Lower-case entries are mostly machine transliterations; abbreviations are upper-case anyway.
    return s[0].isupper() or lang == "abbr"


# --- Downloads ---

def ensure_raw() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name in RAW_FILES:
        path = RAW / name
        if path.exists():
            continue
        print(f"Downloading {name} ...")
        urllib.request.urlretrieve(GEONAMES_URL + name, path)


# --- Readers ---

def read_overrides() -> dict[int, list[tuple[str, str]]]:
    """geonameid -> [(field, value)]. field 'remove' drops the city."""
    out: dict[int, list[tuple[str, str]]] = {}
    with open(PIPELINE / "overrides.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row["geonameid"].strip():
                continue
            out.setdefault(int(row["geonameid"]), []).append((row["field"].strip(), row["value"].strip()))
    return out


def read_extra_aliases() -> dict[int, list[str]]:
    out: dict[int, list[str]] = {}
    with open(PIPELINE / "aliases_extra.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["geonameid"].strip():
                out.setdefault(int(row["geonameid"]), []).append(row["alias"].strip())
    return out


def city_key(name: str) -> str:
    """Matching key for Chinese names: 'Tai’an', 'Taian' and 'Ordos City' -> 'taian', 'ordos'."""
    n = normalize(name)
    for suffix in (" city", " district", " county"):
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    return n.replace(" ", "")


# Sources of Chinese urban figures, in priority order (the first one that has a city wins).
CHINA_SOURCES = ["china_urban_2020.csv", "china_urban_2020_provinces.csv"]


def read_china_urban(filename: str) -> dict[tuple[str, str], int]:
    """(city key, normalized province) -> 2020 census urban population."""
    out: dict[tuple[str, str], int] = {}
    with open(PIPELINE / filename, encoding="utf-8") as f:
        lines = (line for line in f if not line.startswith("#"))
        for row in csv.DictReader(lines):
            province = row["city"] if row["province"] == "municipality" else row["province"]
            key = (city_key(row["city"]), normalize(province))
            # Same name twice in one province (a city and a county): keep the larger.
            out[key] = max(out.get(key, 0), int(row["urban_2020"]))
    return out


def apply_china_urban(cities: list[dict], admin1: dict[str, str],
                      overrides: dict[int, list[tuple[str, str]]]) -> tuple[list[int], int]:
    """Replace prefecture-wide Chinese populations with urban-area figures.
    Returns (replaced per source, capped). overrides.csv still wins."""
    by_key: dict[tuple[str, str], list[dict]] = {}
    for c in cities:
        if c["cc"] == "CN":
            province = admin1.get(f"CN.{c['admin1Code']}", "")
            by_key.setdefault((city_key(c["name"]), normalize(province)), []).append(c)
    replaced: list[int] = []
    matched: set[int] = set()
    used_keys: set[tuple[str, str]] = set()
    for source in CHINA_SOURCES:
        count = 0
        for key, pop in read_china_urban(source).items():
            # A later source never re-matches a name an earlier one used: it would land on
            # an unrelated namesake (e.g. a second "Changzhi" 160 km away).
            if key in used_keys or not by_key.get(key):
                continue
            used_keys.add(key)
            city = max(by_key[key], key=lambda c: c["pop"])
            matched.add(city["id"])
            if city["id"] not in overrides:
                city["pop"] = pop
                count += 1
        replaced.append(count)
    capped = 0
    for c in cities:
        if (c["cc"] == "CN" and c["id"] not in matched and c["id"] not in overrides
                and c["pop"] > CN_UNLISTED_CAP):
            c["pop"] = CN_UNLISTED_CAP
            capped += 1
    return replaced, capped


def read_countries() -> dict[str, dict]:
    countries = {}
    with open(RAW / "countryInfo.txt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            p = line.rstrip("\n").split("\t")
            countries[p[0]] = {
                "name": p[4],
                "continent": p[8],  # AF, AN, AS, EU, NA, OC, SA
                "geonameid": int(p[16]) if p[16] else None,
                "langs": [l.split("-")[0] for l in p[15].split(",") if l],
            }
    return countries


def read_admin1() -> dict[str, str]:
    out = {}
    with open(RAW / "admin1CodesASCII.txt", encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            out[p[0]] = p[1]
    return out


def read_cities(overrides: dict[int, list[tuple[str, str]]]) -> list[dict]:
    cities = []
    with zipfile.ZipFile(RAW / "cities15000.zip") as z, z.open("cities15000.txt") as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            gid = int(p[0])
            fclass, fcode = p[6], p[7]
            if fclass != "P" or fcode in DROP_FEATURE_CODES:
                continue
            city = {
                "id": gid,
                "name": p[1],
                "ascii": p[2] or p[1],
                "lat": float(p[4]),
                "lon": float(p[5]),
                "pop": int(p[14] or 0),
                "cc": p[8],
                "admin1Code": p[10],
                "fcode": fcode,
            }
            removed = False
            for field, value in overrides.get(gid, []):
                if field == "remove":
                    removed = True
                elif field in ("pop",):
                    city["pop"] = int(value)
                elif field in ("lat", "lon"):
                    city[field] = float(value)
                elif field in ("name", "ascii", "cc"):
                    city[field] = value
                elif field == "metroMain":
                    city["metroMain"] = True
                else:
                    sys.exit(f"overrides.csv: unknown field {field!r} for {gid}")
            if not removed:
                cities.append(city)
    return cities


def read_alternate_names(wanted: set[int]) -> dict[int, list[tuple[str, str, bool, bool]]]:
    """geonameid -> [(name, lang, preferred, short)] for the ids we keep."""
    out: dict[int, list[tuple[str, str, bool, bool]]] = {}
    with zipfile.ZipFile(RAW / "alternateNamesV2.zip") as z, z.open("alternateNamesV2.txt") as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            gid = int(p[1])
            if gid not in wanted:
                continue
            lang = p[2]
            if lang in NON_NAME_LANGS:
                continue
            out.setdefault(gid, []).append((p[3], lang, p[4] == "1", p[5] == "1"))
    return out


# --- Alias building ---

def pick_aliases(primary: list[str], alts: list[tuple[str, str, bool, bool]],
                 local_langs: list[str], extra: list[str]) -> list[str]:
    def rank(a: tuple[str, str, bool, bool]) -> tuple[int, int]:
        name, lang, preferred, short = a
        if lang == "en":
            tier = 0 if (preferred or short) else 1
        elif lang == "abbr":
            tier = 2
        elif lang in local_langs:
            tier = 3
        elif lang in MAJOR_LATIN_LANGS:
            tier = 4
        else:
            tier = 5  # unlabelled: a grab bag of real variants and junk, so last and capped
        return (tier, len(name))

    allowed = {"en", "abbr", ""} | set(local_langs) | set(MAJOR_LATIN_LANGS)
    alts = [a for a in alts if a[1] in allowed]

    seen = {normalize(n) for n in primary}
    picked: list[str] = []
    # Hand-written extras always go first and don't count towards the cap.
    for name in extra:
        key = normalize(name)
        if key and key not in seen:
            seen.add(key)
            picked.append(name)
    count = unlabelled = 0
    for name, lang, _, _ in sorted(alts, key=rank):
        if count >= MAX_ALIASES:
            break
        if not usable_alias(name, lang):
            continue
        if lang == "" and unlabelled >= MAX_UNLABELLED_ALIASES:
            continue
        key = normalize(name)
        if key and key not in seen:
            seen.add(key)
            picked.append(name)
            count += 1
            unlabelled += lang == ""
    return picked


# --- Geometry for the sanity report ---

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def ring_answers(cities: list[dict], start: dict, width: float, rings: int) -> list[str]:
    lines = []
    for k in range(1, rings + 1):
        inner, outer = (k - 1) * width, k * width
        inside = [c for c in cities if c["id"] != start["id"]
                  and inner < haversine_km(start["lat"], start["lon"], c["lat"], c["lon"]) <= outer]
        if not inside:
            lines.append(f"    ring {k} ({inner:.0f}-{outer:.0f} km): no cities")
            continue
        inside.sort(key=lambda c: -c["pop"])
        top = ", ".join(f"{c['name']} {c['pop']:,}" for c in inside[:3])
        lines.append(f"    ring {k} ({inner:.0f}-{outer:.0f} km, {len(inside)} cities): {top}")
    return lines


# --- Main ---

# GeoNames feature codes, most important seat first.
SEAT_RANK = {code: i for i, code in enumerate(["PPLC", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLG", "PPL"])}


def remove_duplicates(cities: list[dict], overrides: dict[int, list[tuple[str, str]]]) -> list[dict]:
    """Drops GeoNames double entries (see DUPLICATE_KM). Cities named in overrides.csv are
    left alone: they were looked at by hand."""
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for c in cities:
        groups.setdefault((normalize(c["name"]), c["admin1Code"], c["cc"]), []).append(c)
    drop: set[int] = set()
    for group in groups.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda c: (-c["pop"], SEAT_RANK.get(c["fcode"], len(SEAT_RANK)), c["id"]))
        keep = group[0]
        for other in group[1:]:
            if other["id"] in overrides:
                continue
            km = haversine_km(keep["lat"], keep["lon"], other["lat"], other["lon"])
            if km <= DUPLICATE_KM or other["pop"] == keep["pop"]:
                drop.add(other["id"])
                print(f"  duplicate: {other['name']} ({other['cc']}) {other['id']} "
                      f"pop {other['pop']:,}, {km:.0f} km from {keep['id']} pop {keep['pop']:,}")
    print(f"Removed {len(drop)} duplicate entries")
    return [c for c in cities if c["id"] not in drop]


def main() -> None:
    ensure_raw()
    overrides = read_overrides()
    extra_aliases = read_extra_aliases()
    countries = read_countries()
    admin1 = read_admin1()
    cities = read_cities(overrides)
    replaced, capped = apply_china_urban(cities, admin1, overrides)
    per_source = ", ".join(f"{n} from {s}" for n, s in zip(replaced, CHINA_SOURCES))
    print(f"China: census urban figures set ({per_source}); {capped} capped at {CN_UNLISTED_CAP:,}")
    for c in cities:
        if c["cc"] == "CN" and c["pop"] == CN_UNLISTED_CAP:
            print(f"  capped: {c['name']} ({admin1.get('CN.' + c['admin1Code'], '')})")
    cities = [c for c in cities if c["pop"] >= MIN_POP]
    print(f"Kept {len(cities):,} cities (population >= {MIN_POP:,})")
    cities = remove_duplicates(cities, overrides)

    country_ids = {c["geonameid"] for c in countries.values() if c["geonameid"]}
    alt_names = read_alternate_names({c["id"] for c in cities} | country_ids)

    records = []
    for c in cities:
        country = countries.get(c["cc"], {"langs": []})
        aliases = pick_aliases([c["name"], c["ascii"]], alt_names.get(c["id"], []),
                               country["langs"], extra_aliases.get(c["id"], []))
        records.append({
            "id": c["id"],
            "name": c["name"],
            "ascii": c["ascii"],
            "lat": round(c["lat"], 4),
            "lon": round(c["lon"], 4),
            "pop": c["pop"],
            "cc": c["cc"],
            "admin1": admin1.get(f"{c['cc']}.{c['admin1Code']}", ""),
            "aliases": aliases,
            "wellKnown": c["pop"] >= WELL_KNOWN_POP or c["fcode"] == "PPLC",
            **({"metroMain": True} if c.get("metroMain") else {}),
        })
    records.sort(key=lambda r: -r["pop"])

    metros, metro_stats = metro_join.assign_metros(records, normalize, METRO_SNAP_MIN_POP, METRO_SNAP_KM)
    for r in records:
        r.pop("metroMain", None)
    metros.sort(key=lambda m: -m["pop"])

    used_ccs = {r["cc"] for r in records}
    country_records = {}
    for cc in sorted(used_ccs):
        info = countries.get(cc)
        if not info:
            print(f"  warning: no countryInfo for {cc}")
            continue
        alts = alt_names.get(info["geonameid"], [])
        country_records[cc] = {
            "name": info["name"],
            "continent": info["continent"],
            "aliases": pick_aliases([info["name"]], alts, info["langs"], []),
        }

    unknown_extra = set(extra_aliases) - {r["id"] for r in records}
    for gid in sorted(unknown_extra):
        print(f"  warning: aliases_extra.csv id {gid} is not in the city list")
    unknown_override = set(overrides) - {c["id"] for c in cities}
    for gid in sorted(unknown_override):
        if not any(f == "remove" for f, _ in overrides[gid]):
            print(f"  warning: overrides.csv id {gid} is not in the city list")

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "cities.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))
    with open(OUT / "countries.json", "w", encoding="utf-8") as f:
        json.dump(country_records, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with open(OUT / "metros.json", "w", encoding="utf-8") as f:
        json.dump(metros, f, ensure_ascii=False, separators=(",", ":"))

    report(records, country_records)
    metro_report(records, metros, metro_stats)


def report(records: list[dict], countries: dict) -> None:
    size_mb = (OUT / "cities.json").stat().st_size / 1e6
    print("\n=== Sanity report ===")
    print(f"Cities: {len(records):,}   well-known: {sum(r['wellKnown'] for r in records):,}   "
          f"countries: {len(countries)}   cities.json: {size_mb:.1f} MB")
    print("\nTop 25 by population:")
    for i, r in enumerate(records[:25], 1):
        print(f"  {i:2}. {r['name']}, {r['admin1']}, {r['cc']}: {r['pop']:,}")
    print("\nAbove 10 million:")
    for r in records:
        if r["pop"] > 10_000_000:
            print(f"  {r['name']} ({r['cc']}): {r['pop']:,}")
    print("\nSample aliases:")
    by_id = {r["id"]: r for r in records}
    for gid in (5128581, 2867714, 1275339, 3448439):  # New York, Munich, Mumbai, Sao Paulo
        r = by_id.get(gid)
        if r:
            print(f"  {r['name']}: {', '.join(r['aliases'])}")
    print("\nRing answers (100 km x 3 rings, and 300 km x 4 rings):")
    for gid in (5128581, 2643743, 1850147, 2332459, 1814906):  # NYC, London, Tokyo, Lagos, Chongqing
        start = by_id.get(gid)
        if not start:
            print(f"  missing start city {gid}")
            continue
        print(f"  {start['name']} ({start['pop']:,})")
        for line in ring_answers(records, start, 100, 3) + ring_answers(records, start, 300, 4):
            print(line)



def metro_units(records: list[dict], metros: list[dict]) -> tuple[list[dict], dict[int, dict]]:
    """Metro mode's candidates: one unit per metro (at its main city's point, with the metro
    population) plus every city outside a metro (with its own population)."""
    by_id = {r["id"]: r for r in records}
    units = []
    for m in metros:
        main = by_id[m["main"]]
        units.append({"id": main["id"], "name": main["name"], "lat": main["lat"], "lon": main["lon"],
                      "pop": m["pop"], "metro": m["id"]})
    for r in records:
        if "metro" not in r:
            units.append({"id": r["id"], "name": r["name"], "lat": r["lat"], "lon": r["lon"], "pop": r["pop"]})
    units.sort(key=lambda u: -u["pop"])
    return units, {m["id"]: m for m in metros}


def metro_report(records: list[dict], metros: list[dict], stats: dict) -> None:
    by_id = {r["id"]: r for r in records}
    size_kb = (OUT / "metros.json").stat().st_size / 1e3
    print("\n=== Metro report (GHSL urban centres) ===")
    print(f"Urban centres: {stats['centres']:,}; with at least one city: {stats['with_cities']:,}; "
          f"without: {stats['without_cities']:,} ({stats['pop_without_cities'] / 1e6:.0f}M people, not playable "
          f"in Metro mode). Cities inside a metro: {stats['cities_in_metros']:,} "
          f"({stats['snapped']} snapped from just outside). metros.json: {size_kb:.0f} KB")
    print("\nTop 20 metros (main city: metro population / city population):")
    for m in metros[:20]:
        main = by_id[m["main"]]
        label = main["name"] if main["name"] == m["name"] else f"{main['name']} (GHSL: {m['name']})"
        print(f"  {label}, {m['cc']}: {m['pop']:,} / {main['pop']:,}  [{m['members']} cities]")
    print("\nCity figure larger than its own metro (likely a district or prefecture total):")
    metro_by_id = {m["id"]: m for m in metros}
    flagged = [(r, metro_by_id[r["metro"]]) for r in records
               if "metro" in r and r["pop"] >= 300_000 and r["pop"] > 1.1 * metro_by_id[r["metro"]]["pop"]]
    for r, m in sorted(flagged, key=lambda t: -t[0]["pop"] / t[1]["pop"])[:40]:
        print(f"  {r['name']}, {r['admin1']}, {r['cc']}: city {r['pop']:,} vs metro {m['pop']:,} "
              f"({r['pop'] / m['pop']:.1f}x)")
    big_outside = [r for r in records if "metro" not in r and r["pop"] >= 500_000]
    print(f"\nCities of 500,000+ outside every metro: {len(big_outside)}")
    for r in big_outside[:20]:
        print(f"  {r['name']}, {r['admin1']}, {r['cc']}: {r['pop']:,}")

    units, metro_by_id = metro_units(records, metros)
    print("\nMetro-mode ring answers (100 km x 3 rings):")
    for gid in (5128581, 2643743, 1850147, 2332459, 1814906):
        start = by_id.get(gid)
        if not start:
            continue
        own = start.get("metro")
        centre = by_id[metro_by_id[own]["main"]] if own else start
        print(f"  {centre['name']} (metro {metro_by_id[own]['pop']:,})" if own else f"  {centre['name']}")
        for k in (1, 2, 3):
            inner, outer = (k - 1) * 100, k * 100
            inside = [u for u in units if u.get("metro") != own and u["id"] != start["id"]
                      and inner < haversine_km(centre["lat"], centre["lon"], u["lat"], u["lon"]) <= outer]
            top = ", ".join(f"{u['name']} {u['pop']:,}" for u in inside[:3])
            print(f"    ring {k} ({inner}-{outer} km, {len(inside)}): {top or 'no cities'}")


if __name__ == "__main__":
    main()
