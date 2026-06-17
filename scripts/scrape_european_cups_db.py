#!/usr/bin/env python3
"""
Scrape UCL + UEL squads from Wikipedia (participants) and Transfermarkt (players).
Uses the same approach as scrape_bundesliga.py: squad page for the player list,
then individual profile pages for primary + secondary positions, birth date, nationality.

Output: european_cups.db  (resumable — already-scraped combos are skipped)

Usage:
    python scripts/scrape_european_cups_db.py              # both comps, all years
    python scripts/scrape_european_cups_db.py --comp ucl
    python scripts/scrape_european_cups_db.py --comp uel
    python scripts/scrape_european_cups_db.py --from 2020  # recent seasons only
"""

import sqlite3, re, sys, time, argparse, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("pip install requests beautifulsoup4 lxml")

ROOT    = Path(__file__).parent.parent
DB_PATH = ROOT / "european_cups.db"
BASE    = "https://www.transfermarkt.de"

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
WIKI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; 34-0-scraper/1.0)",
    "Accept-Language": "en-US,en;q=0.9",
}

DELAY        = 1.5   # minimum seconds between any two TM requests (global)
RETRY_DELAY  = 45.0
MAX_RETRY    = 5
PROFILE_WORKERS = 3  # parallel profile fetches per club

UCL_SEASONS = list(range(2004, 2026))
UEL_SEASONS = list(range(2014, 2026))

RESULT_ORDER = ["winner", "final", "sf", "qf", "r16", "r32", "po", "group"]


# ── Bundesliga clubs — already in players.js, skip squad scraping ─────────────

BUNDESLIGA_CLUBS = {
    "Bayern München", "Borussia Dortmund", "Bayer 04 Leverkusen", "FC Schalke 04",
    "VfB Stuttgart", "Hamburger SV", "Werder Bremen", "VfL Wolfsburg",
    "Eintracht Frankfurt", "Borussia Mönchengladbach", "Hertha BSC", "1. FC Köln",
    "TSG Hoffenheim", "RB Leipzig", "SC Freiburg", "1. FC Union Berlin",
}


# ── TM club lookup (slug, id) ─────────────────────────────────────────────────

