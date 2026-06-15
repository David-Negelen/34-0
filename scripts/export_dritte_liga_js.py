#!/usr/bin/env python3
"""
Export 3. Liga player data from dritte_liga_draft.db to src/data/players3l.js.
Ratings are synthetic (placeholder) — run a rating scraper later to populate
player_ratings and re-export with real data.

Usage:
    python scripts/export_dritte_liga_js.py
"""

import sqlite3
import re
import sys
import random
import math
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "dritte_liga_draft.db"
OUT_PATH = ROOT / "src" / "data" / "players3l.js"

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
    # Normalize "1.FC" → "1. FC" / "1.FSV" → "1. FSV"
    "1.FC Kaiserslautern":      "1. FC Kaiserslautern",
    "1.FC Magdeburg":           "1. FC Magdeburg",
    "1.FC Saarbrücken":         "1. FC Saarbrücken",
    "1.FC Union Berlin":        "1. FC Union Berlin",
    "1.FC Heidenheim 1846":     "1. FC Heidenheim 1846",
    "1.FSV Mainz 05 II":        "1. FSV Mainz 05 II",
    # Alternate official names
    "SG Dynamo Dresden":        "Dynamo Dresden",
    "SV Werder Bremen II":      "Werder Bremen II",
    "Wuppertaler SV Borussia":  "Wuppertaler SV",
}

