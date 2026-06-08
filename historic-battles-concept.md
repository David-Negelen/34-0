# Historic Battles — Concept

## Core idea
Instead of 17 fixed opponents with hardcoded strengths, each season generates 17 randomly-drawn historical (club, season) pairs as opponents. "Deine 11" plays against e.g. `Bayern München 13/14`, `Schalke 04 11/12`, `Nürnberg 07/08`.

---

## Opponent strength — scraped final tables, not player ratings

**Why not FIFA ratings:** FIFA card values are issued the season *after* — a team's 14/15 squad reflects 13/14 performances. This would systematically mis-rate teams that over- or underperformed their paper squad (e.g. Augsburg 14/15 finished 5th, but their FIFA ratings reflect a mid-table side).

**Solution: scrape historical final tables** — points earned are the direct truth of how strong a team was in a given season.

### Data format
A new generated file `src/data/historicTables.js` with a lookup:
```js
export const HISTORIC_TABLES = {
  bl: {
    'Bayern München': { '2013-14': { pts: 90, pos: 1 }, '2014-15': { pts: 79, pos: 1 }, ... },
    'FC Augsburg':    { '2014-15': { pts: 61, pos: 5  }, ... },
    ...
  },
  '2bl': {
    'FC Schalke 04':  { '2020-21': { pts: 34, pos: 18 }, ... },
    ...
  },
};
```

### Strength formula
Map points to the 55–92 strength range used by the simulation, normalized per league:
- BL: ~30 pts (relegation floor) → 55, ~90 pts (title-winning ceiling) → 92
- 2BL: calibrated separately (lower absolute points totals)
- Formula: `strength = 55 + ((pts - PTS_MIN) / (PTS_MAX - PTS_MIN)) * 37`
- `gauss(4)` season-form noise applied at runtime, same as now.

### Scraping target
Transfermarkt or worldfootball.net have clean historical final tables. Write a Python script `scripts/scrape_historic_tables.py` (same pattern as existing export scripts) that outputs `historicTables.js`. Covers all seasons in the player data range (~2004-05 to 2024-25) for both BL and 2BL.

---

## Opponent pool generation — stratified, not fully random
Fully random would risk 17 Bayern peaks or 17 relegation squads. Instead, mirror the current league's strength curve:

1. Valid pairs: any (club, season) present in `HISTORIC_TABLES` for the active league.
2. Bin by final table points into tiers: elite (pos 1–2), strong (pos 3–6), mid (pos 7–14), weak (pos 15–18).
3. Sample to match a realistic distribution — roughly 1–2 elite, 3–4 strong, 7–8 mid, 3–4 weak.
4. One entry per club maximum (no "Bayern 13/14" + "Bayern 14/15" in same game).

---

## Display
- League table shows `'Bayern München 13/14'`, `'Schalke 04 11/12'` etc.
- Season label derived from the `'2013-14'` key → `'13/14'`.
- FeverCurve tooltips show the historic name.
- Club badge colors: CLUBS map in `players.js` already has hex colors — same lookup works.

---

## Mode toggle
New option on `SetupScreen`: **Klassisch** vs **Historisch**. Threads as `battleMode = 'classic' | 'historic'` alongside the existing `league` prop. Historic only changes opponent generation; the draft, formation, rating mode, difficulty, and leaderboard are all unchanged except:
- Leaderboard mode string gets a prefix: `historic_bl_easy_prime` instead of `bl_easy_prime`.

---

## What doesn't change
- Draft flow, SpinPanel, formations, player cards — untouched.
- 2BL works identically (uses `HISTORIC_TABLES['2bl']`).
- Simulation engine (`simulateFullLeague`) gets one new optional `opponents` param; if absent it falls back to the existing static arrays.

---

## Open question
**Club name consistency**: `players.js` uses `'Bayern München'`, `HISTORIC_TABLES` keys must match. Use the player data names as the canonical source — scraping script maps to them. The slight difference from classic mode names (`'FC Bayern München'`) is acceptable.

---

## Files to touch
1. `scripts/scrape_historic_tables.py` — new scraper, outputs `historicTables.js`
2. `src/data/historicTables.js` — generated lookup (not edited by hand)
3. `src/utils/simulation.js` — `buildHistoricOpponents()`, update `simulateFullLeague()` signature
4. `src/components/SetupScreen.jsx` — Klassisch/Historisch toggle
5. `src/components/ResultScreen.jsx` — season label in table rows
6. `src/App.jsx` — thread `battleMode` prop
7. `src/utils/leaderboard.js` — mode string prefix