TM_CLUBS = {
    "Manchester United":           ("manchester-united",            985),
    "Manchester City":             ("manchester-city",              281),
    "Chelsea":                     ("fc-chelsea",                   631),
    "Arsenal":                     ("fc-arsenal",                    11),
    "Liverpool":                   ("fc-liverpool",                  31),
    "Tottenham":                   ("tottenham-hotspur",            148),
    "Aston Villa":                 ("aston-villa",                  405),
    "Newcastle United":            ("newcastle-united",             762),
    "Leeds United":                ("leeds-united",                 399),
    "West Ham":                    ("west-ham-united",              379),
    "Real Madrid":                 ("real-madrid",                  418),
    "Barcelona":                   ("fc-barcelona",                 131),
    "Atlético Madrid":             ("atletico-madrid",               13),
    "Sevilla":                     ("fc-sevilla",                   368),
    "Valencia":                    ("fc-valencia",                 1049),
    "Villarreal":                  ("fc-villarreal",               1050),
    "Real Sociedad":               ("real-sociedad-san-sebastian",  681),
    "Athletic Bilbao":             ("athletic-club-bilbao",         621),
    "Real Betis":                  ("real-betis-balompie",          150),
    "Deportivo La Coruña":         ("deportivo-la-coruna",          660),
    "AC Milan":                    ("ac-mailand",                     5),
    "Inter Milan":                 ("inter-mailand",                 46),
    "Juventus":                    ("juventus-turin",               506),
    "Napoli":                      ("ssc-neapel",                  6195),
    "AS Roma":                     ("as-rom",                        12),
    "Lazio":                       ("lazio-rom",                    398),
    "Atalanta":                    ("atalanta-bergamo",              800),
    "Fiorentina":                  ("acf-fiorentina",               430),
    "Udinese":                     ("udinese-calcio",               410),
    "Paris Saint-Germain":         ("paris-saint-germain",          583),
    "Marseille":                   ("olympique-marseille",          244),
    "Lyon":                        ("olympique-lyon",              1041),
    "Monaco":                      ("as-monaco",                    162),
    "Lille":                       ("losc-lille",                  1082),
    "Rennes":                      ("stade-rennais",                273),
    "Benfica":                     ("sl-benfica",                   294),
    "Porto":                       ("fc-porto",                     720),
    "Sporting CP":                 ("sporting-cp",                  336),
    "Braga":                       ("sc-braga",                      78),
    "Ajax":                        ("ajax-amsterdam",               610),
    "PSV":                         ("psv-eindhoven",                383),
    "Feyenoord":                   ("feyenoord-rotterdam",          234),
    "AZ":                          ("az-alkmaar",                   208),
    "Club Brugge":                 ("fc-brugge",                   2282),
    "Anderlecht":                  ("rsc-anderlecht",                58),
    "Celtic":                      ("celtic-glasgow",               371),
    "Rangers":                     ("rangers-glasgow",              416),
    "Galatasaray":                 ("galatasaray-sk",               141),
    "Beşiktaş":                    ("besiktas-jk",                  114),
    "Fenerbahçe":                  ("Fenerbahce",                    36),
    "Trabzonspor":                 ("trabzonspor-kuluebuee",        2552),
    "Olympiakos":                  ("olympiakos-piraus",            683),
    "Panathinaikos":               ("panathinaikos-athen",         1063),
    "Schachtar Donezk":            ("schachtar-donezk",             660),
    "Dynamo Kiew":                 ("dynamo-kiew",                  225),
    "Red Bull Salzburg":           ("rb-salzburg",                  409),
    "CSKA Moskau":                 ("zska-moskau",                 2410),
    "Zenit St. Petersburg":        ("zenit-st-petersburg",          964),
    "Lokomotiv Moskau":            ("lokomotiv-moskau",             932),
    "Dinamo Zagreb":               ("gnk-dinamo-zagreb",            419),
    "Legia Warschau":              ("legia-warschau",               255),
    "Malmö FF":                    ("malmoe-ff",                    300),
    "Copenhagen":                  ("fc-kopenhagen",                190),
    "Rosenborg":                   ("rosenborg-bk",                 157),
    "Young Boys":                  ("bsc-young-boys",               452),
    "FC Basel":                    ("fc-basel",                      74),
    "Rapid Wien":                  ("sk-rapid-wien",               1664),
    "LASK":                        ("lask",                        1003),
    "Sturm Graz":                  ("sk-sturm-graz",               2440),
    "Sparta Prag":                 ("ac-sparta-prag",               197),
    "Slavia Prag":                 ("sk-slavia-prag",                62),
    "FC Midtjylland":              ("fc-midtjylland",               929),
}


# ── DB ────────────────────────────────────────────────────────────────────────

def init_db(con: sqlite3.Connection):
    con.executescript("""
        CREATE TABLE IF NOT EXISTS competitions (
            id   TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );
        INSERT OR IGNORE INTO competitions VALUES ('ucl', 'UEFA Champions League');
        INSERT OR IGNORE INTO competitions VALUES ('uel', 'UEFA Europa League');

        CREATE TABLE IF NOT EXISTS seasons (
            year    INTEGER NOT NULL,
            comp_id TEXT    NOT NULL,
            label   TEXT    NOT NULL,
            PRIMARY KEY (year, comp_id),
            FOREIGN KEY (comp_id) REFERENCES competitions(id)
        );

        CREATE TABLE IF NOT EXISTS clubs (
            tm_id INTEGER PRIMARY KEY,
            name  TEXT    NOT NULL,
            slug  TEXT    NOT NULL
        );

        -- one row per club per season per competition, with how far they went
        CREATE TABLE IF NOT EXISTS season_clubs (
            season_year INTEGER NOT NULL,
            comp_id     TEXT    NOT NULL,
            club_id     INTEGER NOT NULL,
            club_name   TEXT    NOT NULL,
            result      TEXT    NOT NULL,
            PRIMARY KEY (season_year, comp_id, club_id),
            FOREIGN KEY (comp_id) REFERENCES competitions(id)
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
            PRIMARY KEY (player_id, position),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- sentinel: profile page already fetched for this player
        CREATE TABLE IF NOT EXISTS player_profiles_fetched (
            player_id INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS squad_entries (
            season_year INTEGER NOT NULL,
            comp_id     TEXT    NOT NULL,
            club_id     INTEGER NOT NULL,
            player_id   INTEGER NOT NULL,
            PRIMARY KEY (season_year, comp_id, club_id, player_id),
            FOREIGN KEY (player_id) REFERENCES players(tm_id)
        );

        -- tracks which (season, comp, club) squads are fully scraped
        CREATE TABLE IF NOT EXISTS scrape_log (
            season_year INTEGER NOT NULL,
            comp_id     TEXT    NOT NULL,
            club_id     INTEGER NOT NULL,
            scraped_at  TEXT    DEFAULT (datetime('now')),
            PRIMARY KEY (season_year, comp_id, club_id)
        );
    """)
    con.commit()


