import { calcSquadRatings } from './ratingCalc';
import { HISTORIC_TABLES } from '../data/historicTables';
import { dfbPokalParticipants } from '../data/dfbPokalParticipants';
import { POKAL_PLAYERS } from '../data/pokalPlayers';

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

const SCORE_WEIGHTS  = { GK:0, RB:2, CB:1, LB:2, DM:3, CM:6, AM:10, RW:14, LW:14, ST:22 };
const ASSIST_WEIGHTS = { GK:1, RB:5, CB:2, LB:5, DM:8, CM:14, AM:20, RW:14, LW:14, ST:6 };

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

function generateMatchEvents(goalsFor, goalsAgainst, squad) {
  const events = [];
  const gk = squad.find(p => p.slotType === 'GK');

  // GK last-minute heroics: only when losing by exactly 1 and team scored at least once.
  // ~2% per qualifying match → roughly 1-in-20 full seasons has a GK goal.
  const gkLateGoal = gk && goalsFor > 0 && goalsAgainst - goalsFor === 1 && Math.random() < 0.02;

  for (let i = 0; i < goalsFor; i++) {
    const isLast = i === goalsFor - 1;
    const scorer = gkLateGoal && isLast ? gk : weightedPick(squad, SCORE_WEIGHTS);
    const hasAssist = Math.random() < 0.62;
    const pool2    = squad.filter(p => p !== scorer);
    const assister = hasAssist && pool2.length ? weightedPick(pool2, ASSIST_WEIGHTS) : null;
    const minute   = gkLateGoal && isLast ? Math.floor(Math.random() * 6) + 90 : Math.floor(Math.random() * 90) + 1;
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

// Build 17 historic opponents stratified by final table position tier.
// One entry per club; strength derived from actual season points.
// Within each tier, selection is weighted: good tiers favour high pts (prime seasons);
// bottom tier favours low pts (iconic failures like Schalke 20/21).
function buildHistoricOpponents(league) {
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
  // Good tiers: pts^2.5 weights prime seasons heavily over mediocre ones.
  // Bottom tier: inverse weight pulls iconic disasters (16 pts) above forgettable near-misses (38 pts).
  const primW  = e => Math.pow(e.pts, 2.5);
  const badW   = e => Math.pow(Math.max(1, 55 - e.pts), 2.5);
  const tiers = [
    { entries: all.filter(e => e.pos <= 3),                 target: 4, weightFn: primW },
    { entries: all.filter(e => e.pos >= 4 && e.pos <= 9),   target: 8, weightFn: primW },
    { entries: all.filter(e => e.pos >= 10 && e.pos <= 15), target: 3, weightFn: primW },
    { entries: all.filter(e => e.pos >= 16),                target: 2, weightFn: badW  },
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
    const e = pickWeighted(pool, primW);
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
  const historicOpponents = buildHistoricOpponents(league);
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
  squad.forEach(p => { statsMap[p.name] = { name: p.name, slotLabel: p.slotLabel, slotType: p.slotType, goals: 0, assists: 0 }; });

  playerMatches.forEach(m => {
    const goalsFor    = m.home === 'Deine 11' ? m.hg : m.ag;
    const goalsAgainst = m.home === 'Deine 11' ? m.ag : m.hg;
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

  const playerStats = squad.map(p => statsMap[p.name]);

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
const POKAL_LOWER_STRENGTH = 52; // 3. Liga / Regional / Amateur flat strength

const POKAL_ROUNDS = [
  '1. Runde', '2. Runde', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale',
];

// Derive tier from historicTables: bl / 2bl / lower
function pokalTier(club, season) {
  if (HISTORIC_TABLES.bl[club]?.[season])    return 'bl';
  if (HISTORIC_TABLES['2bl'][club]?.[season]) return '2bl';
  return 'lower';
}

// Strength for a DFB-Pokal opponent: use historicTables pts if available, else flat.
function pokalStrength(club, season) {
  const bl  = HISTORIC_TABLES.bl[club]?.[season];
  const tbl = HISTORIC_TABLES['2bl'][club]?.[season];
  if (bl)  return ptsToStrength(bl.pts, 'bl');
  if (tbl) return ptsToStrength(tbl.pts, '2bl');
  return POKAL_LOWER_STRENGTH;
}

// Build 63 opponent teams sampled from the full Pokal participant pool.
// Tier composition: ~18 bl, ~18 2bl, ~27 lower (one-club constraint).
// Bracket seeding ensures no lower vs lower matchup in R1.
function buildPokalOpponents(allPlayers) {
  const allWithPokal = [...allPlayers, ...POKAL_PLAYERS];
  const pool = dfbPokalParticipants
    .filter(e => !POKAL_BLACKLIST.has(e.club))
    .map(e => ({ ...e, tier: pokalTier(e.club, e.season), strength: pokalStrength(e.club, e.season) }));

  const byTier = { bl: [], '2bl': [], lower: [] };
  pool.forEach(e => byTier[e.tier].push(e));

  function pickWeightedUniq(entries, usedClubs, n, weightFn) {
    const picked = [];
    let avail = entries.filter(e => !usedClubs.has(e.club));
    for (let i = 0; i < n && avail.length; i++) {
      const total = avail.reduce((s, e) => s + weightFn(e), 0);
      let r = Math.random() * total;
      let choice = avail[avail.length - 1];
      for (const e of avail) { r -= weightFn(e); if (r <= 0) { choice = e; break; } }
      picked.push(choice);
      usedClubs.add(choice.club);
      avail = avail.filter(e => !usedClubs.has(e.club));
    }
    return picked;
  }

  const primW = e => Math.pow(e.strength, 2.5);
  const usedClubs = new Set();

  const blPicks    = pickWeightedUniq(byTier.bl,    usedClubs, 18, primW);
  const tblPicks   = pickWeightedUniq(byTier['2bl'], usedClubs, 18, primW);
  const lowerPicks = pickWeightedUniq(byTier.lower,  usedClubs, 27, e => 1);

  const opponents = [...blPicks, ...tblPicks, ...lowerPicks].map(e => {
    const seasonKey = seasonLabelToKey(e.season);
    const scorerPool = allWithPokal.filter(p => p.seasons.some(s => s.club === e.club && s.season === seasonKey));
    const eff = Math.round(Math.min(98, Math.max(40, e.strength + gauss(5))));
    return { name: `${e.club} ${e.season}`, club: e.club, season: e.season, tier: e.tier, att: eff, def: eff, scorerPool };
  });

  return opponents; // 63 opponents
}

// Simulate a single knockout game (90 min → optional ET → optional pens).
// Returns { hg, ag, aet, pens, penScore }
function simulateKnockout(hAtt, hDef, aAtt, aDef) {
  // More variance than league: upset factor ±15% of strength
  const hAdjAtt = Math.max(40, hAtt + gauss(8));
  const aAdjAtt = Math.max(40, aAtt + gauss(8));
  const { hg, ag } = simulateMatch(hAdjAtt, hDef, aAdjAtt, aDef);

  if (hg !== ag) return { hg, ag, aet: false, pens: false };

  // Extra time: lower-scoring but another chance (each team ~0.4 expected)
  const etH = poisson(0.35);
  const etA = poisson(0.35);
  const hTotal = hg + etH;
  const aTotal = ag + etA;

  if (hTotal !== aTotal) return { hg: hTotal, ag: aTotal, aet: true, pens: false };

  // Simulate 5-kick shootout + sudden death until a winner emerges
  const kicks = [];
  let hPen = 0, aPen = 0;
  for (let i = 0; i < 5; i++) {
    const hScored = Math.random() < 0.75;
    const aScored = Math.random() < 0.75;
    if (hScored) hPen++;
    if (aScored) aPen++;
    kicks.push({ home: hScored, away: aScored });
  }
  // Sudden death: both score or both miss → continue; otherwise decisive
  while (hPen === aPen && kicks.length < 50) {
    const hSD = Math.random() < 0.75;
    const aSD = Math.random() < 0.75;
    if (hSD) hPen++;
    if (aSD) aPen++;
    kicks.push({ home: hSD, away: aSD, sd: true });
  }
  const hWins = hPen > aPen;

  return { hg: hTotal, ag: aTotal, aet: true, pens: true, penScore: `${hPen}:${aPen}`, hWins, kicks };
}

// Simulate the full 64-team bracket. Returns player's match list.
export function simulateDFBPokal(slots, allPlayers = []) {
  const ratings   = calcSquadRatings(slots);
  const overall   = ratings.overall ?? 75;
  const ovrBoost  = overall > 82 ? Math.pow(overall - 82, 1.5) : 0;
  const attStr    = Math.min(99, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3 + ovrBoost));
  const defStr    = Math.min(99, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35 + ovrBoost));

  const opponents = buildPokalOpponents(allPlayers);
  // opponents is 63 entries; player is slot 0 (index 63 in the 64-slot bracket)

  // Sort opponents: lower-tier teams go into even slots so in R1 they always face
  // a bl/2bl team (odd slots). bl/2bl fill odd slots, lower fill even slots.
  const blAnd2bl  = shuffleArr(opponents.filter(o => o.tier === 'bl' || o.tier === '2bl'));
  const lower     = shuffleArr(opponents.filter(o => o.tier === 'lower'));

  // Build 64-slot bracket. Slot 63 = player.
  // R1 pairs: (0,1), (2,3), ..., (62,63)
  // We place lower-tier in even slots 0,2,4,... so they face bl/2bl in odd slots.
  // Player is in slot 63 (odd) → faces a lower-tier team in slot 62 in R1.
  const bracket = new Array(64);
  let blIdx = 0, lowIdx = 0;
  for (let i = 0; i < 63; i++) {
    if (i % 2 === 0) {
      bracket[i] = lower[lowIdx++] ?? blAnd2bl[blIdx++]; // even = lower
    } else {
      bracket[i] = blAnd2bl[blIdx++] ?? lower[lowIdx++]; // odd  = bl/2bl
    }
  }
  bracket[63] = { name: 'Deine 11', att: attStr, def: defStr, isPlayer: true, scorerPool: [] };

  const playerMatches = [];
  let teams = [...bracket];

  for (let round = 0; round < 6; round++) {
    const winners = [];
    for (let i = 0; i < teams.length; i += 2) {
      const home = teams[i];
      const away = teams[i + 1];
      const isPlayerGame = home.isPlayer || away.isPlayer;

      const result = simulateKnockout(home.att, home.def, away.att, away.def);
      const homeWon = result.pens ? result.hWins : result.hg > result.ag;

      if (isPlayerGame) {
        const own = home.isPlayer ? result.hg : result.ag;
        const opp = home.isPlayer ? result.ag : result.hg;
        const oppTeam = home.isPlayer ? away : home;

        // Generate scorer events for player's side
        const squad = slots.filter(s => s.player).map(s => s.player);
        const events = generateMatchEvents(own, opp, squad);

        // Generate opponent scorers
        const oppPool = oppTeam.scorerPool ?? [];
        const oppGoals = Array.from({ length: opp }, () => {
          const minute = Math.floor(Math.random() * (result.aet ? 120 : 90)) + 1;
          let scorerName = null;
          if (oppPool.length) {
            const totalW = oppPool.reduce((s, p) => s + (SCORE_WEIGHTS[p.positions[0]] ?? 1), 0);
            let r = Math.random() * totalW;
            for (const p of oppPool) { r -= (SCORE_WEIGHTS[p.positions[0]] ?? 1); if (r <= 0) { scorerName = p.name; break; } }
            if (!scorerName) scorerName = oppPool[oppPool.length - 1].name;
          }
          return { minute, scorerName };
        }).sort((a, b) => a.minute - b.minute);

        playerMatches.push({
          round: POKAL_ROUNDS[round],
          opponent: oppTeam.name,
          home: home.isPlayer,
          ownGoals: own,
          oppGoals2: opp,
          aet: result.aet,
          pens: result.pens,
          penScore: result.penScore ?? null,
          won: homeWon === home.isPlayer,
          events,
          oppGoals,
          kicks: result.kicks ?? [],
        });
      }

      winners.push(homeWon ? home : away);
    }
    teams = winners;
    // If player was eliminated, stop
    if (!teams.some(t => t.isPlayer) && playerMatches.length > 0 && !playerMatches[playerMatches.length - 1].won) break;
  }

  const roundReached = playerMatches.length;
  const won = roundReached === 6 && playerMatches[5]?.won;

  return { playerMatches, roundReached, won, bracket: [...bracket] };
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
