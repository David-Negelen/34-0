#!/usr/bin/env python3
"""
Scrape Bundesliga squads from Transfermarkt for seasons 2000/01 – 2025/26.
Stores: which clubs were in the league each season, and each club's full squad.
Player data: name + positions only (no DOB, nationality, ratings).

Usage:
    source .venv/bin/activate
    python scripts/scrape_bundesliga.py

Resumes automatically if interrupted — already-scraped season/club combos are skipped.
Output: bundesliga_draft.db
"""

import sqlite3
import time
import re
import sys
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "bundesliga_draft.db"

BASE = "https://www.transfermarkt.de"
BUNDESLIGA_ID = "L1"

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

DELAY = 2.0        # seconds between requests
RETRY_DELAY = 30.0 # seconds to wait after a 429/503


# ── Database setup ────────────────────────────────────────────────────────────

def init_db(con: sqlite3.Connection):
    con.executescript("""
        CREATE TABLE IF NOT EXISTS seasons (
            year  INTEGER PRIMARY KEY,
            label TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clubs (
            tm_id INTEGER PRIMARY KEY,
            name  TEXT NOT NULL,
            slug  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS season_clubs (
            season_year INTEGER NOT NULL,
            club_id     INTEGER NOT NULL,
            PRIMARY KEY (season_year, club_id),
            FOREIGN KEY (season_year) REFERENCES seasons(year),
            FOREIGN KEY (club_id)     REFERENCES clubs(tm_id)
        );

        CREATE TABLE IF NOT EXISTS players (
            tm_id INTEGER PRIMARY KEY,
            name  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS player_positions (
            player_id INTEGER NOT NULL,
            position  TEXT    NOT NULL,
            is_primary INTEGER DEFAULT 1,
            PRIMARY KEY (player_id, position),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        CREATE TABLE IF NOT EXISTS squad_entries (
            season_year INTEGER NOT NULL,
            club_id     INTEGER NOT NULL,
            player_id   INTEGER NOT NULL,
            PRIMARY KEY (season_year, club_id, player_id),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- Track which (season, club) squads are fully scraped
        CREATE TABLE IF NOT EXISTS scrape_log (
            season_year INTEGER NOT NULL,
            club_id     INTEGER NOT NULL,
            scraped_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (season_year, club_id)
        );
    """)
    con.commit()


# ── HTTP helpers ──────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update(HEADERS)

def fetch(url: str, retries: int = 3) -> BeautifulSoup:
    for attempt in range(retries):
        try:
            time.sleep(DELAY)
            r = session.get(url, timeout=20)
            if r.status_code in (429, 503):
                print(f"    Rate-limited ({r.status_code}), waiting {RETRY_DELAY}s …")
                time.sleep(RETRY_DELAY)
                continue
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            print(f"    Error: {e}, retrying ({attempt+1}/{retries}) …")
            time.sleep(DELAY * 3)
    raise RuntimeError(f"Failed to fetch {url}")


# ── Parsing helpers ───────────────────────────────────────────────────────────

def parse_club_id_slug(href: str):
    """'/fc-bayern-muenchen/startseite/verein/27' → (27, 'fc-bayern-muenchen')"""
    m = re.search(r"/([^/]+)/[^/]+/verein/(\d+)", href)
    if m:
        return int(m.group(2)), m.group(1)
    return None, None

def parse_player_id(href: str):
    """/manuel-neuer/profil/spieler/17259  → 17259"""
    m = re.search(r"/spieler/(\d+)", href)
    return int(m.group(1)) if m else None

def season_label(year: int) -> str:
    """2000 → '2000-01'"""
    return f"{year}-{str(year + 1)[-2:]}"


# ── Season overview scraper ───────────────────────────────────────────────────

def scrape_season_clubs(year: int) -> list[dict]:
    """Return list of {tm_id, name, slug} for all clubs in the given season."""
    url = (
        f"{BASE}/bundesliga/startseite/wettbewerb/{BUNDESLIGA_ID}"
        f"/plus/?saison_id={year}"
    )
    print(f"  Fetching season {season_label(year)} overview …")
    soup = fetch(url)

    clubs = []
    seen = set()

    # Club links appear in the main items table
    for a in soup.select("table.items td.hauptlink a[href*='/verein/']"):
        href = a.get("href", "")
        tm_id, slug = parse_club_id_slug(href)
        if tm_id and tm_id not in seen:
            seen.add(tm_id)
            clubs.append({"tm_id": tm_id, "name": a.get_text(strip=True), "slug": slug})

    if not clubs:
        # Fallback: any verein link in the page
        for a in soup.select("a[href*='/verein/']"):
            href = a.get("href", "")
            tm_id, slug = parse_club_id_slug(href)
            name = a.get_text(strip=True)
            if tm_id and name and tm_id not in seen:
                seen.add(tm_id)
                clubs.append({"tm_id": tm_id, "name": name, "slug": slug})

    return clubs


# ── Squad scraper ─────────────────────────────────────────────────────────────

