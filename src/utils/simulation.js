import { calcSquadRatings } from './ratingCalc';
import { getOopPenalty } from './positionUtils';
import { HISTORIC_TABLES } from '../data/historicTables';
import { dfbPokalParticipants } from '../data/dfbPokalParticipants';

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Box-Muller: mean-0 Gaussian with given sigma
function gauss(sigma) {
  const u = 1 - Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// ── Player event simulation ───────────────────────────────────────────────────

const SCORE_WEIGHTS  = { GK:0, RB:2, CB:1, LB:2, DM:3, CM:6, AM:10, LM:12, RM:12, RW:14, LW:14, ST:22 };
const ASSIST_WEIGHTS = { GK:1, RB:5, CB:2, LB:5, DM:8, CM:14, AM:20, LM:16, RM:16, RW:14, LW:14, ST:6 };

// Scale each player's weight by their rating relative to a baseline of 75.
// A 90-rated player gets ~1.7x the baseline weight; a 60-rated player gets ~0.51x.
function ratingFactor(rating) {
  return Math.pow((rating ?? 75) / 75, 3);
}

function weightedPick(pool, weights) {
  const total = pool.reduce((s, p) => s + (weights[p.slotType] ?? 1) * ratingFactor(p.rating), 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= (weights[p.slotType] ?? 1) * ratingFactor(p.rating);
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}

// goalsForReg: goals scored in regular time (so ET goals get minutes 91–120)
export function generateMatchEvents(goalsFor, goalsAgainst, squad, gkGoalChance = 0.01, aet = false, goalsForReg = null) {
  const events = [];
  const gk = squad.find(p => p.slotType === 'GK');
  const regGoals = goalsForReg ?? goalsFor;

  // GK last-minute equalizer: keeper pushes up when 1 goal down and scores.
  // Check is against the pre-GK-goal score (goalsFor - 1 vs goalsAgainst), so
  // the condition is goalsAgainst === goalsFor (the GK's goal brings it level).
  const gkLateGoal = gk && goalsAgainst === goalsFor && Math.random() < gkGoalChance;  // league: 1%, pokal: 4%

  for (let i = 0; i < goalsFor; i++) {
    const isLast = i === goalsFor - 1;
    const scorer = gkLateGoal && isLast ? gk : weightedPick(squad, SCORE_WEIGHTS);
    const hasAssist = Math.random() < 0.62;
    const pool2    = squad.filter(p => p !== scorer);
    const assister = hasAssist && pool2.length ? weightedPick(pool2, ASSIST_WEIGHTS) : null;
    let minute;
    if (gkLateGoal && isLast) {
      minute = aet ? Math.floor(Math.random() * 6) + 119 : Math.floor(Math.random() * 6) + 90;
    } else if (aet && i >= regGoals) {
      minute = Math.floor(Math.random() * 30) + 91;
    } else {
      minute = Math.floor(Math.random() * 90) + 1;
    }
    events.push({ type: 'goal', minute, scorer, assister });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

// ── Match simulation ──────────────────────────────────────────────────────────

// Simulate a single match with separate attack/defense ratings.
// lambdaH is driven by home attack vs away defense; lambdaA vice-versa.
// Home advantage baked in as +0.18 / -0.18.
export function simulateMatch(hAtt, hDef, aAtt, aDef) {
  const lambdaH = Math.max(0.40, 1.40 + 0.15 + (hAtt - aDef) * 0.040);
  const lambdaA = Math.max(0.40, 1.40 - 0.15 + (aAtt - hDef) * 0.040);
  return { hg: poisson(lambdaH), ag: poisson(lambdaA) };
}

// ── League teams ──────────────────────────────────────────────────────────────

const BUNDESLIGA_TEAMS = [
  { name: 'FC Bayern München',          strength: 90 },
  { name: 'Borussia Dortmund',          strength: 82 },
  { name: 'Bayer 04 Leverkusen',        strength: 81 },
  { name: 'VfB Stuttgart',              strength: 76 },
  { name: 'Eintracht Frankfurt',        strength: 74 },
  { name: 'TSG 1899 Hoffenheim',        strength: 71 },
  { name: 'SC Freiburg',                strength: 71 },
  { name: 'Borussia Mönchengladbach',   strength: 70 },
  { name: 'Werder Bremen',              strength: 68 },
  { name: '1. FC Union Berlin',         strength: 68 },
  { name: 'FC Augsburg',                strength: 66 },
  { name: '1. FSV Mainz 05',            strength: 66 },
  { name: 'VfL Wolfsburg',              strength: 65 },
  { name: 'VfL Bochum',                 strength: 63 },
  { name: 'FC St. Pauli',               strength: 62 },
  { name: 'Holstein Kiel',              strength: 60 },
  { name: 'SV Darmstadt 98',            strength: 58 },
];

const ZWEITE_LIGA_TEAMS = [
  { name: 'FC Schalke 04',              strength: 68 },
  { name: 'Hannover 96',                strength: 67 },
  { name: 'Fortuna Düsseldorf',         strength: 66 },
  { name: 'Hertha BSC',                 strength: 65 },
  { name: 'VfL Bochum',                 strength: 65 },
  { name: 'SV Darmstadt 98',            strength: 64 },
  { name: '1. FC Kaiserslautern',       strength: 63 },
  { name: 'Arminia Bielefeld',          strength: 62 },
  { name: 'SC Paderborn 07',            strength: 62 },
  { name: '1. FC Nürnberg',             strength: 61 },
  { name: 'SpVgg Greuther Fürth',       strength: 61 },
  { name: 'Holstein Kiel',              strength: 60 },
  { name: 'Karlsruher SC',              strength: 60 },
  { name: 'SV Elversberg',              strength: 59 },
  { name: '1. FC Magdeburg',            strength: 58 },
  { name: 'Eintracht Braunschweig',     strength: 57 },
  { name: 'Preußen Münster',            strength: 56 },
];

const DRITTE_LIGA_TEAMS = [
  { name: '1. FC Saarbrücken',          club: '1. FC Saarbrücken',   strength: 62 },
  { name: 'Dynamo Dresden',             club: 'Dynamo Dresden',       strength: 61 },
  { name: 'TSV 1860 München',           club: 'TSV 1860 München',     strength: 61 },
  { name: 'FC Ingolstadt 04',           club: 'FC Ingolstadt 04',     strength: 60 },
  { name: 'MSV Duisburg',               club: 'MSV Duisburg',         strength: 60 },
  { name: 'FC Hansa Rostock',           club: 'FC Hansa Rostock',     strength: 59 },
  { name: 'Preußen Münster',            club: 'Preußen Münster',      strength: 59 },
  { name: 'SpVgg Unterhaching',         club: 'SpVgg Unterhaching',   strength: 58 },
  { name: 'Hallescher FC',              club: 'Hallescher FC',        strength: 58 },
  { name: 'SV Wehen Wiesbaden',         club: 'SV Wehen Wiesbaden',   strength: 57 },
  { name: 'VfL Osnabrück',              club: 'VfL Osnabrück',        strength: 57 },
  { name: 'FC Erzgebirge Aue',          club: 'FC Erzgebirge Aue',    strength: 56 },
  { name: 'Rot-Weiß Erfurt',            club: 'Rot-Weiß Erfurt',      strength: 56 },
  { name: 'FC Viktoria Köln',           club: 'FC Viktoria Köln',     strength: 55 },
  { name: 'SV Waldhof Mannheim',        club: 'SV Waldhof Mannheim',  strength: 55 },
  { name: 'FSV Zwickau',                club: 'FSV Zwickau',          strength: 54 },
  { name: 'FC Carl Zeiss Jena',         club: 'FC Carl Zeiss Jena',   strength: 53 },
];

// ── Historic opponent generation ──────────────────────────────────────────────

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Map final-table points to simulation strength range.
// BL:  [16, 91] pts → [55, 92]; 2BL: [19, 76] pts → [54, 71]; 3L: [19, 76] pts → [50, 64]
function ptsToStrength(pts, league) {
  if (league === '2bl') return Math.round(Math.min(71, Math.max(54, 54 + (pts - 19) / 57 * 17)));
  if (league === '3l')  return Math.round(Math.min(64, Math.max(50, 50 + (pts - 19) / 57 * 14)));
  return Math.round(Math.min(92, Math.max(55, 55 + (pts - 16) / 75 * 37)));
}

// Draft-appeal weight: bucket teams into bad / icons / allround.
// bad = 0 draftable players → weight 1  (~5%)
// icons = 1–3 draftable players → weight 12 (~60%)
// allround = 4+ draftable players → weight 7  (~35%)
// Exact percentages depend on pool composition; ratios 1:12:7 give the right ballpark.
const ICON_THRESHOLD = 78;
function draftAppealW(club, season, allPlayers) {
  const key = seasonLabelToKey(season);
  const good = allPlayers.filter(p =>
    p.seasons.some(s => s.club === club && s.season === key && s.rating >= ICON_THRESHOLD)
  ).length;
  if (good === 0) return 1;
  if (good <= 3)  return 12;
  return 7;
}

// Build 17 historic opponents stratified by final table position tier.
// One entry per club; strength derived from actual season points.
// Within each tier, selection weighted by draft appeal (icon players > raw strength).
function buildHistoricOpponents(league, allPlayers = []) {
  const tables = HISTORIC_TABLES[league] ?? {};
  const all = [];
  for (const [club, seasons] of Object.entries(tables)) {
    for (const [season, { pos, pts }] of Object.entries(seasons)) {
      all.push({ club, season, pos, pts, strength: ptsToStrength(pts, league) });
    }
  }

  function pickWeighted(pool, weightFn) {
    const total = pool.reduce((s, e) => s + weightFn(e), 0);
    let r = Math.random() * total;
    for (const e of pool) { r -= weightFn(e); if (r <= 0) return e; }
    return pool[pool.length - 1];
  }

  // Tiers: top(1-3), strong(4-9), mid(10-15), bottom(16+) → targets: 4/8/3/2 = 17
  // All tiers weighted by draft appeal so icon players from any tier appear often.
  const w = e => draftAppealW(e.club, e.season, allPlayers);
  const tiers = [
    { entries: all.filter(e => e.pos <= 3),                 target: 4, weightFn: w },
    { entries: all.filter(e => e.pos >= 4 && e.pos <= 9),   target: 8, weightFn: w },
    { entries: all.filter(e => e.pos >= 10 && e.pos <= 15), target: 3, weightFn: w },
    { entries: all.filter(e => e.pos >= 16),                target: 2, weightFn: w },
  ];

  const selected = [];
  const usedClubs = new Set();

  for (const { entries, target, weightFn } of tiers) {
    let pool = entries.filter(e => !usedClubs.has(e.club));
    for (let i = 0; i < target && pool.length > 0; i++) {
      const e = pickWeighted(pool, weightFn);
      selected.push(e);
      usedClubs.add(e.club);
      pool = pool.filter(p => !usedClubs.has(p.club));
    }
  }

  // Fill any remaining slots (edge case: not enough unique clubs per tier)
  let pool = all.filter(e => !usedClubs.has(e.club));
  while (selected.length < 17 && pool.length > 0) {
    const e = pickWeighted(pool, w);
    selected.push(e);
    usedClubs.add(e.club);
    pool = pool.filter(p => !usedClubs.has(p.club));
  }

  return selected.map(e => ({ name: `${e.club} ${e.season}`, strength: e.strength, club: e.club, season: e.season }));
}

// ── Schedule builder ─────────────────────────────────────────────────────────

// Standard polygon/circle algorithm: fix team 0, rotate teams 1..n-1.
// Returns (n-1) rounds, each with n/2 [homeIdx, awayIdx] pairs.
// n=18 → 17 rounds × 9 games; every team plays exactly once per round.
function buildRoundRobinRounds(n) {
  const rotating = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [[0, rotating[0]]];
    for (let i = 1; i < n / 2; i++) round.push([rotating[i], rotating[n - 1 - i]]);
    rotating.unshift(rotating.pop());
    rounds.push(round);
  }
  return rounds;
}

// ── Full league simulation ────────────────────────────────────────────────────

// 34-round proper Bundesliga schedule (17 Hinrunde + 17 Rückrunde).
// Returns { result, table, playerMatches, playerStats, tableHistory } where:
//   tableHistory — 34 sorted table snapshots (one per matchday)
// '13/14' → '2013-14'
function seasonLabelToKey(label) {
  const [a, b] = label.split('/');
  return `20${a}-${b}`;
}

// Compute the att/def simulation strengths for a squad (same formula used inside the sim).
export function calcTeamStrength(slots) {
  const ratings = calcSquadRatings(slots);
  const overall  = ratings.overall ?? 75;
  const ovrBoost = overall > 82 ? Math.pow(overall - 82, 1.5) : 0;
  const att = Math.min(99, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3 + ovrBoost));
  const def = Math.min(99, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35 + ovrBoost));
  return { att, def, ovr: overall };
}

// extraTeams: [{name, att, def}] — real multiplayer opponents injected into the league.
export function simulateFullLeague(slots, league = 'bl', allPlayers = [], extraTeams = []) {
  const { att: attStr, def: defStr, ovr: overall } = calcTeamStrength(slots);
  const ovrBoost = overall > 82 ? Math.pow(overall - 82, 1.5) : 0;

  // Late-game boost: for 90+ OVR squads, effective strength can exceed 99 in lambda
  // calculations, making 34-0-0 achievable. 95 OVR → +7.5, 100 OVR → +15.
  const lateBoost = overall > 90 ? (overall - 90) * 3 : 0;

  // Bad season: 12% chance of underperforming — makes finishing 2nd or lower possible.
  const formPenalty = Math.random() < 0.12 ? -(8 + Math.floor(Math.random() * 6)) : 0;

  // Each team gets a season-form offset (σ=6) so the table shuffles each run.
  // Bayern still mostly wins; Paderborn mostly struggles — but nothing is guaranteed.
  const historicOpponents = buildHistoricOpponents(league, allPlayers);
  const allLeagueTeams = historicOpponents.length === 17
    ? historicOpponents
    : (league === '2bl' ? ZWEITE_LIGA_TEAMS : league === '3l' ? DRITTE_LIGA_TEAMS : BUNDESLIGA_TEAMS);
  // When real-player opponents are injected, reduce CPU team count so total stays at 18.
  const cpuCount = Math.max(1, 17 - extraTeams.length);
  const LEAGUE_TEAMS = extraTeams.length > 0
    ? shuffleArr([...allLeagueTeams]).slice(0, cpuCount)
    : allLeagueTeams;
  const STRIKER_POS = new Set(['ST', 'LF', 'RF', 'AM', 'SS']);

  const teams = [
    ...LEAGUE_TEAMS.map(t => {
      const eff = Math.round(Math.min(98, Math.max(40, t.strength + gauss(4))));
      let scorerPool = [];
      if (t.season && allPlayers.length) {
        // Historic opponent: exact season, all positions
        const seasonKey = seasonLabelToKey(t.season);
        scorerPool = allPlayers.filter(p => p.seasons.some(s => s.club === t.club && s.season === seasonKey));
      } else if (t.club && allPlayers.length) {
        // Static 3L team: pick a random season from data, strikers only
        const clubStrikers = allPlayers.filter(p =>
          p.positions?.some(pos => STRIKER_POS.has(pos)) &&
          p.seasons.some(s => s.club === t.club)
        );
        if (clubStrikers.length) {
          const seasons = [...new Set(
            clubStrikers.flatMap(p => p.seasons.filter(s => s.club === t.club).map(s => s.season))
          )];
          const picked = seasons[Math.floor(Math.random() * seasons.length)];
          scorerPool = clubStrikers.filter(p => p.seasons.some(s => s.club === t.club && s.season === picked));
        }
      }
      return { ...t, att: eff, def: eff, scorerPool };
    }),
    ...extraTeams.map(t => ({
      name: t.name,
      club: t.name,
      att: Math.round(Math.min(98, Math.max(40, t.att + gauss(4)))),
      def: Math.round(Math.min(98, Math.max(40, t.def + gauss(4)))),
      isRealPlayer: true,
      scorerPool: [],
    })),
    { name: 'Deine 11', att: attStr + lateBoost + formPenalty, def: defStr + lateBoost + formPenalty, isPlayer: true, scorerPool: [] },
  ];
  const n = teams.length; // 18 (cpu + extra real players + player)
  const playerIdx = n - 1;

  const stats = Array.from({ length: n }, () => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));

  // Proper 34-round schedule: Hinrunde rounds then Rückrunde (home/away flipped).
  // Every team plays exactly once per round → player's 34 games come out in order.
  const hinRunde  = buildRoundRobinRounds(n);
  const ruckRunde = hinRunde.map(round => round.map(([h, a]) => [a, h]));

  // Soft-sort only the Hinrunde so the player faces weaker opponents early.
  // Rückrunde mirrors the sorted Hinrunde (same order, home/away flipped) — like a real season.
  const sortedHin = hinRunde
    .map(round => {
      const pm     = round.find(([hi, ai]) => hi === playerIdx || ai === playerIdx);
      const oppIdx = pm ? (pm[0] === playerIdx ? pm[1] : pm[0]) : -1;
      const oppStr = oppIdx >= 0 ? teams[oppIdx].att : 70;
      return { round, sortKey: oppStr + gauss(8) };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(r => r.round);
  const sortedRuck = sortedHin.map(round => round.map(([h, a]) => [a, h]));
  const allRounds = [...sortedHin, ...sortedRuck];

  const playerMatches = [];
  const tableHistory  = [];

  for (const round of allRounds) {
    for (const [hi, ai] of round) {
      const { hg, ag } = simulateMatch(teams[hi].att, teams[hi].def, teams[ai].att, teams[ai].def);

      if (hg > ag) { stats[hi].W++; stats[ai].L++; }
      else if (hg < ag) { stats[hi].L++; stats[ai].W++; }
      else { stats[hi].D++; stats[ai].D++; }

      stats[hi].GF += hg; stats[hi].GA += ag;
      stats[ai].GF += ag; stats[ai].GA += hg;

      if (hi === playerIdx || ai === playerIdx) {
        playerMatches.push({ home: teams[hi].name, away: teams[ai].name, hg, ag });
      }
    }

    // Snapshot the league table after each completed round
    tableHistory.push(
      teams.map((t, i) => ({
        name: t.name, isPlayer: !!t.isPlayer,
        pts: stats[i].W * 3 + stats[i].D, GF: stats[i].GF, GA: stats[i].GA,
      })).sort((a, b) => {
        const pd = b.pts - a.pts; if (pd) return pd;
        const gd = (b.GF - b.GA) - (a.GF - a.GA); if (gd) return gd;
        return b.GF - a.GF;
      }).map((r, i) => ({ ...r, pos: i + 1 }))
    );
  }

  playerMatches.forEach((m, i) => { m.day = i + 1; });

  // Generate per-player events and aggregate season stats (bench excluded)
  const squad = slots
    .filter(s => s.player && s.type !== 'BENCH')
    .map(s => {
      const base = s.player.displayRating ?? s.player.primeRating ?? 75;
      return { id: s.player.id, name: s.player.name, slotType: s.type, slotLabel: s.label, rating: Math.max(1, base - getOopPenalty(s.player.positions, s.type)) };
    });

  const statsMap = {};
  squad.forEach(p => { statsMap[p.id] = { id: p.id, name: p.name, slotLabel: p.slotLabel, slotType: p.slotType, goals: 0, assists: 0, cleanSheets: 0 }; });

  playerMatches.forEach(m => {
    const goalsFor    = m.home === 'Deine 11' ? m.hg : m.ag;
    const goalsAgainst = m.home === 'Deine 11' ? m.ag : m.hg;
    if (goalsAgainst === 0) {
      squad
        .filter(p => ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.slotType))
        .forEach(p => { statsMap[p.id].cleanSheets++; });
    }
    const events = squad.length ? generateMatchEvents(goalsFor, goalsAgainst, squad) : [];
    m.events = events;
    const oppTeamName = m.home === 'Deine 11' ? m.away : m.home;
    const oppTeam = teams.find(t => t.name === oppTeamName);
    const oppPool = oppTeam?.scorerPool ?? [];
    m.oppGoals = Array.from({ length: goalsAgainst }, () => {
      const minute = Math.floor(Math.random() * 90) + 1;
      let scorerName = null;
      if (oppPool.length) {
        const totalW = oppPool.reduce((s, p) => s + (SCORE_WEIGHTS[p.positions[0]] ?? 1), 0);
        let r = Math.random() * totalW;
        for (const p of oppPool) { r -= (SCORE_WEIGHTS[p.positions[0]] ?? 1); if (r <= 0) { scorerName = p.name; break; } }
        if (!scorerName) scorerName = oppPool[oppPool.length - 1].name;
      }
      return { minute, scorerName };
    }).sort((a, b) => a.minute - b.minute);
    events.forEach(e => {
      if (e.type === 'goal') { statsMap[e.scorer.id].goals++; if (e.assister) statsMap[e.assister.id].assists++; }
    });
  });

  const playerStats = squad.map(p => ({ ...statsMap[p.id], games: 34 }));

  // Build sorted table
  const table = teams.map((t, i) => ({
    name: t.name,
    isPlayer: !!t.isPlayer,
    ...stats[i],
    pts: stats[i].W * 3 + stats[i].D,
  })).sort((a, b) => {
    const pd = b.pts - a.pts;
    if (pd !== 0) return pd;
    const gd = (b.GF - b.GA) - (a.GF - a.GA);
    if (gd !== 0) return gd;
    return b.GF - a.GF;
  }).map((r, i) => ({ ...r, pos: i + 1 }));

  const ps = stats[playerIdx];
  const playerPos = table.find(r => r.isPlayer)?.pos ?? 18;
  const gkGoal = playerStats.some(p => p.slotType === 'GK' && p.goals > 0);
  const ratings = calcSquadRatings(slots);
  const result = {
    W: ps.W, D: ps.D, L: ps.L,
    GF: ps.GF, GA: ps.GA,
    pts: ps.W * 3 + ps.D,
    pos: playerPos,
    gkGoal,
    ratings,
  };

  return { result, table, playerMatches, playerStats, tableHistory };
}

// ── DFB-Pokal simulation ──────────────────────────────────────────────────────

const POKAL_BLACKLIST = new Set(['RB Leipzig']);
const POKAL_LOWER_STRENGTH = 50;

const POKAL_ROUNDS = [
  '1. Runde', '2. Runde', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale',
];

function pokalTier(club, season) {
  if (HISTORIC_TABLES.bl[club]?.[season])    return 'bl';
  if (HISTORIC_TABLES['2bl'][club]?.[season]) return '2bl';
  return 'lower';
}

function pokalStrength(club, season) {
  const bl  = HISTORIC_TABLES.bl[club]?.[season];
  const tbl = HISTORIC_TABLES['2bl'][club]?.[season];
  if (bl)  return ptsToStrength(bl.pts, 'bl');
  if (tbl) return ptsToStrength(tbl.pts, '2bl');
  return POKAL_LOWER_STRENGTH;
}

// Build a scorer name index: Map<"club|seasonKey", [{name, positions}]>
function buildScorerIndex(players) {
  const index = new Map();
  const seen = new Set();
  for (const p of players) {
    for (const s of (p.seasons ?? [])) {
      const uid = `${p.name}|${s.club}|${s.season}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const k = `${s.club}|${s.season}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push({ name: p.name, positions: p.positions ?? ['CM'] });
    }
  }
  return index;
}

// Build the 64-team Pokal field: player + 39 historic BL/2BL + 24 historic lower/amateur.
// Simple random selection — no draft-appeal weighting needed for opponents.
export function buildPokalField(slots, allPlayers = []) {
  const ratings  = calcSquadRatings(slots);
  const overall  = ratings.overall ?? 75;
  const ovrBoost = overall > 82 ? Math.pow(overall - 82, 1.5) : 0;
  const attStr   = Math.min(99, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3 + ovrBoost));
  const defStr   = Math.min(99, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35 + ovrBoost));

  const scorerIdx = buildScorerIndex(allPlayers);

  const pool = dfbPokalParticipants
    .filter(e => !POKAL_BLACKLIST.has(e.club))
    .map(e => ({ ...e, tier: pokalTier(e.club, e.season), strength: pokalStrength(e.club, e.season) }));

  const upper = shuffleArr(pool.filter(e => e.tier === 'bl' || e.tier === '2bl'));
  const lower = shuffleArr(pool.filter(e => e.tier === 'lower'));

  function makeTeam(e, attOverride) {
    const seasonKey = seasonLabelToKey(e.season);
    const scorerPool = scorerIdx.get(`${e.club}|${seasonKey}`) ?? [];
    const att = attOverride ?? Math.round(Math.min(98, Math.max(40, e.strength + gauss(5))));
    return { name: `${e.club} ${e.season}`, club: e.club, season: e.season, tier: e.tier, att, def: att, scorerPool };
  }

  const pickedUpper = upper.slice(0, 39).map(e => makeTeam(e));
  const pickedLower = lower.slice(0, 24).map(e =>
    makeTeam(e, Math.round(Math.min(60, Math.max(35, POKAL_LOWER_STRENGTH + gauss(5)))))
  );

  const playerTeam = { name: 'Deine 11', tier: 'player', att: attStr, def: defStr, isPlayer: true, scorerPool: [] };

  return [playerTeam, ...pickedUpper, ...pickedLower]; // 64 teams
}

