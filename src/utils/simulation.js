import { calcSquadRatings } from './ratingCalc';

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
const ASSIST_WEIGHTS = { GK:0, RB:5, CB:2, LB:5, DM:8, CM:16, AM:22, RW:14, LW:14, ST:6 };

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

const LEAGUE_TEAMS = [
  { name: 'FC Bayern München',          strength: 90 },
  { name: 'Borussia Dortmund',          strength: 82 },
  { name: 'Bayer 04 Leverkusen',        strength: 81 },
  { name: 'VfB Stuttgart',              strength: 76 },
  { name: 'Eintracht Frankfurt',        strength: 74 },
  { name: 'TSG 1899 Hoffenheim',        strength: 71 },
  { name: 'SC Freiburg',                strength: 71 },
  { name: 'Borussia Mönchengladbach',   strength: 70 },
  { name: 'Werder Bremen',              strength: 68 },
  { name: 'Hamburger SV',               strength: 68 },
  { name: '1. FC Union Berlin',         strength: 67 },
  { name: '1. FC Köln',                 strength: 67 },
  { name: 'FC Augsburg',                strength: 66 },
  { name: '1. FSV Mainz 05',            strength: 66 },
  { name: 'FC Schalke 04',              strength: 63 },
  { name: 'SV Elversberg',              strength: 60 },
  { name: 'SC Paderborn 07',            strength: 58 },
];

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
export function simulateFullLeague(slots) {
  const ratings = calcSquadRatings(slots);
  // Separate attack/defense strengths derived from positional ratings.
  // att drives goals scored; def drives goals conceded.
  const attStr = Math.min(95, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3));
  const defStr = Math.min(95, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35));

  // Each team gets a season-form offset (σ=6) so the table shuffles each run.
  // Bayern still mostly wins; Paderborn mostly struggles — but nothing is guaranteed.
  const teams = [
    ...LEAGUE_TEAMS.map(t => {
      const eff = Math.round(Math.min(98, Math.max(40, t.strength + gauss(4))));
      return { ...t, att: eff, def: eff };
    }),
    { name: 'Deine 11', att: attStr, def: defStr, isPlayer: true },
  ];
  const n = teams.length; // 18
  const playerIdx = n - 1;

  const stats = Array.from({ length: n }, () => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));

  // Proper 34-round schedule: Hinrunde rounds then Rückrunde (home/away flipped).
  // Every team plays exactly once per round → player's 34 games come out in order.
  const hinRunde  = buildRoundRobinRounds(n);
  const ruckRunde = hinRunde.map(round => round.map(([h, a]) => [a, h]));
  const allRounds = [...hinRunde, ...ruckRunde];

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
    m.oppMinutes = Array.from({ length: goalsAgainst }, () =>
      Math.floor(Math.random() * 90) + 1
    ).sort((a, b) => a - b);
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

// ── Achievements ──────────────────────────────────────────────────────────────

export function getAchievements(result, slots = []) {
  const { W, D, L, GF, GA, pts, pos = 18, gkGoal = false } = result;
  const achievements = [];

  if (L === 0 && D === 0) achievements.push({ key: 'perfect',    label: 'Perfekte Saison',      desc: '34-0-0 – Eine Legende der Bundesliga.' });
  else if (L === 0)       achievements.push({ key: 'invincible', label: 'Ungeschlagen',          desc: 'Die gesamte Saison unbesiegt.' });

  if (pos === 1)          achievements.push({ key: 'champions',  label: 'Deutscher Meister!',   desc: 'Bundesliga-Champion – die Schale geholt.' });
  else if (pos <= 4)      achievements.push({ key: 'top4',       label: 'Champions League',      desc: 'Top-4 – ein Platz in der Königsklasse.' });
  else if (pos === 5)     achievements.push({ key: 'europe',     label: 'Europa League',         desc: 'Europacup-Platz gesichert.' });
  else if (pos === 6)     achievements.push({ key: 'conference', label: 'Conference League',     desc: 'Europäischer Fußball – ein Platz in der Conference League.' });
  else if (pos <= 9)      achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',     desc: 'Solide Saison in der oberen Tabellenhälfte.' });
  else if (pos <= 15)     achievements.push({ key: 'midtable',   label: 'Gerettet',              desc: 'Klassenerhalt gesichert.' });
  else if (pos === 16)    achievements.push({ key: 'playoff',    label: 'Relegation',            desc: 'Platz 16 – muss in die Relegation.' });
  else if (pts <= 15)     achievements.push({ key: 'derby',      label: 'Historisches Desaster', desc: 'Einer der schlechtesten Absteiger aller Zeiten.' });
  else                    achievements.push({ key: 'relegated',  label: 'Abgestiegen',           desc: 'Ab in die 2. Bundesliga.' });

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
      achievements.push({ key: 'all_stars', label: 'Liga-Allstars', desc: `Spieler aus ${clubs.length} verschiedenen Klubs – die beste Liga der Welt vertreten.` });
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
