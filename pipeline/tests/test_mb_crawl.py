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



def test_partial_merge_reports_missing_index_ranges_without_faking_rows():
    from mb_crawl import merge_partial_project_parts

    index = [{"mb_id": str(i)} for i in range(6)]
    parts = [
        (0, 2, [{"mb_id": "0"}, {"mb_id": "1"}]),
        (4, 6, [{"mb_id": "4"}, {"mb_id": "5"}]),
    ]

    merged, coverage = merge_partial_project_parts(index, parts)

    assert [row["mb_id"] for row in merged] == ["0", "1", "4", "5"]
    assert coverage == {
        "expected": 6,
        "collected": 4,
        "complete": False,
        "covered_ranges": [
            {"start": 0, "end": 2, "count": 2},
            {"start": 4, "end": 6, "count": 2},
        ],
        "missing_ranges": [{"start": 2, "end": 4}],
    }


def test_partial_merge_rejects_rows_from_the_wrong_index_slice():
    from mb_crawl import merge_partial_project_parts

    index = [{"mb_id": "a"}, {"mb_id": "b"}]
    with pytest.raises(ValueError, match="does not match its index slice"):
        merge_partial_project_parts(index, [(0, 2, [{"mb_id": "b"}, {"mb_id": "a"}])])


def test_partial_merge_rejects_overlapping_batches():
    from mb_crawl import merge_partial_project_parts

    index = [{"mb_id": str(i)} for i in range(4)]
    with pytest.raises(ValueError, match="Overlapping"):
        merge_partial_project_parts(index, [
            (0, 3, [{"mb_id": "0"}, {"mb_id": "1"}, {"mb_id": "2"}]),
            (2, 4, [{"mb_id": "2"}, {"mb_id": "3"}]),
        ])