// Draw one round: create pairings, simulate all matches (including player's), return results.
// R1 constraint: no lower vs lower. From R2 onward: free draw.
export function drawPokalRound(teams, round, slots) {
  const player = teams.find(t => t.isPlayer);
  const others = teams.filter(t => !t.isPlayer);
  let pairs;

  if (round === 0) {
    const lower     = shuffleArr(others.filter(t => t.tier === 'lower'));   // 24
    const nonLower  = shuffleArr([player, ...others.filter(t => t.tier !== 'lower')]); // 40
    pairs = [];
    for (const lt of lower) pairs.push([nonLower.pop(), lt]);         // 24 upper+lower pairs
    while (nonLower.length >= 2) pairs.push([nonLower.pop(), nonLower.pop()]); // 8 upper+upper pairs
  } else {
    const shuffled = shuffleArr(teams);
    pairs = [];
    for (let i = 0; i < shuffled.length; i += 2) pairs.push([shuffled[i], shuffled[i + 1]]);
  }

  // R1 + R2: lower-tier team always at home. Otherwise random.
  pairs = pairs.map(([a, b]) => {
    if (round <= 1) {
      if (b.tier === 'lower') return [b, a];
      if (a.tier === 'lower') return [a, b];
    }
    return Math.random() < 0.5 ? [b, a] : [a, b];
  });

  const squad = slots.filter(s => s.player && s.type !== 'BENCH').map(s => {
    const base = s.player.displayRating ?? s.player.primeRating ?? 75;
    return { ...s.player, slotType: s.type, rating: Math.max(1, base - getOopPenalty(s.player.positions, s.type)) };
  });

  const matchups = [];
  const winners  = [];

  for (const [home, away] of pairs) {
    const isPlayerMatch = !!(home.isPlayer || away.isPlayer);
    const result  = simulateKnockout(home.att, home.def, away.att, away.def);
    const homeWon = result.pens ? result.hWins : result.hg > result.ag;

    const entry = {
      homeTeam: home, awayTeam: away,
      home: home.name, away: away.name,
      hg: result.hg, ag: result.ag,
      aet: result.aet, pens: result.pens, penScore: result.penScore ?? null,
      homeWon, isPlayerMatch,
    };

    if (isPlayerMatch) {
      const playerIsHome = !!home.isPlayer;
      const oppTeam = playerIsHome ? away : home;
      const own = playerIsHome ? result.hg : result.ag;
      const opp = playerIsHome ? result.ag : result.hg;
      const ownReg = playerIsHome ? result.hgReg : result.agReg;
      const oppReg = playerIsHome ? result.agReg : result.hgReg;
      const won = playerIsHome ? homeWon : !homeWon;

      const events = squad.length ? generateMatchEvents(own, opp, squad, 0.04, result.aet, ownReg) : [];
      const oppPool = oppTeam.scorerPool ?? [];
      const oppGoals = Array.from({ length: opp }, (_, gi) => {
        const inEt = result.aet && gi >= oppReg;
        const minute = inEt ? Math.floor(Math.random() * 30) + 91 : Math.floor(Math.random() * 90) + 1;
        let scorerName = null;
        if (oppPool.length) {
          const totalW = oppPool.reduce((s, p) => s + (SCORE_WEIGHTS[p.positions[0]] ?? 1), 0);
          let r = Math.random() * totalW;
          for (const p of oppPool) { r -= (SCORE_WEIGHTS[p.positions[0]] ?? 1); if (r <= 0) { scorerName = p.name; break; } }
          if (!scorerName) scorerName = oppPool[oppPool.length - 1].name;
        }
        return { minute, scorerName };
      }).sort((a, b) => a.minute - b.minute);

      entry.playerMatch = {
        round: POKAL_ROUNDS[round],
        opponent: oppTeam.name,
        home: playerIsHome,
        ownGoals: own, oppGoals2: opp,
        aet: result.aet, pens: result.pens, penScore: result.penScore ?? null,
        won, events, oppGoals, kicks: result.kicks ?? [],
      };
    }

    matchups.push(entry);
    winners.push(homeWon ? home : away);
  }

  return { matchups, winners };
}

