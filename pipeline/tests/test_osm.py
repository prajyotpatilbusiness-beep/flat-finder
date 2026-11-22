import osm_fetch


def g(*pts):
    return [{"lon": x, "lat": y} for x, y in pts]


def test_ring_from_relation_joins_reversed_segments():
    el = {"members": [
        {"role": "outer", "geometry": g((0, 0), (1, 0), (1, 1))},
        {"role": "outer", "geometry": g((0, 0), (0, 1), (1, 1))},  # reversed direction
        {"role": "inner", "geometry": g((0.2, 0.2), (0.3, 0.2))},
    ]}
    rings = osm_fetch.ring_from_relation(el)
    assert len(rings) == 1
    assert rings[0][0] == rings[0][-1] and len(rings[0]) == 5


def test_height_of():
    assert osm_fetch.height_of({"height": "60 m"}) == 60
    assert osm_fetch.height_of({"building:levels": "10"}) == 32
    assert osm_fetch.height_of({}) is None


def test_poi_kind_covers_education_and_employment_places():
    assert osm_fetch.poi_kind({"amenity": "college"}) == "college"
    assert osm_fetch.poi_kind({"amenity": "university"}) == "university"
    assert osm_fetch.poi_kind({"landuse": "commercial", "name": "EON Free Zone"}) == "it_park"
    assert osm_fetch.poi_kind({"building": "office"}) == "office"
    assert osm_fetch.poi_kind({"office": "research", "name": "Science and Technology Park"}) == "office"
    assert osm_fetch.poi_kind({"name": "Science and Technology Park"}) is None
    assert osm_fetch.poi_kind({"tourism": "hotel", "name": "OYO Flagship IT Park"}) is None
    assert osm_fetch.poi_kind({"highway": "service", "name": "EON Free Zone Road"}) is None


def test_poi_record_links_to_osm_and_google_maps_without_guessing_address():
    p = osm_fetch.poi_record({"type": "node", "id": 42, "lat": 18.52, "lon": 73.85,
                              "tags": {"name": "Pune College", "amenity": "college"}}, "Pune")
    assert p["source"] == "https://www.openstreetmap.org/node/42"
    assert "google.com/maps/search" in p["gmaps"] and "Pune" in p["gmaps"]
    assert "address" not in p


def test_dedupe_pois_collapses_nearby_buildings_for_one_campus():
    p = {"k": "it_park", "name": "EON Free Zone", "lat": 18.55, "lng": 73.95}
    near = {**p, "lat": 18.5505, "lng": 73.9505}
    far = {**p, "lat": 18.60, "lng": 73.95}
    assert len(osm_fetch.dedupe_pois([p, near, far])) == 2
