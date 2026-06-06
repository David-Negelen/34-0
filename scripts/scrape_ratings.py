#!/usr/bin/env python3
"""
Scrape player OVR ratings from fifaindex.com team pages into bundesliga_draft.db.

For each club in data/fifaindex_clubs.txt, scrapes the squad page for every
FIFA / EA FC edition to get per-player OVR ratings. Players are matched to
TM players by normalised name.

Usage:
    python scripts/scrape_ratings.py [--debug]

Fill in data/fifaindex_clubs.txt before running. Resumes automatically.
"""

import sqlite3
import time
import re
import sys
import unicodedata
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT       = Path(__file__).parent.parent
DB_PATH    = ROOT / "bundesliga_draft.db"
CLUBS_FILE = ROOT / "data" / "fifaindex_clubs.txt"
BASE       = "https://fifaindex.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://fifaindex.com/",
}

DELAY       = 2.5
RETRY_DELAY = 60.0

# game slug → season start year  (aligns with squad_entries.season_year)
GAME_SLUG_TO_YEAR: dict[str, int] = {
    "fc26":   2025,
    "fc25":   2024,
    "fc24":   2023,
    "fifa23": 2022,
    "fifa22": 2021,
    "fifa21": 2020,
    "fifa20": 2019,
    "fifa19": 2018,
    "fifa18": 2017,
    "fifa17": 2016,
    "fifa16": 2015,
    "fifa15": 2014,
    "fifa14": 2013,
    "fifa13": 2012,
    "fifa12": 2011,
    "fifa11": 2010,
    "fifa10": 2009,
    "fifa09": 2008,
    "fifa08": 2007,
    "fifa07": 2006,
    "fifa06": 2005,
    "fifa05": 2004,
}

DEBUG = "--debug" in sys.argv


# ── DB ─────────────────────────────────────────────────────────────────────────

def init_db(con: sqlite3.Connection):
    con.executescript("""
        CREATE TABLE IF NOT EXISTS player_ratings (
            player_id   INTEGER NOT NULL,
            season_year INTEGER NOT NULL,
            rating      INTEGER NOT NULL,
            PRIMARY KEY (player_id, season_year),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- tracks which (fi_club_id, game_slug) pages have been scraped
        CREATE TABLE IF NOT EXISTS fi_team_scraped (
            fi_club_id INTEGER NOT NULL,
            game_slug  TEXT    NOT NULL,
            PRIMARY KEY (fi_club_id, game_slug)
        );
    """)
    con.commit()


# ── HTTP ───────────────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update(HEADERS)

def fetch(url: str, retries: int = 4) -> BeautifulSoup | None:
    """Returns None on 404. Raises on persistent errors."""
    for attempt in range(retries):
        try:
            time.sleep(DELAY)
            r = session.get(url, timeout=30)
            if r.status_code == 404:
                return None
            if r.status_code in (403, 429, 502, 503):
                wait = RETRY_DELAY * (attempt + 1)
                print(f"    Rate-limited ({r.status_code}), waiting {wait:.0f}s …")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            wait = DELAY * (3 ** attempt)
            print(f"    Error: {e}, retrying in {wait:.0f}s …")
            time.sleep(wait)
    raise RuntimeError(f"Failed: {url}")


# ── Name normalisation ─────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    nfd = unicodedata.normalize("NFD", name)
    ascii_only = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z ]", "", ascii_only.lower()).strip()

def name_score(a: str, b: str) -> float:
    na, nb = normalize(a), normalize(b)
    if na == nb:
        return 1.0
    ta, tb = set(na.split()), set(nb.split())
    if not ta or not tb:
        return 0.0
    # use min so "Robert Lewandowski" still matches "Robert Lewandowski-Perkovic"
    return len(ta & tb) / min(len(ta), len(tb))


# ── Clubs file ─────────────────────────────────────────────────────────────────

def load_clubs() -> list[tuple[int, str]]:
    """Parse fifaindex_clubs.txt → [(fi_club_id, fi_slug), …]"""
    if not CLUBS_FILE.exists():
        return []
    clubs = []
    for line in CLUBS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        m = re.match(r"^(\d+)-(.+)$", line)
        if m:
            clubs.append((int(m.group(1)), m.group(2).strip()))
        else:
            print(f"  ⚠  Malformed line ignored: {line!r}")
    return clubs


# ── Team page parser ───────────────────────────────────────────────────────────