// Simulate a single knockout game (90 min → optional ET → optional pens).
// Returns { hg, ag, aet, pens, penScore }
// Tuned for Pokal: lower base scoring → ~32% draws for equal teams, more AET + pens.
export function simulateKnockout(hAtt, hDef, aAtt, aDef) {
  const hAdj = Math.max(40, hAtt + gauss(5));
  const aAdj = Math.max(40, aAtt + gauss(5));
  const lambdaH = Math.max(0.25, 0.95 + (hAdj - aDef) * 0.022);
  const lambdaA = Math.max(0.25, 0.80 + (aAdj - hDef) * 0.022);
  const hg = poisson(lambdaH);
  const ag = poisson(lambdaA);

  if (hg !== ag) return { hg, ag, hgReg: hg, agReg: ag, aet: false, pens: false };

  // Extra time: 30 min each side
  const etH = poisson(0.45);
  const etA = poisson(0.45);
  const hTotal = hg + etH;
  const aTotal = ag + etA;

  if (hTotal !== aTotal) return { hg: hTotal, ag: aTotal, hgReg: hg, agReg: ag, aet: true, pens: false };

  // Simulate 5-kick shootout + sudden death. Kicks are stored as a flat alternating
  // array [{side:'home'|'away', scored:bool, sd?:bool}] and stop as soon as one
  // team can no longer be caught (no unnecessary kicks after the result is decided).
  const kicks = [];
  let hPen = 0, aPen = 0;
  for (let i = 0; i < 5; i++) {
    const awayKicksLeft = 5 - i;   // away kicks remaining including this round
    const roundsAfter   = 4 - i;   // full rounds left after this one completes

    const hScored = Math.random() < 0.75;
    if (hScored) hPen++;
    kicks.push({ side: 'home', scored: hScored });
    if (hPen > aPen + awayKicksLeft) break; // home wins; away can't catch up

    const aScored = Math.random() < 0.75;
    if (aScored) aPen++;
    kicks.push({ side: 'away', scored: aScored });
    if (aPen > hPen + roundsAfter) break;   // away wins
    if (hPen > aPen + roundsAfter) break;   // home wins
  }
  // Sudden death: both teams always kick each round; stop when scores diverge
  while (hPen === aPen && kicks.length < 100) {
    const hSD = Math.random() < 0.75;
    if (hSD) hPen++;
    kicks.push({ side: 'home', scored: hSD, sd: true });
    const aSD = Math.random() < 0.75;
    if (aSD) aPen++;
    kicks.push({ side: 'away', scored: aSD, sd: true });
  }
  const hWins = hPen > aPen;

  return { hg: hTotal, ag: aTotal, hgReg: hg, agReg: ag, aet: true, pens: true, penScore: `${hPen}:${aPen}`, hWins, kicks };
}

