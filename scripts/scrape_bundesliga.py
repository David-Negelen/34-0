#!/usr/bin/env python3
"""
Scrape Bundesliga squads from Transfermarkt for seasons 2025/26 → 2010/11.
Positions are fetched from each player's individual profile page using the
"Detailposition" panel (dd.detail-position__position).

Usage:
    source .venv/bin/activate
    python scripts/scrape_bundesliga.py

Resumes automatically — already-scraped (season, club) combos are skipped,
and player profiles already in the DB are not re-fetched.
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

DELAY = 2.5
RETRY_DELAY = 45.0


# ── Database ──────────────────────────────────────────────────────────────────

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

        -- positions fetched from the player's profile detail page
        CREATE TABLE IF NOT EXISTS player_positions (
            player_id  INTEGER NOT NULL,
            position   TEXT    NOT NULL,
            is_primary INTEGER DEFAULT 1,
            PRIMARY KEY (player_id, position),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- sentinel: player profile has been fetched (even if no positions found)
        CREATE TABLE IF NOT EXISTS player_profiles_fetched (
            player_id INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS squad_entries (
            season_year INTEGER NOT NULL,
            club_id     INTEGER NOT NULL,
            player_id   INTEGER NOT NULL,
            PRIMARY KEY (season_year, club_id, player_id),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- tracks which (season, club) squads are fully scraped
        CREATE TABLE IF NOT EXISTS scrape_log (
            season_year INTEGER NOT NULL,
            club_id     INTEGER NOT NULL,
            scraped_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (season_year, club_id)
        );
    """)
    con.commit()


# ── HTTP ──────────────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update(HEADERS)

def fetch(url: str, retries: int = 5) -> BeautifulSoup:
    for attempt in range(retries):
        try:
            time.sleep(DELAY)
            r = session.get(url, timeout=30)
            if r.status_code in (429, 502, 503):
                wait = RETRY_DELAY * (attempt + 1)
                print(f"    Rate-limited ({r.status_code}), waiting {wait:.0f}s …")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            wait = DELAY * (3 ** (attempt + 1))
            print(f"    Error: {e}, retrying ({attempt+1}/{retries}) in {wait:.0f}s …")
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_club_id_slug(href: str):
    m = re.search(r"/([^/]+)/[^/]+/verein/(\d+)", href)
    if m:
        return int(m.group(2)), m.group(1)
    return None, None

def parse_player_id(href: str):
    m = re.search(r"/spieler/(\d+)", href)
    return int(m.group(1)) if m else None

def make_profile_url(href: str) -> str:
    """Normalize any TM player href to the canonical /profil/spieler/ URL."""
    m = re.match(r"/([^/]+)/[^/]+/spieler/(\d+)", href)
    if m:
        return f"{BASE}/{m.group(1)}/profil/spieler/{m.group(2)}"
    return BASE + href

def season_label(year: int) -> str:
    return f"{year}/{str(year + 1)[-2:]}"


# ── Scrapers ──────────────────────────────────────────────────────────────────

def scrape_season_clubs(year: int) -> list[dict]:
    url = (
        f"{BASE}/bundesliga/startseite/wettbewerb/{BUNDESLIGA_ID}"
        f"/plus/?saison_id={year}"
    )
    print(f"  Fetching {season_label(year)} overview …")
    soup = fetch(url)

    clubs = []
    seen = set()
    for a in soup.select("table.items td.hauptlink a[href*='/verein/']"):
        href = a.get("href", "")
        tm_id, slug = parse_club_id_slug(href)
        if tm_id and tm_id not in seen:
            seen.add(tm_id)
            clubs.append({"tm_id": tm_id, "name": a.get_text(strip=True), "slug": slug})

    if not clubs:
        for a in soup.select("a[href*='/verein/']"):
            href = a.get("href", "")
            tm_id, slug = parse_club_id_slug(href)
            name = a.get_text(strip=True)
            if tm_id and name and tm_id not in seen:
                seen.add(tm_id)
                clubs.append({"tm_id": tm_id, "name": name, "slug": slug})

    return clubs


def scrape_squad(club: dict, year: int) -> list[dict]:
    """Return list of {tm_id, name, profile_url} — no positions here."""
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
        href = name_cell.get("href", "")
        player_id = parse_player_id(href)
        if not player_id or player_id in seen:
            continue
        seen.add(player_id)
        name = name_cell.get_text(strip=True)
        if not name:
            continue
        players.append({
            "tm_id": player_id,
            "name": name,
            "profile_url": make_profile_url(href),
        })

    return players


