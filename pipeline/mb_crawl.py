"""Polite, cached project crawler with small, artifact-friendly collection batches.

usage:
  python mb_crawl.py list <city>
  python mb_crawl.py projects <city>
  python mb_crawl.py projects-range <city> <start> <end>
  python mb_crawl.py merge <city>

Range indexes are zero-based and end-exclusive. Range output files can be
uploaded as separate GitHub Actions artifacts and merged after all batches finish.
"""
import gzip
import hashlib
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError

import mb_parse

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache" / "mb"
OUT = ROOT / "out"
CITIES = json.loads((ROOT.parent / "data" / "cities.json").read_text())
CITY = next((a for a in sys.argv[1:] if a in CITIES), "gurgaon")
CFG = CITIES[CITY]
LIST_URL = "https://www.magicbricks.com/residential-projects-in-" + CFG["magicbricks"] + "-nprid/page-{}"
OUT = OUT / CITY
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
DELAY = 1.0


def write_json(path, value):
    """Write complete JSON atomically so a checkpoint is never half-written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=0), encoding="utf-8")
    temp.replace(path)


def fetch(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html.gz")
    if f.exists() and f.stat().st_size > 2000:
        return gzip.decompress(f.read_bytes()).decode("utf-8", "ignore")
    for attempt in range(3):
        try:
            parts = urllib.parse.urlsplit(url)
            safe_path = urllib.parse.quote(parts.path, safe="/%:@!$&'()*+,;=-._~")
            request_url = urllib.parse.urlunsplit(
                (parts.scheme, parts.netloc, safe_path, parts.query, parts.fragment)
            )
            req = urllib.request.Request(request_url, headers={"User-Agent": UA})
            html = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "ignore")
            f.write_bytes(gzip.compress(html.encode("utf-8"), 9))
            time.sleep(DELAY)
            return html
        except HTTPError as e:
            if e.code in (404, 410):
                print("  unavailable", url, e, flush=True)
                return None
            print("  retry", attempt + 1, url, e, flush=True)
            time.sleep(5 * (attempt + 1))
        except Exception as e:  # network hiccup: back off and retry
            print("  retry", attempt + 1, url, e, flush=True)
            time.sleep(5 * (attempt + 1))
    return None


def crawl_list():
    first = fetch(LIST_URL.format(1))
    total = mb_parse.parse_total(first)
    if not total:
        raise RuntimeError("Could not read the total project count from the first listing page.")
    pages = -(-total // 20)
    projects = {}
    for n in range(1, pages + 1):
        html = fetch(LIST_URL.format(n))
        if not html:
            continue
        for c in mb_parse.parse_list_page(html):
            projects[c["psmid"]] = mb_parse.card_to_project(c)
        print(f"list {n}/{pages}: {len(projects)} projects", flush=True)
    if len(projects) < total * 0.95:
        raise RuntimeError(
            f"List crawl collected only {len(projects)} of {total} reported projects; "
            "refusing to checkpoint an incomplete index."
        )
    write_json(OUT / "mb_index.json", list(projects.values()))
    print("total reported", total, "collected", len(projects))


def merge_project_parts(index, parts):
    """Merge range outputs in original index order and reject missing/duplicate IDs."""
    by_id = {}
    for part in parts:
        for project in part:
            project_id = project.get("mb_id")
            if not project_id:
                raise ValueError("A project batch contains a row without mb_id.")
            if project_id in by_id:
                raise ValueError(f"Duplicate project id across batches: {project_id}")
            by_id[project_id] = project

    expected = [project["mb_id"] for project in index]
    expected_set = set(expected)
    missing = [project_id for project_id in expected if project_id not in by_id]
    extra = [project_id for project_id in by_id if project_id not in expected_set]
    if missing or extra:
        raise ValueError(
            f"Project batches do not match the index: {len(missing)} missing, "
            f"{len(extra)} unexpected."
        )
    return [by_id[project_id] for project_id in expected]



def merge_partial_project_parts(index, parts):
    """Merge available batches in index order and report every uncovered range."""
    if not parts:
        raise ValueError("No project batch files were found.")

    ordered = sorted(parts, key=lambda item: item[0])
    merged = []
    covered = []
    missing = []
    cursor = 0

    for start, end, rows in ordered:
        if start < 0 or end <= start or end > len(index):
            raise ValueError(f"Invalid batch range {start}:{end} for {len(index)} indexed projects.")
        if start < cursor:
            raise ValueError(f"Overlapping project batch at {start}:{end}.")
        if start > cursor:
            missing.append({"start": cursor, "end": start})

        expected = [project["mb_id"] for project in index[start:end]]
        actual = [project.get("mb_id") for project in rows]
        if len(rows) != end - start or actual != expected:
            raise ValueError(
                f"Batch {start}:{end} does not match its index slice "
                f"({len(rows)} rows; expected {end - start} in exact order)."
            )

        merged.extend(rows)
        covered.append({"start": start, "end": end, "count": len(rows)})
        cursor = end

    if cursor < len(index):
        missing.append({"start": cursor, "end": len(index)})

    coverage = {
        "expected": len(index),
        "collected": len(merged),
        "complete": len(merged) == len(index),
        "covered_ranges": covered,
        "missing_ranges": missing,
    }
    return merged, coverage

def crawl_projects(start=0, end=None, output_path=None):
    index = json.loads((OUT / "mb_index.json").read_text(encoding="utf-8"))
    end = len(index) if end is None else end
    if start < 0 or end < start or end > len(index):
        raise ValueError(f"Invalid project range {start}:{end} for {len(index)} projects.")
    selected = index[start:end]
    from concurrent.futures import ThreadPoolExecutor

    def one(project):
        html = fetch(project["url"])
        try:
            detail = mb_parse.parse_project_page(html) if html else {}
        except Exception as e:
            print("  parse failed", project["url"], e, flush=True)
            detail = {}
        return {
            **project,
            **{key: value for key, value in detail.items() if value not in (None, [], "")},
        }

    target = pathlib.Path(output_path) if output_path else (
        OUT / f"mb_projects_part_{start}_{end}.json"
        if (start or end != len(index))
        else OUT / "mb_projects.json"
    )
    out = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        for offset, merged in enumerate(executor.map(one, selected), 1):
            out.append(merged)
            if offset % 100 == 0 or offset == len(selected):
                print(f"project {start + offset}/{len(index)}", flush=True)
                write_json(target, out)
    if not selected:
        write_json(target, out)
    print(f"saved {len(out)} projects to {target}", flush=True)


def merge_projects():
    index = json.loads((OUT / "mb_index.json").read_text(encoding="utf-8"))
    part_files = sorted(OUT.glob("mb_projects_part_*.json"))
    if not part_files:
        raise RuntimeError("No project batch files were found.")
    parts = [json.loads(path.read_text(encoding="utf-8")) for path in part_files]
    merged = merge_project_parts(index, parts)
    write_json(OUT / "mb_projects.json", merged)
    print(f"merged {len(merged)} projects from {len(part_files)} batches", flush=True)


def merge_partial_projects():
    index = json.loads((OUT / "mb_index.json").read_text(encoding="utf-8"))
    part_files = list(OUT.glob("mb_projects_part_*.json"))
    parts = []
    for path in part_files:
        stem = path.stem.removeprefix("mb_projects_part_")
        try:
            start, end = (int(value) for value in stem.split("_", 1))
        except (TypeError, ValueError):
            raise ValueError(f"Invalid project batch filename: {path.name}")
        rows = json.loads(path.read_text(encoding="utf-8"))
        parts.append((start, end, rows))

    merged, coverage = merge_partial_project_parts(index, parts)
    write_json(OUT / "mb_projects.json", merged)
    write_json(OUT / "mb_coverage.json", coverage)
    print(
        f"merged {coverage['collected']:,}/{coverage['expected']:,} projects "
        f"from {len(parts)} batches; missing ranges: {coverage['missing_ranges']}",
        flush=True,
    )


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "list":
        crawl_list()
    elif command == "projects":
        crawl_projects()
    elif command == "projects-range":
        if len(sys.argv) != 5:
            raise SystemExit("usage: python mb_crawl.py projects-range <city> <start> <end>")
        crawl_projects(int(sys.argv[3]), int(sys.argv[4]))
    elif command == "merge":
        merge_projects()
    elif command == "merge-partial":
        merge_partial_projects()
    else:
        raise SystemExit(f"Unknown command: {command}")
