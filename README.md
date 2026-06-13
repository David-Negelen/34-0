# 34-0

Build your all-time Bundesliga dream team and simulate a complete season.

## Modes

### Bundesliga / 2. Bundesliga

Pick a formation, difficulty, and draft mode, then fill 11 squad slots one by one. Each spin randomly assigns a club; you then pick one of its players to fill the slot.

- **Kader zuerst** (squad-first): spin a club, choose a player, then assign them to a position
- **Position zuerst** (position-first): pick a position first, then spin for a club

Jokers let you re-spin a club you don't like. On Hard difficulty jokers are disabled and player ratings are hidden.

Player ratings come in two modes:
- **Prime** — every player rated at their career peak
- **Saisonstärke** — rated as they were in the specific season shown

After drafting, a **Saisonprognose** screen shows your squad's line ratings and an estimated finishing position before you start.

### DFB-Pokal

Simulates the full DFB-Pokal knockout tournament (6 rounds, 64 teams drawn from real historical participants). Matches can go to extra time and penalties. The winner is recorded globally — the [statistics page](https://34-0.app/pokal-stats) shows win counts for all clubs that have ever appeared in the dataset.

The Pokal draft draws from a combined pool of Bundesliga and 2. Bundesliga players.

### Karriere

A multi-season career mode. You start in the 2. Bundesliga and work toward promotion.

**Flow each season:**

1. **Draft** — pick from a pool of 2. Bundesliga (or Bundesliga, if promoted) players
2. **Saisonprognose** — review your squad ratings and predicted position
3. **Simulate** — a full 34-matchday season is run
4. **Result** — see the table, Fieberkurve (position-over-time chart), and player stats
5. **Transfer window** — review incoming offers; accept to swap a player, skip to keep your current squad
6. **Next season** — continue or end your career at any time

Promotion and relegation:

| Position | Division | Outcome |
|---|---|---|
| 1st–2nd | 2. Bundesliga | Direct promotion |
| 3rd | 2. Bundesliga | Relegation playoff |
| 1st–15th | Bundesliga | Stay up |
| 16th | Bundesliga | Relegation playoff |
| 17th–18th | Bundesliga | Direct relegation |

When your career ends, a summary screen shows your full season history and cumulative player statistics.

## Simulation

### Squad rating

An overall (OVR) is calculated as a weighted average across four lines:

| Line | Weight |
|------|--------|
| GK   | 12 %   |
| DEF  | 32 %   |
| MID  | 31 %   |
| ATT  | 25 %   |

### Season simulation

Your team plays a full 34-matchday season against 17 real historical opponents. Match outcomes use Poisson-distributed goal counts based on the OVR difference between teams. Goals are attributed to individual players using position-weighted probabilities scaled by each player's rating.

Points: win = 3, draw = 1, loss = 0.

### Leaderboard

After a season you can submit your result (name, OVR, formation, points, record) to the global leaderboard. Separate boards exist for each mode.

## Data

- **~4 000 players** across 1. Bundesliga and 2. Bundesliga history (`players.js`, `players2bl.js`)
- **~4 700 DFB-Pokal players** from historical editions (`pokalPlayers.js`)
- **190 clubs** that have participated in the DFB-Pokal (`dfbPokalParticipants.js`)
- Historic league tables used as season opponents (`historicTables.js`)

Player database browsable at [34-0.app/spieler](https://34-0.app/spieler) — filterable by league, position, and searchable by name.

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
