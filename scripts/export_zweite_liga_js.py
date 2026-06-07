#!/usr/bin/env python3
"""
Export 2. Bundesliga player data from zweite_liga_draft.db to src/data/players2bl.js.
Exports all seasons >= 2013. Each player gets a full seasons array with one
entry per (club, season) appearance. Ratings filled from nearest known year.

Usage:
    python scripts/export_zweite_liga_js.py
"""

import sqlite3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "zweite_liga_draft.db"
OUT_PATH = ROOT / "src" / "data" / "players2bl.js"

MIN_YEAR = 2013

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
    "Hängende Spitze":       "AM",
    "Linksaußen":            "LW",
    "Rechtsaußen":           "RW",
    "Mittelstürmer":         "ST",
}

CLUB_NAME_MAP = {
    "1.FC Heidenheim 1846":     "1. FC Heidenheim",
    "1.FC Kaiserslautern":      "1. FC Kaiserslautern",
    "1.FC Köln":                "1. FC Köln",
    "1.FC Magdeburg":           "1. FC Magdeburg",
    "1.FC Nürnberg":            "1. FC Nürnberg",
    "1.FC Union Berlin":        "1. FC Union Berlin",
    "Arminia Bielefeld":        "Arminia Bielefeld",
    "Eintracht Braunschweig":   "Eintracht Braunschweig",
    "FC Energie Cottbus":       "FC Energie Cottbus",
    "FC Erzgebirge Aue":        "FC Erzgebirge Aue",
    "FC Hansa Rostock":         "FC Hansa Rostock",
    "FC Ingolstadt 04":         "FC Ingolstadt 04",
    "FC Schalke 04":            "FC Schalke 04",
    "FC St. Pauli":             "FC St. Pauli",
    "Fortuna Düsseldorf":       "Fortuna Düsseldorf",
    "FSV Frankfurt":            "FSV Frankfurt",
    "Hamburger SV":             "Hamburger SV",
    "Hannover 96":              "Hannover 96",
    "Hertha BSC":               "Hertha BSC",
    "Holstein Kiel":            "Holstein Kiel",
    "Karlsruher SC":            "Karlsruher SC",
    "MSV Duisburg":             "MSV Duisburg",
    "Preußen Münster":          "Preußen Münster",
    "RB Leipzig":               "RB Leipzig",
    "SC Freiburg":              "SC Freiburg",
    "SC Paderborn 07":          "SC Paderborn 07",
    "SG Dynamo Dresden":        "Dynamo Dresden",
    "SpVgg Greuther Fürth":     "SpVgg Greuther Fürth",
    "SSV Jahn Regensburg":      "SSV Jahn Regensburg",
    "SSV Ulm 1846":             "SSV Ulm 1846",
    "SV 07 Elversberg":         "SV Elversberg",
    "SV Darmstadt 98":          "SV Darmstadt 98",
    "SV Sandhausen":            "SV Sandhausen",
    "SV Wehen Wiesbaden":       "SV Wehen Wiesbaden",
    "SV Werder Bremen":         "Werder Bremen",
    "TSV 1860 München":         "TSV 1860 München",
    "VfB Stuttgart":            "VfB Stuttgart",
    "VfL Bochum":               "VfL Bochum",
    "VfL Osnabrück":            "VfL Osnabrück",
    "VfR Aalen":                "VfR Aalen",
    "Würzburger Kickers":       "Würzburger Kickers",
}

CLUBS_META = {
    # 2025/26 clubs
    "1. FC Kaiserslautern":     {"color": "#C5001A", "text": "#fff"},
    "1. FC Magdeburg":          {"color": "#0079C1", "text": "#fff"},
    "1. FC Nürnberg":           {"color": "#960000", "text": "#fff"},
    "Arminia Bielefeld":        {"color": "#004895", "text": "#fff"},
    "Dynamo Dresden":           {"color": "#FFCB00", "text": "#000"},
    "Eintracht Braunschweig":   {"color": "#E3D400", "text": "#003087"},
    "FC Schalke 04":            {"color": "#004D9D", "text": "#fff"},
    "Fortuna Düsseldorf":       {"color": "#EE1C25", "text": "#fff"},
    "Hannover 96":              {"color": "#009900", "text": "#fff"},
    "Hertha BSC":               {"color": "#003FA5", "text": "#fff"},
    "Holstein Kiel":            {"color": "#003A8C", "text": "#fff"},
    "Karlsruher SC":            {"color": "#003982", "text": "#fff"},
    "Preußen Münster":          {"color": "#003DA5", "text": "#fff"},
    "SC Paderborn 07":          {"color": "#0046AD", "text": "#fff"},
    "SV Elversberg":            {"color": "#003B7C", "text": "#fff"},
    "SV Darmstadt 98":          {"color": "#0D4F8B", "text": "#fff"},
    "SpVgg Greuther Fürth":     {"color": "#006D3B", "text": "#fff"},
    "VfL Bochum":               {"color": "#005CA8", "text": "#fff"},
    # other clubs that have appeared in 2BL
    "FC Energie Cottbus":       {"color": "#004F9E", "text": "#fff"},
    "FC Erzgebirge Aue":        {"color": "#7B2D8B", "text": "#fff"},
    "FC Hansa Rostock":         {"color": "#0066A2", "text": "#fff"},
    "FC Ingolstadt 04":         {"color": "#C41E3A", "text": "#fff"},
    "FC St. Pauli":             {"color": "#6B3526", "text": "#fff"},
    "FSV Frankfurt":            {"color": "#E2001A", "text": "#fff"},
    "Hamburger SV":             {"color": "#0067B4", "text": "#fff"},
    "1. FC Heidenheim":         {"color": "#E32221", "text": "#fff"},
    "1. FC Köln":               {"color": "#E2001A", "text": "#fff"},
    "1. FC Union Berlin":       {"color": "#EB1923", "text": "#fff"},
    "MSV Duisburg":             {"color": "#003399", "text": "#fff"},
    "RB Leipzig":               {"color": "#DD041B", "text": "#fff"},
    "SC Freiburg":              {"color": "#E32221", "text": "#fff"},
    "SSV Jahn Regensburg":      {"color": "#CC0000", "text": "#fff"},
    "SSV Ulm 1846":             {"color": "#1A1A1A", "text": "#fff"},
    "SV Sandhausen":            {"color": "#1D1D1B", "text": "#fff"},
    "SV Wehen Wiesbaden":       {"color": "#BB0000", "text": "#fff"},
    "TSV 1860 München":         {"color": "#5B9AC8", "text": "#fff"},
    "VfB Stuttgart":            {"color": "#E32221", "text": "#fff"},
    "VfL Osnabrück":            {"color": "#5D0A74", "text": "#fff"},
    "VfR Aalen":                {"color": "#CC0000", "text": "#fff"},
    "Werder Bremen":            {"color": "#1D9C5A", "text": "#fff"},
    "Würzburger Kickers":       {"color": "#C80030", "text": "#fff"},
}