// Two-legged tie: leg 1 is 90 min only, leg 2 can go to ET + pens.
// Returns { leg1: {hg, ag}, leg2: {hg, ag, hgReg, agReg, aet, pens, penScore}, hWins }
// hWins = whether the original leg-1 home team (H) wins overall.
export function simulateTwoLegTie(hAtt, hDef, aAtt, aDef) {
  // Leg 1: H at home, A away — 90 min only
  const { hg: l1h, ag: l1a } = simulateMatch(hAtt, hDef, aAtt, aDef);

  // Leg 2: A at home, H away — 90 min first
  const { hg: l2h90, ag: l2a90 } = simulateMatch(aAtt, aDef, hAtt, hDef);

  // Aggregate (H's total = leg1 home + leg2 away)
  const aggH = l1h + l2a90;
  const aggA = l1a + l2h90;

  if (aggH !== aggA) {
    return { leg1: { hg: l1h, ag: l1a }, leg2: { hg: l2h90, ag: l2a90, hgReg: l2h90, agReg: l2a90, aet: false, pens: false, penScore: null }, hWins: aggH > aggA };
  }

  // ET in leg 2 (A still home)
  const etAHome = poisson(0.45), etHAway = poisson(0.45);
  const l2h = l2h90 + etAHome, l2a = l2a90 + etHAway;
  const aggHEt = l1h + l2a, aggAEt = l1a + l2h;

  if (aggHEt !== aggAEt) {
    return { leg1: { hg: l1h, ag: l1a }, leg2: { hg: l2h, ag: l2a, hgReg: l2h90, agReg: l2a90, aet: true, pens: false, penScore: null }, hWins: aggHEt > aggAEt };
  }

  // Pens (in leg 2: A home → "home" kicks, H away → "away" kicks)
  const kicks = [];
  let ap = 0, hp = 0;
  for (let i = 0; i < 5; i++) {
    const hKicksLeft = 5 - i, rAfter = 4 - i;
    const aScored = Math.random() < 0.75;
    if (aScored) ap++;
    kicks.push({ side: 'home', scored: aScored });
    if (ap > hp + hKicksLeft) break;
    const hScored = Math.random() < 0.75;
    if (hScored) hp++;
    kicks.push({ side: 'away', scored: hScored });
    if (hp > ap + rAfter || ap > hp + rAfter) break;
  }
  while (ap === hp && kicks.length < 100) {
    const aSD = Math.random() < 0.75;
    if (aSD) ap++;
    kicks.push({ side: 'home', scored: aSD, sd: true });
    const hSD = Math.random() < 0.75;
    if (hSD) hp++;
    kicks.push({ side: 'away', scored: hSD, sd: true });
  }
  // H wins if their (away) pens > A's (home) pens
  return { leg1: { hg: l1h, ag: l1a }, leg2: { hg: l2h, ag: l2a, hgReg: l2h90, agReg: l2a90, aet: true, pens: true, penScore: `${ap}:${hp}`, kicks }, hWins: hp > ap };
}

