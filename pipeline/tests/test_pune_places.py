from pune_places import build_directory

def test_pune_directory_separates_campuses_and_office_hubs():
    elements = [
        {"type":"node","id":1,"lat":18.52,"lon":73.85,"tags":{"name":"Sample University","amenity":"university"}},
        {"type":"way","id":2,"center":{"lat":18.55,"lon":73.94},"tags":{"name":"Sample IT Park","office":"it"}},
        {"type":"node","id":3,"lat":18.56,"lon":73.95,"tags":{"name":"Unrelated cafe","amenity":"cafe"}},
        {"type":"way","id":4,"center":{"lat":18.51,"lon":73.82},"tags":{"name":"Sample College","amenity":"college"}},
    ]
    result = build_directory(elements)
    assert [p["name"] for p in result["campuses"]] == ["Sample College", "Sample University"]
    assert [p["name"] for p in result["offices"]] == ["Sample IT Park"]
    assert result["licence"] == "Open Database Licence (ODbL) 1.0"
    assert all("source_url" in p for p in result["campuses"] + result["offices"])

def test_named_business_park_without_office_tag_is_included():
    result = build_directory([
        {"type":"relation","id":8,"center":{"lat":18.59,"lon":73.74},
         "tags":{"name":"Hinjawadi Technology Park Phase 1","landuse":"commercial"}}
    ])
    assert len(result["offices"]) == 1
    assert result["offices"][0]["kind"] == "business_park"
