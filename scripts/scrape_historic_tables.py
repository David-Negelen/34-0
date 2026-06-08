#!/usr/bin/env python3
"""
Scrape final Bundesliga / 2. Bundesliga tables from Transfermarkt.
Outputs src/data/historicTables.js — { league: { club: { 'YY/YY': { pos, pts } } } }

Usage:
    source .venv/bin/activate
    python scripts/scrape_historic_tables.py
"""

import time
import sys
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT     = Path(__file__).parent.parent
OUT_PATH = ROOT / "src" / "data" / "historicTables.js"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.transfermarkt.de/",
}

DELAY = 2.5

# Maps TM full names → canonical names used in players.js / players2bl.js
CLUB_NAME_MAP = {
    # Bundesliga
    "FC Bayern München":        "Bayern München",
    "Borussia Dortmund":        "Borussia Dortmund",
    "RB Leipzig":               "RB Leipzig",
    "VfB Stuttgart":            "VfB Stuttgart",
    "TSG 1899 Hoffenheim":      "TSG Hoffenheim",
    "Bayer 04 Leverkusen":      "Bayer 04 Leverkusen",
    "SC Freiburg":              "SC Freiburg",
    "Eintracht Frankfurt":      "Eintracht Frankfurt",
    "FC Augsburg":              "FC Augsburg",
    "1.FSV Mainz 05":           "1. FSV Mainz 05",
    "1. FSV Mainz 05":          "1. FSV Mainz 05",
    "1.FC Union Berlin":        "1. FC Union Berlin",
    "1. FC Union Berlin":       "1. FC Union Berlin",
    "Borussia Mönchengladbach": "Borussia Mönchengladbach",
    "Hamburger SV":             "Hamburger SV",
    "1.FC Köln":                "1. FC Köln",
    "1. FC Köln":               "1. FC Köln",
    "SV Werder Bremen":         "Werder Bremen",
    "VfL Wolfsburg":            "VfL Wolfsburg",
    "1.FC Heidenheim 1846":     "1. FC Heidenheim",
    "FC St. Pauli":             "FC St. Pauli",
    "Hertha BSC":               "Hertha BSC",
    "FC Schalke 04":            "FC Schalke 04",
    "Hannover 96":              "Hannover 96",
    "Arminia Bielefeld":        "Arminia Bielefeld",
    "Holstein Kiel":            "Holstein Kiel",
    "SV Darmstadt 98":          "SV Darmstadt 98",
    "VfL Bochum":               "VfL Bochum",
    "1.FC Nürnberg":            "1. FC Nürnberg",
    "1. FC Nürnberg":           "1. FC Nürnberg",
    "Fortuna Düsseldorf":       "Fortuna Düsseldorf",
    "SpVgg Greuther Fürth":     "SpVgg Greuther Fürth",
    "FC Ingolstadt 04":         "FC Ingolstadt 04",
    "SC Paderborn 07":          "SC Paderborn 07",
    "Alemannia Aachen":         "Alemannia Aachen",
    "FC Energie Cottbus":       "FC Energie Cottbus",
    "FC Hansa Rostock":         "FC Hansa Rostock",
    "MSV Duisburg":             "MSV Duisburg",
    # 2BL-only clubs
    "1.FC Kaiserslautern":      "1. FC Kaiserslautern",
    "1. FC Kaiserslautern":     "1. FC Kaiserslautern",
    "1.FC Magdeburg":           "1. FC Magdeburg",
    "1. FC Magdeburg":          "1. FC Magdeburg",
    "Eintracht Braunschweig":   "Eintracht Braunschweig",
    "Preußen Münster":          "Preußen Münster",
    "Karlsruher SC":            "Karlsruher SC",
    "SV 07 Elversberg":         "SV Elversberg",
    "SV Elversberg":            "SV Elversberg",
    "SSV Jahn Regensburg":      "SSV Jahn Regensburg",
    "SG Dynamo Dresden":        "Dynamo Dresden",
    "SV Sandhausen":            "SV Sandhausen",
    "VfL Osnabrück":            "VfL Osnabrück",
    "SV Wehen Wiesbaden":       "SV Wehen Wiesbaden",
    "Würzburger Kickers":       "Würzburger Kickers",
    "TSV 1860 München":         "TSV 1860 München",
    "FSV Frankfurt":            "FSV Frankfurt",
    "FC Erzgebirge Aue":        "FC Erzgebirge Aue",
    "SSV Ulm 1846":             "SSV Ulm 1846",
    "VfR Aalen":                "VfR Aalen",
}

CLUB_BLACKLIST = {"RB Leipzig"}  # everyone hates them

LEAGUES = [
    {
        "key":   "bl",
        "url":   "https://www.transfermarkt.de/bundesliga/tabelle/wettbewerb/L1/saison_id/{year}",
        "years": range(2004, 2026),
    },
    {
        "key":   "2bl",
        "url":   "https://www.transfermarkt.de/2-bundesliga/tabelle/wettbewerb/L2/saison_id/{year}",
        "years": range(2012, 2026),
    },
]


def season_label(year):
    return f"{str(year)[2:]}/{str(year + 1)[2:]}"


def fetch_table(url):
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")

    table = soup.select_one("table.items")
    if not table:
        return []

    rows = []
    # Skip first tr (header); rows have no odd/even class on this page
    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 10:
            continue

        # td[0] = position, td[2] = club (with <a title="full name">), td[9] = points
        try:
            pos = int(tds[0].get_text(strip=True))
        except ValueError:
            continue

        name_a = tds[2].find("a")
        if not name_a:
            continue
        tm_name = (name_a.get("title") or name_a.get_text(strip=True)).strip()

        canonical = CLUB_NAME_MAP.get(tm_name)
        if not canonical:
            print(f"    UNMAPPED: '{tm_name}'")
            canonical = tm_name

        try:
            pts = int(tds[9].get_text(strip=True))
        except ValueError:
            continue

        rows.append({"pos": pos, "club": canonical, "pts": pts})

    return rows


def main():
    result = {"bl": {}, "2bl": {}}
    unmapped = set()

    for league in LEAGUES:
        key = league["key"]
        print(f"\n── {key.upper()} ──")

        for year in league["years"]:
            label = season_label(year)
            url   = league["url"].format(year=year)
            print(f"  {year} ({label})...", end=" ", flush=True)

            try:
                rows = fetch_table(url)
                if not rows:
                    print("no table found!")
                else:
                    print(f"{len(rows)} teams")
                    for row in rows:
                        club = row["club"]
                        if club in CLUB_BLACKLIST:
                            continue
                        if club not in result[key]:
                            result[key][club] = {}
                        result[key][club][label] = {"pos": row["pos"], "pts": row["pts"]}
            except Exception as e:
                print(f"ERROR: {e}")

            time.sleep(DELAY)

    # Write JS file
    lines = [
        "// Auto-generated by scripts/scrape_historic_tables.py — do not edit by hand.",
        "",
        "export const HISTORIC_TABLES = {",
    ]

    for league_key in ("bl", "2bl"):
        lines.append(f"  '{league_key}': {{")
        for club in sorted(result[league_key]):
            seasons = result[league_key][club]
            parts = [
                f"'{s}': {{ pos: {seasons[s]['pos']}, pts: {seasons[s]['pts']} }}"
                for s in sorted(seasons)
            ]
            lines.append(f"    '{club}': {{ {', '.join(parts)} }},")
        lines.append("  },")

    lines.append("};")
    OUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWrote {OUT_PATH}")
    print(f"BL clubs: {len(result['bl'])}, 2BL clubs: {len(result['2bl'])}")


if __name__ == "__main__":
    main()
