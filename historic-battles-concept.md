# Historic Battles — Concept

## Core idea
Instead of 17 fixed opponents with hardcoded strengths, each season generates 17 randomly-drawn historical (club, season) pairs as opponents. "Deine 11" plays against e.g. `Bayern München 13/14`, `Schalke 04 11/12`, `Nürnberg 07/08`.

---

## Opponent strength — data-driven, not hardcoded
Each historical team's strength is derived from the existing player data — average rating of the top 14 players for that club+season. This means Bayern 13/14 (Ribery, Robben, Neuer) rates around 88–89, Bayern 08/09 maybe 82, and so on. No manual entry needed. At simulation time we call `getTeamSeasonStrength(players, club, season)`.

The small `gauss(4)` season-form noise stays on top, same as now.

---

## Opponent pool generation — stratified, not fully random
Fully random would risk 17 Bayern peaks or 17 relegation squads. Instead, mirror the current league's strength curve:

1. Compute strength for every valid (club, season) pair (needs ≥12 players with ratings for that year).
2. Bin them into tiers: elite (≥82), strong (75–81), mid (67–74), weak (<67).
3. Sample to match a realistic tier distribution — roughly 1 elite, 4 strong, 7 mid, 5 weak — per the current BUNDESLIGA_TEAMS / ZWEITE_LIGA_TEAMS distribution.
4. Apply one-club-per-season constraint (no "Bayern 13/14" + "Bayern 14/15" in same game).

---

## Display
- League table shows `'Bayern München 13/14'`, `'Schalke 04 11/12'` etc.
- Season label derived from the existing `'2013-14'` string → `'13/14'`.
- FeverCurve tooltips show the historic name too.
- Club badge colors: CLUBS map in `players.js` already has hex colors — same lookup works.

---

## Mode toggle
New option on `SetupScreen`: **Klassisch** vs **Historisch**. Threads as `mode = 'classic' | 'historic'` alongside the existing `league` prop. Historic only changes opponent generation; the draft, formation, rating mode, difficulty, and leaderboard are all unchanged except:
- Leaderboard mode string gets a prefix: `historic_bl_easy_prime` instead of `bl_easy_prime`.

---

## What doesn't change
- Draft flow, SpinPanel, formations, player cards — untouched.
- 2BL works identically (draws from `players2bl.js` instead).
- Simulation engine (`simulateFullLeague`) gets one new optional `opponents` param; if absent it falls back to the existing static arrays.

---

## Open question
**Data club name mismatch**: `players.js` has `'Bayern München'`, simulation has `'FC Bayern München'`. In historic mode the team names come from the player data directly. That's fine for display — just means they differ slightly from classic mode names. Confirm this is OK, or add a canonical name mapping.

---

## Files to touch
1. `src/utils/simulation.js` — `getTeamSeasonStrength()`, `buildHistoricOpponents()`, update `simulateFullLeague()` signature
2. `src/components/SetupScreen.jsx` — Klassisch/Historisch toggle
3. `src/components/ResultScreen.jsx` — season label in table rows
4. `src/App.jsx` — thread `mode` prop
5. `src/utils/leaderboard.js` — mode string prefix
