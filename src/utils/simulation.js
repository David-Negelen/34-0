import { calcSquadRatings } from './ratingCalc';

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// ── Player event simulation ───────────────────────────────────────────────────

const SCORE_WEIGHTS  = { GK:0, RB:2, CB:1, LB:2, DM:3, CM:6, AM:10, RW:14, LW:14, SS:22, ST:32 };
const ASSIST_WEIGHTS = { GK:0, RB:5, CB:2, LB:5, DM:8, CM:16, AM:22, RW:14, LW:14, SS:8, ST:6 };
const CARD_WEIGHTS   = { GK:2, RB:8, CB:10, LB:8, DM:12, CM:9, AM:6, RW:5, LW:5, SS:5, ST:8 };

function weightedPick(pool, weights) {
  const total = pool.reduce((s, p) => s + (weights[p.slotType] ?? 1), 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= weights[p.slotType] ?? 1;
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}

function generateMatchEvents(goalsFor, squad) {
  const events = [];
  for (let i = 0; i < goalsFor; i++) {
    const scorer   = weightedPick(squad, SCORE_WEIGHTS);
    const hasAssist = Math.random() < 0.62;
    const pool2    = squad.filter(p => p !== scorer);
    const assister = hasAssist && pool2.length ? weightedPick(pool2, ASSIST_WEIGHTS) : null;
    events.push({ type: 'goal', minute: Math.floor(Math.random() * 90) + 1, scorer, assister });
  }
  const yellows = poisson(1.7);
  for (let i = 0; i < yellows; i++) {
    events.push({ type: 'yellow', minute: Math.floor(Math.random() * 90) + 1, player: weightedPick(squad, CARD_WEIGHTS) });
  }
  if (Math.random() < 0.055) {
    events.push({ type: 'red', minute: Math.floor(Math.random() * 80) + 10, player: weightedPick(squad, CARD_WEIGHTS) });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

// ── Match simulation ──────────────────────────────────────────────────────────

// Simulate a single match with separate attack/defense ratings.
// lambdaH is driven by home attack vs away defense; lambdaA vice-versa.
// Home advantage baked in as +0.18 / -0.18.
function simulateMatch(hAtt, hDef, aAtt, aDef) {
  const lambdaH = Math.max(0.25, 1.30 + 0.18 + (hAtt - aDef) * 0.013);
  const lambdaA = Math.max(0.25, 1.30 - 0.18 + (aAtt - hDef) * 0.013);
  return { hg: poisson(lambdaH), ag: poisson(lambdaA) };
}

// ── League teams ──────────────────────────────────────────────────────────────

const LEAGUE_TEAMS = [
  { name: 'FC Bayern München',          strength: 88 },
  { name: 'Borussia Dortmund',          strength: 81 },
  { name: 'Bayer 04 Leverkusen',        strength: 79 },
  { name: 'VfB Stuttgart',              strength: 74 },
  { name: 'TSG 1899 Hoffenheim',        strength: 67 },
  { name: 'SC Freiburg',                strength: 68 },
  { name: 'Eintracht Frankfurt',        strength: 72 },
  { name: 'Borussia Mönchengladbach',   strength: 66 },
  { name: 'FC Augsburg',                strength: 62 },
  { name: '1. FSV Mainz 05',            strength: 61 },
  { name: '1. FC Union Berlin',         strength: 62 },
  { name: 'Hamburger SV',               strength: 64 },
  { name: '1. FC Köln',                 strength: 63 },
  { name: 'Werder Bremen',              strength: 63 },
  { name: 'FC Schalke 04',              strength: 60 },
  { name: 'SV Elversberg',              strength: 56 },
  { name: 'SC Paderborn 07',            strength: 54 },
];

// ── Full league simulation ────────────────────────────────────────────────────

// Simulates all 18×17 = 306 fixtures as proper head-to-head matches.
// Each goal scored is the opponent's conceded goal — GD is consistent.
// Returns { result, table, playerMatches } where:
//   result        — { W, D, L, GF, GA, pts, ratings } for "Deine 11"
//   table         — sorted 18-row array with pos field
//   playerMatches — [{day, home, away, hg, ag}, ...] for "Deine 11"'s 34 games
export function simulateFullLeague(slots) {
  const ratings = calcSquadRatings(slots);
  // Separate attack/defense strengths derived from positional ratings.
  // att drives goals scored; def drives goals conceded.
  const attStr = Math.min(95, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3));
  const defStr = Math.min(95, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35));

  const teams = [
    ...LEAGUE_TEAMS.map(t => ({ ...t, att: t.strength, def: t.strength })),
    { name: 'Deine 11', att: attStr, def: defStr, isPlayer: true },
  ];
  const n = teams.length; // 18
  const playerIdx = n - 1;

  const stats = Array.from({ length: n }, () => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));

  // All ordered pairs (home, away) — each pair plays twice total
  const fixtures = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) fixtures.push([i, j]);
    }
  }

  // Fisher-Yates shuffle so match order is random
  for (let i = fixtures.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fixtures[i], fixtures[j]] = [fixtures[j], fixtures[i]];
  }

  const playerMatches = [];

  for (const [hi, ai] of fixtures) {
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

  // Number player's 34 matches in simulation order
  playerMatches.forEach((m, i) => { m.day = i + 1; });

  // Generate per-player events and aggregate season stats
  const squad = slots
    .filter(s => s.player)
    .map(s => ({ name: s.player.name, slotType: s.type, slotLabel: s.label }));

  const statsMap = {};
  squad.forEach(p => { statsMap[p.name] = { name: p.name, slotLabel: p.slotLabel, goals: 0, assists: 0, yellows: 0, reds: 0 }; });

  playerMatches.forEach(m => {
    const goalsFor = m.home === 'Deine 11' ? m.hg : m.ag;
    const events = squad.length ? generateMatchEvents(goalsFor, squad) : [];
    m.events = events;
    events.forEach(e => {
      if (e.type === 'goal')   { statsMap[e.scorer.name].goals++; if (e.assister) statsMap[e.assister.name].assists++; }
      if (e.type === 'yellow') { statsMap[e.player.name].yellows++; }
      if (e.type === 'red')    { statsMap[e.player.name].reds++; }
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
  const result = {
    W: ps.W, D: ps.D, L: ps.L,
    GF: ps.GF, GA: ps.GA,
    pts: ps.W * 3 + ps.D,
    ratings,
  };

  return { result, table, playerMatches, playerStats };
}

// ── Achievements ──────────────────────────────────────────────────────────────

export function getAchievements(result, slots = []) {
  const { W, D, L, GF, GA, pts } = result;
  const achievements = [];

  if (L === 0 && D === 0) achievements.push({ key: 'perfect',    label: 'Perfekte Saison',      desc: '34-0-0 – Eine Legende der Bundesliga.' });
  else if (L === 0)       achievements.push({ key: 'invincible', label: 'Ungeschlagen',          desc: 'Die gesamte Saison unbesiegt.' });

  if (pts >= 82)          achievements.push({ key: 'champions',  label: 'Deutscher Meister!',   desc: 'Bundesliga-Champion – die Schale geholt.' });
  else if (pts >= 62)     achievements.push({ key: 'top4',       label: 'Champions League',      desc: 'Top-4 – ein Platz in der Königsklasse.' });
  else if (pts >= 52)     achievements.push({ key: 'europe',     label: 'Europa League',         desc: 'Europacup-Platz gesichert.' });
  else if (pts >= 48)     achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',     desc: 'Solide Saison in der oberen Tabellenhälfte.' });
  else if (pts >= 34)     achievements.push({ key: 'midtable',   label: 'Gerettet',              desc: 'Klassenerhalt knapp geschafft.' });
  else if (pts <= 15)     achievements.push({ key: 'derby',      label: 'Historisches Desaster', desc: 'Einer der schlechtesten Absteiger aller Zeiten.' });
  else                    achievements.push({ key: 'relegated',  label: 'Abgestiegen',           desc: 'Ab in die 2. Bundesliga.' });

  if (GF >= 100)          achievements.push({ key: 'century',    label: 'Tormaschine',           desc: '100+ Tore – historische Offensivleistung.' });
  else if (GF >= 85)      achievements.push({ key: 'goalflood',  label: 'Torflut',               desc: '85+ Tore – Angriffspower auf höchstem Niveau.' });

  if (GA <= 18)           achievements.push({ key: 'bunker',     label: 'Festung',               desc: 'Nur 18 Gegentore – defensiv unantastbar.' });
  else if (GA <= 28)      achievements.push({ key: 'fortress',   label: 'Solide Abwehr',         desc: 'Nur 28 Gegentore – Defensive der Extraklasse.' });

  if (W >= 30)            achievements.push({ key: 'dominant',   label: 'Dominanz',              desc: '30+ Siege – beherrschend von Anfang bis Ende.' });
  if (D >= 10)            achievements.push({ key: 'mister_draw',label: 'Remis-König',           desc: '10+ Unentschieden – das konsistenteste Team.' });

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
    '🏟️ Bundesliga Dream XI',
    `Formation: ${formation}`,
    '',
    lines,
    '',
    `📊 ${W}W ${D}D ${L}L | ${GF}:${GA} | ${pts} pts`,
    achs.map(a => `🏆 ${a.label}`).join(' · '),
    '',
    '#BundesligaDraftXI',
  ].join('\n');
}
