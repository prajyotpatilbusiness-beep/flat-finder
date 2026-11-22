"""Import licensed 99acres and NoBroker exports into a privacy-safe common schema.

This module deliberately does not crawl either portal. Supply an authorized CSV or
JSON export at pipeline/incoming/<city>/<source>.csv|json. Only non-personal listing
facts are retained; contacts, seller names, photos and account data are discarded.
"""
import argparse
import csv
import hashlib
import json
import pathlib
import re
import urllib.parse
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parent
CITIES = json.loads((ROOT.parent / "data" / "cities.json").read_text(encoding="utf-8"))
INCOMING = ROOT / "incoming"
OUT = ROOT / "out"
SOURCE_DOMAINS = {
    "99acres": {"99acres.com", "www.99acres.com"},
    "nobroker": {"nobroker.in", "www.nobroker.in"},
}
CITY_ALIASES = {
    "bangalore": {"bangalore", "bengaluru"},
    "mumbai": {"mumbai"},
    "pune": {"pune"},
    "gurgaon": {"gurgaon", "gurugram"},
}


def first(row, *keys):
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def number(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("₹", "").replace("INR", "").strip()
    match = re.search(r"(-?\d+(?:\.\d+)?)", text)
    return float(match.group(1)) if match else None


def price_inr(value):
    """Convert common INR labels such as '₹ 1.25 Cr' or '₹ 45 Lac' to rupees."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return round(value) if value > 0 else None
    text = str(value).lower().replace(",", "").replace("₹", "").replace("inr", "").strip()
    match = re.search(r"(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|thousand|k)?", text)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2) or ""
    multiplier = 1
    if unit in ("crore", "cr"):
        multiplier = 10_000_000
    elif unit in ("lakh", "lac", "l"):
        multiplier = 100_000
    elif unit in ("thousand", "k"):
        multiplier = 1_000
    total = round(amount * multiplier)
    return total if total > 0 else None


def operation_of(row, url):
    raw = str(first(row, "operation", "transaction_type", "listing_type", "intent", "purpose", "search_type") or "").lower()
    if not raw:
        raw = str(url or "").lower()
    if any(word in raw for word in ("rent", "rental", "lease", "tenant")):
        return "rent"
    if any(word in raw for word in ("sale", "sell", "buy", "resale", "purchase")):
        return "buy"
    return None


def source_url(value, source):
    if not value:
        return None
    url = str(value).strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in SOURCE_DOMAINS[source]:
        return None
    return url


def city_matches(value, city):
    if not value:
        return True
    normalized = re.sub(r"[^a-z]", "", str(value).lower())
    accepted = {re.sub(r"[^a-z]", "", x) for x in CITY_ALIASES.get(city, {CITIES[city]["name"]})}
    accepted.add(re.sub(r"[^a-z]", "", CITIES[city]["name"]))
    return normalized in accepted


def normalize_row(row, source, city):
    """Return a normalized public listing fact, or None for unusable/untrusted rows."""
    url = source_url(first(row, "url", "listing_url", "detail_url", "property_url", "permalink"), source)
    operation = operation_of(row, url)
    if not operation or not city_matches(first(row, "city", "city_name", "location_city"), city):
        return None

    title = str(first(row, "title", "project_name", "property_name", "building_name",
                      "buildingName", "society_name", "society", "name") or "").strip()
    locality = str(first(row, "locality", "sub_locality", "subLocality", "address_locality",
                         "location", "sector") or "").strip()
    if not title and not locality:
        return None

    raw_id = first(row, "listing_id", "property_id", "propertyId", "spid", "project_id", "id")
    if raw_id is None:
        raw_id = hashlib.sha1(f"{url or ''}|{title}|{locality}|{first(row, 'price', 'price_inr')}".encode()).hexdigest()[:20]

    raw_price = first(row, "price_inr", "price", "expected_price", "expectedPrice",
                      "monthly_rent", "rent", "rent_amount", "amount")
    price = price_inr(raw_price)
    raw_bhk = first(row, "bhk", "bedrooms", "bedroom", "bedroomD", "configuration")
    bhk_num = number(raw_bhk)
    if bhk_num is None and raw_bhk is not None:
        match = re.search(r"(\d+)\s*(?:bhk|bed)", str(raw_bhk).lower())
        bhk_num = float(match.group(1)) if match else None
    bhk = int(bhk_num) if bhk_num and bhk_num.is_integer() and 1 <= bhk_num <= 20 else None

    raw_area = first(row, "carpet_area_sqft", "carpetAreaSqft", "super_built_up_area_sqft",
                     "superBuiltUpAreaSqft", "built_up_area_sqft", "builtUpAreaSqft", "area_sqft")
    area = number(raw_area)
    lat = number(first(row, "latitude", "lat"))
    lng = number(first(row, "longitude", "lng", "lon", "long"))
    if lat is not None and not (-90 <= lat <= 90):
        lat = None
    if lng is not None and not (-180 <= lng <= 180):
        lng = None

    return {
        "id": f"{source}:{str(raw_id).strip()}",
        "source": source,
        "source_id": str(raw_id).strip(),
        "title": title or locality,
        "society_name": str(first(row, "society_name", "building_name", "buildingName",
                                  "project_name", "property_name", "society") or title).strip(),
        "locality": locality or None,
        "city": city,
        "operation": operation,
        "price_inr": price,
        "price_period": "month" if operation == "rent" else "total",
        "bhk": bhk,
        "area_sqft": round(area, 1) if area and area > 0 else None,
        "latitude": lat,
        "longitude": lng,
        "property_type": str(first(row, "property_type", "propertyType", "type_name") or "").strip() or None,
        "url": url,
        "posted_at": str(first(row, "posted_at", "postedAt", "post_date", "created_at") or "").strip() or None,
    }


def read_feed(path):
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as handle:
            return list(csv.DictReader(handle))
    if path.suffix.lower() == ".json":
        value = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(value, list):
            return value
        for key in ("listings", "properties", "data", "results"):
            if isinstance(value, dict) and isinstance(value.get(key), list):
                return value[key]
        raise ValueError(f"{path} must contain a list or a listings/properties/data/results array.")
    raise ValueError(f"Unsupported feed type: {path}")


def import_city_feeds(city, incoming=INCOMING, output_root=OUT):
    if city not in CITIES:
        raise ValueError(f"Unknown city: {city}")
    folder = pathlib.Path(incoming) / city
    output = []
    stats = {}
    for source in ("99acres", "nobroker"):
        candidates = [folder / f"{source}.json", folder / f"{source}.csv"]
        path = next((p for p in candidates if p.is_file()), None)
        if path is None:
            stats[source] = {"file": None, "rows_read": 0, "accepted": 0, "skipped": 0}
            continue
        rows = read_feed(path)
        accepted = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            item = normalize_row(row, source, city)
            if item:
                accepted[item["id"]] = item
        output.extend(accepted.values())
        stats[source] = {
            "file": path.name,
            "rows_read": len(rows),
            "accepted": len(accepted),
            "skipped": len(rows) - len(accepted),
        }
    target = pathlib.Path(output_root) / city / "portal_listings.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"Imported {len(output)} licensed portal listing rows for {city}: {stats}")
    return output, stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("city", choices=sorted(CITIES))
    args = parser.parse_args()
    import_city_feeds(args.city)
