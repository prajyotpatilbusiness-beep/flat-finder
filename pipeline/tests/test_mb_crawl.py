import pytest

from mb_crawl import merge_project_parts


def test_merge_project_parts_restores_original_index_order():
    index = [
        {"mb_id": "a"},
        {"mb_id": "b"},
        {"mb_id": "c"},
    ]
    parts = [
        [{"mb_id": "c", "lat": 3}],
        [{"mb_id": "a", "lat": 1}, {"mb_id": "b", "lat": 2}],
    ]

    merged = merge_project_parts(index, parts)

    assert [row["mb_id"] for row in merged] == ["a", "b", "c"]
    assert [row["lat"] for row in merged] == [1, 2, 3]


def test_merge_project_parts_rejects_missing_rows():
    index = [{"mb_id": "a"}, {"mb_id": "b"}]

    with pytest.raises(ValueError, match="1 missing"):
        merge_project_parts(index, [[{"mb_id": "a"}]])


def test_merge_project_parts_rejects_duplicate_rows():
    index = [{"mb_id": "a"}]

    with pytest.raises(ValueError, match="Duplicate project id"):
        merge_project_parts(index, [[{"mb_id": "a"}], [{"mb_id": "a"}]])


def test_merge_project_parts_rejects_unexpected_rows():
    index = [{"mb_id": "a"}]

    with pytest.raises(ValueError, match="1 unexpected"):
        merge_project_parts(index, [[{"mb_id": "a"}, {"mb_id": "unexpected"}]])
