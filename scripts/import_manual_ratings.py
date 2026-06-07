#!/usr/bin/env python3
"""
Import manually entered ratings from data/missing_ratings.csv into the DB,
then regenerate src/data/players.js.

CSV format: tm_id, name, squad_years, rating
- Leave rating blank to skip a player.
- One rating is applied to ALL squad years for that player.
- Existing ratings in the DB are NOT overwritten (skip duplicates).

Usage:
    python scripts/import_manual_ratings.py
"""

import csv
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "bundesliga_draft.db"
CSV_PATH = ROOT / "data" / "missing_ratings.csv"


def main():
    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")
    if not CSV_PATH.exists():
        sys.exit(f"CSV not found: {CSV_PATH}")

    con = sqlite3.connect(DB_PATH)

    inserted = 0
    skipped_blank = 0
    skipped_exists = 0

    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rating_str = row["rating"].strip()
            if not rating_str:
                skipped_blank += 1
                continue

            tm_id = int(row["tm_id"])
            years = [int(y.strip()) for y in row["squad_years"].split(",") if y.strip()]

            # Support either a single rating (applied to all years) or
            # multiple comma-separated values matching squad_years in order.
            rating_parts = [p.strip() for p in rating_str.split(",") if p.strip()]
            if len(rating_parts) == 1:
                try:
                    single = int(rating_parts[0])
                except ValueError:
                    print(f"  SKIP bad rating '{rating_str}' for {row['name']}")
                    skipped_blank += 1
                    continue
                if not (40 <= single <= 99):
                    print(f"  SKIP out-of-range rating {single} for {row['name']}")
                    skipped_blank += 1
                    continue
                ratings_for_years = [single] * len(years)
            else:
                if len(rating_parts) != len(years):
                    print(f"  SKIP {row['name']}: {len(rating_parts)} ratings but {len(years)} years")
                    skipped_blank += 1
                    continue
                try:
                    ratings_for_years = [int(p) for p in rating_parts]
                except ValueError:
                    print(f"  SKIP bad rating '{rating_str}' for {row['name']}")
                    skipped_blank += 1
                    continue
                if any(not (40 <= r <= 99) for r in ratings_for_years):
                    print(f"  SKIP out-of-range values for {row['name']}: {ratings_for_years}")
                    skipped_blank += 1
                    continue

            for year, rating in zip(years, ratings_for_years):
                exists = con.execute(
                    "SELECT 1 FROM player_ratings WHERE player_id=? AND season_year=?",
                    (tm_id, year),
                ).fetchone()
                if exists:
                    skipped_exists += 1
                    continue
                con.execute(
                    "INSERT INTO player_ratings (player_id, season_year, rating) VALUES (?, ?, ?)",
                    (tm_id, year, rating),
                )
                inserted += 1


    con.commit()
    con.close()

    print(f"Inserted {inserted} rating rows  |  skipped {skipped_blank} blank  |  {skipped_exists} already existed")

    if inserted > 0:
        print("Regenerating src/data/players.js ...")
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "export_players_js.py")],
            check=True,
        )
    else:
        print("No new ratings — players.js not regenerated.")


if __name__ == "__main__":
    main()
