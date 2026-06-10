# 34-0

Build your all-time Bundesliga dream team and simulate a complete season.

## How it works

### Draft

You pick your formation, difficulty, and draft mode, then fill 11 squad slots one by one. Each spin randomly assigns a club; you then pick one of its players to fill the slot.

- **Kader zuerst** (squad-first): spin a club, choose a player, then assign them to a position
- **Position zuerst** (position-first): pick a position first, then spin for a club

Jokers let you re-spin a club you don't like. On Hard difficulty jokers are disabled and player ratings are hidden.

Player ratings come in two modes:
- **Prime** — every player rated at their career peak
- **Saisonstärke** (career) — rated as they were in the specific season shown

### Squad rating

Once your 11 are drafted, an overall rating (OVR) is calculated as a weighted average across four lines:

| Line | Weight |
|------|--------|
| GK   | 12 %   |
| DEF  | 32 %   |
| MID  | 31 %   |
| ATT  | 25 %   |

### Season simulation

Your team plays a full 34-matchday Bundesliga season against the 17 real historical opponents from the selected season table. Match outcomes are generated using Poisson-distributed goal counts based on the OVR difference between your team and each opponent. Goals are attributed to individual players using position-weighted probabilities, scaled by each player's rating.

Points: win = 3, draw = 1, loss = 0.

### DFB-Pokal

A separate mode simulates the full DFB-Pokal knockout tournament (6 rounds, 64 teams drawn from real historical participants). Matches can go to extra time and penalties. The winner is recorded globally — the [statistics page](https://34-0.app/pokal-stats) shows win counts for all 190 clubs that have ever appeared in the dataset.

### Leaderboard

After a season you can submit your result (name, OVR, formation, points, record) to the global leaderboard. Separate boards exist for each mode combination.

## Data

- **~4 000 players** across 1. Bundesliga and 2. Bundesliga history (`players.js`, `players2bl.js`)
- **~4 700 DFB-Pokal players** from historical editions (`pokalPlayers.js`)
- **190 clubs** that have participated in the DFB-Pokal (`dfbPokalParticipants.js`)
- Historic league tables used as season opponents (`historicTables.js`)

## Tech stack

- React + Vite (SPA)
- [PocketBase](https://pocketbase.io) for leaderboard and Pokal stats persistence
- Deployed at [34-0.app](https://34-0.app)

## Local dev

```bash
npm install
npm run dev
```

Set `VITE_PB_URL` in a `.env` file to point at a local or remote PocketBase instance. Defaults to `https://api.34-0.app`.