CLUBS_META = {
    # ── Original 34 ──────────────────────────────────────────────────────────
    "1. FC Heidenheim 1846":    {"color": "#CC0000", "text": "#fff"},
    "1. FC Kaiserslautern":     {"color": "#C5001A", "text": "#fff"},
    "1. FC Magdeburg":          {"color": "#0079C1", "text": "#fff"},
    "1. FC Saarbrücken":        {"color": "#003D80", "text": "#fff"},
    "1. FC Union Berlin":       {"color": "#CC0000", "text": "#fff"},
    "1. FSV Mainz 05 II":       {"color": "#CC0022", "text": "#fff"},
    "Alemannia Aachen":         {"color": "#FFCC00", "text": "#000"},
    "Arminia Bielefeld":        {"color": "#004895", "text": "#fff"},
    "Borussia Dortmund II":     {"color": "#FDE100", "text": "#000"},
    "Chemnitzer FC":            {"color": "#6E2B71", "text": "#fff"},
    "Dynamo Dresden":           {"color": "#FFCB00", "text": "#000"},
    "Eintracht Braunschweig":   {"color": "#E3D400", "text": "#003087"},
    "FC Bayern München II":     {"color": "#DC052D", "text": "#fff"},
    "FC Carl Zeiss Jena":       {"color": "#003B77", "text": "#fff"},
    "FC Energie Cottbus":       {"color": "#004F9E", "text": "#fff"},
    "FC Erzgebirge Aue":        {"color": "#7B2D8B", "text": "#fff"},
    "FC Hansa Rostock":         {"color": "#0066A2", "text": "#fff"},
    "FC Ingolstadt 04":         {"color": "#C41E3A", "text": "#fff"},
    "FC Viktoria 1889 Berlin":  {"color": "#003082", "text": "#fff"},
    "FC Viktoria Köln":         {"color": "#C41E3A", "text": "#fff"},
    "Fortuna Düsseldorf":       {"color": "#CC0022", "text": "#fff"},
    "FSV Frankfurt":            {"color": "#CC0000", "text": "#fff"},
    "FSV Zwickau":              {"color": "#CC0000", "text": "#fff"},
    "Hallescher FC":            {"color": "#D30000", "text": "#fff"},
    "Hannover 96 II":           {"color": "#D30034", "text": "#000"},
    "Holstein Kiel":            {"color": "#003C8A", "text": "#fff"},
    "Karlsruher SC":            {"color": "#009EE0", "text": "#fff"},
    "KFC Uerdingen 05":         {"color": "#CC0000", "text": "#fff"},
    "Kickers Emden":            {"color": "#00529F", "text": "#fff"},
    "Kickers Offenbach":        {"color": "#CC0000", "text": "#fff"},
    "MSV Duisburg":             {"color": "#003399", "text": "#fff"},
    "Preußen Münster":          {"color": "#003DA5", "text": "#fff"},
    "RB Leipzig":               {"color": "#CC0022", "text": "#fff"},
    "Rot Weiss Ahlen":          {"color": "#CC0000", "text": "#fff"},
    "Rot-Weiß Erfurt":          {"color": "#CC0000", "text": "#fff"},
    "Rot-Weiss Essen":          {"color": "#CC0000", "text": "#fff"},
    "Rot-Weiß Oberhausen":      {"color": "#CC0000", "text": "#fff"},
    "SC Freiburg II":           {"color": "#CC0000", "text": "#000"},
    "SC Fortuna Köln":          {"color": "#CC0000", "text": "#fff"},
    "SC Paderborn 07":          {"color": "#00489A", "text": "#fff"},
    "SC Verl":                  {"color": "#003C8A", "text": "#fff"},
    "SG Sonnenhof Großaspach":  {"color": "#009900", "text": "#fff"},
    "SpVgg Bayreuth":           {"color": "#009900", "text": "#fff"},
    "SpVgg Unterhaching":       {"color": "#228B22", "text": "#fff"},
    "Sportfreunde Lotte":       {"color": "#00843D", "text": "#fff"},
    "SSV Jahn Regensburg":      {"color": "#CC0000", "text": "#fff"},
    "SSV Ulm 1846":             {"color": "#CC0000", "text": "#fff"},
    "Stuttgarter Kickers":      {"color": "#005CA8", "text": "#fff"},
    "SV 07 Elversberg":         {"color": "#003C8A", "text": "#fff"},
    "SV Babelsberg 03":         {"color": "#CC0000", "text": "#000"},
    "SV Darmstadt 98":          {"color": "#005AA0", "text": "#fff"},
    "SV Meppen":                {"color": "#005CA8", "text": "#fff"},
    "SV Sandhausen":            {"color": "#006633", "text": "#fff"},
    "SV Waldhof Mannheim":      {"color": "#003082", "text": "#fff"},
    "SV Wacker Burghausen":     {"color": "#009B48", "text": "#fff"},
    "SV Wehen Wiesbaden":       {"color": "#BB0000", "text": "#fff"},
    "TSV 1860 München":         {"color": "#5B9AC8", "text": "#fff"},
    "TSV Havelse":              {"color": "#003C8A", "text": "#fff"},
    "TuS Koblenz":              {"color": "#CC0000", "text": "#fff"},
    "Türkgücü München":         {"color": "#C8102E", "text": "#fff"},
    "VfB Lübeck":               {"color": "#CC0000", "text": "#fff"},
    "VfB Oldenburg":            {"color": "#003C8A", "text": "#fff"},
    "VfB Stuttgart II":         {"color": "#E32221", "text": "#fff"},
    "VfL Osnabrück":            {"color": "#5D0A74", "text": "#fff"},
    "VfR Aalen":                {"color": "#CC0000", "text": "#fff"},
    "Werder Bremen II":         {"color": "#1D9C5A", "text": "#fff"},
    "Wuppertaler SV":           {"color": "#003082", "text": "#FDE100"},
    "Würzburger Kickers":       {"color": "#C80030", "text": "#fff"},
}

PLACEHOLDER_RATING = 62  # 3. Liga average

random.seed(42)


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


def synthetic_prime(num_seasons: int) -> int:
    """Placeholder rating based on career length in 3. Liga."""
    # Longer career = likely better player
    base = 55 + min(num_seasons, 9) * 1.2
    noise = random.gauss(0, 6)
    return int(max(50, min(74, round(base + noise))))


def main():
    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

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
    lines.append("// Auto-generated by scripts/export_dritte_liga_js.py — ratings are synthetic placeholders.")
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

        num_seasons = len(season_entries)
        prime = synthetic_prime(num_seasons)

        # Per-season rating: small variation around prime
        season_ratings = []
        for _ in season_entries:
            delta = random.randint(-3, 3)
            season_ratings.append(max(48, min(76, prime + delta)))

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
        lines.append(f"    primeRating: {prime},")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")

    total = len(players) - skipped
    print(f"✓ {total} players → {OUT_PATH}  ({skipped} skipped — no known-club seasons)")


if __name__ == "__main__":
    main()
