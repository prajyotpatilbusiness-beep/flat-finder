"""Build Pune college/university and office-hub search anchors from OpenStreetMap.

The output is a place directory, not property inventory. OSM coordinates are map
centres for discovery and should not be presented as surveyed property locations.
Data is distributed under ODbL; retain the attribution in the generated JSON.
"""
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parent
REPO = ROOT.parent
CFG = json.loads((REPO / "data" / "cities.json").read_text(encoding="utf-8"))
CITY = "pune"
OUT = REPO / "web" / "public" / "data" / "pune-search-places.json"
CACHE = ROOT / "cache" / "osm" / CITY
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

OFFICE_NAME = re.compile(
    r"\b(it park|tech(?:nology)? park|business park|business centre|business center|"
    r"corporate park|special economic zone|sez|infotech|knowledge park|"
    r"world trade center|eon free zone|magarpatta|hinjawadi|rajiv gandhi infotech|"
    r"industrial estate|midc|business district|technology campus)\b",
    re.I,
)
EXCLUDE_NAME = re.compile(
    r"\b(220\s*kv|substation|transformer|power line|electricity|banquet|"
    r"restaurant|cafe|hotel|mall|cinema|theatre|temple|church|hospital|"
    r"school|college|university|resort|gym|club)\b",
    re.I,
)


def query_text():
    south, west, north, east = CFG[CITY]["bbox"]
    bbox = f"({south},{west},{north},{east})"
    return f"""[out:json][timeout:240];
(
  nwr["amenity"~"^(college|university)$"]{bbox};
  nwr["office"~"^(it|company|business|coworking)$"]{bbox};
  nwr["building"="office"]["name"]{bbox};
  nwr["landuse"~"^(commercial|industrial)$"]["name"]{bbox};
  nwr["name"~"IT Park|Technology Park|Business Park|Business Centre|Business Center|Corporate Park|Special Economic Zone|SEZ|Infotech|Knowledge Park|World Trade Center|EON Free Zone|Magarpatta|Hinjawadi|Rajiv Gandhi Infotech|Industrial Estate|MIDC|Business District|Technology Campus",i]{bbox};
);
out center tags;"""


def overpass():
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / "pune-search-places.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cache_file.unlink(missing_ok=True)

    body = urllib.parse.urlencode({"data": query_text()}).encode()
    errors = []
    for url in MIRRORS:
        for attempt in range(2):
            try:
                request = urllib.request.Request(
                    url,
                    data=body,
                    headers={
                        "User-Agent": "FlatFinder/1.0 (Pune college and office place index; OSM ODbL attribution)",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                )
                with urllib.request.urlopen(request, timeout=280) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload.get("elements"), list):
                    raise ValueError("Overpass response is missing the elements array")
                cache_file.write_text(json.dumps(payload), encoding="utf-8")
                return payload
            except Exception as error:
                errors.append(f"{url}: {error}")
                time.sleep(4 + attempt * 6)
    raise RuntimeError("All Overpass mirrors failed:\n" + "\n".join(errors))


def centre(element):
    if element.get("center"):
        return element["center"].get("lat"), element["center"].get("lon")
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    return None, None


def address(tags):
    parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
        tags.get("addr:postcode"),
    ]
    return ", ".join(str(part).strip() for part in parts if part)


def normalize_element(element):
    tags = element.get("tags") or {}
    name = str(tags.get("name") or tags.get("official_name") or "").strip()
    if not name:
        return None

    amenity = tags.get("amenity")
    office = tags.get("office")
    landuse = tags.get("landuse")
    building = tags.get("building")
    if amenity == "university":
        group, kind = "campuses", "university"
    elif amenity == "college":
        group, kind = "campuses", "college"
    elif EXCLUDE_NAME.search(name):
        return None
    elif OFFICE_NAME.search(name):
        group, kind = "offices", "business_park"
    elif office in {"it", "company", "business", "coworking"}:
        group, kind = "offices", "office_hub"
    elif building == "office":
        group, kind = "offices", "office_building"
    else:
        return None

    lat, lng = centre(element)
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (18.25 <= lat <= 18.82 and 73.55 <= lng <= 74.15):
        return None

    osm_type = element.get("type")
    osm_id = element.get("id")
    if not osm_type or not osm_id:
        return None

    return {
        "id": f"osm-{osm_type}-{osm_id}",
        "name": name,
        "city": "Pune",
        "kind": kind,
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "address": address(tags) or None,
        "source": "OpenStreetMap",
        "source_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
    }, group


def dedupe(items):
    # Deduplicate equivalent name + near-identical centre records without merging
    # distinct campus branches or separate office phases.
    seen = set()
    output = []
    for item in sorted(items, key=lambda row: (row["name"].casefold(), row["id"])):
        key = re.sub(r"[^a-z0-9]+", "", item["name"].casefold())
        rounded = (round(item["lat"], 3), round(item["lng"], 3))
        marker = (key, rounded)
        if marker in seen:
            continue
        seen.add(marker)
        output.append(item)
    return output


def build_directory(elements):
    campuses, offices = [], []
    for element in elements:
        result = normalize_element(element)
        if not result:
            continue
        item, group = result
        (campuses if group == "campuses" else offices).append(item)
    return {
        "city": "Pune",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenStreetMap",
        "licence": "Open Database Licence (ODbL) 1.0",
        "attribution": "© OpenStreetMap contributors",
        "attribution_url": "https://www.openstreetmap.org/copyright",
        "coverage_bbox": CFG[CITY]["bbox"],
        "coverage_note": "Pune metropolitan search area, including mapped nearby campuses and office/business parks. This is a mapped directory, not a guarantee that every institution is mapped in OSM.",
        "campuses": dedupe(campuses),
        "offices": dedupe(offices),
    }


def main():
    payload = overpass()
    directory = build_directory(payload["elements"])
    if not directory["campuses"]:
        raise SystemExit("No Pune colleges or universities were returned; refusing to publish an empty directory.")
    if not directory["offices"]:
        raise SystemExit("No Pune office hubs were returned; refusing to publish an empty directory.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(directory, separators=(",", ":")), encoding="utf-8")
    print(
        f"Pune place index: {len(directory['campuses']):,} colleges/universities; "
        f"{len(directory['offices']):,} office/business-hub places."
    )
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