# ── HTTP ──────────────────────────────────────────────────────────────────────

_tls = threading.local()

def _get_session() -> requests.Session:
    if not hasattr(_tls, "session"):
        s = requests.Session()
        s.headers.update(HEADERS)
        _tls.session = s
    return _tls.session

# Global rate limiter — enforces DELAY between all TM requests across all threads
_rate_lock       = threading.Lock()
_last_request_ts = 0.0

def _rate_wait():
    global _last_request_ts
    with _rate_lock:
        now  = time.time()
        wait = DELAY - (now - _last_request_ts)
        if wait > 0:
            time.sleep(wait)
        _last_request_ts = time.time()

def fetch_tm(url: str) -> BeautifulSoup:
    session = _get_session()
    for attempt in range(MAX_RETRY):
        try:
            _rate_wait()
            r = session.get(url, timeout=30)
            if r.status_code == 404:
                r.raise_for_status()          # raises HTTPError — caught below, no retry
            if r.status_code in (429, 502, 503):
                wait = RETRY_DELAY * (attempt + 1)
                print(f"    Rate-limited ({r.status_code}), waiting {wait:.0f}s …")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except requests.HTTPError:
            raise                             # 404 / other HTTP errors: no retry
        except requests.RequestException as e:
            if attempt == MAX_RETRY - 1:
                raise
            wait = DELAY * (3 ** (attempt + 1))
            print(f"    Error: {e}, retrying in {wait:.0f}s …")
            time.sleep(wait)
    raise RuntimeError(f"Failed: {url}")

def fetch_wiki(url: str) -> BeautifulSoup | None:
    for attempt in range(3):
        try:
            r = requests.get(url, headers=WIKI_HEADERS, timeout=20)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except Exception as e:
            if attempt == 2:
                print(f"    Wiki error {url}: {e}")
                return None
            time.sleep(3)
    return None


# ── Wikipedia participant scraping ────────────────────────────────────────────

