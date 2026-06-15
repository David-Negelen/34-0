#!/usr/bin/env python3
"""
Scrape player OVR ratings from fifaindex.com into dritte_liga_draft.db.

Works identically to scrape_ratings.py but targets the 3. Liga DB
and reads club IDs from data/fifaindex_dritte_liga_clubs.txt.
3. Liga was added to FIFA in FIFA 18 (2017-18 season).

Usage:
    python scripts/scrape_dritte_liga_ratings.py [--debug]

Reuses data/fifaindex_session.txt for auth. Resumes automatically.
"""

import sqlite3
import time
import re
import sys
import unicodedata
import difflib
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT         = Path(__file__).parent.parent
DB_PATH      = ROOT / "dritte_liga_draft.db"
CLUBS_FILE   = ROOT / "data" / "fifaindex_dritte_liga_clubs.txt"
SESSION_FILE = ROOT / "data" / "fifaindex_session.txt"
BASE         = "https://fifaindex.com"

DELAY       = 1.5
RETRY_DELAY = 30.0

# 3. Liga added to FIFA in FIFA 18 (2017-18 season)
GAME_SLUG_TO_YEAR: dict[str, int] = {
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

        CREATE TABLE IF NOT EXISTS fi_team_scraped (
            fi_club_id INTEGER NOT NULL,
            game_slug  TEXT    NOT NULL,
            PRIMARY KEY (fi_club_id, game_slug)
        );
    """)
    con.commit()


# ── Session ────────────────────────────────────────────────────────────────────

def load_session() -> requests.Session:
    values: dict[str, str] = {}
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
        "Accept-Language": "de-DE,de;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://fifaindex.com/",
    })
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            name, _, val = part.partition("=")
            sess.cookies.set(name.strip(), val.strip(), domain="fifaindex.com")
    return sess


session: requests.Session | None = None


def fetch(url: str, retries: int = 3) -> BeautifulSoup | None:
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


# ── Name normalisation ─────────────────────────────────────────────────────────

_TRANSLIT = str.maketrans({
    'ı': 'i', 'İ': 'I',
    'ø': 'o', 'Ø': 'O',
    'ł': 'l', 'Ł': 'L',
    'đ': 'd', 'Đ': 'D',
    'ð': 'd', 'Ð': 'D',
    'æ': 'ae', 'Æ': 'AE',
})

def normalize(name: str) -> str:
    name = name.replace("ß", "ss").replace("ẞ", "ss")
    name = name.translate(_TRANSLIT)
    nfd = unicodedata.normalize("NFD", name)
    ascii_only = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    spaced = ascii_only.replace("-", " ").replace(".", " ")
    return re.sub(r" +", " ", re.sub(r"[^a-z ]", "", spaced.lower())).strip()

def name_score(a: str, b: str) -> float:
    na, nb = normalize(a), normalize(b)
    if na == nb:
        return 1.0
    ta, tb = set(na.split()), set(nb.split())
    if not ta or not tb:
        return 0.0
    token_score = len(ta & tb) / min(len(ta), len(tb))
    if token_score >= 0.80:
        return token_score
    return max(token_score, difflib.SequenceMatcher(None, na, nb).ratio())


# ── Clubs file ─────────────────────────────────────────────────────────────────

def load_clubs() -> list[tuple[int, str]]:
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


def build_club_map(con: sqlite3.Connection, clubs: list[tuple[int, str]]) -> dict[int, int]:
    """Map fi_club_id → tm_club_id by matching fifaindex slug against TM club names."""
    tm_clubs = con.execute("SELECT tm_id, name FROM clubs").fetchall()
    club_map: dict[int, int] = {}
    unmapped: list[str] = []
    for fi_club_id, fi_slug in clubs:
        best_id, best_score = None, 0.0
        for tm_id, tm_name in tm_clubs:
            s = name_score(fi_slug, tm_name)
            if s > best_score:
                best_score = s
                best_id = tm_id
        if best_score >= 0.65:
            club_map[fi_club_id] = best_id
        else:
            unmapped.append(fi_slug)
    if unmapped:
        print(f"  ⚠  {len(unmapped)} clubs not mapped to TM: {', '.join(unmapped)}")
    print(f"  Club map: {len(club_map)}/{len(clubs)} clubs → TM IDs")
    return club_map


# ── Team page parser ───────────────────────────────────────────────────────────

def parse_team_page(soup: BeautifulSoup) -> list[dict]:
    players = []
    seen: set[str] = set()

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


# ── Main scraper ───────────────────────────────────────────────────────────────

def run(con: sqlite3.Connection):
    clubs = load_clubs()
    if not clubs:
        print(f"\nNo clubs found in {CLUBS_FILE}")
        return

    club_id_map = build_club_map(con, clubs)

    SCOPED_THRESHOLD = 0.80

    def find_tm_id(scraped_name: str, scoped_pool: list | None) -> int | None:
        """Returns tm_id if a confident match is found within scoped_pool, else None."""
        if not scoped_pool:
            return None

        key = normalize(scraped_name)

        for _, tid, nk in scoped_pool:
            if nk == key:
                return tid

        tokens = key.split()
        if len(tokens) >= 2 and len(tokens[0]) == 1:
            last = tokens[-1]
            cands = [(tid, nk) for _, tid, nk in scoped_pool if nk.split()[-1] == last]
            hits  = [(tid, nk) for tid, nk in cands if nk.split()[0][0] == tokens[0]]
            if len(hits) == 1:
                return hits[0][0]
            if len(cands) == 1 and cands[0][1].split()[0][0] == tokens[0]:
                return cands[0][0]

        best_id, best_score = None, 0.0
        for raw_name, tm_id, _ in scoped_pool:
            s = name_score(scraped_name, raw_name)
            if s > best_score:
                best_score = s
                best_id = tm_id

        return best_id if best_score >= SCOPED_THRESHOLD else None

    games = list(GAME_SLUG_TO_YEAR.items())

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
                print("404 – club not in this edition, skipped")
                con.execute(
                    "INSERT OR IGNORE INTO fi_team_scraped (fi_club_id, game_slug) VALUES (?, ?)",
                    (fi_club_id, game_slug)
                )
                con.commit()
                continue

            squad = parse_team_page(soup)
            if not squad:
                not_avail = soup.find(string=re.compile("nicht verfügbar"))
                msg = "not available in this edition" if not_avail else "0 players found"
                print(msg + ", skipped")
                con.execute(
                    "INSERT OR IGNORE INTO fi_team_scraped (fi_club_id, game_slug) VALUES (?, ?)",
                    (fi_club_id, game_slug)
                )
                con.commit()
                continue

            scoped_pool = None
            tm_club_id = club_id_map.get(fi_club_id)
            if tm_club_id:
                rows = con.execute(
                    "SELECT p.name, p.tm_id FROM players p "
                    "JOIN squad_entries se ON se.player_id = p.tm_id "
                    "WHERE se.club_id = ? AND se.season_year = ?",
                    (tm_club_id, season_year)
                ).fetchall()
                if rows:
                    scoped_pool = [(name, tm_id, normalize(name)) for name, tm_id in rows]

            if scoped_pool is None:
                print(f"{len(squad)} players scraped, club not in 3L this season — skipped")
                con.execute(
                    "INSERT OR IGNORE INTO fi_team_scraped (fi_club_id, game_slug) VALUES (?, ?)",
                    (fi_club_id, game_slug)
                )
                con.commit()
                continue

            matched = unmatched = 0
            for p in squad:
                tm_id = find_tm_id(p["name"], scoped_pool)
                if tm_id:
                    con.execute(
                        "INSERT OR REPLACE INTO player_ratings "
                        "(player_id, season_year, rating) VALUES (?, ?, ?)",
                        (tm_id, season_year, p["ovr"])
                    )
                    matched += 1
                else:
                    unmatched += 1

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
    global session

    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}\nRun the 3. Liga TM scraper first.")

    session = load_session()
    con = sqlite3.connect(DB_PATH, timeout=60)
    init_db(con)
    run(con)
    con.close()


if __name__ == "__main__":
    main()