def scrape_player_positions(profile_url: str) -> list[str]:
    """Fetch the player's profile page; extract positions from the Detailposition panel."""
    soup = fetch(profile_url)
    positions = []
    for dd in soup.select("dd.detail-position__position"):
        pos = dd.get_text(strip=True)
        if pos:
            positions.append(pos)
    return positions


# ── DB helpers ────────────────────────────────────────────────────────────────

def save_season_clubs(con, year, clubs):
    con.execute(
        "INSERT OR IGNORE INTO seasons (year, label) VALUES (?, ?)",
        (year, season_label(year))
    )
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

def profile_already_fetched(con, player_id: int) -> bool:
    return con.execute(
        "SELECT 1 FROM player_profiles_fetched WHERE player_id=?", (player_id,)
    ).fetchone() is not None

def save_player_and_positions(con, player: dict, positions: list[str]):
    con.execute(
        "INSERT OR IGNORE INTO players (tm_id, name) VALUES (?, ?)",
        (player["tm_id"], player["name"])
    )
    for i, pos in enumerate(positions):
        con.execute(
            "INSERT OR IGNORE INTO player_positions (player_id, position, is_primary) "
            "VALUES (?, ?, ?)",
            (player["tm_id"], pos, 1 if i == 0 else 0)
        )
    con.execute(
        "INSERT OR IGNORE INTO player_profiles_fetched (player_id) VALUES (?)",
        (player["tm_id"],)
    )

def save_squad_entry(con, year, club_id, player_id):
    con.execute(
        "INSERT OR IGNORE INTO squad_entries (season_year, club_id, player_id) "
        "VALUES (?, ?, ?)",
        (year, club_id, player_id)
    )

def already_scraped(con, year, club_id) -> bool:
    return con.execute(
        "SELECT 1 FROM scrape_log WHERE season_year=? AND club_id=?",
        (year, club_id)
    ).fetchone() is not None

def mark_scraped(con, year, club_id):
    con.execute(
        "INSERT OR IGNORE INTO scrape_log (season_year, club_id) VALUES (?, ?)",
        (year, club_id)
    )
    con.commit()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    con = sqlite3.connect(DB_PATH)
    init_db(con)

    # 2025/26 down to 2004/05  (22 seasons)
    seasons = list(range(2025, 2003, -1))
    total = len(seasons)

    for i, year in enumerate(seasons, 1):
        print(f"\n[{i}/{total}] Season {season_label(year)}")

        clubs = scrape_season_clubs(year)
        if not clubs:
            print(f"  ⚠  No clubs found, skipping")
            continue
        print(f"  {len(clubs)} clubs")
        save_season_clubs(con, year, clubs)

        for j, club in enumerate(clubs, 1):
            if already_scraped(con, year, club["tm_id"]):
                print(f"  [{j}/{len(clubs)}] {club['name']} — skipped")
                continue

            print(f"  [{j}/{len(clubs)}] {club['name']} …", flush=True)
            try:
                players = scrape_squad(club, year)
            except Exception as e:
                print(f"    Squad fetch error: {e}")
                continue

            new_profiles = 0
            for k, p in enumerate(players, 1):
                if not profile_already_fetched(con, p["tm_id"]):
                    print(f"    [{k}/{len(players)}] {p['name']} … ", end="", flush=True)
                    try:
                        positions = scrape_player_positions(p["profile_url"])
                    except Exception as e:
                        print(f"ERROR: {e}")
                        positions = []
                    save_player_and_positions(con, p, positions)
                    pos_str = ", ".join(positions) if positions else "no position"
                    print(f"→ {pos_str}")
                    new_profiles += 1
                else:
                    print(f"    [{k}/{len(players)}] {p['name']} — cached")
                    con.execute(
                        "INSERT OR IGNORE INTO players (tm_id, name) VALUES (?, ?)",
                        (p["tm_id"], p["name"])
                    )
                save_squad_entry(con, year, club["tm_id"], p["tm_id"])

            con.commit()
            mark_scraped(con, year, club["tm_id"])
            print(f"  ✓ {club['name']}: {len(players)} players ({new_profiles} new profiles)")

    con.close()

    con = sqlite3.connect(DB_PATH)
    n_players = con.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    n_entries = con.execute("SELECT COUNT(*) FROM squad_entries").fetchone()[0]
    n_seasons = con.execute("SELECT COUNT(*) FROM seasons").fetchone()[0]
    n_pos     = con.execute("SELECT COUNT(DISTINCT player_id) FROM player_positions").fetchone()[0]
    con.close()

    print(f"\n✓ Done — {n_seasons} seasons, {n_players} players, {n_entries} squad entries")
    print(f"  {n_pos} players with position data")
    print(f"  Database: {DB_PATH}")


if __name__ == "__main__":
    main()