NAME_MAP = {
    "FC Bayern München": "Bayern München", "FC Bayern Munich": "Bayern München",
    "Bayern Munich": "Bayern München",
    "Borussia Dortmund": "Borussia Dortmund",
    "Bayer Leverkusen": "Bayer 04 Leverkusen",
    "Bayer 04 Leverkusen": "Bayer 04 Leverkusen",
    "Schalke 04": "FC Schalke 04", "FC Schalke 04": "FC Schalke 04",
    "VfB Stuttgart": "VfB Stuttgart",
    "Hamburger SV": "Hamburger SV", "Hamburg": "Hamburger SV",
    "Werder Bremen": "Werder Bremen", "SV Werder Bremen": "Werder Bremen",
    "VfL Wolfsburg": "VfL Wolfsburg", "Wolfsburg": "VfL Wolfsburg",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
    "Borussia Mönchengladbach": "Borussia Mönchengladbach",
    "Borussia M'gladbach": "Borussia Mönchengladbach",
    "Hertha BSC": "Hertha BSC",
    "1. FC Köln": "1. FC Köln", "FC Köln": "1. FC Köln",
    "TSG 1899 Hoffenheim": "TSG Hoffenheim", "Hoffenheim": "TSG Hoffenheim",
    "RB Leipzig": "RB Leipzig",
    "SC Freiburg": "SC Freiburg", "Freiburg": "SC Freiburg",
    "1. FC Union Berlin": "1. FC Union Berlin", "Union Berlin": "1. FC Union Berlin",
    "VfL Bochum": "VfL Bochum",
    "Manchester United": "Manchester United", "Man. United": "Manchester United",
    "Manchester City": "Manchester City", "Man. City": "Manchester City",
    "Chelsea": "Chelsea", "Chelsea FC": "Chelsea",
    "Arsenal": "Arsenal", "Arsenal FC": "Arsenal",
    "Liverpool": "Liverpool", "Liverpool FC": "Liverpool",
    "Tottenham Hotspur": "Tottenham", "Tottenham Hotspur FC": "Tottenham",
    "Aston Villa": "Aston Villa",
    "Newcastle United": "Newcastle United",
    "Leeds United": "Leeds United",
    "West Ham United": "West Ham",
    "Real Madrid": "Real Madrid", "Real Madrid CF": "Real Madrid",
    "FC Barcelona": "Barcelona", "Barcelona": "Barcelona",
    "Atlético de Madrid": "Atlético Madrid", "Atlético Madrid": "Atlético Madrid",
    "Atletico Madrid": "Atlético Madrid",
    "Sevilla FC": "Sevilla", "Sevilla": "Sevilla",
    "Valencia CF": "Valencia", "Valencia": "Valencia",
    "Villarreal CF": "Villarreal", "Villarreal": "Villarreal",
    "Real Sociedad": "Real Sociedad",
    "Athletic Club": "Athletic Bilbao", "Athletic Bilbao": "Athletic Bilbao",
    "Real Betis": "Real Betis",
    "Deportivo de La Coruña": "Deportivo La Coruña",
    "AC Milan": "AC Milan", "Milan": "AC Milan",
    "Internazionale": "Inter Milan", "Inter Milan": "Inter Milan", "Inter": "Inter Milan",
    "FC Internazionale Milano": "Inter Milan",
    "Juventus": "Juventus", "Juventus FC": "Juventus",
    "Napoli": "Napoli", "SSC Napoli": "Napoli",
    "AS Roma": "AS Roma", "Roma": "AS Roma",
    "SS Lazio": "Lazio", "Lazio": "Lazio",
    "Atalanta": "Atalanta", "Atalanta BC": "Atalanta",
    "ACF Fiorentina": "Fiorentina", "Fiorentina": "Fiorentina",
    "Udinese Calcio": "Udinese", "Udinese": "Udinese",
    "Paris Saint-Germain": "Paris Saint-Germain", "PSG": "Paris Saint-Germain",
    "Olympique de Marseille": "Marseille", "Marseille": "Marseille",
    "Olympique Lyonnais": "Lyon", "Lyon": "Lyon", "Olympique de Lyon": "Lyon",
    "AS Monaco": "Monaco", "Monaco": "Monaco",
    "Lille OSC": "Lille", "Lille": "Lille",
    "Stade Rennais": "Rennes", "Rennes": "Rennes",
    "SL Benfica": "Benfica", "Benfica": "Benfica",
    "FC Porto": "Porto", "Porto": "Porto",
    "Sporting CP": "Sporting CP", "Sporting": "Sporting CP",
    "SC Braga": "Braga", "Braga": "Braga",
    "Ajax": "Ajax", "AFC Ajax": "Ajax",
    "PSV Eindhoven": "PSV", "PSV": "PSV",
    "Feyenoord": "Feyenoord",
    "AZ Alkmaar": "AZ", "AZ": "AZ",
    "Club Brugge KV": "Club Brugge", "Club Brugge": "Club Brugge",
    "RSC Anderlecht": "Anderlecht", "Anderlecht": "Anderlecht",
    "Celtic": "Celtic", "Celtic FC": "Celtic",
    "Rangers": "Rangers", "Rangers FC": "Rangers",
    "Galatasaray": "Galatasaray", "Galatasaray SK": "Galatasaray",
    "Beşiktaş": "Beşiktaş", "Besiktas": "Beşiktaş", "Beşiktaş JK": "Beşiktaş",
    "Fenerbahçe": "Fenerbahçe",
    "Trabzonspor": "Trabzonspor",
    "Olympiacos FC": "Olympiakos", "Olympiacos": "Olympiakos", "Olympiakos": "Olympiakos",
    "Panathinaikos": "Panathinaikos",
    "FC Shakhtar Donetsk": "Schachtar Donezk", "Shakhtar Donetsk": "Schachtar Donezk",
    "FC Dynamo Kyiv": "Dynamo Kiew", "Dynamo Kyiv": "Dynamo Kiew",
    "FC Red Bull Salzburg": "Red Bull Salzburg", "Red Bull Salzburg": "Red Bull Salzburg",
    "CSKA Moscow": "CSKA Moskau", "PFC CSKA Moscow": "CSKA Moskau",
    "Zenit St. Petersburg": "Zenit St. Petersburg",
    "FC Zenit Saint Petersburg": "Zenit St. Petersburg",
    "Zenit Saint Petersburg": "Zenit St. Petersburg",
    "Lokomotiv Moscow": "Lokomotiv Moskau",
    "GNK Dinamo Zagreb": "Dinamo Zagreb", "Dinamo Zagreb": "Dinamo Zagreb",
    "Legia Warsaw": "Legia Warschau", "Legia Warszawa": "Legia Warschau",
    "Malmö FF": "Malmö FF",
    "FC Copenhagen": "Copenhagen", "Copenhagen": "Copenhagen",
    "Rosenborg BK": "Rosenborg", "Rosenborg": "Rosenborg",
    "BSC Young Boys": "Young Boys", "Young Boys": "Young Boys",
    "FC Basel": "FC Basel", "FC Basel 1893": "FC Basel",
    "SK Rapid Wien": "Rapid Wien", "Rapid Wien": "Rapid Wien",
    "LASK": "LASK",
    "Sturm Graz": "Sturm Graz",
    "AC Sparta Prague": "Sparta Prag", "Sparta Prague": "Sparta Prag",
    "Slavia Prague": "Slavia Prag", "SK Slavia Prague": "Slavia Prag",
    "FC Midtjylland": "FC Midtjylland", "Midtjylland": "FC Midtjylland",
}

