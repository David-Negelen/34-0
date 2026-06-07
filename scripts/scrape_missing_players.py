#!/usr/bin/env python3
"""
Targeted scraper: fetch ratings for players still showing 50 OVR.

Strategy: for each missing player we know their club and season year.
We map those clubs to fifaindex team IDs, visit the team page for the
right game edition, and match the player by last name (much more robust
than a full-name fuzzy search against a search endpoint that ignores params).

Usage:
    python scripts/scrape_missing_players.py [--debug] [--dry-run]
"""

import json
import re
import sqlite3
import sys
import time
import unicodedata
import difflib
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Run: pip install requests beautifulsoup4 lxml")

ROOT         = Path(__file__).parent.parent
DB_PATH      = ROOT / "bundesliga_draft.db"
ONLY50_PATH  = ROOT / "data" / "only50.json"
SESSION_FILE = ROOT / "data" / "fifaindex_session.txt"
CLUBS_FILE   = ROOT / "data" / "fifaindex_clubs.txt"
BASE         = "https://fifaindex.com"

DELAY        = 1.2
RETRY_DELAY  = 30.0

DEBUG   = "--debug" in sys.argv
DRY_RUN = "--dry-run" in sys.argv

GAME_SLUG_TO_YEAR: dict[str, int] = {
    "fc26":   2025, "fc25":   2024, "fc24":   2023,
    "fifa23": 2022, "fifa22": 2021, "fifa21": 2020,
    "fifa20": 2019, "fifa19": 2018, "fifa18": 2017,
    "fifa17": 2016, "fifa16": 2015, "fifa15": 2014,
    "fifa14": 2013, "fifa13": 2012, "fifa12": 2011,
    "fifa11": 2010, "fifa10": 2009, "fifa09": 2008,
    "fifa08": 2007, "fifa07": 2006, "fifa06": 2005,
    "fifa05": 2004,
}
YEAR_TO_SLUG = {v: k for k, v in GAME_SLUG_TO_YEAR.items()}

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
        sys.exit(f"\nFill in {SESSION_FILE} before running.")

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
    return max(token_score, difflib.SequenceMatcher(None, na, nb).ratio())


# ── Club mapping ───────────────────────────────────────────────────────────────

# Map normalized DB club name → (fi_club_id, fi_slug).
# Slug-derived names often abbreviate ("mgladbach") so we also list common
# DB spelling variants explicitly.
_EXTRA_ALIASES: dict[str, tuple[int, str]] = {
    # Mönchengladbach — slug is abbreviated
    "borussia monchengladbach":    (23, "borussia-mgladbach"),
    "bor monchengladbach":         (23, "borussia-mgladbach"),
    "vfl bochum 1848":             (160, "vfl-bochum"),
    "fc hansa rostock":            (27, "hansa-rostock"),
    "fc energie cottbus":          (162, "energie-cottbus"),
    "energie cottbus":             (162, "energie-cottbus"),
    "tsg hoffenheim":              (10029, "tsg-1899-hoffenheim"),
    "tsg 1899 hoffenheim":         (10029, "tsg-1899-hoffenheim"),
    "spvgg greuther furth":        (165, "spvgg-greuther-furth"),
    "spvgg greuther fürth":        (165, "spvgg-greuther-furth"),
    "fc st pauli":                 (110329, "fc-st-pauli"),
    "hamburger sv":                (28, "hamburger-sv"),
    "hsv":                         (28, "hamburger-sv"),
    "1 fc nurnberg":               (171, "1-fc-nurnberg"),
    "1 fc nürnberg":               (171, "1-fc-nurnberg"),
    "eintracht braunschweig":      (110500, "eintracht-braunschweig"),
    "sv eintracht braunschweig":   (110500, "eintracht-braunschweig"),
    "rb leipzig":                  (112172, "rb-leipzig"),
    "rasenballsport leipzig":      (112172, "rb-leipzig"),
    "bayern munchen":              (21, "bayern-munchen"),
    "fc bayern munchen":           (21, "bayern-munchen"),
    "fc bayern münchen":           (21, "bayern-munchen"),
    "fc bayernmünchen":            (21, "bayern-munchen"),
}

def build_club_map() -> dict[str, tuple[int, str]]:
    mapping: dict[str, tuple[int, str]] = {}

    if CLUBS_FILE.exists():
        for line in CLUBS_FILE.read_text(encoding="utf-8").splitlines():
            line = line.split("#")[0].strip()
            if not line:
                continue
            m = re.match(r"^(\d+)-(.+)$", line)
            if not m:
                continue
            fi_id   = int(m.group(1))
            fi_slug = m.group(2).strip()
            # slug → readable text: "1-fc-koln" → "1 fc koln"
            slug_text = fi_slug.replace("-", " ")
            mapping[normalize(slug_text)] = (fi_id, fi_slug)

    mapping.update(_EXTRA_ALIASES)
    return mapping


def find_club(club_name: str, club_map: dict[str, tuple[int, str]]) -> tuple[int, str] | None:
    key = normalize(club_name)

    # Exact
    if key in club_map:
        return club_map[key]

    # Fuzzy
    best_k, best_s = None, 0.0
    for k, v in club_map.items():
        s = difflib.SequenceMatcher(None, key, k).ratio()
        if s > best_s:
            best_s, best_k = s, k

    if best_s >= 0.70 and best_k:
        if DEBUG:
            print(f"\n    club '{club_name}' ~ '{best_k}' ({best_s:.2f})")
        return club_map[best_k]

    return None


# ── Team page (cached) ─────────────────────────────────────────────────────────