PLACEHOLDER_RATING = 50


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

    ratings_lookup: dict[tuple[int, int], int] = {}
    player_all_ratings: dict[int, list[tuple[int, int]]] = {}
    for r in con.execute("SELECT player_id, season_year, rating FROM player_ratings").fetchall():
        ratings_lookup[(r["player_id"], r["season_year"])] = r["rating"]
        player_all_ratings.setdefault(r["player_id"], []).append((r["season_year"], r["rating"]))
    print(f"  {len(ratings_lookup)} rating entries loaded from DB")

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

    players: dict[int, dict] = {}
    for row in rows:
        tm_id = row["tm_id"]
        raw_club = row["club_name"]
        club = CLUB_NAME_MAP.get(raw_club, raw_club)

        if club not in CLUBS_META:
            continue

        if tm_id not in players:
            players[tm_id] = {
                "tm_id":         tm_id,
                "name":          row["name"],
                "positions_raw": [],
                "seasons":       {},
            }

        if row["position"] and row["position"] not in players[tm_id]["positions_raw"]:
            players[tm_id]["positions_raw"].append(row["position"])

        key = (club, row["season_year"])
        players[tm_id]["seasons"][key] = True

    lines: list[str] = []
    lines.append("// Auto-generated by scripts/export_zweite_liga_js.py — do not edit by hand.")
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
        season_entries = list(p["seasons"].keys())
        if not season_entries:
            skipped += 1
            continue

        pid = slugify(p["name"]) + "_" + str(p["tm_id"])
        pos_js = "[" + ", ".join(f"'{pos}'" for pos in positions) + "]"
        tm_id = p["tm_id"]

        season_ratings = [
            ratings_lookup.get((tm_id, year), PLACEHOLDER_RATING)
            for (_, year) in season_entries
        ]

        years = [year for (_, year) in season_entries]
        known = [(y, r) for y, r in zip(years, season_ratings) if r != PLACEHOLDER_RATING]
        squad_year_set = set(years)
        for y, r in player_all_ratings.get(tm_id, []):
            if y not in squad_year_set and r != PLACEHOLDER_RATING:
                known.append((y, r))
        if known:
            filled = []
            for y, r in zip(years, season_ratings):
                if r != PLACEHOLDER_RATING:
                    filled.append(r)
                else:
                    nearest = min(known, key=lambda kr: abs(kr[0] - y))[1]
                    filled.append(nearest)
            season_ratings = filled

        prime_rating = max(season_ratings) if season_ratings else PLACEHOLDER_RATING

        if prime_rating == PLACEHOLDER_RATING:
            skipped += 1
            continue

        seasons_js_parts = []
        for (club, year), rating in zip(season_entries, season_ratings):
            sl = season_label(year)
            seasons_js_parts.append(
                f"{{ club: {repr(club)}, season: '{sl}', rating: {rating} }}"
            )
        seasons_js = "[" + ", ".join(seasons_js_parts) + "]"

        lines.append("  {")
        lines.append(f"    id: '{pid}',")
        lines.append(f"    name: {repr(p['name'])},")
        lines.append(f"    positions: {pos_js},")
        lines.append(f"    seasons: {seasons_js},")
        lines.append(f"    primeRating: {prime_rating},")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")

    total = len(players) - skipped
    print(f"✓ {total} players → {OUT_PATH}  ({skipped} skipped — no known-club seasons or no ratings)")
    season_counts: dict[str, int] = {}
    for p in players.values():
        for (club, year) in p["seasons"]:
            sl = season_label(year)
            season_counts[sl] = season_counts.get(sl, 0) + 1
    for sl, count in sorted(season_counts.items()):
        print(f"  {sl}: {count} squad entries")


if __name__ == "__main__":
    main()