NON_CLUB_WORDS = {
    "group", "round", "phase", "stage", "bracket", "final", "season",
    "championship", "match", "away goals", "aggregate", "replay",
    "play-off", "playoff", "knockout", "wikipedia", "edit", "hide",
    "talk", "view", "history", "list", "association",
    "qualifying", "preliminary", "ceremony", "statistics", "goalscorer",
    "team of", "best xi", "award", "criteria",
    "goal difference", "coefficient", "head-to-head", "disciplinary",
    "goals scored", "goals against", "away goal", "regulations", "tiebreak",
}
NON_CLUB_EXACT = {
    "agg.", "agg", "leg", "pld", "gf", "ga", "gd", "pts", "points",
    "pos", "won", "drawn", "lost", "for", "against", "diff",
    "mp", "gp", "p", "f", "a", "w", "d", "l", "n/a",
}

ROUND_MAP = {
    "final":                     "final",
    "semi-final":                "sf",
    "quarter-final":             "qf",
    "round of 16":               "r16",
    "last 16":                   "r16",
    "round of 32":               "r32",
    "last 32":                   "r32",
    "knockout round":            "po",
    "play-off":                  "po",
    "playoff":                   "po",
    "knockout phase play-offs":  "po",
}

def normalise(raw: str) -> str:
    raw = re.sub(r"\s*\(.*?\)\s*", "", raw).strip()
    raw = re.sub(r"\s+", " ", raw)
    return NAME_MAP.get(raw, raw)

def looks_like_club(name: str) -> bool:
    if len(name) < 2 or len(name) > 60:
        return False
    if name.lower() in NON_CLUB_EXACT:
        return False
    return not any(w in name.lower() for w in NON_CLUB_WORDS)

def best_result(a: str, b: str) -> str:
    return a if RESULT_ORDER.index(a) <= RESULT_ORDER.index(b) else b

def heading_result(text: str) -> str | None:
    low = text.lower()
    for kw, res in ROUND_MAP.items():
        if kw in low:
            return res
    return None

def season_label(year: int) -> str:
    return f"{str(year)[2:]}/{str(year + 1)[2:]}"

def wiki_url(year: int, comp: str) -> str:
    dash = "–"
    y2s  = str(year + 1)[2:]
    if comp == "ucl":
        return f"https://en.wikipedia.org/wiki/{year}{dash}{y2s}_UEFA_Champions_League"
    return f"https://en.wikipedia.org/wiki/{year}{dash}{y2s}_UEFA_Europa_League"

def teams_from_table(table) -> list[str]:
    seen  = set()
    names = []
    for row in table.find_all("tr"):
        for cell in row.find_all(["td", "th"])[:3]:
            for a in cell.find_all("a", href=True):
                href = a.get("href", "")
                if not (href.startswith("/wiki/") or href.startswith("http")):
                    continue
                n = normalise(a.get_text(strip=True))
                if n and looks_like_club(n) and n not in seen:
                    seen.add(n)
                    names.append(n)
    return names

