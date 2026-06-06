#!/usr/bin/env python3
"""
Export Bundesliga player data from bundesliga_draft.db to src/data/players.js.
Exports all seasons >= 2015. Each player gets a full seasons array with one
entry per (club, season) appearance. Ratings are placeholders (75) — replace later.

Usage:
    python scripts/export_players_js.py
"""

import sqlite3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "bundesliga_draft.db"
OUT_PATH = ROOT / "src" / "data" / "players.js"

MIN_YEAR = 2015  # cap: 2015-16 and later

POSITION_MAP = {
    "Torwart":               "GK",
    "Innenverteidiger":      "CB",
    "Libero":                "CB",
    "Rechter Verteidiger":   "RB",
    "Linker Verteidiger":    "LB",
    "Defensives Mittelfeld": "DM",
    "Zentrales Mittelfeld":  "CM",
    "Linkes Mittelfeld":     "LW",
    "Rechtes Mittelfeld":    "RW",
    "Offensives Mittelfeld": "AM",
    "Hängende Spitze":       "SS",
    "Linksaußen":            "LW",
    "Rechtsaußen":           "RW",
    "Mittelstürmer":         "ST",
}

CLUB_NAME_MAP = {
    "FC Bayern München":        "Bayern München",
    "1.FC Köln":                "1. FC Köln",
    "1.FC Union Berlin":        "1. FC Union Berlin",
    "1.FSV Mainz 05":           "1. FSV Mainz 05",
    "1.FC Nürnberg":            "1. FC Nürnberg",
    "1.FC Heidenheim 1846":     "1. FC Heidenheim",
    "Bayer 04 Leverkusen":      "Bayer 04 Leverkusen",
    "Borussia Dortmund":        "Borussia Dortmund",
    "Borussia Mönchengladbach": "Borussia Mönchengladbach",
    "Eintracht Frankfurt":      "Eintracht Frankfurt",
    "FC Augsburg":              "FC Augsburg",
    "FC Ingolstadt 04":         "FC Ingolstadt 04",
    "FC Schalke 04":            "FC Schalke 04",
    "FC St. Pauli":             "FC St. Pauli",
    "Fortuna Düsseldorf":       "Fortuna Düsseldorf",
    "Hamburger SV":             "Hamburger SV",
    "Hannover 96":              "Hannover 96",
    "Hertha BSC":               "Hertha BSC",
    "Holstein Kiel":            "Holstein Kiel",
    "RB Leipzig":               "RB Leipzig",
    "SC Freiburg":              "SC Freiburg",
    "SC Paderborn 07":          "SC Paderborn 07",
    "SV Darmstadt 98":          "SV Darmstadt 98",
    "SV Werder Bremen":         "Werder Bremen",
    "SpVgg Greuther Fürth":     "SpVgg Greuther Fürth",
    "TSG 1899 Hoffenheim":      "TSG Hoffenheim",
    "VfB Stuttgart":            "VfB Stuttgart",
    "VfL Bochum":               "VfL Bochum",
    "VfL Wolfsburg":            "VfL Wolfsburg",
    "Arminia Bielefeld":        "Arminia Bielefeld",
}

CLUBS_META = {
    "Bayern München":           {"color": "#DC052D", "text": "#fff"},
    "Borussia Dortmund":        {"color": "#FDE100", "text": "#000"},
    "Bayer 04 Leverkusen":      {"color": "#E32221", "text": "#fff"},
    "RB Leipzig":               {"color": "#DD041B", "text": "#fff"},
    "Borussia Mönchengladbach": {"color": "#00A551", "text": "#fff"},
    "Eintracht Frankfurt":      {"color": "#E1000F", "text": "#fff"},
    "VfB Stuttgart":            {"color": "#E32221", "text": "#fff"},
    "SC Freiburg":              {"color": "#E32221", "text": "#fff"},
    "TSG Hoffenheim":           {"color": "#1465AA", "text": "#fff"},
    "VfL Wolfsburg":            {"color": "#65B32E", "text": "#fff"},
    "1. FC Union Berlin":       {"color": "#EB1923", "text": "#fff"},
    "Werder Bremen":            {"color": "#1D9C5A", "text": "#fff"},
    "FC Augsburg":              {"color": "#BA3C27", "text": "#fff"},
    "1. FC Köln":               {"color": "#E2001A", "text": "#fff"},
    "Hamburger SV":             {"color": "#0067B4", "text": "#fff"},
    "1. FSV Mainz 05":          {"color": "#C3122F", "text": "#fff"},
    "FC St. Pauli":             {"color": "#6B3526", "text": "#fff"},
    "1. FC Heidenheim":         {"color": "#E32221", "text": "#fff"},
    # historical clubs
    "FC Schalke 04":            {"color": "#004D9D", "text": "#fff"},
    "Hertha BSC":               {"color": "#003FA5", "text": "#fff"},
    "Hannover 96":              {"color": "#009900", "text": "#fff"},
    "1. FC Nürnberg":           {"color": "#960000", "text": "#fff"},
    "Arminia Bielefeld":        {"color": "#004895", "text": "#fff"},
    "FC Ingolstadt 04":         {"color": "#C41E3A", "text": "#fff"},
    "SC Paderborn 07":          {"color": "#0046AD", "text": "#fff"},
    "SV Darmstadt 98":          {"color": "#0D4F8B", "text": "#fff"},
    "Fortuna Düsseldorf":       {"color": "#EE1C25", "text": "#fff"},
    "Holstein Kiel":            {"color": "#003A8C", "text": "#fff"},
    "SpVgg Greuther Fürth":     {"color": "#006D3B", "text": "#fff"},
    "VfL Bochum":               {"color": "#005CA8", "text": "#fff"},
}

