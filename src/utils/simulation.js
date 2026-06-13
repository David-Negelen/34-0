import { calcSquadRatings } from './ratingCalc';
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
function generateMatchEvents(goalsFor, goalsAgainst, squad, gkGoalChance = 0.01, aet = false, goalsForReg = null) {
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
function simulateMatch(hAtt, hDef, aAtt, aDef) {
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
// BL:  [16, 91] pts → [55, 92]; 2BL: [19, 76] pts → [54, 71]
function ptsToStrength(pts, league) {
  if (league === '2bl') return Math.round(Math.min(71, Math.max(54, 54 + (pts - 19) / 57 * 17)));
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

export function simulateFullLeague(slots, league = 'bl', allPlayers = []) {
  const ratings = calcSquadRatings(slots);
  // Hidden OVR boost: rewards good drafts exponentially above 80.
  // 85 OVR → +11 (effective ~95, dominates); 80 and below → no boost.
  const overall  = ratings.overall ?? 75;
  const ovrBoost = overall > 82 ? Math.pow(overall - 82, 1.5) : 0;
  const attStr = Math.min(99, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3 + ovrBoost));
  const defStr = Math.min(99, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35 + ovrBoost));

  // Each team gets a season-form offset (σ=6) so the table shuffles each run.
  // Bayern still mostly wins; Paderborn mostly struggles — but nothing is guaranteed.
  const historicOpponents = buildHistoricOpponents(league, allPlayers);
  const LEAGUE_TEAMS = historicOpponents.length === 17
    ? historicOpponents
    : (league === '2bl' ? ZWEITE_LIGA_TEAMS : BUNDESLIGA_TEAMS);
  const teams = [
    ...LEAGUE_TEAMS.map(t => {
      const eff = Math.round(Math.min(98, Math.max(40, t.strength + gauss(4))));
      // Build scorer pool from real player data for this club+season
      const seasonKey = t.season ? seasonLabelToKey(t.season) : null;
      const scorerPool = seasonKey && allPlayers.length
        ? allPlayers.filter(p => p.seasons.some(s => s.club === t.club && s.season === seasonKey))
        : [];
      return { ...t, att: eff, def: eff, scorerPool };
    }),
    { name: 'Deine 11', att: attStr, def: defStr, isPlayer: true, scorerPool: [] },
  ];
  const n = teams.length; // 18
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

  // Generate per-player events and aggregate season stats
  const squad = slots
    .filter(s => s.player)
    .map(s => ({ name: s.player.name, slotType: s.type, slotLabel: s.label, rating: s.player.displayRating ?? s.player.primeRating ?? 75 }));

  const statsMap = {};
  squad.forEach(p => { statsMap[p.name] = { name: p.name, slotLabel: p.slotLabel, slotType: p.slotType, goals: 0, assists: 0, cleanSheets: 0 }; });

  playerMatches.forEach(m => {
    const goalsFor    = m.home === 'Deine 11' ? m.hg : m.ag;
    const goalsAgainst = m.home === 'Deine 11' ? m.ag : m.hg;
    if (goalsAgainst === 0) {
      squad
        .filter(p => ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.slotType))
        .forEach(p => { statsMap[p.name].cleanSheets++; });
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
      if (e.type === 'goal') { statsMap[e.scorer.name].goals++; if (e.assister) statsMap[e.assister.name].assists++; }
    });
  });

  const playerStats = squad.map(p => ({ ...statsMap[p.name], games: 34 }));

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

  const squad = slots.filter(s => s.player).map(s => ({
    ...s.player,
    slotType: s.type,
    rating: s.player.displayRating ?? s.player.primeRating ?? 75,
  }));

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
function simulateKnockout(hAtt, hDef, aAtt, aDef) {
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

// ── Achievements ──────────────────────────────────────────────────────────────

export function getAchievements(result, slots = [], league = 'bl') {
  const { W, D, L, GF, GA, pts, pos = 18, gkGoal = false } = result;
  const achievements = [];
  const is2bl = league === '2bl';

  if (L === 0 && D === 0) achievements.push({ key: 'perfect',    label: 'Perfekte Saison',      desc: '34-0-0 – Eine Legende des deutschen Fußballs.' });
  else if (L === 0)       achievements.push({ key: 'invincible', label: 'Ungeschlagen',          desc: 'Die gesamte Saison unbesiegt.' });

  if (is2bl) {
    if (pos === 1)        achievements.push({ key: 'champions',  label: 'Meister der 2. Liga!',  desc: 'Direkter Aufstieg in die Bundesliga.' });
    else if (pos === 2)   achievements.push({ key: 'promoted',   label: 'Aufgestiegen!',          desc: 'Direkter Aufstieg – zurück im Fußballoberhaus.' });
    else if (pos === 3)   achievements.push({ key: 'playoff',    label: 'Relegation Aufstieg',    desc: 'Platz 3 – Aufstiegsspiel gegen einen Bundesligisten.' });
    else if (pos <= 9)    achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',      desc: 'Solide Saison in der oberen Tabellenhälfte.' });
    else if (pos <= 15)   achievements.push({ key: 'midtable',   label: 'Gerettet',               desc: 'Klassenerhalt gesichert.' });
    else if (pos === 16)  achievements.push({ key: 'relegpl',    label: 'Relegation Abstieg',     desc: 'Platz 16 – Abstiegsspiel gegen einen Drittligisten.' });
    else if (pts <= 15)   achievements.push({ key: 'derby',      label: 'Historisches Desaster', desc: 'Einer der schwächsten Absteiger aller Zeiten.' });
    else                  achievements.push({ key: 'relegated',  label: 'Abgestiegen',           desc: 'Ab in die 3. Liga.' });
  } else {
    if (pos === 1)        achievements.push({ key: 'champions',  label: 'Deutscher Meister!',   desc: 'Bundesliga-Champion – die Schale geholt.' });
    else if (pos <= 4)    achievements.push({ key: 'top4',       label: 'Champions League',      desc: 'Top-4 – ein Platz in der Königsklasse.' });
    else if (pos === 5)   achievements.push({ key: 'europe',     label: 'Europa League',         desc: 'Europacup-Platz gesichert.' });
    else if (pos === 6)   achievements.push({ key: 'conference', label: 'Conference League',     desc: 'Europäischer Fußball – ein Platz in der Conference League.' });
    else if (pos <= 9)    achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',     desc: 'Solide Saison in der oberen Tabellenhälfte.' });
    else if (pos <= 15)   achievements.push({ key: 'midtable',   label: 'Gerettet',              desc: 'Klassenerhalt gesichert.' });
    else if (pos === 16)  achievements.push({ key: 'playoff',    label: 'Relegation',            desc: 'Platz 16 – muss in die Relegation.' });
    else if (pts <= 15)   achievements.push({ key: 'derby',      label: 'Historisches Desaster', desc: 'Einer der schlechtesten Absteiger aller Zeiten.' });
    else                  achievements.push({ key: 'relegated',  label: 'Abgestiegen',           desc: 'Ab in die 2. Bundesliga.' });
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

  return achievements;
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