def scrape_season_wiki(year: int, comp: str) -> list[dict]:
    """Returns [{club, season, result}] for group/league-phase clubs only."""
    label = season_label(year)
    url   = wiki_url(year, comp)
    soup  = fetch_wiki(url)
    if soup is None:
        return []

    winner_name = ""
    for box in soup.select("table.infobox"):
        for row in box.find_all("tr"):
            th = row.find("th"); td = row.find("td")
            if th and td:
                if any(w in th.get_text(strip=True).lower() for w in ("winner", "champions", "sieger")):
                    for a in td.find_all("a"):
                        n = normalise(a.get_text(strip=True))
                        if looks_like_club(n):
                            winner_name = n; break
            if winner_name: break

    GROUP_TRIGGERS   = {"group stage", "group a", "group b", "league phase", "liga-phase"}
    KNOCKOUT_TRIGGER = {"knockout", "round of 16", "last 16", "quarter", "semi-final", "final", "knockout phase"}
    STOP_TRIGGERS    = {"statistics", "see also", "references", "external links", "top goalscorer"}

    group_clubs:  set[str]       = set()
    club_result:  dict[str, str] = {}
    in_group      = False
    in_knockout   = False
    current_ko    = "r16"
    final_cands:  list[str]      = []

    for el in soup.find_all(["h2", "h3", "h4", "table"]):
        if el.name in ("h2", "h3", "h4"):
            text = el.get_text(strip=True); low = text.lower()
            if any(kw in low for kw in STOP_TRIGGERS): break
            if any(kw in low for kw in GROUP_TRIGGERS):
                in_group = True; in_knockout = False; continue
            if in_group and any(kw in low for kw in ("results", "matchday", "match details")):
                in_group = False; continue
            if any(kw in low for kw in KNOCKOUT_TRIGGER):
                in_group = False; in_knockout = True
                res = heading_result(text)
                if res: current_ko = res
                continue
            if any(kw in low for kw in ("qualifying", "preliminary", "play-off round", "champions path")):
                in_group = False; in_knockout = False
        elif el.name == "table" and "wikitable" in el.get("class", []):
            teams = teams_from_table(el)
            if in_group:
                group_clubs.update(teams)
            elif in_knockout:
                for t in teams:
                    club_result[t] = best_result(club_result.get(t, "group"), current_ko)
                if current_ko == "final" and len(teams) >= 2 and not final_cands:
                    final_cands = teams[:2]

    final_map = {c: "group" for c in group_clubs}
    for club, res in club_result.items():
        if club in final_map:
            final_map[club] = best_result(final_map[club], res)

    if winner_name:
        final_map[winner_name] = "winner"
    elif final_cands and "winner" not in final_map.values():
        final_map[final_cands[0]] = "winner"

    return [{"club": c, "season": label, "result": r}
            for c, r in sorted(final_map.items())]


# ── TM squad + profile scraping ───────────────────────────────────────────────

def scrape_squad(club_name: str, year: int) -> list[dict]:
    """Returns [{tm_id, name, profile_url}]. Empty if club not in TM_CLUBS."""
    info = TM_CLUBS.get(club_name)
    if info is None:
        return []
    slug, tid = info
    url  = f"{BASE}/{slug}/kader/verein/{tid}/saison_id/{year}/plus/1"
    try:
        soup = fetch_tm(url)
    except Exception as e:
        print(f"    Squad error {club_name} {year}: {e}")
        return []

    players  = []
    seen_ids = set()
    for row in soup.select("table.items tbody tr"):
        link = row.select_one("td.posrela td.hauptlink a")
        if not link:
            continue
        pm = re.search(r"/spieler/(\d+)", link.get("href", ""))
        if not pm:
            continue
        pid  = int(pm.group(1))
        name = link.get_text(strip=True)
        if pid in seen_ids:
            continue
        seen_ids.add(pid)

        slug_m = re.match(r"/([^/]+)/", link.get("href", ""))
        p_slug = slug_m.group(1) if slug_m else name.lower().replace(" ", "-")
        profile_url = f"{BASE}/{p_slug}/profil/spieler/{pid}"

        players.append({"tm_id": pid, "name": name, "profile_url": profile_url})

    return players


