import json

from portal_import import import_city_feeds, normalize_row, price_inr


def test_price_inr_handles_indian_price_labels():
    assert price_inr("₹ 1.25 Cr") == 12_500_000
    assert price_inr("₹ 45 Lac") == 4_500_000
    assert price_inr("₹ 32,000 / month") == 32_000
    assert price_inr(75000) == 75000


def test_normalize_99acres_listing_and_drop_personal_fields():
    row = {
        "propertyId": "A-123",
        "title": "2 BHK Apartment in Kharadi",
        "buildingName": "Riverfront Residency",
        "locality": "Kharadi",
        "city": "Pune",
        "transaction_type": "Rent",
        "price": "₹ 32,000 / month",
        "bedrooms": "2 BHK",
        "carpetAreaSqft": "850",
        "latitude": "18.55",
        "longitude": "73.94",
        "url": "https://www.99acres.com/example-property",
        "owner_name": "Do not retain",
        "phone": "9999999999",
    }

    item = normalize_row(row, "99acres", "pune")

    assert item["id"] == "99acres:A-123"
    assert item["operation"] == "rent"
    assert item["price_inr"] == 32000
    assert item["price_period"] == "month"
    assert item["bhk"] == 2
    assert item["area_sqft"] == 850
    assert item["latitude"] == 18.55
    assert item["longitude"] == 73.94
    assert "owner_name" not in item and "phone" not in item


def test_normalize_nobroker_sale_listing():
    row = {
        "id": "NB-7",
        "property_name": "Green Park Homes",
        "society_name": "Green Park Homes",
        "locality": "Wakad",
        "city": "Pune",
        "purpose": "Buy",
        "expected_price": "₹ 90 L",
        "bhk": "3",
        "superBuiltUpAreaSqft": 1450,
        "url": "https://www.nobroker.in/property/sale/pune/NB-7",
    }
    item = normalize_row(row, "nobroker", "pune")
    assert item["operation"] == "buy"
    assert item["price_inr"] == 9_000_000
    assert item["bhk"] == 3
    assert item["area_sqft"] == 1450


def test_reject_wrong_city_or_non_portal_url():
    assert normalize_row({
        "title": "A home", "city": "Mumbai", "operation": "rent",
        "url": "https://www.99acres.com/home",
    }, "99acres", "pune") is None
    assert normalize_row({
        "title": "A home", "city": "Pune", "operation": "rent",
        "url": "https://example.com/home",
    }, "99acres", "pune")["url"] is None


def test_import_city_feeds_dedupes_and_writes_private_safe_schema(tmp_path):
    incoming = tmp_path / "incoming"
    folder = incoming / "pune"
    folder.mkdir(parents=True)
    (folder / "99acres.json").write_text(json.dumps({
        "listings": [
            {"id": "1", "title": "Sunshine", "locality": "Wakad", "city": "Pune",
             "operation": "sale", "price": "1 Cr",
             "url": "https://www.99acres.com/sunshine"},
            {"id": "1", "title": "Sunshine duplicate", "locality": "Wakad", "city": "Pune",
             "operation": "sale", "price": "1 Cr",
             "url": "https://www.99acres.com/sunshine"},
            {"id": "2", "title": "Outside", "locality": "Wakad", "city": "Mumbai",
             "operation": "sale", "url": "https://www.99acres.com/outside"},
        ]
    }))
    output, stats = import_city_feeds("pune", incoming=incoming, output_root=tmp_path / "out")
    assert len(output) == 1
    assert stats["99acres"]["accepted"] == 1
    assert stats["99acres"]["skipped"] == 2
    saved = json.loads((tmp_path / "out" / "pune" / "portal_listings.json").read_text())
    assert saved == output
