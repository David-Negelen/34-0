#!/usr/bin/env python3
"""
Scrape nationality for all players already in bundesliga_draft.db and
zweite_liga_draft.db that are not yet in playerNationalities.json.

Output: src/data/playerNationalities.json  { [tm_id]: "Germany" | null }

Safe to interrupt and resume — already-fetched entries are skipped.

Usage:
    source .venv/bin/activate
    python scripts/scrape_nationalities.py
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

ROOT    = Path(__file__).parent.parent
OUTPUT  = ROOT / "src" / "data" / "playerNationalities.json"

DBS = [
    ROOT / "bundesliga_draft.db",
    ROOT / "zweite_liga_draft.db",
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

DELAY        = 1.5   # seconds between requests
RETRY_DELAY  = 45.0  # seconds when rate-limited
CHECKPOINT   = 50    # save JSON every N players


# ── Load player IDs from existing DBs ────────────────────────────────────────

players: dict[int, str] = {}  # tm_id → name

for db_path in DBS:
    if not db_path.exists():
        print(f"Skipping missing DB: {db_path.name}")
        continue
    con = sqlite3.connect(db_path)
    for row in con.execute("SELECT tm_id, name FROM players").fetchall():
        if row[0] not in players:
            players[row[0]] = row[1]
    con.close()

print(f"Unique players across DBs: {len(players)}")

# ── Resume support ────────────────────────────────────────────────────────────

cache: dict[str, list[str]] = {}

todo = list(players.items())
print(f"Scraping all {len(todo)} players (no cache)\n")

if not todo:
    print("All done!")
    sys.exit(0)


# ── HTTP ──────────────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update(HEADERS)


def fetch_html(url: str, retries: int = 5) -> str | None:
    for attempt in range(retries):
        try:
            time.sleep(DELAY)
            r = session.get(url, timeout=30)
            if r.status_code == 404:
                return None
            if r.status_code in (429, 502, 503):
                wait = RETRY_DELAY * (attempt + 1)
                print(f"    Rate-limited ({r.status_code}), waiting {wait:.0f}s …")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            wait = DELAY * (3 ** (attempt + 1))
            print(f"    Error: {e}, retrying in {wait:.0f}s …")
            time.sleep(wait)
    return None


# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_nationalities(soup: BeautifulSoup) -> list[str]:
    # Method 1: all itemprop="nationality" spans (modern TM layout)
    results = []
    for el in soup.find_all(attrs={"itemprop": "nationality"}):
        text = el.get_text(strip=True)
        if text and text not in results:
            results.append(text)
    if results:
        return results

    # Method 2: all flag images in the info table (fallback)
    for img in soup.select("img.flaggenrahmen"):
        title = (img.get("title") or img.get("alt") or "").strip()
        if title and title not in results:
            results.append(title)

    return results


# ── Main loop ─────────────────────────────────────────────────────────────────

found = 0
not_found = 0
errors = 0
checkpoint = 0

for i, (tm_id, name) in enumerate(todo):
    url = f"{BASE}/-/profil/spieler/{tm_id}"
    label = f"[{i + 1}/{len(todo)}] {name[:30]:<30}"

    try:
        html = fetch_html(url)
        if html is None:
            cache[str(tm_id)] = []
            not_found += 1
            print(f"{label} 404")
        else:
            soup = BeautifulSoup(html, "lxml")
            nats = parse_nationalities(soup)
            cache[str(tm_id)] = nats
            if nats:
                found += 1
                print(f"{label} → {', '.join(nats)}")
            else:
                print(f"{label} → (no nationality found)")
    except Exception as e:
        cache[str(tm_id)] = []
        errors += 1
        print(f"{label} ERROR: {e}")

    checkpoint += 1
    if checkpoint % CHECKPOINT == 0:
        OUTPUT.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        print(f"\n--- checkpoint: {len(cache)} saved (found:{found} 404:{not_found} err:{errors}) ---\n")

OUTPUT.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
print(f"\nDone. {found} nationalities found, {not_found} not found, {errors} errors.")
print(f"Total entries: {len(cache)} → {OUTPUT}")
