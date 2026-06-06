#!/usr/bin/env python3
"""
Scrape player OVR ratings from fifaindex.com into bundesliga_draft.db.

Phase 1 — lookup:  for each player in DB, search fifaindex.com by name to find
                   their fifaindex player ID + URL slug.
Phase 2 — ratings: for each found player, fetch their career-history page and
                   extract OVR ratings for every FIFA/EA FC game edition.

Ratings are stored in player_ratings(player_id, season_year, rating).
season_year is the start year of the football season (e.g. 2016 for 2016-17),
which aligns directly with squad_entries.season_year.

Usage:
    source .venv/bin/activate
    python scripts/scrape_ratings.py [--phase 1|2|both] [--debug]

Resumes automatically — already-processed players are skipped.
"""

import sqlite3
import time
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import quote_plus

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT    = Path(__file__).parent.parent
DB_PATH = ROOT / "bundesliga_draft.db"
BASE    = "https://www.fifaindex.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.fifaindex.com/",
}

DELAY       = 3.0
RETRY_DELAY = 60.0

# Maps fifaindex URL game slug → season start year (= squad_entries.season_year)
# FC 26 covers the 2025-26 season → season_year = 2025
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
        -- Maps our TM player IDs to their fifaindex.com ID + slug.
        -- fifaindex_id IS NULL means we searched but couldn't find a match.
        CREATE TABLE IF NOT EXISTS fifaindex_lookup (
            player_id    INTEGER PRIMARY KEY,
            fifaindex_id INTEGER,
            slug         TEXT,
            searched_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- One row per (player, football-season) with the FIFA OVR rating.
        CREATE TABLE IF NOT EXISTS player_ratings (
            player_id   INTEGER NOT NULL,
            season_year INTEGER NOT NULL,
            rating      INTEGER NOT NULL,
            PRIMARY KEY (player_id, season_year),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- Sentinel: career page has been fetched for this player.
        CREATE TABLE IF NOT EXISTS ratings_fetched (
            player_id INTEGER PRIMARY KEY,
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );
    """)
    con.commit()


# ── HTTP ───────────────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update(HEADERS)

def fetch(url: str, retries: int = 4) -> BeautifulSoup:
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
            wait = DELAY * (3 ** attempt)
            print(f"    Error: {e}, retrying in {wait:.0f}s …")
            time.sleep(wait)
    raise RuntimeError(f"Failed: {url}")


# ── Name normalisation ─────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    """Lowercase, strip diacritics, keep only letters+spaces."""
    nfd = unicodedata.normalize("NFD", name)
    ascii_only = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z ]", "", ascii_only.lower()).strip()

def name_score(our_name: str, their_name: str) -> float:
    """0–1 similarity. 1 = exact (normalised) match."""
    a = normalize(our_name)
    b = normalize(their_name)
    if a == b:
        return 1.0
    # token overlap (handles reordered names / extra middle names)
    ta = set(a.split())
    tb = set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


# ── Phase 1: search fifaindex.com to find player IDs ─────────────────────────

def search_player(name: str) -> tuple[int | None, str | None]:
    """
    Search fifaindex.com for `name`.
    Returns (fifaindex_id, slug) or (None, None) if not found.

    fifaindex search URL: /players/?name=<encoded>
    Each result card links to /players/<id>-<slug>/
    """
    url = f"{BASE}/players/?name={quote_plus(name)}"
    try:
        soup = fetch(url)
    except Exception as e:
        print(f"    Search error for '{name}': {e}")
        return None, None

    if DEBUG:
        print(f"    [DEBUG] search URL: {url}")

    # Player result links look like: href="/players/12345-firstname-lastname/"
    # or href="/players/12345-firstname-lastname/fc26/"
    pattern = re.compile(r"/players/(\d+)-([^/]+)/(?:[a-z0-9]+/)?$")
    best_id, best_slug, best_score = None, None, 0.0

    for a in soup.select("a[href]"):
        href = a.get("href", "")
        m = pattern.match(href)
        if not m:
            continue
        fi_id   = int(m.group(1))
        slug    = m.group(2)
        # The display name is either in the link text or a nearby element
        display = a.get_text(" ", strip=True)
        if not display:
            # Try nearby heading
            parent = a.parent
            for el in (parent, parent.parent if parent else None):
                if el:
                    t = el.get_text(" ", strip=True)
                    if t:
                        display = t
                        break

        score = name_score(name, display) if display else 0.0
        if DEBUG and score > 0.3:
            print(f"      candidate: {fi_id}-{slug!r}  display={display!r}  score={score:.2f}")
        if score > best_score:
            best_score = score
            best_id, best_slug = fi_id, slug

    # Require a reasonable match
    THRESHOLD = 0.6
    if best_score >= THRESHOLD:
        return best_id, best_slug
    if DEBUG:
        print(f"    No match above threshold (best={best_score:.2f})")
    return None, None


def run_phase1(con: sqlite3.Connection):
    players = con.execute("""
        SELECT p.tm_id, p.name
        FROM players p
        WHERE NOT EXISTS (
            SELECT 1 FROM fifaindex_lookup fl WHERE fl.player_id = p.tm_id
        )
        ORDER BY p.name
    """).fetchall()

    total = len(players)
    print(f"\nPhase 1: searching {total} players on fifaindex.com …\n")

    for i, (tm_id, name) in enumerate(players, 1):
        print(f"  [{i}/{total}] {name} … ", end="", flush=True)
        fi_id, slug = search_player(name)
        if fi_id:
            print(f"→ {fi_id}-{slug}")
        else:
            print("→ not found")
        con.execute(
            "INSERT OR IGNORE INTO fifaindex_lookup (player_id, fifaindex_id, slug) VALUES (?, ?, ?)",
            (tm_id, fi_id, slug)
        )
        con.commit()

    found = con.execute(
        "SELECT COUNT(*) FROM fifaindex_lookup WHERE fifaindex_id IS NOT NULL"
    ).fetchone()[0]
    print(f"\nPhase 1 done — {found}/{total} players matched")


# ── Phase 2: scrape career ratings ────────────────────────────────────────────

def scrape_career(fifaindex_id: int, slug: str) -> dict[int, int]:
    """
    Fetch the player's profile page on fifaindex.com and extract career ratings.
    Returns { season_year: ovr_rating }.

    The career history section contains links whose href includes the game slug:
      /players/<id>-<slug>/fifa17/  →  game slug = "fifa17"  →  season_year = 2016

    The OVR rating is displayed near each link (in a sibling element or child span).
    """
    # Use the fc26 base page; career history is rendered for any game edition
    url = f"{BASE}/players/{fifaindex_id}-{slug}/fc26/"
    try:
        soup = fetch(url)
    except Exception as e:
        print(f"    Fetch error: {e}")
        return {}

    if DEBUG:
        print(f"    [DEBUG] career URL: {url}")

    ratings: dict[int, int] = {}

    # Career history links look like: href="/players/12345-slug/fc26/"
    # We iterate all <a> tags whose href contains our player's path
    player_path = f"/players/{fifaindex_id}-{slug}/"
    game_pattern = re.compile(
        re.escape(player_path) + r"(fc\d+|fifa\d+)/$",
        re.IGNORECASE,
    )

    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = game_pattern.search(href)
        if not m:
            continue
        game_slug = m.group(1).lower()
        season_year = GAME_SLUG_TO_YEAR.get(game_slug)
        if season_year is None:
            continue

        # OVR is typically shown as a number in/near the link
        # Try: text of the <a> itself, then look for a .rating or span child
        ovr = None

        # Attempt 1: direct child span with purely numeric text
        for span in a.find_all(["span", "div", "strong", "b"]):
            t = span.get_text(strip=True)
            if re.fullmatch(r"\d{2}", t):
                ovr = int(t)
                break

        # Attempt 2: the link text itself contains a 2-digit number
        if ovr is None:
            text = a.get_text(" ", strip=True)
            nums = re.findall(r"\b([5-9]\d)\b", text)  # realistic OVR range 50-99
            if nums:
                ovr = int(nums[-1])

        # Attempt 3: next sibling element
        if ovr is None:
            sib = a.find_next_sibling()
            if sib:
                t = sib.get_text(strip=True)
                if re.fullmatch(r"\d{2}", t):
                    ovr = int(t)

        if ovr and 50 <= ovr <= 99:
            ratings[season_year] = ovr
            if DEBUG:
                print(f"      {game_slug} → {season_year}: {ovr}")

    if not ratings and DEBUG:
        print("    [DEBUG] No ratings parsed. Raw HTML snippet:")
        print(soup.prettify()[:3000])

    return ratings


def run_phase2(con: sqlite3.Connection):
    rows = con.execute("""
        SELECT fl.player_id, p.name, fl.fifaindex_id, fl.slug
        FROM fifaindex_lookup fl
        JOIN players p ON p.tm_id = fl.player_id
        WHERE fl.fifaindex_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM ratings_fetched rf WHERE rf.player_id = fl.player_id
          )
        ORDER BY p.name
    """).fetchall()

    total = len(rows)
    print(f"\nPhase 2: fetching career ratings for {total} players …\n")

    for i, (tm_id, name, fi_id, slug) in enumerate(rows, 1):
        print(f"  [{i}/{total}] {name} ({fi_id}-{slug}) … ", end="", flush=True)
        ratings = scrape_career(fi_id, slug)
        if ratings:
            for season_year, rating in ratings.items():
                con.execute(
                    "INSERT OR REPLACE INTO player_ratings (player_id, season_year, rating) VALUES (?, ?, ?)",
                    (tm_id, season_year, rating)
                )
            print(f"→ {len(ratings)} seasons rated")
        else:
            print("→ no ratings found")
        con.execute(
            "INSERT OR IGNORE INTO ratings_fetched (player_id) VALUES (?)", (tm_id,)
        )
        con.commit()

    n = con.execute("SELECT COUNT(*) FROM player_ratings").fetchone()[0]
    print(f"\nPhase 2 done — {n} total rating entries in DB")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    phase = "both"
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--phase" and i + 1 < len(sys.argv[1:]):
            phase = sys.argv[i + 2]

    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")

    con = sqlite3.connect(DB_PATH)
    init_db(con)

    if phase in ("1", "both"):
        run_phase1(con)

    if phase in ("2", "both"):
        run_phase2(con)

    # Summary
    n_players = con.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    n_matched = con.execute(
        "SELECT COUNT(*) FROM fifaindex_lookup WHERE fifaindex_id IS NOT NULL"
    ).fetchone()[0]
    n_ratings = con.execute("SELECT COUNT(*) FROM player_ratings").fetchone()[0]
    con.close()

    print(f"\n✓ {n_matched}/{n_players} players matched on fifaindex")
    print(f"  {n_ratings} rating entries total")
    print(f"  DB: {DB_PATH}")


if __name__ == "__main__":
    main()