def scrape_squad(club: dict, year: int) -> list[dict]:
    """Return list of {tm_id, name, positions: [str]} for the club's season squad."""
    url = (
        f"{BASE}/{club['slug']}/kader/verein/{club['tm_id']}"
        f"/saison_id/{year}/plus/1"
    )
    soup = fetch(url)

    players = []
    seen = set()

    table = soup.find("table", class_="items")
    if not table:
        return players

    for row in table.select("tbody tr"):
        name_cell = row.select_one("td.hauptlink a[href*='/spieler/']")
        if not name_cell:
            continue
        player_id = parse_player_id(name_cell.get("href", ""))
        if not player_id or player_id in seen:
            continue
        seen.add(player_id)

        name = name_cell.get_text(strip=True)
        if not name:
            continue

        # Positions: collect all td[title] values that match known position strings.
        # TM puts the main position in a title attribute; the first match is primary.
        positions = []
        for td in row.find_all("td"):
            title = td.get("title", "").strip()
            if _is_position(title) and title not in positions:
                positions.append(title)

        players.append({"tm_id": player_id, "name": name, "positions": positions})

    return players

# Known German position strings from Transfermarkt
_TM_POSITIONS = {
    "Torwart",
    "Innenverteidiger", "Rechter Verteidiger", "Linker Verteidiger", "Libero",
    "Defensives Mittelfeld", "Zentrales Mittelfeld", "Offensives Mittelfeld",
    "Rechtes Mittelfeld", "Linkes Mittelfeld",
    "Mittelstürmer", "Linksaußen", "Rechtsaußen", "Hängende Spitze",
    # English equivalents (TM sometimes uses these)
    "Goalkeeper", "Centre-Back", "Right-Back", "Left-Back",
    "Defensive Midfield", "Central Midfield", "Attacking Midfield",
    "Right Midfield", "Left Midfield",
    "Centre-Forward", "Left Winger", "Right Winger", "Second Striker",
}

def _is_position(text: str) -> bool:
    return text in _TM_POSITIONS


# ── Persistence ───────────────────────────────────────────────────────────────

def save_season_clubs(con: sqlite3.Connection, year: int, clubs: list[dict]):
    label = season_label(year)
    con.execute("INSERT OR IGNORE INTO seasons (year, label) VALUES (?, ?)", (year, label))
    for c in clubs:
        con.execute(
            "INSERT OR IGNORE INTO clubs (tm_id, name, slug) VALUES (?, ?, ?)",
            (c["tm_id"], c["name"], c["slug"])
        )
        con.execute(
            "INSERT OR IGNORE INTO season_clubs (season_year, club_id) VALUES (?, ?)",
            (year, c["tm_id"])
        )
    con.commit()

def save_squad(con: sqlite3.Connection, year: int, club_id: int, players: list[dict]):
    for p in players:
        con.execute(
            "INSERT OR IGNORE INTO players (tm_id, name) VALUES (?, ?)",
            (p["tm_id"], p["name"])
        )
        # Upsert positions (take the first as primary, rest as secondary)
        for i, pos in enumerate(p["positions"]):
            con.execute(
                "INSERT OR IGNORE INTO player_positions (player_id, position, is_primary) "
                "VALUES (?, ?, ?)",
                (p["tm_id"], pos, 1 if i == 0 else 0)
            )
        con.execute(
            "INSERT OR IGNORE INTO squad_entries (season_year, club_id, player_id) "
            "VALUES (?, ?, ?)",
            (year, club_id, p["tm_id"])
        )
    con.execute(
        "INSERT OR IGNORE INTO scrape_log (season_year, club_id) VALUES (?, ?)",
        (year, club_id)
    )
    con.commit()

def already_scraped(con: sqlite3.Connection, year: int, club_id: int) -> bool:
    row = con.execute(
        "SELECT 1 FROM scrape_log WHERE season_year=? AND club_id=?",
        (year, club_id)
    ).fetchone()
    return row is not None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    con = sqlite3.connect(DB_PATH)
    init_db(con)

    seasons = range(2000, 2026)  # 2000/01 through 2025/26
    total = len(seasons)

    for i, year in enumerate(seasons, 1):
        print(f"\n[{i}/{total}] Season {season_label(year)}")

        # Step 1: get clubs for this season
        clubs = scrape_season_clubs(year)
        if not clubs:
            print(f"  ⚠  No clubs found for {year}, skipping")
            continue
        print(f"  {len(clubs)} clubs found")
        save_season_clubs(con, year, clubs)

        # Step 2: scrape each club's squad
        for j, club in enumerate(clubs, 1):
            if already_scraped(con, year, club["tm_id"]):
                print(f"  [{j}/{len(clubs)}] {club['name']} — already done, skipping")
                continue

            print(f"  [{j}/{len(clubs)}] {club['name']} …", end=" ", flush=True)
            try:
                players = scrape_squad(club, year)
                save_squad(con, year, club["tm_id"], players)
                print(f"{len(players)} players")
            except Exception as e:
                print(f"ERROR: {e}")
                # Don't mark as scraped so it can be retried

    con.close()

    # Summary
    con = sqlite3.connect(DB_PATH)
    n_players  = con.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    n_entries  = con.execute("SELECT COUNT(*) FROM squad_entries").fetchone()[0]
    n_seasons  = con.execute("SELECT COUNT(*) FROM seasons").fetchone()[0]
    con.close()

    print(f"\n✓ Done — {n_seasons} seasons, {n_players} unique players, {n_entries} squad entries")
    print(f"  Database: {DB_PATH}")


if __name__ == "__main__":
    main()
