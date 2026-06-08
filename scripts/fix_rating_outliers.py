#!/usr/bin/env python3
"""
Detect and fix sudden mid-career rating DROPS in bundesliga_draft.db.

A season is a drop-outlier if its rating is >= THRESHOLD below the average
of its two immediate neighbours. Consecutive bad seasons are handled by
running multiple passes until the curve stabilises (up to MAX_PASSES).

Only interior points are considered (not first or last season of career).
Only drops are fixed — steep increases are left alone.

Usage:
    python scripts/fix_rating_outliers.py [--dry-run]
"""

import sqlite3
from pathlib import Path
import sys

ROOT       = Path(__file__).parent.parent
DB_PATH    = ROOT / "bundesliga_draft.db"
THRESHOLD  = 8        # a drop of this many points below neighbour avg is flagged
MAX_PASSES = 10
DRY_RUN    = "--dry-run" in sys.argv

con = sqlite3.connect(DB_PATH)
players = con.execute("SELECT tm_id, name FROM players").fetchall()
name_map = {tm_id: name for tm_id, name in players}


def find_fixes(ratings_by_player: dict) -> list[tuple[int, int, int, int]]:
    """Return list of (player_id, season_year, old_rating, new_rating)."""
    fixes = []
    for tm_id, rows in ratings_by_player.items():
        n = len(rows)
        if n < 2:
            continue
        # Interior points
        for i in range(1, n - 1):
            yr, rating = rows[i]
            prev_r = rows[i - 1][1]
            next_r = rows[i + 1][1]
            neighbour_avg = (prev_r + next_r) / 2
            if neighbour_avg - rating >= THRESHOLD:
                fixes.append((tm_id, yr, rating, round(neighbour_avg)))
        # Edge: last season drops below previous
        if n >= 2:
            yr, rating = rows[-1]
            if rows[-2][1] - rating >= THRESHOLD:
                fixes.append((tm_id, yr, rating, rows[-2][1]))
    return fixes


def load_ratings() -> dict:
    result = {}
    for tm_id, _ in players:
        rows = con.execute(
            "SELECT season_year, rating FROM player_ratings WHERE player_id=? ORDER BY season_year",
            (tm_id,)
        ).fetchall()
        result[tm_id] = list(rows)
    return result


total_fixed = 0
all_fixes_log: list[tuple[int, int, int, int]] = []

for pass_num in range(1, MAX_PASSES + 1):
    ratings = load_ratings()
    fixes = find_fixes(ratings)
    if not fixes:
        break

    # Apply in-memory so later passes in this round see updated values
    fix_map: dict[tuple[int, int], int] = {(pid, yr): new for pid, yr, _, new in fixes}

    for pid, rows in ratings.items():
        for i, (yr, r) in enumerate(rows):
            if (pid, yr) in fix_map:
                ratings[pid][i] = (yr, fix_map[(pid, yr)])

    all_fixes_log.extend(fixes)
    total_fixed += len(fixes)

    if not DRY_RUN:
        for pid, yr, old, new in fixes:
            con.execute(
                "UPDATE player_ratings SET rating=? WHERE player_id=? AND season_year=?",
                (new, pid, yr)
            )
        con.commit()

print(f"Passes run: {pass_num}  |  Total fixes: {total_fixed}  (threshold={THRESHOLD})\n")

# Deduplicate log — show only final state per (player, year)
final: dict[tuple[int, int], tuple[int, int]] = {}
for pid, yr, old, new in all_fixes_log:
    if (pid, yr) not in final:
        final[(pid, yr)] = (old, new)
    else:
        final[(pid, yr)] = (final[(pid, yr)][0], new)

for (pid, yr), (old, new) in sorted(final.items(), key=lambda x: name_map[x[0][0]]):
    print(f"  {name_map[pid]:<30s} {yr}-{str(yr+1)[2:]}  {old:3d} → {new:3d}")

if DRY_RUN:
    print("\n--dry-run: no changes written.")
else:
    print(f"\n✓ Done.")

con.close()
