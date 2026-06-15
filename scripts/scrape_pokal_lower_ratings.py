#!/usr/bin/env python3
"""
Scrape player OVR ratings for lower-tier DFB-Pokal clubs from fifaindex.com.
Stores raw scraped data into pokal_lower_draft.db (no player matching needed).
Only scrapes FIFA 21+ editions (when 3. Liga was added to FIFA).

Usage:
    python scripts/scrape_pokal_lower_ratings.py [--debug]

Reuses data/fifaindex_session.txt for auth. Resumes automatically.
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

ROOT         = Path(__file__).parent.parent
DB_PATH      = ROOT / "pokal_lower_draft.db"
CLUBS_FILE   = ROOT / "data" / "fifaindex_pokal_lower_clubs.txt"
SESSION_FILE = ROOT / "data" / "fifaindex_session.txt"
BASE         = "https://fifaindex.com"

DELAY       = 1.5
RETRY_DELAY = 30.0

# 3. Liga was added to FIFA in FIFA 18 (2017-18 season)
GAME_SLUG_TO_YEAR = {
    "fifa18": 2017,
    "fifa19": 2018,
    "fifa20": 2019,
    "fifa21": 2020,
    "fifa22": 2021,
    "fifa23": 2022,
    "fc24":   2023,
    "fc25":   2024,
    "fc26":   2025,
}

DEBUG = "--debug" in sys.argv


# ── DB ──────────────────────────────────────────────────────────────────────────

def init_db(con):
    con.executescript("""
        CREATE TABLE IF NOT EXISTS scraped_players (
            fi_player_id INTEGER,
            name         TEXT    NOT NULL,
            fi_club_id   INTEGER NOT NULL,
            season_year  INTEGER NOT NULL,
            rating       INTEGER NOT NULL,
            PRIMARY KEY (fi_club_id, season_year, fi_player_id)
        );
        CREATE TABLE IF NOT EXISTS fi_team_scraped (
            fi_club_id INTEGER NOT NULL,
            game_slug  TEXT    NOT NULL,
            PRIMARY KEY (fi_club_id, game_slug)
        );
    """)
    con.commit()


# ── Session ─────────────────────────────────────────────────────────────────────

def load_session():
    values = {}
    if SESSION_FILE.exists():
        for line in SESSION_FILE.read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if "=" in line:
                k, _, v = line.partition("=")
                values[k.strip()] = v.strip().strip("'\"")

    ua = values.get("user_agent", "")
    cookie_str = values.get("cookies", "")

    if not ua or ua == "PASTE_HERE" or not cookie_str or cookie_str == "PASTE_FULL_COOKIE_HEADER_HERE":
        sys.exit(
            f"\nFill in {SESSION_FILE} before running.\n"
            "  user_agent  →  Chrome console: navigator.userAgent\n"
            "  cookies     →  Network tab > any fifaindex request > Request Headers > Cookie"
        )

    sess = requests.Session()
    sess.headers.update({
        "User-Agent": ua,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://fifaindex.com/",
    })
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, _, val = part.partition("=")
            sess.cookies.set(name.strip(), val.strip(), domain="fifaindex.com")
    return sess


session = None


def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            time.sleep(DELAY)
            r = session.get(url, timeout=20)
            if r.status_code == 404:
                return None
            if r.status_code in (403, 429, 502, 503):
                wait = RETRY_DELAY * (attempt + 1)
                print(f"    Blocked ({r.status_code}), waiting {wait:.0f}s …")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"    Error: {e}, retrying …")
    raise RuntimeError(f"Failed: {url}")


# ── Parser ───────────────────────────────────────────────────────────────────────

def parse_team_page(soup):
    players = []
    seen = set()

    for row in soup.select("table tr"):
        if row.find("th"):
            continue
        player_link = row.select_one("a[href*='/spieler/']")
        if not player_link:
            continue
        name = player_link.get_text(strip=True)
        if not name or name in seen:
            continue
        seen.add(name)

        href = player_link.get("href", "")
        m = re.search(r"/spieler/(\d+)-", href)
        fi_player_id = int(m.group(1)) if m else None

        ovr = None
        for td in row.find_all("td"):
            cls = " ".join(td.get("class", []))
            if "font-bold" in cls and "font-heading" in cls:
                t = td.get_text(strip=True)
                if re.fullmatch(r"\d{2}", t):
                    ovr = int(t)
                    break

        if ovr:
            players.append({"name": name, "fi_player_id": fi_player_id, "ovr": ovr})
            if DEBUG:
                print(f"      {name}: {ovr}")
        elif DEBUG:
            print(f"      {name}: OVR not found")

    return players


# ── Clubs file ───────────────────────────────────────────────────────────────────

def load_clubs():
    """Return list of (fi_club_id, fi_slug) for lines with resolved IDs."""
    clubs = []
    for line in CLUBS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line or line.startswith("???"):
            continue
        m = re.match(r"^(\d+)-(.+)$", line)
        if m:
            clubs.append((int(m.group(1)), m.group(2).strip()))
        else:
            print(f"  ⚠  Malformed line ignored: {line!r}")
    return clubs


# ── Main ─────────────────────────────────────────────────────────────────────────

def run(con):
    clubs = load_clubs()
    if not clubs:
        print(f"No clubs with resolved IDs in {CLUBS_FILE}")
        return

    games = list(GAME_SLUG_TO_YEAR.items())
    print(f"Scraping {len(clubs)} clubs × {len(games)} editions …")

    for ci, (fi_club_id, fi_slug) in enumerate(clubs, 1):
        print(f"\n[{ci}/{len(clubs)}] {fi_club_id}-{fi_slug}")

        for game_slug, season_year in games:
            already = con.execute(
                "SELECT 1 FROM fi_team_scraped WHERE fi_club_id=? AND game_slug=?",
                (fi_club_id, game_slug)
            ).fetchone()
            if already:
                continue

            label = f"{season_year}-{str(season_year + 1)[-2:]}"
            print(f"  {game_slug:7s} ({label}) … ", end="", flush=True)

            url = f"{BASE}/de/teams/{fi_club_id}-{fi_slug}/{game_slug}/"
            try:
                soup = fetch(url)
            except Exception as e:
                print(f"ERROR: {e}")
                continue

            if DEBUG and soup:
                dump = ROOT / "data" / "debug_page.html"
                dump.write_text(soup.prettify(), encoding="utf-8")
                print(f"    [debug] HTML saved to {dump}")

            if soup is None:
                print("404 – not in this edition")
                con.execute(
                    "INSERT OR IGNORE INTO fi_team_scraped VALUES (?, ?)",
                    (fi_club_id, game_slug)
                )
                con.commit()
                continue

            squad = parse_team_page(soup)
            for p in squad:
                con.execute(
                    "INSERT OR REPLACE INTO scraped_players "
                    "(fi_player_id, name, fi_club_id, season_year, rating) VALUES (?,?,?,?,?)",
                    (p["fi_player_id"], p["name"], fi_club_id, season_year, p["ovr"])
                )
            con.execute(
                "INSERT OR IGNORE INTO fi_team_scraped VALUES (?, ?)",
                (fi_club_id, game_slug)
            )
            con.commit()
            print(f"{len(squad)} players")

    n = con.execute("SELECT COUNT(*) FROM scraped_players").fetchone()[0]
    print(f"\n✓ Done — {n} total scraped player-season entries in DB")


def main():
    global session
    session = load_session()
    con = sqlite3.connect(DB_PATH, timeout=60)
    init_db(con)
    run(con)
    con.close()


if __name__ == "__main__":
    main()
