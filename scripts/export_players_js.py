#!/usr/bin/env python3
"""
Export Bundesliga player data from bundesliga_draft.db to src/data/players.js.
Ratings are placeholders (75) — replace with real values later.

Usage:
    python scripts/export_players_js.py [--season YYYY]   (default: 2025)
"""

import sqlite3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "bundesliga_draft.db"
OUT_PATH = ROOT / "src" / "data" / "players.js"

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
    "Bayer 04 Leverkusen":      "Bayer 04 Leverkusen",
    "Borussia Dortmund":        "Borussia Dortmund",
    "Borussia Mönchengladbach": "Borussia Mönchengladbach",
    "Eintracht Frankfurt":      "Eintracht Frankfurt",
    "FC Augsburg":              "FC Augsburg",
    "FC St. Pauli":             "FC St. Pauli",
    "Hamburger SV":             "Hamburger SV",
    "RB Leipzig":               "RB Leipzig",
    "SC Freiburg":              "SC Freiburg",
    "SV Werder Bremen":         "Werder Bremen",
    "TSG 1899 Hoffenheim":      "TSG Hoffenheim",
    "VfB Stuttgart":            "VfB Stuttgart",
    "VfL Wolfsburg":            "VfL Wolfsburg",
    "1.FC Heidenheim 1846":     "1. FC Heidenheim",
}

CLUBS_META = {
    "Bayern München":           {"color": "#DC052D", "text": "#fff"},
    "Borussia Dortmund":        {"color": "#FDE100", "text": "#000"},
    "Bayer 04 Leverkusen":      {"color": "#E32221", "text": "#000"},
    "RB Leipzig":               {"color": "#001E62", "text": "#DD041B"},
    "Borussia Mönchengladbach": {"color": "#111111", "text": "#fff"},
    "Eintracht Frankfurt":      {"color": "#E1000F", "text": "#000"},
    "VfB Stuttgart":            {"color": "#E32221", "text": "#fff"},
    "SC Freiburg":              {"color": "#E32221", "text": "#000"},
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
    year = 2025
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--season" and i + 1 < len(sys.argv[1:]):
            year = int(sys.argv[i + 2])

    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    rows = con.execute("""
        SELECT
            p.tm_id,
            p.name,
            c.name  AS club_name,
            pp.position,
            pp.is_primary
        FROM squad_entries se
        JOIN players p ON p.tm_id = se.player_id
        JOIN clubs   c ON c.tm_id = se.club_id
        LEFT JOIN player_positions pp ON pp.player_id = p.tm_id
        WHERE se.season_year = ?
        ORDER BY p.tm_id, pp.is_primary DESC, pp.position
    """, (year,)).fetchall()
    con.close()

    # Group by player
    players: dict[int, dict] = {}
    for row in rows:
        tm_id = row["tm_id"]
        if tm_id not in players:
            players[tm_id] = {
                "tm_id":         tm_id,
                "name":          row["name"],
                "club":          CLUB_NAME_MAP.get(row["club_name"], row["club_name"]),
                "positions_raw": [],
            }
        if row["position"]:
            players[tm_id]["positions_raw"].append(row["position"])

    lines: list[str] = []
    lines.append("// Auto-generated by scripts/export_players_js.py — do not edit by hand.")
    lines.append("")

    lines.append("export const CLUBS = {")
    for club, meta in CLUBS_META.items():
        lines.append(f"  {repr(club)}: {{ color: {repr(meta['color'])}, text: {repr(meta['text'])} }},")
    lines.append("};")
    lines.append("")

    lines.append("export const PLAYERS = [")
    for p in players.values():
        positions = map_positions(p["positions_raw"])
        pid = slugify(p["name"]) + "_" + str(p["tm_id"])
        club = p["club"]
        season = season_label(year)
        pos_js = "[" + ", ".join(f"'{pos}'" for pos in positions) + "]"
        lines.append("  {")
        lines.append(f"    id: '{pid}',")
        lines.append(f"    name: {repr(p['name'])},")
        lines.append(f"    positions: {pos_js},")
        lines.append(f"    seasons: [{{ club: {repr(club)}, season: '{season}', rating: {PLACEHOLDER_RATING} }}],")
        lines.append(f"    primeRating: {PLACEHOLDER_RATING},")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")

    print(f"✓ {len(players)} players → {OUT_PATH}")
    pos_counts: dict[str, int] = {}
    for p in players.values():
        for pos in map_positions(p["positions_raw"]):
            pos_counts[pos] = pos_counts.get(pos, 0) + 1
    for pos, count in sorted(pos_counts.items()):
        print(f"  {pos}: {count}")


if __name__ == "__main__":
    main()
