#!/usr/bin/env python3
"""
Scrape squads for DFB-Pokal teams not already in players.js / players2bl.js.
Only needs name + position (no rating) — used for opponent scorer display.
Outputs src/data/pokalPlayers.js

Usage:
    source .venv/bin/activate
    python scripts/scrape_pokal_squads.py
"""

import json
import time
import re
import sys
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT     = Path(__file__).parent.parent
OUT_PATH = ROOT / "src" / "data" / "pokalPlayers.js"

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
BASE  = "https://www.transfermarkt.de"
DELAY = 2.5

POSITION_MAP = {
    "Torwart":               "GK",
    "Innenverteidiger":      "CB",
    "Libero":                "CB",
    "Rechter Verteidiger":   "RB",
    "Linker Verteidiger":    "LB",
    "Defensives Mittelfeld": "DM",
    "Zentrales Mittelfeld":  "CM",
    "Linkes Mittelfeld":     "LM",
    "Rechtes Mittelfeld":    "RM",
    "Offensives Mittelfeld": "AM",
    "Hängende Spitze":       "AM",
    "Linksaußen":            "LW",
    "Rechtsaußen":           "RW",
    "Mittelstürmer":         "ST",
}

# Club name → (slug, tm_id) cache to avoid repeated searches
_club_id_cache: dict = {}


def fetch(url: str) -> BeautifulSoup | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return BeautifulSoup(r.text, "lxml")
    except Exception as e:
        print(f"    FETCH ERROR {url}: {e}")
        return None


def find_club_on_tm(club_name: str) -> tuple[str, str] | None:
    """Search TM for club_name → (slug, tm_id) or None."""
    if club_name in _club_id_cache:
        return _club_id_cache[club_name]

    url = f"{BASE}/schnellsuche/ergebnis/schnellsuche?query={requests.utils.quote(club_name)}&Verein_page=0"
    soup = fetch(url)
    if not soup:
        return None

    # Results table for clubs (Vereine)
    for a in soup.select("table.items td.hauptlink a[href*='/verein/']"):
        href = a["href"]
        m = re.search(r"/([^/]+)/[^/]+/verein/(\d+)", href)
        if m:
            slug, tm_id = m.group(1), m.group(2)
            _club_id_cache[club_name] = (slug, tm_id)
            time.sleep(DELAY)
            return slug, tm_id

    _club_id_cache[club_name] = None
    return None


def scrape_squad(slug: str, tm_id: str, season_start: int) -> list[dict]:
    """Fetch squad page for (slug, tm_id) in season starting season_start year.
    Returns list of {name, position}."""
    url = f"{BASE}/{slug}/kader/verein/{tm_id}/saison_id/{season_start}/plus/1"
    soup = fetch(url)
    if not soup:
        return []

    players = []
    for row in soup.select("table.items tbody tr"):
        name_cell = row.select_one("td.hauptlink a[href*='/profil/spieler/']")
        if not name_cell:
            continue
        name = name_cell.get_text(strip=True)
        if not name:
            continue

        # Position: try inline td text or the position span
        pos_cell = row.select_one("td.posrela")
        raw_pos  = pos_cell.get_text(strip=True) if pos_cell else ""
        position = POSITION_MAP.get(raw_pos, "CM")  # default CM

        players.append({"name": name, "position": position})

    return players


def season_label_to_start(label: str) -> int:
    """'13/14' → 2013"""
    y = label.split("/")[0]
    return int("20" + y)


def season_label_to_key(label: str) -> str:
    """'13/14' → '2013-14'"""
    a, b = label.split("/")
    return f"20{a}-{b}"


def main():
    # ── Load existing covered (club, season) pairs ────────────────────────────
    # We read the JS files as text to extract club+season from seasons arrays.
    covered: set[tuple[str, str]] = set()
    for js_file in [ROOT / "src/data/players.js", ROOT / "src/data/players2bl.js"]:
        text = js_file.read_text(encoding="utf-8")
        for m in re.finditer(r"club:\s*'([^']+)'.*?season:\s*'([^']+)'", text):
            covered.add((m.group(1), m.group(2)))

    # ── Load Pokal participants ───────────────────────────────────────────────
    participants_text = (ROOT / "src/data/dfbPokalParticipants.js").read_text(encoding="utf-8")
    pairs = re.findall(r"\{\s*club:\s*'([^']+)',\s*season:\s*'([^']+)'\s*\}", participants_text)

    # Unique pairs not already covered
    missing = []
    seen = set()
    for club, season_label in pairs:
        season_key = season_label_to_key(season_label)
        key = (club, season_label)
        if (club, season_key) not in covered and key not in seen:
            missing.append((club, season_label))
            seen.add(key)

    print(f"Missing pairs to scrape: {len(missing)}")

    # ── Resume: load already-scraped output if it exists ─────────────────────
    # We track scraped (club, season_label) in a sidecar JSON file
    done_path = ROOT / "scripts" / "_pokal_squads_done.json"
    results: dict = {}  # "club|season_label" → [{name, position}, ...]
    if done_path.exists():
        results = json.loads(done_path.read_text())
    print(f"Already done: {len(results)} pairs")

    # ── Scrape ────────────────────────────────────────────────────────────────
    for i, (club, season_label) in enumerate(missing):
        key = f"{club}|{season_label}"
        if key in results:
            continue

        season_start = season_label_to_start(season_label)
        print(f"  [{i+1}/{len(missing)}] {club} {season_label} ...")

        found = find_club_on_tm(club)
        if not found:
            print(f"    → not found on TM, skipping")
            results[key] = []
            done_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))
            continue

        slug, tm_id = found
        squad = scrape_squad(slug, tm_id, season_start)
        print(f"    → {len(squad)} players")
        results[key] = squad
        done_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))
        time.sleep(DELAY)

    # ── Write JS ──────────────────────────────────────────────────────────────
    lines = [
        "// Auto-generated by scripts/scrape_pokal_squads.py",
        "// Pokal-only squad data (lower-tier teams) — name + position only",
        "// Used for opponent scorer display; not draftable.",
        "",
        "export const POKAL_PLAYERS = [",
    ]

    for key, squad in results.items():
        if not squad:
            continue
        club, season_label = key.split("|", 1)
        season_key = season_label_to_key(season_label)
        for p in squad:
            pos = p["position"]
            name = p["name"].replace("'", "\\'")
            club_esc = club.replace("'", "\\'")
            lines.append(
                f"  {{ name: '{name}', positions: ['{pos}'], "
                f"seasons: [{{ club: '{club_esc}', season: '{season_key}', rating: 50 }}] }},"
            )

    lines += ["];", ""]
    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    total_players = sum(len(v) for v in results.values())
    print(f"\nWrote {total_players} players → {OUT_PATH}")


if __name__ == "__main__":
    main()
