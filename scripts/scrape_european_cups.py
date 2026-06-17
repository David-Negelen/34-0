#!/usr/bin/env python3
"""
Scrape UEFA Champions League + Europa League participants and squads.

Pass 1 – Participants + results (Wikipedia):
  Each season page gives us which clubs reached the group/league phase, plus
  how far each advanced (winner / final / sf / qf / r16 / po / group).

Pass 2 – Squads (Transfermarkt):
  For each participating club × season we scrape the TM kader page and extract
  player name, position, birth year, and nationality.
  Ratings are stored as 0 — a separate fifaindex scraper will fill them in.

Outputs:
  src/data/uclParticipants.js     { club, season, result }
  src/data/uelParticipants.js     { club, season, result }
  src/data/playersEuropean.js     { id, name, positions, birthYear, nationality,
                                     seasons: [{ club, season, rating: 0 }] }

Usage:
    pip install requests beautifulsoup4 lxml
    python scripts/scrape_european_cups.py --dry-run         # participants only, fast
    python scripts/scrape_european_cups.py --comp ucl        # full UCL
    python scripts/scrape_european_cups.py --comp uel        # full UEL
    python scripts/scrape_european_cups.py --from 2022       # recent seasons only
"""

import re, sys, time, argparse
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("pip install requests beautifulsoup4 lxml")

ROOT      = Path(__file__).parent.parent
DELAY     = 3.0
MAX_RETRY = 2

WIKI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; 34-0-scraper/1.0)",
    "Accept-Language": "en-US,en;q=0.9",
}
TM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.transfermarkt.de/",
}

# UCL: 2004/05 to 2025/26 (36-team format from 2024/25)
UCL_SEASONS = list(range(2004, 2026))
# UEL: 2014/15 to 2025/26
UEL_SEASONS = list(range(2014, 2026))

RESULT_ORDER = ["winner", "final", "sf", "qf", "r16", "r32", "po", "group"]

ROUND_MAP = {
    "final":             "final",
    "semi-final":        "sf",
    "quarter-final":     "qf",
    "round of 16":       "r16",
    "last 16":           "r16",
    "round of 32":       "r32",
    "last 32":           "r32",
    "knockout round":    "po",
    "play-off":          "po",
    "playoff":           "po",
    "zwischenrunde":     "po",
    "knockout phase play-offs": "po",
}


# ── Name normalisation ────────────────────────────────────────────────────────

