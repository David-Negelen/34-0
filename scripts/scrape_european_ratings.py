#!/usr/bin/env python3
"""
Scrape player OVR ratings from fifaindex.com for all CL/UEL clubs in european_cups.db.
Adds a player_ratings table to european_cups.db. After running, re-run
export_european_players_js.py to update playersEuropean.js.

First run: use --discover to search for fifaindex club IDs.
The result is saved to data/fifaindex_european_clubs.txt — edit any mismatches,
then run normally to scrape.

Usage:
    python scripts/scrape_european_ratings.py --discover   # find fifaindex IDs
    python scripts/scrape_european_ratings.py [--debug]    # scrape ratings
"""

import sqlite3
import time
import re
import sys
import unicodedata
import difflib
from pathlib import Path
from urllib.parse import quote_plus

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT         = Path(__file__).parent.parent
DB_PATH      = ROOT / "european_cups.db"
CLUBS_FILE   = ROOT / "data" / "fifaindex_european_clubs.txt"
SESSION_FILE = ROOT / "data" / "fifaindex_session.txt"
BASE         = "https://fifaindex.com"
DELAY        = 1.5
RETRY_DELAY  = 30.0

# game slug → season start year (same mapping as scrape_ratings.py)
GAME_SLUG_TO_YEAR: dict[str, int] = {
    "fc26": 2025, "fc25": 2024, "fc24": 2023, "fifa23": 2022,
    "fifa22": 2021, "fifa21": 2020, "fifa20": 2019, "fifa19": 2018,
    "fifa18": 2017, "fifa17": 2016, "fifa16": 2015, "fifa15": 2014,
    "fifa14": 2013, "fifa13": 2012, "fifa12": 2011, "fifa11": 2010,
    "fifa10": 2009, "fifa09": 2008, "fifa08": 2007, "fifa07": 2006,
    "fifa06": 2005, "fifa05": 2004,
}

DEBUG    = "--debug" in sys.argv
DISCOVER = "--discover" in sys.argv


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


# ── Name normalisation ─────────────────────────────────────────────────────────