def parse_team_page(soup: BeautifulSoup) -> list[dict]:
    """
    Extract players from a fifaindex team page.
    Returns [{"name": str, "fi_player_id": int|None, "ovr": int}]

    fifaindex table layout (each <tr>):
      # | Name (link) | Country | Position | Age | OVR | POT | Contract | Value | Wage
    OVR and POT are rendered as coloured badge spans.
    We take the FIRST badge number per row → OVR.
    """
    players = []
    seen: set[str] = set()

    for row in soup.select("table tr"):
        if row.find("th"):
            continue

        player_link = row.select_one("a[href*='/players/']")
        if not player_link:
            continue

        name = player_link.get_text(strip=True)
        if not name or name in seen:
            continue
        seen.add(name)

        href = player_link.get("href", "")
        m = re.search(r"/players/(\d+)-", href)
        fi_player_id = int(m.group(1)) if m else None

        # First badge-style span with a 2-digit number → OVR
        ovr = None
        for span in row.select("span"):
            t = span.get_text(strip=True)
            if re.fullmatch(r"[5-9]\d", t):
                ovr = int(t)
                break

        # Fallback: scan <td> text values
        if ovr is None:
            for td in row.find_all("td"):
                t = td.get_text(strip=True)
                if re.fullmatch(r"[5-9]\d", t):
                    ovr = int(t)
                    break

        if ovr:
            players.append({"name": name, "fi_player_id": fi_player_id, "ovr": ovr})
            if DEBUG:
                print(f"      {name}: {ovr}")
        elif DEBUG:
            print(f"      {name}: OVR not found")

    return players


# ── Main scraper ───────────────────────────────────────────────────────────────

def run(con: sqlite3.Connection):
    clubs = load_clubs()
    if not clubs:
        print(f"\nNo clubs found in {CLUBS_FILE}")
        print("Add entries like:  21-bayern-munchen")
        return

    # Build name index from DB for fast matching
    db_players = con.execute("SELECT tm_id, name FROM players").fetchall()
    norm_exact: dict[str, int] = {}
    norm_list: list[tuple[str, int, str]] = []   # (raw_name, tm_id, normalized)
    for tm_id, name in db_players:
        key = normalize(name)
        norm_exact[key] = tm_id
        norm_list.append((name, tm_id, key))

    THRESHOLD = 0.80

    def find_tm_id(scraped_name: str) -> tuple[int | None, float]:
        key = normalize(scraped_name)
        if key in norm_exact:
            return norm_exact[key], 1.0
        best_id, best_score = None, 0.0
        for _, tm_id, nk in norm_list:
            s = name_score(scraped_name, _)
            if s > best_score:
                best_score = s
                best_id = tm_id
        return (best_id if best_score >= THRESHOLD else None), best_score

    games = list(GAME_SLUG_TO_YEAR.items())   # newest first

    for ci, (fi_club_id, fi_slug) in enumerate(clubs, 1):
        print(f"\n[{ci}/{len(clubs)}] {fi_club_id}-{fi_slug}")

        for game_slug, season_year in games:
            already = con.execute(
                "SELECT 1 FROM fi_team_scraped WHERE fi_club_id=? AND game_slug=?",
                (fi_club_id, game_slug)
            ).fetchone()
            if already:
                continue

            url = f"{BASE}/teams/{fi_club_id}-{fi_slug}/{game_slug}/"
            label = f"{season_year}-{str(season_year + 1)[-2:]}"
            print(f"  {game_slug:7s} ({label}) … ", end="", flush=True)

            try:
                soup = fetch(url)
            except Exception as e:
                print(f"ERROR: {e}")
                continue

            if soup is None:
                print("404 – club not in this edition, skipped")
                con.execute(
                    "INSERT OR IGNORE INTO fi_team_scraped (fi_club_id, game_slug) VALUES (?, ?)",
                    (fi_club_id, game_slug)
                )
                con.commit()
                continue

            squad = parse_team_page(soup)
            matched = unmatched = 0
            for p in squad:
                tm_id, score = find_tm_id(p["name"])
                if tm_id:
                    con.execute(
                        "INSERT OR REPLACE INTO player_ratings "
                        "(player_id, season_year, rating) VALUES (?, ?, ?)",
                        (tm_id, season_year, p["ovr"])
                    )
                    matched += 1
                else:
                    unmatched += 1
                    if DEBUG:
                        print(f"    ✗ no match: {p['name']!r} (best score={score:.2f})")

            con.execute(
                "INSERT OR IGNORE INTO fi_team_scraped (fi_club_id, game_slug) VALUES (?, ?)",
                (fi_club_id, game_slug)
            )
            con.commit()
            suffix = f" ({unmatched} unmatched)" if unmatched else ""
            print(f"{len(squad)} players, {matched} matched{suffix}")

    n = con.execute("SELECT COUNT(*) FROM player_ratings").fetchone()[0]
    print(f"\n✓ Done — {n} total rating entries in DB")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")
    if not CLUBS_FILE.exists():
        sys.exit(
            f"Clubs file not found: {CLUBS_FILE}\n"
            "Create it with one club per line, e.g.:  21-bayern-munchen\n"
            "Find club IDs at https://fifaindex.com/teams/"
        )

    con = sqlite3.connect(DB_PATH, timeout=60)
    init_db(con)
    run(con)
    con.close()


if __name__ == "__main__":
    main()