NAME_MAP = {
    "FC Bayern München": "Bayern München", "FC Bayern Munich": "Bayern München",
    "Bayern Munich": "Bayern München",
    "Borussia Dortmund": "Borussia Dortmund",
    "Bayer Leverkusen": "Bayer 04 Leverkusen", "Bayer 04 Leverkusen": "Bayer 04 Leverkusen",
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
    "Tottenham Hotspur": "Tottenham", "Tottenham": "Tottenham",
    "Tottenham Hotspur FC": "Tottenham",
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
    "Malmö FF": "Malmö FF", "Malmoe FF": "Malmö FF",
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
    "Villarreal CF": "Villarreal",
    "Eintracht Frankfurt": "Eintracht Frankfurt",
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def season_label(start_year: int) -> str:
    return f"{str(start_year)[2:]}/{str(start_year + 1)[2:]}"

def best_result(a: str, b: str) -> str:
    return a if RESULT_ORDER.index(a) <= RESULT_ORDER.index(b) else b

def heading_result(text: str) -> str | None:
    low = text.lower()
    for kw, res in ROUND_MAP.items():
        if kw in low:
            return res
    return None


# ── Wikipedia ─────────────────────────────────────────────────────────────────

def wiki_url(start_year: int, comp: str) -> str:
    y2s  = str(start_year + 1)[2:]
    dash = "–"   # en-dash U+2013
    if comp == "ucl":
        return f"https://en.wikipedia.org/wiki/{start_year}{dash}{y2s}_UEFA_Champions_League"
    return f"https://en.wikipedia.org/wiki/{start_year}{dash}{y2s}_UEFA_Europa_League"

def fetch_wiki(url: str) -> BeautifulSoup | None:
    for attempt in range(MAX_RETRY + 1):
        try:
            r = requests.get(url, headers=WIKI_HEADERS, timeout=20)
            if r.status_code == 404:
                print(f"    404: {url}")
                return None
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except Exception as e:
            if attempt == MAX_RETRY:
                print(f"    ERROR {url}: {e}")
                return None
            time.sleep(3)
    return None

def teams_from_table(table) -> list[str]:
    names = []
    seen  = set()
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

def scrape_season_wiki(start_year: int, comp: str) -> list[dict]:
    label = season_label(start_year)
    url   = wiki_url(start_year, comp)
    print(f"  [{label}] {url}")

    soup = fetch_wiki(url)
    if soup is None:
        return []

    # Detect winner from infobox
    winner_name = ""
    for box in soup.select("table.infobox"):
        for row in box.find_all("tr"):
            th = row.find("th")
            td = row.find("td")
            if th and td:
                th_low = th.get_text(strip=True).lower()
                if any(w in th_low for w in ("winner", "champions", "sieger")):
                    for a in td.find_all("a"):
                        n = normalise(a.get_text(strip=True))
                        if looks_like_club(n):
                            winner_name = n
                            break
            if winner_name:
                break

    GROUP_TRIGGERS   = {"group stage", "group a", "group b", "league phase",
                        "liga-phase", "gruppenphase"}
    KNOCKOUT_TRIGGER = {"knockout", "round of 16", "last 16", "quarter",
                        "semi-final", "semi finals", "final", "knockout phase"}
    STOP_TRIGGERS    = {"statistics", "see also", "references", "external links",
                        "top goalscorer", "team of the season"}

    group_clubs:  set[str]   = set()
    club_result:  dict[str, str] = {}
    in_group      = False
    in_knockout   = False
    current_ko    = "r16"
    final_cands:  list[str] = []

    for element in soup.find_all(["h2", "h3", "h4", "table"]):
        if element.name in ("h2", "h3", "h4"):
            text = element.get_text(strip=True)
            low  = text.lower()

            if any(kw in low for kw in STOP_TRIGGERS):
                break

            if any(kw in low for kw in GROUP_TRIGGERS):
                in_group = True; in_knockout = False
                continue

            if in_group and any(kw in low for kw in ("results", "matchday", "spieltag", "match details")):
                in_group = False
                continue

            if any(kw in low for kw in KNOCKOUT_TRIGGER):
                in_group = False; in_knockout = True
                res = heading_result(text)
                if res:
                    current_ko = res
                continue

            if any(kw in low for kw in ("qualifying", "preliminary", "play-off round",
                                         "champions path", "league path")):
                in_group = False; in_knockout = False

        elif element.name == "table" and "wikitable" in element.get("class", []):
            teams = teams_from_table(element)
            if in_group:
                group_clubs.update(teams)
            elif in_knockout:
                for t in teams:
                    club_result[t] = best_result(club_result.get(t, "group"), current_ko)
                if current_ko == "final" and len(teams) >= 2 and not final_cands:
                    final_cands = teams[:2]

    # Build final map: only clubs that reached group/league phase
    final_map = {c: "group" for c in group_clubs}
    for club, res in club_result.items():
        if club in final_map:
            final_map[club] = best_result(final_map[club], res)

    if winner_name:
        final_map[winner_name] = "winner"
    elif final_cands and "winner" not in final_map.values():
        final_map[final_cands[0]] = "winner"

    if not final_map:
        print(f"    WARNING: 0 clubs found")
        return []

    return [{"club": c, "season": label, "result": r}
            for c, r in sorted(final_map.items())]


# ── Transfermarkt: club ID table ──────────────────────────────────────────────

# German Bundesliga clubs are already in players.js — skip squad scraping for them.
# They still appear in uclParticipants / uelParticipants; just no duplicate player entries.
BUNDESLIGA_CLUBS = {
    "Bayern München", "Borussia Dortmund", "Bayer 04 Leverkusen", "FC Schalke 04",
    "VfB Stuttgart", "Hamburger SV", "Werder Bremen", "VfL Wolfsburg",
    "Eintracht Frankfurt", "Borussia Mönchengladbach", "Hertha BSC", "1. FC Köln",
    "TSG Hoffenheim", "RB Leipzig", "SC Freiburg", "1. FC Union Berlin",
}

TM_CLUBS = {
    "Manchester United":           ("manchester-united",            985),
    "Manchester City":             ("manchester-city",              281),
    "Chelsea":                     ("fc-chelsea",                  631),
    "Arsenal":                     ("fc-arsenal",                   11),
    "Liverpool":                   ("fc-liverpool",                 31),
    "Tottenham":                   ("tottenham-hotspur",           148),
    "Aston Villa":                 ("aston-villa",                 405),
    "Newcastle United":            ("newcastle-united",            762),
    "Leeds United":                ("leeds-united",                399),
    "West Ham":                    ("west-ham-united",             379),
    "Real Madrid":                 ("real-madrid",                 418),
    "Barcelona":                   ("fc-barcelona",                131),
    "Atlético Madrid":             ("atletico-madrid",              13),
    "Sevilla":                     ("fc-sevilla",                  368),
    "Valencia":                    ("fc-valencia",                1049),
    "Villarreal":                  ("fc-villarreal",              1050),
    "Real Sociedad":               ("real-sociedad-san-sebastian",  681),
    "Athletic Bilbao":             ("athletic-club-bilbao",        621),
    "Real Betis":                  ("real-betis-balompie",         150),
    "Deportivo La Coruña":         ("deportivo-la-coruna",         660),
    "AC Milan":                    ("ac-mailand",                    5),
    "Inter Milan":                 ("inter-mailand",                46),
    "Juventus":                    ("juventus-turin",              506),
    "Napoli":                      ("ssc-neapel",                 6195),
    "AS Roma":                     ("as-rom",                       12),
    "Lazio":                       ("lazio-rom",                   398),
    "Atalanta":                    ("atalanta-bergamo",             800),
    "Fiorentina":                  ("acf-fiorentina",              430),
    "Udinese":                     ("udinese-calcio",              410),
    "Paris Saint-Germain":         ("paris-saint-germain",         583),
    "Marseille":                   ("olympique-marseille",         244),
    "Lyon":                        ("olympique-lyon",             1041),
    "Monaco":                      ("as-monaco",                   162),
    "Lille":                       ("losc-lille",                 1082),
    "Rennes":                      ("stade-rennais",               273),
    "Benfica":                     ("sl-benfica",                  294),
    "Porto":                       ("fc-porto",                    720),
    "Sporting CP":                 ("sporting-cp",                 336),
    "Braga":                       ("sc-braga",                     78),
    "Ajax":                        ("ajax-amsterdam",              610),
    "PSV":                         ("psv-eindhoven",               383),
    "Feyenoord":                   ("feyenoord-rotterdam",         234),
    "AZ":                          ("az-alkmaar",                  208),
    "Club Brugge":                 ("fc-brugge",                  2282),
    "Anderlecht":                  ("rsc-anderlecht",               12),
    "Celtic":                      ("celtic-glasgow",              371),
    "Rangers":                     ("rangers-glasgow",             416),
    "Galatasaray":                 ("galatasaray-sk",              141),
    "Beşiktaş":                    ("besiktas-jk",                 114),
    "Fenerbahçe":                  ("Fenerbahce",                    36),
    "Trabzonspor":                 ("trabzonspor-kuluebuee",       2552),
    "Olympiakos":                  ("olympiakos-piraus",           683),
    "Panathinaikos":               ("panathinaikos-athen",        1063),
    "Schachtar Donezk":            ("schachtar-donezk",            660),
    "Dynamo Kiew":                 ("dynamo-kiew",                 225),
    "Red Bull Salzburg":           ("rb-salzburg",                 409),
    "CSKA Moskau":                 ("zska-moskau",                2410),
    "Zenit St. Petersburg":        ("zenit-st-petersburg",         964),
    "Lokomotiv Moskau":            ("lokomotiv-moskau",            932),
    "Dinamo Zagreb":               ("gnk-dinamo-zagreb",           419),
    "Legia Warschau":              ("legia-warschau",              255),
    "Malmö FF":                    ("malmoe-ff",                   300),
    "Copenhagen":                  ("fc-kopenhagen",               190),
    "Rosenborg":                   ("rosenborg-bk",                157),
    "Young Boys":                  ("bsc-young-boys",              452),
    "FC Basel":                    ("fc-basel",                     74),
    "Rapid Wien":                  ("sk-rapid-wien",              1664),
    "LASK":                        ("lask",                       1003),
    "Sturm Graz":                  ("sk-sturm-graz",              2440),
    "Sparta Prag":                 ("ac-sparta-prag",              197),
    "Slavia Prag":                 ("sk-slavia-prag",               62),
    "FC Midtjylland":              ("fc-midtjylland",              929),
}


# ── Transfermarkt: position mapping ──────────────────────────────────────────

TM_POS_MAP = {
    "Torwart": "GK", "Goalkeeper": "GK",
    "Innenverteidiger": "CB", "Centre-Back": "CB",
    "Linker Verteidiger": "LB", "Left-Back": "LB",
    "Rechter Verteidiger": "RB", "Right-Back": "RB",
    "Defensives Mittelfeld": "DM", "Defensive Midfield": "DM",
    "Zentrales Mittelfeld": "CM", "Central Midfield": "CM",
    "Linkes Mittelfeld": "LM", "Left Midfield": "LM",
    "Rechtes Mittelfeld": "RM", "Right Midfield": "RM",
    "Offensives Mittelfeld": "AM", "Attacking Midfield": "AM",
    "Hängende Spitze": "AM", "Second Striker": "AM",
    "Linksaußen": "LW", "Left Winger": "LW",
    "Rechtsaußen": "RW", "Right Winger": "RW",
    "Mittelstürmer": "ST", "Centre-Forward": "ST",
}

def tm_pos(raw: str) -> list[str]:
    raw = raw.strip()
    if raw in TM_POS_MAP:
        return [TM_POS_MAP[raw]]
    low = raw.lower()
    if "torwart" in low or "keeper" in low:        return ["GK"]
    if "innen" in low or "centre-back" in low:     return ["CB"]
    if "links" in low and "verteid" in low:        return ["LB"]
    if "rechts" in low and "verteid" in low:       return ["RB"]
    if "defensiv" in low:                          return ["DM"]
    if "zentral" in low or "central" in low:       return ["CM"]
    if "offensiv" in low or "attacking" in low:    return ["AM"]
    if "linksaußen" in low or "left wing" in low:  return ["LW"]
    if "rechtsaußen" in low or "right wing" in low: return ["RW"]
    if "stürm" in low or "forward" in low or "striker" in low: return ["ST"]
    return ["CM"]

def make_id(name: str, tm_id: int) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    return f"{slug}-{tm_id}"


# ── Transfermarkt: squad page ─────────────────────────────────────────────────

TM_FAILURES: list[dict] = []   # collects {club, season_year, url, error}

def fetch_tm(url: str, _club: str = "", _year: int = 0) -> BeautifulSoup | None:
    for attempt in range(MAX_RETRY + 1):
        try:
            r = requests.get(url, headers=TM_HEADERS, timeout=20)
            if r.status_code == 429:
                print("  Rate-limited, sleeping 30s…")
                time.sleep(30)
                continue
            r.raise_for_status()
            return BeautifulSoup(r.text, "lxml")
        except Exception as e:
            if attempt == MAX_RETRY:
                print(f"  ERROR {url}: {e}")
                TM_FAILURES.append({"club": _club, "season_year": _year, "url": url, "error": str(e)})
                return None
            time.sleep(5)
    return None

def scrape_squad_tm(club: str, season_year: int) -> list[dict]:
    """
    Returns list of {name, tm_player_id, positions, birth_year, nationality}.
    Rating is stored as 0 and filled later via fifaindex.
    """
    info = TM_CLUBS.get(club)
    if info is None:
        return []
    slug, tid = info

    url  = (f"https://www.transfermarkt.de/{slug}/kader/verein/{tid}"
            f"/saison_id/{season_year}/plus/1")
    soup = fetch_tm(url, _club=club, _year=season_year)
    if soup is None:
        return []

    players   = []
    seen_pids = set()

    for row in soup.select("table.items tbody tr"):
        # Player link: td.posrela > table.inline-table > tr > td.hauptlink > a
        link = row.select_one("td.posrela td.hauptlink a")
        if not link:
            continue
        pm = re.search(r"/spieler/(\d+)", link.get("href", ""))
        if not pm:
            continue
        pid  = int(pm.group(1))
        name = link.get_text(strip=True)
        if pid in seen_pids:
            continue
        seen_pids.add(pid)

        # Position — second tr of the inline-table has the position text
        pos_td = row.select_one("td.posrela table.inline-table tr:nth-child(2) td")
        raw_pos   = pos_td.get_text(strip=True) if pos_td else ""
        positions = tm_pos(raw_pos)

        # Birth year — zentriert cell with format "DD.MM.YYYY (age)"
        birth_year = None
        for td in row.find_all("td", class_="zentriert"):
            m = re.search(r"\b(19[4-9]\d|200\d|201\d|202[0-6])\b", td.get_text())
            if m:
                birth_year = int(m.group(1))
                break

        # Nationality — img.flaggenrahmen alt attribute
        nationality = None
        flag = row.select_one("img.flaggenrahmen")
        if flag:
            nationality = (flag.get("alt") or flag.get("title") or "").strip() or None

        players.append({
            "name":          name,
            "tm_player_id":  pid,
            "positions":     positions,
            "birth_year":    birth_year,
            "nationality":   nationality,
        })

    return players


# ── Player aggregation ────────────────────────────────────────────────────────

def build_players(
    all_participants: list[dict],
    squad_map: dict[tuple, list[dict]],
) -> list[dict]:
    by_pid: dict[int, dict] = {}

    for entry in all_participants:
        year = 2000 + int(entry["season"][:2])
        key  = (entry["club"], year)
        for p in squad_map.get(key, []):
            pid = p["tm_player_id"]
            if pid not in by_pid:
                by_pid[pid] = {
                    "name":        p["name"],
                    "positions":   p["positions"],
                    "birth_year":  p["birth_year"],
                    "nationality": p["nationality"],
                    "seasons":     [],
                }
            se = {"club": entry["club"], "season": entry["season"], "rating": 0}
            if se not in by_pid[pid]["seasons"]:
                by_pid[pid]["seasons"].append(se)

    result = []
    for pid, data in by_pid.items():
        data["seasons"].sort(key=lambda s: s["season"])
        result.append({
            "id":          make_id(data["name"], pid),
            "name":        data["name"],
            "positions":   data["positions"],
            "birthYear":   data["birth_year"],
            "nationality": data["nationality"],
            "seasons":     data["seasons"],
        })
    return result


# ── JS output ─────────────────────────────────────────────────────────────────

def js_str(s) -> str:
    return "'" + str(s or "").replace("\\", "\\\\").replace("'", "\\'") + "'"

def write_participants_js(entries: list[dict], path: Path, var_name: str, comment: str):
    lines = [
        "// Auto-generated by scripts/scrape_european_cups.py",
        f"// {comment}",
        "// result: 'winner'|'final'|'sf'|'qf'|'r16'|'r32'|'po'|'group'",
        "",
        f"export const {var_name} = [",
    ]
    for e in entries:
        lines.append(
            f"  {{ club: {js_str(e['club'])}, season: {js_str(e['season'])}, "
            f"result: {js_str(e['result'])} }},"
        )
    lines += ["];", ""]
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  → {len(entries)} entries  {path.name}")

def write_players_js(players: list[dict], path: Path):
    lines = [
        "// Auto-generated by scripts/scrape_european_cups.py",
        "// European club players — UCL/UEL participants",
        "// ratings are 0 until filled by scrape_fifaindex.py",
        "",
        "export const playersEuropean = [",
    ]
    for p in players:
        pos_js  = "[" + ", ".join(js_str(x) for x in p["positions"]) + "]"
        seas_js = "[" + ", ".join(
            f"{{ club: {js_str(s['club'])}, season: {js_str(s['season'])}, rating: {s['rating']} }}"
            for s in p["seasons"]
        ) + "]"
        nat = js_str(p["nationality"]) if p.get("nationality") else "null"
        by  = p["birthYear"] if p.get("birthYear") else "null"
        lines.append(
            f"  {{ id: {js_str(p['id'])}, name: {js_str(p['name'])}, "
            f"positions: {pos_js}, birthYear: {by}, nationality: {nat}, "
            f"seasons: {seas_js} }},"
        )
    lines += ["];", ""]
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  → {len(players)} players  {path.name}")


# ── Main ──────────────────────────────────────────────────────────────────────

COMP_SEASONS = {
    "ucl": UCL_SEASONS,
    "uel": UEL_SEASONS,
}
COMP_LABELS = {
    "ucl": "Champions League",
    "uel": "Europa League",
}

def run_comp(comp: str, seasons: list[int], dry_run: bool):
    print(f"\n{'='*60}")
    print(f"  {COMP_LABELS[comp]}  {seasons[0]}/{seasons[0]+1}–{seasons[-1]}/{seasons[-1]+1}")
    print(f"{'='*60}")

    all_participants: list[dict] = []
    squad_map: dict[tuple, list[dict]] = {}

    for year in seasons:
        entries = scrape_season_wiki(year, comp)
        winner  = next((e["club"] for e in entries if e["result"] == "winner"), "?")
        print(f"    {len(entries)} clubs  winner: {winner}")
        all_participants.extend(entries)
        time.sleep(DELAY)

    var   = "UCL_PARTICIPANTS" if comp == "ucl" else "UEL_PARTICIPANTS"
    fname = "uclParticipants.js" if comp == "ucl" else "uelParticipants.js"
    write_participants_js(
        all_participants,
        ROOT / "src/data" / fname,
        var,
        f"{COMP_LABELS[comp]} participants",
    )

    if dry_run:
        print("  (dry-run — skipping Transfermarkt squad scrape)")
        return

    # Squads
    seen_keys: set[tuple] = set()
    known = 0; unknown = 0; skipped_buli = 0
    for e in all_participants:
        year = 2000 + int(e["season"][:2])
        key  = (e["club"], year)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        if e["club"] in BUNDESLIGA_CLUBS:
            skipped_buli += 1
            continue
        if TM_CLUBS.get(e["club"]) is None:
            unknown += 1
            continue
        squad = scrape_squad_tm(e["club"], year)
        squad_map[key] = squad
        known += 1
        print(f"    {e['club']:40s}  {e['season']}  {len(squad)} players")
        time.sleep(DELAY)

    print(f"\n  Scraped: {known}  |  Skipped (Bundesliga, in players.js): {skipped_buli}  |  Unknown (no TM ID): {unknown}")

    if TM_FAILURES:
        import json
        fail_path = ROOT / "scripts/tm_slug_failures.json"
        # Merge with any existing failures from a previous run
        existing = json.loads(fail_path.read_text()) if fail_path.exists() else []
        existing_keys = {(f["club"], f["season_year"]) for f in existing}
        new_failures = [f for f in TM_FAILURES if (f["club"], f["season_year"]) not in existing_keys]
        fail_path.write_text(json.dumps(existing + new_failures, indent=2, ensure_ascii=False))
        print(f"  ⚠  {len(TM_FAILURES)} TM failures logged → {fail_path.name}")

    players = build_players(all_participants, squad_map)
    write_players_js(players, ROOT / "src/data/playersEuropean.js")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Only scrape Wikipedia participants, skip TM squad pages")
    ap.add_argument("--comp",    choices=["ucl", "uel", "both"], default="both")
    ap.add_argument("--from",    dest="from_year", type=int, default=2004)
    args = ap.parse_args()

    comps = ["ucl", "uel"] if args.comp == "both" else [args.comp]
    for comp in comps:
        base    = COMP_SEASONS[comp]
        seasons = [y for y in base if y >= args.from_year]
        run_comp(comp, seasons, args.dry_run)

    print("\nDone.")
