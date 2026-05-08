#!/usr/bin/env python3
"""
find_unalbummed_takeout.py
──────────────────────────
Parses Google Takeout .tgz files and produces two CSVs:

  albummed_takeout.csv    — photos IN albums  (archive these first)
  unalbummed_takeout.csv  — photos NOT in any album  (delete these)

WORKFLOW
────────
  1. Run this script to generate the two CSVs.
  2. Load albummed_takeout.csv into the Chrome extension → Archive All.
     (This hides album photos from the main Google Photos view.)
  3. In Google Photos main view, shift-click to select all → Delete.
     (Only unalbummed photos are visible now.)
  4. Load albummed_takeout.csv into the extension again → Unarchive All.

RUN
───
    python find_unalbummed_takeout.py
"""

import csv
import json
import re
import tarfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

TAKEOUT_DIR    = Path.home() / "Downloads"
TGZ_GLOB       = "takeout-*.tgz"
YEAR_FOLDER_RE = re.compile(r"^Photos from \d{4}(\s*\(\d+\))?$")
SKIP_JSON      = {
    "metadata.json",
    "user-generated-memory-titles.json",
    "shared_album_comments.json",
    "print-subscriptions.json",
}


def is_year_folder(name: str) -> bool:
    return bool(YEAR_FOLDER_RE.match(name.strip()))


def photo_key(meta: dict) -> tuple:
    title = meta.get("title", "")
    ts    = (meta.get("photoTakenTime") or meta.get("creationTime") or {}).get("timestamp", "0")
    return (title, str(ts))


def parse_tgz(path: Path, photo_folders: dict, photo_info: dict) -> int:
    count = 0
    with tarfile.open(path, "r:gz") as tar:
        for member in tar.getmembers():
            name = member.name
            if not name.endswith(".json"):
                continue
            if "Google Photos" not in name:
                continue
            filename = name.rsplit("/", 1)[-1]
            if filename in SKIP_JSON:
                continue
            parts = name.split("/")
            if len(parts) < 4:
                continue
            folder_name = parts[-2]

            try:
                f = tar.extractfile(member)
                if f is None:
                    continue
                meta = json.loads(f.read())
            except Exception:
                continue

            key = photo_key(meta)

            if is_year_folder(folder_name):
                photo_folders[key].add("__year__")
            else:
                photo_folders[key].add(folder_name)

            # Keep the entry that has a URL when we see the same photo twice
            existing = photo_info.get(key)
            has_url  = bool(meta.get("url", "").strip())
            if existing is None or (has_url and not existing.get("url")):
                ts_raw = (meta.get("photoTakenTime") or meta.get("creationTime") or {}).get("timestamp", "0")
                try:
                    date_str = datetime.fromtimestamp(int(ts_raw), tz=timezone.utc).strftime("%Y-%m-%d")
                except Exception:
                    date_str = "unknown"

                photo_info[key] = {
                    "title":    meta.get("title", ""),
                    "taken":    (meta.get("photoTakenTime") or {}).get("formatted", ""),
                    "date_str": date_str,
                    "url":      meta.get("url", "").strip(),
                }

            count += 1
    return count


def write_csv(path: Path, photos: list):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["title", "date", "url", "taken"])
        w.writeheader()
        for item in photos:
            w.writerow({
                "title": item["title"],
                "date":  item["date_str"],
                "url":   item["url"],
                "taken": item["taken"],
            })


def main():
    tgz_files = sorted(TAKEOUT_DIR.glob(TGZ_GLOB))
    if not tgz_files:
        print(f"❌  No .tgz files found in {TAKEOUT_DIR}")
        return

    print(f"Found {len(tgz_files)} Takeout archive(s):")
    for f in tgz_files:
        print(f"  • {f.name}")
    print()

    photo_folders: dict[tuple, set]  = defaultdict(set)
    photo_info:    dict[tuple, dict] = {}

    for tgz in tgz_files:
        print(f"📦  Scanning {tgz.name} …")
        n = parse_tgz(tgz, photo_folders, photo_info)
        print(f"    → {n:,} metadata entries read")

    unalbummed = sorted(
        [photo_info[k] for k, v in photo_folders.items() if v == {"__year__"}],
        key=lambda p: p["date_str"]
    )
    albummed = sorted(
        [photo_info[k] for k, v in photo_folders.items() if v != {"__year__"}],
        key=lambda p: p["date_str"]
    )

    print(f"\n📊  Total unique photos  : {len(photo_folders):,}")
    print(f"📁  In albums            : {len(albummed):,}  → albummed_takeout.csv  (archive these)")
    print(f"📭  Not in any album     : {len(unalbummed):,}  → unalbummed_takeout.csv")

    no_url_a = sum(1 for p in albummed    if not p["url"])
    no_url_u = sum(1 for p in unalbummed  if not p["url"])
    if no_url_a or no_url_u:
        print(f"\n⚠️   Photos missing URL: {no_url_a} albummed, {no_url_u} unalbummed (will be skipped)")

    script_dir     = Path(__file__).parent.resolve()
    data_dir       = script_dir / "data"
    data_dir.mkdir(exist_ok=True)
    albummed_csv   = data_dir / "albummed_takeout.csv"
    unalbummed_csv = data_dir / "unalbummed_takeout.csv"

    write_csv(albummed_csv,   albummed)
    write_csv(unalbummed_csv, unalbummed)

    print(f"\n✅  {albummed_csv}   → {len(albummed):,} rows")
    print(f"✅  {unalbummed_csv} → {len(unalbummed):,} rows")

    print("\n── Next steps ──────────────────────────────────────────────")
    print("  1. Load albummed_takeout.csv into the Chrome extension")
    print("     and click Archive All.  (~57 photos, very fast.)")
    print("  2. In Google Photos main view, click the first photo's")
    print("     checkbox, scroll to bottom, Shift-click the last one,")
    print("     then click Delete.  (All 25k unalbummed photos.)")
    print("  3. Load albummed_takeout.csv again → Unarchive All.")
    print("────────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()