_TRANSLIT = str.maketrans({
    'ı': 'i', 'İ': 'I', 'ø': 'o', 'Ø': 'O', 'ł': 'l', 'Ł': 'L',
    'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D', 'æ': 'ae', 'Æ': 'AE',
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
# Format: {fi_club_id}-{fi_slug}   (same as fifaindex_clubs.txt)

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
    """Map fi_club_id → european_cups.db tm_id by fuzzy-matching fi_slug against club names."""
    db_clubs = con.execute("SELECT tm_id, name FROM clubs").fetchall()
    club_map: dict[int, int] = {}
    unmapped: list[str] = []
    for fi_id, fi_slug in clubs:
        best_id, best_score = None, 0.0
        for tm_id, tm_name in db_clubs:
            s = name_score(fi_slug, tm_name)
            if s > best_score:
                best_score = s
                best_id = tm_id
        if best_score >= 0.60:
            club_map[fi_id] = best_id
        else:
            unmapped.append(fi_slug)
    if unmapped:
        print(f"  ⚠  {len(unmapped)} clubs not matched to european_cups.db: {', '.join(unmapped)}")
    print(f"  Club map: {len(club_map)}/{len(clubs)} entries matched")
    return club_map


# ── Discovery ──────────────────────────────────────────────────────────────────

def search_fifaindex_team(name: str) -> tuple[int, str] | None:
    """Search fifaindex teams page, return (fi_id, fi_slug) of first result."""
    url = f"{BASE}/de/teams/?search={quote_plus(name)}"
    soup = fetch(url)
    if not soup:
        return None
    for a in soup.select("a[href*='/teams/']"):
        href = a.get("href", "")
        m = re.search(r"/teams/(\d+)-([^/?#]+)", href)
        if m:
            return int(m.group(1)), m.group(2)
    return None


def discover_clubs(con: sqlite3.Connection):
    """Search fifaindex for each club in european_cups.db, write clubs file."""
    db_clubs = con.execute("SELECT tm_id, name FROM clubs ORDER BY name").fetchall()

    # Keep entries already in the file
    existing = {fi_slug: fi_id for fi_id, fi_slug in load_clubs()}

    lines: list[str] = [
        "# fifaindex club IDs for European CL/UEL clubs",
        "# Format: {fi_club_id}-{fi_slug}  (same as fifaindex_clubs.txt)",
        "# Edit manually to fix any mismatches, then run without --discover.",
        "",
    ]
    found = failed = 0
    for tm_id, name in db_clubs:
        print(f"  Searching: {name!r} … ", end="", flush=True)
        try:
            result = search_fifaindex_team(name)
        except Exception as e:
            print(f"ERROR: {e}")
            lines.append(f"# NOT_FOUND: {name}")
            failed += 1
            continue
        if result:
            fi_id, fi_slug = result
            print(f"→ {fi_id}-{fi_slug}")
            lines.append(f"{fi_id}-{fi_slug}  # {name}")
            found += 1
        else:
            print("not found")
            lines.append(f"# NOT_FOUND: {name}")
            failed += 1

    CLUBS_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n✓ Discovery done: {found} found, {failed} not found")
    print(f"  Review {CLUBS_FILE}, then run without --discover")


# ── Team page parser (identical to scrape_ratings.py) ─────────────────────────

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
        elif DEBUG:
            print(f"      {name}: OVR not found")
    return players


# ── Main scraper ───────────────────────────────────────────────────────────────

def run(con: sqlite3.Connection):
    clubs = load_clubs()
    if not clubs:
        sys.exit(
            f"No clubs in {CLUBS_FILE}\n"
            "Run with --discover first to populate it."
        )

    club_map = build_club_map(con, clubs)  # fi_club_id → tm_id in european_cups.db

    # Which (tm_club_id, season_year) combos have squad data?
    valid_seasons: set[tuple[int, int]] = set(
        con.execute("SELECT club_id, season_year FROM squad_entries").fetchall()
    )

    # Player name index
    db_players = con.execute("SELECT tm_id, name FROM players").fetchall()
    norm_exact: dict[str, int] = {}
    norm_list: list[tuple[str, int, str]] = []
    for tm_id, name in db_players:
        key = normalize(name)
        norm_exact[key] = tm_id
        norm_list.append((name, tm_id, key))

    lastname_index: dict[str, list[tuple[int, str]]] = {}
    for _, tm_id, nk in norm_list:
        last = nk.split()[-1]
        lastname_index.setdefault(last, []).append((tm_id, nk))

    SCOPED_THRESHOLD   = 0.80
    FALLBACK_THRESHOLD = 0.75

    def find_tm_id(scraped_name: str, scoped_pool=None) -> tuple[int | None, float]:
        key = normalize(scraped_name)
        if scoped_pool:
            for _, tid, nk in scoped_pool:
                if nk == key:
                    return tid, 1.0
            tokens = key.split()
            if len(tokens) >= 2 and len(tokens[0]) == 1:
                last = tokens[-1]
                cands = [(tid, nk) for _, tid, nk in scoped_pool if nk.split()[-1] == last]
                hits  = [(tid, nk) for tid, nk in cands if nk.split()[0][0] == tokens[0]]
                if len(hits) == 1:
                    return hits[0][0], 0.90
                if len(cands) == 1 and cands[0][1].split()[0][0] == tokens[0]:
                    return cands[0][0], 0.90
            best_id, best_score = None, 0.0
            for raw_name, tm_id, _ in scoped_pool:
                s = name_score(scraped_name, raw_name)
                if s > best_score:
                    best_score = s
                    best_id = tm_id
            if best_score >= SCOPED_THRESHOLD:
                return best_id, best_score
            if DEBUG:
                print(f"    ~ scoped miss: {scraped_name!r} (score={best_score:.2f}), trying global …")
        if key in norm_exact:
            return norm_exact[key], 1.0
        tokens = key.split()
        if len(tokens) >= 2 and len(tokens[0]) == 1:
            last = tokens[-1]
            candidates = lastname_index.get(last, [])
            initial_hits = [(tid, nk) for tid, nk in candidates if nk.split()[0][0] == tokens[0]]
            if len(initial_hits) == 1:
                return initial_hits[0][0], 0.90
            if len(candidates) == 1 and candidates[0][1].split()[0][0] == tokens[0]:
                return candidates[0][0], 0.90
        best_id, best_score = None, 0.0
        for raw_name, tm_id, nk in norm_list:
            s = name_score(scraped_name, raw_name)
            if s > best_score:
                best_score = s
                best_id = tm_id
        if best_score >= FALLBACK_THRESHOLD:
            return best_id, best_score
        return None, best_score

    games = list(GAME_SLUG_TO_YEAR.items())

    for ci, (fi_club_id, fi_slug) in enumerate(clubs, 1):
        tm_club_id = club_map.get(fi_club_id)
        if tm_club_id is None:
            continue

        club_name = con.execute("SELECT name FROM clubs WHERE tm_id=?", (tm_club_id,)).fetchone()
        club_name = club_name[0] if club_name else fi_slug
        print(f"\n[{ci}/{len(clubs)}] {club_name} (fi={fi_club_id})")

        for game_slug, season_year in games:
            # Skip editions where we have no squad data for this club
            if (tm_club_id, season_year) not in valid_seasons:
                continue

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

            if soup is None:
                print("404 – not in this edition")
                con.execute(
                    "INSERT OR IGNORE INTO fi_team_scraped VALUES (?, ?)",
                    (fi_club_id, game_slug)
                )
                con.commit()
                continue

            squad = parse_team_page(soup)

            # Scoped player pool for this club+season
            rows = con.execute(
                "SELECT p.name, p.tm_id FROM players p "
                "JOIN squad_entries se ON se.player_id = p.tm_id "
                "WHERE se.club_id = ? AND se.season_year = ?",
                (tm_club_id, season_year)
            ).fetchall()
            scoped_pool = [(name, tid, normalize(name)) for name, tid in rows] if rows else None

            matched = unmatched = 0
            for p in squad:
                tm_id, score = find_tm_id(p["name"], scoped_pool)
                if tm_id:
                    con.execute(
                        "INSERT OR REPLACE INTO player_ratings VALUES (?, ?, ?)",
                        (tm_id, season_year, p["ovr"])
                    )
                    matched += 1
                    if DEBUG and score < 0.95:
                        print(f"    ~ match: {p['name']!r} → score={score:.2f}")
                else:
                    unmatched += 1
                    if DEBUG:
                        print(f"    ✗ no match: {p['name']!r} (best={score:.2f})")

            con.execute(
                "INSERT OR IGNORE INTO fi_team_scraped VALUES (?, ?)",
                (fi_club_id, game_slug)
            )
            con.commit()
            suffix = f" ({unmatched} unmatched)" if unmatched else ""
            print(f"{len(squad)} players, {matched} matched{suffix}")

    n = con.execute("SELECT COUNT(*) FROM player_ratings").fetchone()[0]
    print(f"\n✓ Done — {n} rating entries in european_cups.db")
    print("  Run: python scripts/export_european_players_js.py")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    global session
    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")
    session = load_session()
    con = sqlite3.connect(DB_PATH, timeout=60)
    init_db(con)
    if DISCOVER:
        discover_clubs(con)
    else:
        run(con)
    con.close()


if __name__ == "__main__":
    main()