# Some clubs have different slugs across FIFA editions (e.g. Gladbach).
# If the primary slug 404s we try these alternatives in order.
_SLUG_ALTERNATIVES: dict[int, list[str]] = {
    23: ["borussia-mgladbach", "monchengladbach", "bor-monchengladbach"],
}

_team_cache: dict[tuple[int, str], list[dict]] = {}


def get_team_players(fi_club_id: int, fi_slug: str, game_slug: str) -> list[dict]:
    key = (fi_club_id, game_slug)
    if key in _team_cache:
        return _team_cache[key]

    slugs_to_try = list(dict.fromkeys(
        [fi_slug] + _SLUG_ALTERNATIVES.get(fi_club_id, [])
    ))

    soup = None
    for slug in slugs_to_try:
        url = f"{BASE}/de/teams/{fi_club_id}-{slug}/{game_slug}/"
        soup = fetch(url)
        if soup:
            break

    if not soup:
        _team_cache[key] = []
        return []

    players = []
    seen: set[str] = set()
    for row in soup.select("table tr"):
        if row.find("th"):
            continue
        link = row.select_one("a[href*='/spieler/']")
        if not link:
            continue
        name = link.get_text(strip=True)
        if not name or name in seen:
            continue
        seen.add(name)

        ovr = None
        for td in row.find_all("td"):
            cls = " ".join(td.get("class", []))
            if "font-bold" in cls and "font-heading" in cls:
                t = td.get_text(strip=True)
                if re.fullmatch(r"\d{2}", t):
                    ovr = int(t)
                    break

        if ovr:
            players.append({"name": name, "ovr": ovr})

    _team_cache[key] = players
    if DEBUG:
        print(f"\n      [{fi_slug}/{game_slug}] {len(players)} players on page")
    return players


# ── Player matching ────────────────────────────────────────────────────────────

def find_player(db_name: str, team_players: list[dict]) -> dict | None:
    """
    Match db_name against the team roster.
    Primary: last-name token exact match (robust against first-name abbreviations).
    Fallback: full-name fuzzy score ≥ 0.45 (lower than global scraper's 0.55,
    safe here because we're already on the right club page).
    """
    last = normalize(db_name).split()[-1]

    # Pass 1: last-name token in any position on the page
    token_hits = [p for p in team_players if last in normalize(p["name"]).split()]
    if len(token_hits) == 1:
        return token_hits[0]
    if len(token_hits) > 1:
        # Multiple players share the last name — pick best full-name score
        return max(token_hits, key=lambda p: name_score(db_name, p["name"]))

    # Pass 2: full-name fuzzy with relaxed threshold
    scored = [(p, name_score(db_name, p["name"])) for p in team_players]
    best_p, best_s = max(scored, key=lambda x: x[1])
    if best_s >= 0.45:
        if DEBUG:
            print(f"\n      fuzzy: '{best_p['name']}' (score={best_s:.2f})")
        return best_p

    return None


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    global session

    if not DB_PATH.exists():
        sys.exit(f"DB not found: {DB_PATH}")
    if not ONLY50_PATH.exists():
        sys.exit(f"only50.json not found: {ONLY50_PATH}")

    session = load_session()
    con = sqlite3.connect(DB_PATH, timeout=60)

    data = json.load(open(ONLY50_PATH))
    # Track which (player_id, season_year) pairs already exist so we can fill gaps
    rated_pairs = {(r[0], r[1]) for r in con.execute("SELECT player_id, season_year FROM player_ratings").fetchall()}

    missing = []
    for p in data:
        tm_id = int(p["id"].rsplit("_", 1)[1])
        club_years: list[tuple[str, int]] = []
        for s in p.get("seasons", []):
            year = int(s["season"].split("-")[0])
            if year in YEAR_TO_SLUG and s.get("club") and (tm_id, year) not in rated_pairs:
                club_years.append((s["club"], year))
        if club_years:
            missing.append({"tm_id": tm_id, "name": p["name"], "club_years": club_years})

    print(f"{len(missing)} players need ratings\n")

    club_map = build_club_map()
    if DEBUG:
        print(f"Club map: {len(club_map)} entries\n")

    found = skipped = 0

    for i, player in enumerate(missing, 1):
        tm_id      = player["tm_id"]
        name       = player["name"]
        club_years = player["club_years"]

        print(f"[{i}/{len(missing)}] {name} (tm_id={tm_id}) … ", end="", flush=True)

        ratings: dict[int, int] = {}
        tried_keys: set[tuple[int, str]] = set()

        for club_name, season_year in club_years:
            game_slug = YEAR_TO_SLUG[season_year]
            club_info = find_club(club_name, club_map)
            if not club_info:
                if DEBUG:
                    print(f"\n    no club map for '{club_name}'")
                continue

            fi_club_id, fi_slug = club_info
            cache_key = (fi_club_id, game_slug)
            if cache_key in tried_keys:
                continue
            tried_keys.add(cache_key)

            team_players = get_team_players(fi_club_id, fi_slug, game_slug)
            if not team_players:
                continue

            match = find_player(name, team_players)
            if match:
                ratings[season_year] = match["ovr"]

        if not ratings:
            print("no match found")
            skipped += 1
            continue

        if not DRY_RUN:
            for year, ovr in ratings.items():
                con.execute(
                    "INSERT OR REPLACE INTO player_ratings (player_id, season_year, rating) VALUES (?, ?, ?)",
                    (tm_id, year, ovr)
                )
            con.commit()

        rating_str = ", ".join(f"{YEAR_TO_SLUG.get(y,'?')}={r}" for y, r in sorted(ratings.items()))
        print(f"→ [{rating_str}]")
        found += 1

    print(f"\n✓ Done — {found} players rated, {skipped} skipped")
    con.close()


if __name__ == "__main__":
    main()
