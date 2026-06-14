#!/usr/bin/env python3
"""
Scrape 3. Liga (L3) and Frauen-Bundesliga (FBL) squads from Transfermarkt.
Each player profile fetch captures positions, birth date, and nationality in
one request, so no separate birth-year or nationality pass is needed.

Output DBs:
    dritte_liga_draft.db
    frauen_bundesliga_draft.db

Shared JSON (merged with existing data):
    src/data/playerBirthDates.json    { [tm_id]: "YYYY-MM-DD" | null }
    src/data/playerNationalities.json { [tm_id]: "Germany" | null }

Resume-safe: already-scraped (season, club) pairs are skipped, and player
profiles already in the DB are not re-fetched. Safe to run repeatedly.

Usage:
    source .venv/bin/activate
    python scripts/scrape_dritte_liga_frauen.py
"""

import json
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

BIRTH_DATES_PATH  = ROOT / "src" / "data" / "playerBirthDates.json"
NATIONALITIES_PATH = ROOT / "src" / "data" / "playerNationalities.json"

LEAGUES = [
    {
        "id":       "L3",
        "name":     "3. Liga",
        "db_path":  ROOT / "dritte_liga_draft.db",
        "seasons":  list(range(2024, 2009, -1)),  # 2024/25 → 2010/11
    },
    {
        "id":       "FBL",
        "name":     "Frauen-Bundesliga",
        "db_path":  ROOT / "frauen_bundesliga_draft.db",
        "seasons":  list(range(2024, 2014, -1)),  # 2024/25 → 2015/16
    },
]

BASE = "https://www.transfermarkt.de"

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

DELAY       = 2.5
RETRY_DELAY = 45.0


# ── Shared JSON state (loaded once, written after every profile) ──────────────

birth_dates:   dict[str, str | None] = {}
nationalities: dict[str, str | None] = {}

if BIRTH_DATES_PATH.exists():
    birth_dates = json.loads(BIRTH_DATES_PATH.read_text(encoding="utf-8"))
if NATIONALITIES_PATH.exists():
    nationalities = json.loads(NATIONALITIES_PATH.read_text(encoding="utf-8"))


