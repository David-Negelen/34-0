#!/usr/bin/env python3
"""
Scrape DFB-Pokal participants from Transfermarkt (2010/11 – 2024/25).
Outputs src/data/dfbPokalParticipants.js

Each entry: { club, season, tier }
  tier: 'bl' | '2bl' | '3l' | 'regional' | 'amateur'

Usage:
    source .venv/bin/activate
    python scripts/scrape_dfb_pokal.py
"""

import time
import sys
import re
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT     = Path(__file__).parent.parent
OUT_PATH = ROOT / "src" / "data" / "dfbPokalParticipants.js"

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

CLUB_BLACKLIST = {"RB Leipzig"}  # everyone hates them

# Season IDs on TM are the start year (2010 = 2010/11)
SEASONS = list(range(2010, 2025))  # 2010/11 through 2024/25

# Known name normalisations (extend as needed after inspection)
CLUB_NAME_MAP = {
    "FC Bayern München":            "Bayern München",
    "Borussia Dortmund":            "Borussia Dortmund",
    "SV Werder Bremen":             "Werder Bremen",
    "1.FSV Mainz 05":               "1. FSV Mainz 05",
    "1. FSV Mainz 05":              "1. FSV Mainz 05",
    "1.FC Köln":                    "1. FC Köln",
    "1. FC Köln":                   "1. FC Köln",
    "1.FC Union Berlin":            "1. FC Union Berlin",
    "1. FC Union Berlin":           "1. FC Union Berlin",
    "1.FC Kaiserslautern":          "1. FC Kaiserslautern",
    "1. FC Kaiserslautern":         "1. FC Kaiserslautern",
    "1.FC Heidenheim 1846":         "1. FC Heidenheim",
    "FC Heidenheim 1846":           "1. FC Heidenheim",
    "1. FC Heidenheim 1846":        "1. FC Heidenheim",
    "TSG 1899 Hoffenheim":          "TSG Hoffenheim",
    "Bayer 04 Leverkusen":          "Bayer 04 Leverkusen",
    "Borussia Mönchengladbach":     "Borussia Mönchengladbach",
    "1.FC Nürnberg":                "1. FC Nürnberg",
    "1. FC Nürnberg":               "1. FC Nürnberg",
    "1.FC Magdeburg":               "1. FC Magdeburg",
    "1. FC Magdeburg":              "1. FC Magdeburg",
    "SG Dynamo Dresden":            "Dynamo Dresden",
    "SSV Jahn Regensburg":          "SSV Jahn Regensburg",
    "SpVgg Greuther Fürth":         "SpVgg Greuther Fürth",
    "SV 07 Elversberg":             "SV Elversberg",
    "1.FC Saarbrücken":             "1. FC Saarbrücken",
    "1. FC Saarbrücken":            "1. FC Saarbrücken",
    "DSC Arminia Bielefeld":        "Arminia Bielefeld",
    "Arminia Bielefeld":            "Arminia Bielefeld",
    "FC Schalke 04":                "FC Schalke 04",
    "Hamburger SV":                 "Hamburger SV",
    "VfB Stuttgart":                "VfB Stuttgart",
    "SC Freiburg":                  "SC Freiburg",
    "Eintracht Frankfurt":          "Eintracht Frankfurt",
    "FC Augsburg":                  "FC Augsburg",
    "VfL Wolfsburg":                "VfL Wolfsburg",
    "VfL Bochum 1848":              "VfL Bochum",
    "VfL Bochum":                   "VfL Bochum",
    "Hertha BSC":                   "Hertha BSC",
    "Hannover 96":                  "Hannover 96",
    "Fortuna Düsseldorf":           "Fortuna Düsseldorf",
    "Eintracht Braunschweig":       "Eintracht Braunschweig",
    "SV Darmstadt 98":              "SV Darmstadt 98",
    "FC Ingolstadt 04":             "FC Ingolstadt 04",
    "SC Paderborn 07":              "SC Paderborn 07",
    "FC Energie Cottbus":           "FC Energie Cottbus",
    "FC Hansa Rostock":             "FC Hansa Rostock",
    "MSV Duisburg":                 "MSV Duisburg",
    "TSV 1860 München":             "TSV 1860 München",
    "Karlsruher SC":                "Karlsruher SC",
    "SSV Ulm 1846":                 "SSV Ulm 1846",
    "Holstein Kiel":                "Holstein Kiel",
    "FC St. Pauli":                 "FC St. Pauli",
    "SV Sandhausen":                "SV Sandhausen",
    "VfL Osnabrück":                "VfL Osnabrück",
    "SV Wehen Wiesbaden":           "SV Wehen Wiesbaden",
    "Preußen Münster":              "Preußen Münster",
    "Würzburger Kickers":           "Würzburger Kickers",
    "FC Erzgebirge Aue":            "FC Erzgebirge Aue",
}

def normalise(name):
    return CLUB_NAME_MAP.get(name, name)

def season_label(start_year):
    y1 = str(start_year)[2:]
    y2 = str(start_year + 1)[2:]
    return f"{y1}/{y2}"

def fetch_participants(season_start):
    url = f"https://www.transfermarkt.de/dfb-pokal/teilnehmer/pokalwettbewerb/DFB/saison_id/{season_start}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return []

    soup = BeautifulSoup(r.text, "lxml")
    entries = []

    # TM participant table: each row has club name + league column
    rows = soup.select("table.items tbody tr")
    for row in rows:
        cells = row.select("td")
        if len(cells) < 3:
            continue

        # Club name is in the first <td> with class "hauptlink"
        name_cell = row.select_one("td.hauptlink a")
        if not name_cell:
            continue
        raw_name = name_cell.get_text(strip=True)
        club = normalise(raw_name)

        if club in CLUB_BLACKLIST:
            continue

        entries.append({"club": club})

    return entries

def main():
    all_entries = []  # flat list of {club, season, tier}

    for year in SEASONS:
        label = season_label(year)
        print(f"Scraping {label} ...")
        participants = fetch_participants(year)
        print(f"  → {len(participants)} teams")

        for p in participants:
            all_entries.append({
                "club":   p["club"],
                "season": label,
            })

        time.sleep(DELAY)

    # Write JS — tier is derived at runtime from historicTables
    lines = ["// Auto-generated by scripts/scrape_dfb_pokal.py",
             "// DFB-Pokal participants 2010/11–2024/25",
             "// tier is resolved at runtime via historicTables",
             "",
             "export const dfbPokalParticipants = ["]

    for e in all_entries:
        lines.append(f"  {{ club: {json_str(e['club'])}, season: {json_str(e['season'])} }},")

    lines += ["];", ""]
    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {len(all_entries)} entries → {OUT_PATH}")

def json_str(s):
    return "'" + s.replace("'", "\\'") + "'"

if __name__ == "__main__":
    main()