POSITION_MAP = {
    "Torwart":               "GK",
    "Innenverteidiger":      "CB",
    "Libero":                "CB",
    "Rechter Verteidiger":   "RB",
    "Linker Verteidiger":    "LB",
    "Defensives Mittelfeld": "DM",
    "Zentrales Mittelfeld":  "CM",
    "Linkes Mittelfeld":     "LW",
    "Rechtes Mittelfeld":    "RW",
    "Offensives Mittelfeld": "AM",
    "Hängende Spitze":       "AM",
    "Linksaußen":            "LW",
    "Rechtsaußen":           "RW",
    "Mittelstürmer":         "ST",
}

def scrape_player_profile(profile_url: str) -> dict:
    """
    Fetches the player's TM profile page.
    Returns {positions: [...], birth_date: 'YYYY-MM-DD'|None, nationality: str|None}.
    positions[0] is primary, rest are secondary.
    """
    try:
        soup = fetch_tm(profile_url)
    except Exception as e:
        print(f"    Profile error {profile_url}: {e}")
        return {"positions": [], "birth_date": None, "nationality": None}

    # Positions from the Detailposition panel (same selector as BL scraper)
    raw_positions = [dd.get_text(strip=True)
                     for dd in soup.select("dd.detail-position__position")
                     if dd.get_text(strip=True)]
    positions = [POSITION_MAP.get(p, p) for p in raw_positions]

    # Birth date: TM format is DD.MM.YYYY inside [itemprop='birthDate']
    birth_date = None
    bd_el = soup.select_one("[itemprop='birthDate']")
    if bd_el:
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", bd_el.get_text())
        if m:
            birth_date = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    # Nationality: first flag image in the player data area
    nationality = None
    for img in soup.select("img.flaggenrahmen"):
        alt = (img.get("alt") or img.get("title") or "").strip()
        if alt:
            nationality = alt
            break

    return {"positions": positions, "birth_date": birth_date, "nationality": nationality}


# ── DB helpers ────────────────────────────────────────────────────────────────

def save_season_clubs(con, year: int, comp: str, entries: list[dict]):
    label = season_label(year)
    con.execute("INSERT OR IGNORE INTO seasons (year, comp_id, label) VALUES (?,?,?)",
                (year, comp, label))
    for e in entries:
        club_info = TM_CLUBS.get(e["club"])
        if club_info:
            slug, tid = club_info
            con.execute("INSERT OR IGNORE INTO clubs (tm_id, name, slug) VALUES (?,?,?)",
                        (tid, e["club"], slug))
            con.execute(
                "INSERT OR REPLACE INTO season_clubs (season_year,comp_id,club_id,club_name,result) "
                "VALUES (?,?,?,?,?)",
                (year, comp, tid, e["club"], e["result"])
            )
        else:
            # Store without a TM id — we can still track the result
            con.execute(
                "INSERT OR REPLACE INTO season_clubs (season_year,comp_id,club_id,club_name,result) "
                "VALUES (?,?,?,?,?)",
                (year, comp, 0, e["club"], e["result"])
            )
    con.commit()

def profile_fetched(con, pid: int) -> bool:
    return con.execute(
        "SELECT 1 FROM player_profiles_fetched WHERE player_id=?", (pid,)
    ).fetchone() is not None

def save_player(con, pid: int, name: str, profile: dict):
    positions = profile.get("positions", [])
    con.execute(
        "INSERT OR IGNORE INTO players (tm_id, name, birth_date, nationality) VALUES (?,?,?,?)",
        (pid, name, profile.get("birth_date"), profile.get("nationality"))
    )
    for i, pos in enumerate(positions):
        con.execute(
            "INSERT OR IGNORE INTO player_positions (player_id, position, is_primary) VALUES (?,?,?)",
            (pid, pos, 1 if i == 0 else 0)
        )
    con.execute("INSERT OR IGNORE INTO player_profiles_fetched (player_id) VALUES (?)", (pid,))

def save_squad_entry(con, year: int, comp: str, club_id: int, pid: int):
    con.execute(
        "INSERT OR IGNORE INTO squad_entries (season_year,comp_id,club_id,player_id) VALUES (?,?,?,?)",
        (year, comp, club_id, pid)
    )

def already_scraped(con, year: int, comp: str, club_id: int) -> bool:
    return con.execute(
        "SELECT 1 FROM scrape_log WHERE season_year=? AND comp_id=? AND club_id=?",
        (year, comp, club_id)
    ).fetchone() is not None

def mark_scraped(con, year: int, comp: str, club_id: int):
    con.execute(
        "INSERT OR IGNORE INTO scrape_log (season_year,comp_id,club_id) VALUES (?,?,?)",
        (year, comp, club_id)
    )
    con.commit()