def save_json():
    BIRTH_DATES_PATH.write_text(
        json.dumps(birth_dates, ensure_ascii=False), encoding="utf-8"
    )
    NATIONALITIES_PATH.write_text(
        json.dumps(nationalities, ensure_ascii=False), encoding="utf-8"
    )


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
            PRIMARY KEY (season_year, club_id)
        );

        CREATE TABLE IF NOT EXISTS players (
            tm_id       INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            birth_date  TEXT,
            nationality TEXT
        );

        CREATE TABLE IF NOT EXISTS player_positions (
            player_id  INTEGER NOT NULL,
            position   TEXT    NOT NULL,
            is_primary INTEGER DEFAULT 1,
            PRIMARY KEY (player_id, position)
        );

        CREATE TABLE IF NOT EXISTS player_profiles_fetched (
            player_id INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS squad_entries (
            season_year INTEGER NOT NULL,
            club_id     INTEGER NOT NULL,
            player_id   INTEGER NOT NULL,
            PRIMARY KEY (season_year, club_id, player_id)
        );

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
            print(f"    Error: {e}, retrying ({attempt + 1}/{retries}) in {wait:.0f}s …")
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_club_id_slug(href: str):
    m = re.search(r"/([^/]+)/[^/]+/verein/(\d+)", href)
    if m:
        return int(m.group(2)), m.group(1)
    return None, None


def parse_player_id(href: str) -> int | None:
    m = re.search(r"/spieler/(\d+)", href)
    return int(m.group(1)) if m else None


def make_profile_url(href: str) -> str:
    m = re.match(r"/([^/]+)/[^/]+/spieler/(\d+)", href)
    if m:
        return f"{BASE}/{m.group(1)}/profil/spieler/{m.group(2)}"
    return BASE + href


def season_label(year: int) -> str:
    return f"{year}/{str(year + 1)[-2:]}"


# ── Profile parsing ───────────────────────────────────────────────────────────

def parse_player_profile(soup: BeautifulSoup) -> tuple[list[str], str | None, str | None]:
    """Returns (positions, birth_date_iso, nationality_str)."""

    positions = [dd.get_text(strip=True) for dd in soup.select("dd.detail-position__position")]

    # Birth date: itemprop="birthDate" contains text like "01.01.1990"
    birth_date = None
    bd_el = soup.find(attrs={"itemprop": "birthDate"})
    if bd_el:
        text = bd_el.get_text(strip=True)
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", text)
        if m:
            birth_date = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    # Nationality: itemprop first, then flag image fallback
    nationality = None
    nat_el = soup.find(attrs={"itemprop": "nationality"})
    if nat_el:
        nationality = nat_el.get_text(strip=True) or None
    if not nationality:
        for img in soup.select("img.flaggenrahmen"):
            title = img.get("title") or img.get("alt") or ""
            if title:
                nationality = title.strip()
                break

    return positions, birth_date, nationality


# ── Scrapers ──────────────────────────────────────────────────────────────────

def scrape_season_clubs(league_id: str, year: int) -> list[dict]:
    url = f"{BASE}/-/startseite/wettbewerb/{league_id}/plus/?saison_id={year}"
    soup = fetch(url)

    clubs = []
    seen: set[int] = set()

    for a in soup.select("table.items td.hauptlink a[href*='/verein/']"):
        href = a.get("href", "")
        tm_id, slug = parse_club_id_slug(href)
        if tm_id and tm_id not in seen:
            seen.add(tm_id)
            clubs.append({"tm_id": tm_id, "name": a.get_text(strip=True), "slug": slug})

    # Fallback: any /verein/ link
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
    url = (
        f"{BASE}/{club['slug']}/kader/verein/{club['tm_id']}"
        f"/saison_id/{year}/plus/1"
    )
    soup = fetch(url)

    players = []
    seen: set[int] = set()
    table = soup.find("table", class_="items")
    if not table:
        return players

    for row in table.select("tbody tr"):
        cell = row.select_one("td.hauptlink a[href*='/spieler/']")
        if not cell:
            continue
        href = cell.get("href", "")
        player_id = parse_player_id(href)
        if not player_id or player_id in seen:
            continue
        seen.add(player_id)
        name = cell.get_text(strip=True)
        if not name:
            continue
        players.append({
            "tm_id":       player_id,
            "name":        name,
            "profile_url": make_profile_url(href),
        })

    return players


# ── DB helpers ────────────────────────────────────────────────────────────────

def save_season_clubs(con, year, clubs):
    con.execute(
        "INSERT OR IGNORE INTO seasons (year, label) VALUES (?, ?)",
        (year, season_label(year))
    )
    for c in clubs:
        con.execute("INSERT OR IGNORE INTO clubs (tm_id, name, slug) VALUES (?, ?, ?)",
                    (c["tm_id"], c["name"], c["slug"]))
        con.execute("INSERT OR IGNORE INTO season_clubs (season_year, club_id) VALUES (?, ?)",
                    (year, c["tm_id"]))
    con.commit()


def profile_fetched(con, player_id: int) -> bool:
    return con.execute(
        "SELECT 1 FROM player_profiles_fetched WHERE player_id=?", (player_id,)
    ).fetchone() is not None


def save_player(con, player: dict, positions: list[str],
                birth_date: str | None, nationality: str | None):
    con.execute(
        "INSERT OR IGNORE INTO players (tm_id, name, birth_date, nationality) "
        "VALUES (?, ?, ?, ?)",
        (player["tm_id"], player["name"], birth_date, nationality)
    )
    # Update birth_date / nationality if previously NULL
    con.execute(
        "UPDATE players SET birth_date=COALESCE(birth_date,?), "
        "nationality=COALESCE(nationality,?) WHERE tm_id=?",
        (birth_date, nationality, player["tm_id"])
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

def scrape_league(league: dict):
    db_path   = league["db_path"]
    league_id = league["id"]
    seasons   = league["seasons"]

    print(f"\n{'='*60}")
    print(f"  {league['name']}  ({league_id})  →  {db_path.name}")
    print(f"{'='*60}")

    con = sqlite3.connect(db_path)
    init_db(con)

    total_seasons = len(seasons)
    for i, year in enumerate(seasons, 1):
        label = season_label(year)
        print(f"\n[{i}/{total_seasons}] Season {label}")

        clubs = scrape_season_clubs(league_id, year)
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
                tm_id_str = str(p["tm_id"])

                if not profile_fetched(con, p["tm_id"]):
                    print(f"    [{k}/{len(players)}] {p['name']} … ", end="", flush=True)
                    try:
                        soup = fetch(p["profile_url"])
                        positions, birth_date, nationality = parse_player_profile(soup)
                    except Exception as e:
                        print(f"ERROR: {e}")
                        positions, birth_date, nationality = [], None, None

                    save_player(con, p, positions, birth_date, nationality)

                    # Write to shared JSON files
                    if tm_id_str not in birth_dates or birth_dates[tm_id_str] is None:
                        birth_dates[tm_id_str] = birth_date
                    if tm_id_str not in nationalities or nationalities[tm_id_str] is None:
                        nationalities[tm_id_str] = nationality
                    save_json()

                    pos_str = ", ".join(positions) if positions else "no position"
                    nat_str = nationality or "?"
                    bd_str  = birth_date or "?"
                    print(f"→ {pos_str}  |  {bd_str}  |  {nat_str}")
                    new_profiles += 1
                else:
                    print(f"    [{k}/{len(players)}] {p['name']} — cached")
                    con.execute("INSERT OR IGNORE INTO players (tm_id, name) VALUES (?, ?)",
                                (p["tm_id"], p["name"]))

                save_squad_entry(con, year, club["tm_id"], p["tm_id"])

            con.commit()
            mark_scraped(con, year, club["tm_id"])
            print(f"  ✓ {club['name']}: {len(players)} players ({new_profiles} new profiles)")

    n_players = con.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    n_entries = con.execute("SELECT COUNT(*) FROM squad_entries").fetchone()[0]
    n_seasons = con.execute("SELECT COUNT(*) FROM seasons").fetchone()[0]
    con.close()

    print(f"\n  DB: {n_seasons} seasons, {n_players} unique players, {n_entries} squad entries → {db_path.name}")


def main():
    for league in LEAGUES:
        scrape_league(league)

    print(f"\n✓ All leagues done.")
    print(f"  Birth dates:   {len(birth_dates)} entries → {BIRTH_DATES_PATH.name}")
    print(f"  Nationalities: {len(nationalities)} entries → {NATIONALITIES_PATH.name}")


if __name__ == "__main__":
    main()
