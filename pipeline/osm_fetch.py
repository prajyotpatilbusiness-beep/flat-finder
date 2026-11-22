"""Fetch residential areas and building footprints for a city bbox from Overpass, once.

usage: python osm_fetch.py <city>  -> out/<city>/osm_areas.geojson, out/<city>/osm_buildings.geojson
"""
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

import geo

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache" / "osm"
OUT = ROOT / "out"
CITIES = json.loads((ROOT.parent / "data" / "cities.json").read_text())
CITY = next((a for a in sys.argv[1:] if a in CITIES), "gurgaon")
BBOX = tuple(CITIES[CITY]["bbox"])  # south, west, north, east
OUT = OUT / CITY
CACHE = CACHE / CITY
MIRRORS = [
    "https://ovp.dresel.systems/api-as/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def overpass(query, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{name}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode({"data": query}).encode()
    for url in MIRRORS * 2:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "flat-finder/0.1"})
            raw = urllib.request.urlopen(req, timeout=300).read()
            data = json.loads(raw)
            f.write_bytes(raw)
            return data
        except Exception as e:
            detail = e.read().decode("utf-8", "ignore")[:2000] if hasattr(e, "read") else ""
            print("mirror failed", url, e, detail, flush=True)
            time.sleep(10)
    raise SystemExit("all Overpass mirrors failed")


def _pts(geom):
    return [(round(p["lon"], 6), round(p["lat"], 6)) for p in geom]


def ring_from_relation(el):
    """Join a multipolygon relation's outer member ways into closed rings."""
    segs = [_pts(m["geometry"]) for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    rings = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) >= 4:
            rings.append(ring)
    return rings


def height_of(tags):
    try:
        if tags.get("height"):
            return float(str(tags["height"]).split()[0])
        if tags.get("building:levels"):
            return float(tags["building:levels"]) * 3.2
    except ValueError:
        pass
    return None


def main():
    s, w, n, e = BBOX
    bb = f"({s},{w},{n},{e})"
    areas = overpass(f'[out:json][timeout:280];(way["landuse"="residential"]["name"]{bb};relation["landuse"="residential"]["name"]{bb};);out geom;', "areas")
    feats = []
    for el in areas["elements"]:
        rings = ring_from_relation(el) if el["type"] == "relation" else [_pts(el["geometry"])]
        for r in rings:
            feats.append({"type": "Feature", "properties": {"osm": f"{el['type']}/{el['id']}", "name": el["tags"]["name"]},
                          "geometry": {"type": "Polygon", "coordinates": [r]}})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "osm_areas.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    print("areas", len(feats))

    blds = overpass(f'[out:json][timeout:280];way["building"]{bb};out geom;', "buildings")
    bf = []
    for el in blds["elements"]:
        if "geometry" not in el:
            continue
        r = _pts(el["geometry"])
        if r[0] != r[-1]:
            r.append(r[0])
        bf.append({"type": "Feature", "properties": {"osm": el["id"], "h": height_of(el.get("tags", {}))},
                   "geometry": {"type": "Polygon", "coordinates": [r]}})
    (OUT / "osm_buildings.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": bf}))
    print("buildings", len(bf))


POI_QUERY = """[out:json][timeout:280];(
  way["leisure"="park"]{bb};relation["leisure"="park"]{bb};node["leisure"="park"]{bb};
  node["railway"="station"]{bb};node["station"="subway"]{bb};node["railway"="halt"]{bb};
  node["amenity"="school"]{bb};way["amenity"="school"]{bb};
  nwr["amenity"="college"]{bb};nwr["amenity"="university"]{bb};
  node["amenity"="hospital"]{bb};way["amenity"="hospital"]{bb};
  node["shop"="mall"]{bb};way["shop"="mall"]{bb};way["shop"="supermarket"]{bb};node["shop"="supermarket"]{bb};
  nwr["office"]{bb};nwr["building"="office"]{bb};
  nwr["name"~"park|Park|cyber|Cyber|eon|EON|Mindspace|mindspace|Infocity|infocity|free zone|Free Zone|Tech Zone|tech zone|Techzone|techzone|Info Park|info park|InfoPark|infopark|Commerzone|commerzone"]{bb};
);out center tags;"""


def poi_kind(t):
    if t.get("tourism") in ("hotel", "hostel", "guest_house"):
        return None
    if t.get("highway") or t.get("route"):
        return None
    if t.get("amenity") in ("college", "university"):
        return t["amenity"]
    if t.get("leisure") == "park":
        return "park"
    if t.get("station") == "subway" or "metro" in (t.get("name") or "").lower() or t.get("subway") == "yes":
        return "metro"
    if t.get("railway") in ("station", "halt"):
        return "rail"
    if t.get("amenity") in ("school", "hospital"):
        return t["amenity"]
    if t.get("shop") in ("mall", "supermarket"):
        return "shopping"
    if t.get("office") == "research":
        return "office"
    name = (t.get("name") or "").lower()
    if re.search(r"\b(?:it|software|cyber|infotech|infopark|infocity|eon|mindspace|techzone|commerzone)[\w &-]*(?:park|zone|city|campus|free zone|sez)\b|\b(?:it park|tech park|tech zone|techzone|software park|cyber city|cyber park|infotech park|infopark|info park|commerzone)\b", name):
        return "it_park"
    if t.get("office") or t.get("building") == "office":
        return "office"
    return None


def poi_record(el, city_name):
    tags = el.get("tags", {})
    center = el.get("center") or ({"lat": el["lat"], "lon": el["lon"]} if "lat" in el else None)
    kind = poi_kind(tags)
    if not center or not kind:
        return None
    name = tags.get("name")
    record = {"k": kind, "name": name, "lng": round(center["lon"], 5), "lat": round(center["lat"], 5),
              "source": f"https://www.openstreetmap.org/{el['type']}/{el['id']}"}
    address = tags.get("addr:full") or ", ".join(tags[k] for k in ("addr:street", "addr:suburb", "addr:city", "addr:postcode") if tags.get(k))
    if address:
        record["address"] = address
    if name:
        record["gmaps"] = "https://www.google.com/maps/search/?" + urllib.parse.urlencode({"api": "1", "query": f"{name}, {city_name}"})
    if tags.get("website"):
        record["website"] = tags["website"]
    return record


def dedupe_pois(items, radius_m=500):
    """Collapse multiple nearby OSM features for the same named place."""
    seen = {}
    out = []
    for p in items:
        name = " ".join(re.findall(r"[a-z0-9]+", (p.get("name") or "").lower()))
        key = (p["k"], name)
        matches = seen.get(key, []) if name else []
        if any(geo.dist_m((p["lng"], p["lat"]), (q["lng"], q["lat"])) <= radius_m for q in matches):
            continue
        out.append(p)
        if name:
            seen.setdefault(key, []).append(p)
    return out


def fetch_pois():
    s, w, n, e = BBOX
    data = overpass(POI_QUERY.replace("{bb}", f"({s},{w},{n},{e})"), "pois")
    out = dedupe_pois([p for el in data["elements"] if (p := poi_record(el, CITIES[CITY]["name"]))])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "osm_pois.json").write_text(json.dumps(out), encoding="utf-8")
    from collections import Counter
    print("pois", Counter(p["k"] for p in out))


if __name__ == "__main__":
    if "pois" in sys.argv:
        fetch_pois()
    else:
        main()
        fetch_pois()