# ── Main ──────────────────────────────────────────────────────────────────────

COMP_SEASONS = {"ucl": UCL_SEASONS, "uel": UEL_SEASONS}
COMP_LABELS  = {"ucl": "Champions League", "uel": "Europa League"}

def run_comp(con: sqlite3.Connection, comp: str, seasons: list[int]):
    print(f"\n{'='*60}")
    print(f"  {COMP_LABELS[comp]}  {seasons[0]}/{seasons[0]+1}–{seasons[-1]}/{seasons[-1]+1}")
    print(f"{'='*60}")

    for year in seasons:
        label = season_label(year)
        print(f"\n[{label}]")

        # Wikipedia: get participants + results
        entries = scrape_season_wiki(year, comp)
        if not entries:
            print(f"  ⚠  No Wikipedia data, skipping")
            continue
        winner = next((e["club"] for e in entries if e["result"] == "winner"), "?")
        print(f"  {len(entries)} clubs  winner: {winner}")
        save_season_clubs(con, year, comp, entries)

        time.sleep(1.5)

        # TM squads
        for e in entries:
            club = e["club"]
            if club in BUNDESLIGA_CLUBS:
                continue

            club_info = TM_CLUBS.get(club)
            if club_info is None:
                continue
            _, club_id = club_info

            if already_scraped(con, year, comp, club_id):
                print(f"  {club:42s} — cached")
                continue

            print(f"  {club:42s} …", flush=True)

            players = scrape_squad(club, year)
            if not players:
                print(f"    (0 players)")
                mark_scraped(con, year, comp, club_id)
                continue

            # Split into cached (no fetch needed) and new (need profile fetch)
            cached  = [p for p in players if     profile_fetched(con, p["tm_id"])]
            to_fetch = [p for p in players if not profile_fetched(con, p["tm_id"])]

            # Register cached players immediately (silent — profiles already in DB)
            for p in cached:
                con.execute("INSERT OR IGNORE INTO players (tm_id, name) VALUES (?,?)",
                            (p["tm_id"], p["name"]))
                save_squad_entry(con, year, comp, club_id, p["tm_id"])
            if cached:
                print(f"    ({len(cached)} players already in DB, skipped)")

            # Fetch new profiles in parallel
            def _fetch(p):
                return p, scrape_player_profile(p["profile_url"])

            new_profiles = 0
            with ThreadPoolExecutor(max_workers=PROFILE_WORKERS) as pool:
                futures = {pool.submit(_fetch, p): p for p in to_fetch}
                for future in as_completed(futures):
                    p, profile = future.result()
                    save_player(con, p["tm_id"], p["name"], profile)
                    save_squad_entry(con, year, comp, club_id, p["tm_id"])
                    pos_str = ",".join(profile["positions"]) if profile["positions"] else "?"
                    nat     = profile["nationality"] or "?"
                    bd      = profile["birth_date"] or "?"
                    print(f"    {p['name']:35s}  {pos_str}  {bd}  {nat}")
                    new_profiles += 1

            con.commit()
            mark_scraped(con, year, comp, club_id)
            print(f"  ✓ {club}: {len(players)} players ({new_profiles} new, {len(cached)} cached)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--comp",   choices=["ucl", "uel", "both"], default="both")
    ap.add_argument("--from",   dest="from_year", type=int,    default=2004)
    args = ap.parse_args()

    con = sqlite3.connect(DB_PATH)
    init_db(con)

    comps = ["ucl", "uel"] if args.comp == "both" else [args.comp]
    for comp in comps:
        base    = COMP_SEASONS[comp]
        seasons = [y for y in base if y >= args.from_year]
        run_comp(con, comp, seasons)

    n_players = con.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    n_entries = con.execute("SELECT COUNT(*) FROM squad_entries").fetchone()[0]
    n_clubs   = con.execute("SELECT COUNT(DISTINCT club_id) FROM season_clubs WHERE club_id != 0").fetchone()[0]
    n_pos     = con.execute("SELECT COUNT(DISTINCT player_id) FROM player_positions").fetchone()[0]
    con.close()

    print(f"\n✓ Done — {n_clubs} clubs, {n_players} players, {n_entries} squad entries")
    print(f"  {n_pos} players with position data")
    print(f"  Database: {DB_PATH}")