// ── Achievements ──────────────────────────────────────────────────────────────

export function getAchievements(result, slots = [], league = 'bl', cupInfo = {}) {
  const { W, D, L, GF, GA, pts, pos = 18, gkGoal = false } = result;
  const { pokalWon = false, europeanWon = false, europeanComp = null } = cupInfo;
  const achievements = [];
  const is2bl = league === '2bl';
  const is3l  = league === '3l';
  const leagueWon = pos === 1;

  // ── Trophies ──
  if (leagueWon) {
    const label = is3l ? 'Meister der 3. Liga' : is2bl ? 'Meister der 2. Liga' : 'Deutscher Meister';
    const desc  = is3l ? 'Aufstieg in die 2. Bundesliga.' : is2bl ? 'Aufstieg in die Bundesliga.' : 'Die Schale geholt.';
    achievements.push({ key: 'champions', label, desc, tier: 'trophy' });
  }
  if (pokalWon)                                achievements.push({ key: 'pokal', label: 'DFB-Pokal',         desc: 'Den DFB-Pokal gewonnen.',                          tier: 'trophy' });
  if (europeanWon && europeanComp === 'ucl')   achievements.push({ key: 'ucl',   label: 'Champions League',  desc: 'Die UEFA Champions League gewonnen.',               tier: 'trophy' });
  if (europeanWon && europeanComp === 'uel')   achievements.push({ key: 'uel',   label: 'Europa League',     desc: 'Die UEFA Europa League gewonnen.',                  tier: 'trophy' });

  // ── Combos ──
  if (leagueWon && pokalWon && europeanWon) {
    if (L === 0 && D === 0) achievements.push({ key: 'perfect_treble',    label: 'Triple + 34-0-0',        desc: 'Perfekte Saison und alles gewonnen. Unerreicht.',        tier: 'mega' });
    else if (L === 0)       achievements.push({ key: 'invincible_treble', label: 'Triple + Ungeschlagen',  desc: 'Meister, Pokal, Europa – ohne eine Niederlage.',         tier: 'mega' });
    else                    achievements.push({ key: 'treble',            label: 'Triple!',                desc: 'Meister, Pokal und Europacup – das perfekte Jahr.',      tier: 'mega' });
  } else if (leagueWon && pokalWon) {
    if (L === 0 && D === 0) achievements.push({ key: 'perfect_double',    label: 'Double + 34-0-0',        desc: '34-0-0 und das Double. Eine Legende.',                  tier: 'combo' });
    else if (L === 0)       achievements.push({ key: 'invincible_double', label: 'Double + Ungeschlagen',  desc: 'Meister und Pokal – und kein Spiel verloren.',           tier: 'combo' });
    else                    achievements.push({ key: 'double',            label: 'Double',                desc: 'Meister und DFB-Pokalsieger in einer Saison.',           tier: 'combo' });
  }

  // ── Season records ──
  if (L === 0 && D === 0) achievements.push({ key: 'perfect',    label: '34-0-0',         desc: 'Nur Siege. Eine Legende des deutschen Fußballs.' });
  else if (L === 0)       achievements.push({ key: 'invincible', label: 'Ungeschlagen',   desc: 'Die gesamte Saison unbesiegt.' });

  if (is3l) {
    if      (pos === 2)   achievements.push({ key: 'promoted',   label: 'Aufgestiegen!',           desc: 'Direkter Aufstieg in die 2. Bundesliga.' });
    else if (pos === 3)   achievements.push({ key: 'playoff',    label: 'Relegation Aufstieg',     desc: 'Platz 3 – Aufstiegsspiel gegen die 2. Bundesliga.' });
    else if (pos <= 9)    achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',       desc: 'Solide Saison in der oberen Tabellenhälfte.' });
    else if (pos <= 15)   achievements.push({ key: 'midtable',   label: 'Gerettet',                desc: 'Klassenerhalt gesichert.' });
    else if (pos === 16)  achievements.push({ key: 'relegpl',    label: 'Relegation Abstieg',      desc: 'Platz 16 – Abstiegsspiel.' });
    else if (!leagueWon)  achievements.push({ key: 'relegated',  label: 'Platz im Tabellenkeller', desc: 'Schwierige Saison in der 3. Liga.' });
  } else if (is2bl) {
    if      (pos === 2)   achievements.push({ key: 'promoted',   label: 'Aufgestiegen!',           desc: 'Direkter Aufstieg – zurück im Fußballoberhaus.' });
    else if (pos === 3)   achievements.push({ key: 'playoff',    label: 'Relegation Aufstieg',     desc: 'Platz 3 – Aufstiegsspiel gegen einen Bundesligisten.' });
    else if (pos <= 9)    achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',       desc: 'Solide Saison in der oberen Tabellenhälfte.' });
    else if (pos <= 15)   achievements.push({ key: 'midtable',   label: 'Gerettet',                desc: 'Klassenerhalt gesichert.' });
    else if (pos === 16)  achievements.push({ key: 'relegpl',    label: 'Relegation Abstieg',      desc: 'Platz 16 – Abstiegsspiel gegen einen Drittligisten.' });
    else if (pts <= 15)   achievements.push({ key: 'derby',      label: 'Historisches Desaster',   desc: 'Einer der schwächsten Absteiger aller Zeiten.' });
    else if (!leagueWon)  achievements.push({ key: 'relegated',  label: 'Abgestiegen',             desc: 'Ab in die 3. Liga.' });
  } else {
    if      (pos <= 4)    achievements.push({ key: 'top4',       label: 'Champions League',        desc: 'Top-4 – ein Platz in der Königsklasse nächste Saison.' });
    else if (pos === 5)   achievements.push({ key: 'europe',     label: 'Europa League',           desc: 'Europacup-Platz gesichert.' });
    else if (pos === 6)   achievements.push({ key: 'conference', label: 'Conference League',       desc: 'Europäischer Fußball – ein Platz in der Conference League.' });
    else if (pos <= 9)    achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',       desc: 'Solide Saison in der oberen Tabellenhälfte.' });
    else if (pos <= 15)   achievements.push({ key: 'midtable',   label: 'Gerettet',                desc: 'Klassenerhalt gesichert.' });
    else if (pos === 16)  achievements.push({ key: 'playoff',    label: 'Relegation',              desc: 'Platz 16 – muss in die Relegation.' });
    else if (pts <= 15)   achievements.push({ key: 'derby',      label: 'Historisches Desaster',   desc: 'Einer der schlechtesten Absteiger aller Zeiten.' });
    else if (!leagueWon)  achievements.push({ key: 'relegated',  label: 'Abgestiegen',             desc: 'Ab in die 2. Bundesliga.' });
  }

  if (GF >= 100)          achievements.push({ key: 'century',    label: 'Tormaschine',           desc: '100+ Tore – historische Offensivleistung.' });
  else if (GF >= 85)      achievements.push({ key: 'goalflood',  label: 'Torflut',               desc: '85+ Tore – Angriffspower auf höchstem Niveau.' });

  if (GA <= 18)           achievements.push({ key: 'bunker',     label: 'Festung',               desc: 'Nur 18 Gegentore – defensiv unantastbar.' });
  else if (GA <= 28)      achievements.push({ key: 'fortress',   label: 'Solide Abwehr',         desc: 'Nur 28 Gegentore – Defensive der Extraklasse.' });

  if (W >= 30)            achievements.push({ key: 'dominant',   label: 'Dominanz',              desc: '30+ Siege – beherrschend von Anfang bis Ende.' });
  if (D >= 10)            achievements.push({ key: 'mister_draw',label: 'Remis-König',           desc: '10+ Unentschieden – das konsistenteste Team.' });
  if (gkGoal)             achievements.push({ key: 'gk_goal',    label: 'Torwart-Tor!',          desc: 'Der Keeper hat getroffen – ein Moment für die Ewigkeit.' });

  const filled = slots.filter(s => s.player);
  if (filled.length === 11) {
    const clubs = [...new Set(
      filled.map(s => s.player?.seasons?.[0]?.club).filter(Boolean)
    )];
    if (clubs.length === 1) {
      achievements.push({ key: 'one_club', label: `${clubs[0]} XI`, desc: 'Alle 11 Spieler aus demselben Klub.' });
    } else if (clubs.length >= 9) {
      achievements.push({ key: 'all_stars', label: 'Liga-Allstars', desc: `Spieler aus ${clubs.length} verschiedenen Klubs – ${is2bl ? 'die 2. Bundesliga' : 'die beste Liga der Welt'} vertreten.` });
    }
  }

  // Suppress position achievements made redundant by trophies
  const keys = new Set(achievements.map(a => a.key));
  const filtered = achievements.filter(a => {
    if (a.key === 'top4'   && (keys.has('champions') || keys.has('ucl'))) return false;
    if (a.key === 'europe' && keys.has('uel'))                            return false;
    return true;
  });

  // Sort: mega → combo → trophy → stat
  const TIER_ORDER = { mega: 0, combo: 1, trophy: 2 };
  filtered.sort((a, b) => (TIER_ORDER[a.tier] ?? 3) - (TIER_ORDER[b.tier] ?? 3));

  return filtered;
}

// ── Share text ────────────────────────────────────────────────────────────────

export function buildShareText(slots, result, formation) {
  const { W, D, L, GF, GA, pts, achievements } = result;
  const filled = slots.filter(s => s.player);
  const lines = filled.map(s => `${s.label}: ${s.player.name}`).join('\n');
  const achs = achievements ?? getAchievements(result);
  return [
    '🏟️ 34-0',
    `Formation: ${formation}`,
    '',
    lines,
    '',
    `📊 ${W}W ${D}D ${L}L | ${GF}:${GA} | ${pts} pts`,
    achs.map(a => `🏆 ${a.label}`).join(' · '),
    '',
    '#34dash0',
  ].join('\n');
}