PLACEHOLDER_RATING = 75


def slugify(name: str) -> str:
    s = name.lower()
    for a, b in [("ä","ae"),("ö","oe"),("ü","ue"),("Ä","ae"),("Ö","oe"),("Ü","ue"),("ß","ss")]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def season_label(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def map_positions(raw: list[str]) -> list[str]:
    seen: list[str] = []
    for pos in raw:
        code = POSITION_MAP.get(pos)
        if code and code not in seen:
            seen.append(code)
    return seen or ["CM"]


def main():
    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    # One row per (player, club, season_year, position). All seasons >= MIN_YEAR.
    rows = con.execute("""
        SELECT
            p.tm_id,
            p.name,
            c.name       AS club_name,
            se.season_year,
            pp.position,
            pp.is_primary
        FROM squad_entries se
        JOIN players p ON p.tm_id  = se.player_id
        JOIN clubs   c ON c.tm_id  = se.club_id
        LEFT JOIN player_positions pp ON pp.player_id = p.tm_id
        WHERE se.season_year >= ?
        ORDER BY p.tm_id, se.season_year, pp.is_primary DESC, pp.position
    """, (MIN_YEAR,)).fetchall()
    con.close()

    # Build player map: tm_id → { name, positions_raw, seasons: set of (club, year) }
    players: dict[int, dict] = {}
    for row in rows:
        tm_id = row["tm_id"]
        raw_club = row["club_name"]
        club = CLUB_NAME_MAP.get(raw_club, raw_club)

        # skip clubs we don't have metadata for (keeps output clean)
        if club not in CLUBS_META:
            continue

        if tm_id not in players:
            players[tm_id] = {
                "tm_id":         tm_id,
                "name":          row["name"],
                "positions_raw": [],
                "seasons":       {},  # (club, year) → True, ordered by insertion
            }

        if row["position"] and row["position"] not in players[tm_id]["positions_raw"]:
            players[tm_id]["positions_raw"].append(row["position"])

        key = (club, row["season_year"])
        players[tm_id]["seasons"][key] = True

    lines: list[str] = []
    lines.append("// Auto-generated by scripts/export_players_js.py — do not edit by hand.")
    lines.append("")

    lines.append("export const CLUBS = {")
    for club, meta in CLUBS_META.items():
        lines.append(f"  {repr(club)}: {{ color: {repr(meta['color'])}, text: {repr(meta['text'])} }},")
    lines.append("};")
    lines.append("")

    lines.append("export const PLAYERS = [")
    skipped = 0
    for p in players.values():
        positions = map_positions(p["positions_raw"])
        season_entries = list(p["seasons"].keys())  # (club, year) pairs, insertion order
        if not season_entries:
            skipped += 1
            continue

        pid = slugify(p["name"]) + "_" + str(p["tm_id"])
        pos_js = "[" + ", ".join(f"'{pos}'" for pos in positions) + "]"

        seasons_js_parts = []
        for (club, year) in season_entries:
            sl = season_label(year)
            seasons_js_parts.append(
                f"{{ club: {repr(club)}, season: '{sl}', rating: {PLACEHOLDER_RATING} }}"
            )
        seasons_js = "[" + ", ".join(seasons_js_parts) + "]"

        lines.append("  {")
        lines.append(f"    id: '{pid}',")
        lines.append(f"    name: {repr(p['name'])},")
        lines.append(f"    positions: {pos_js},")
        lines.append(f"    seasons: {seasons_js},")
        lines.append(f"    primeRating: {PLACEHOLDER_RATING},")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")

    total = len(players) - skipped
    print(f"✓ {total} players → {OUT_PATH}  ({skipped} skipped — no known-club seasons)")
    season_counts: dict[str, int] = {}
    for p in players.values():
        for (club, year) in p["seasons"]:
            sl = season_label(year)
            season_counts[sl] = season_counts.get(sl, 0) + 1
    for sl, count in sorted(season_counts.items()):
        print(f"  {sl}: {count} squad entries")


if __name__ == "__main__":
    main()
