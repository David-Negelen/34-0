import { calcSquadRatings } from './ratingCalc';

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
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
  { name: 'Bayern München',           strength: 86 },
  { name: 'Borussia Dortmund',         strength: 80 },
  { name: 'Bayer 04 Leverkusen',       strength: 79 },
  { name: 'RB Leipzig',                strength: 77 },
  { name: 'Eintracht Frankfurt',       strength: 72 },
  { name: 'VfB Stuttgart',             strength: 71 },
  { name: 'SC Freiburg',               strength: 68 },
  { name: 'Borussia Mönchengladbach',  strength: 67 },
  { name: 'TSG Hoffenheim',            strength: 66 },
  { name: 'VfL Wolfsburg',             strength: 65 },
  { name: 'Werder Bremen',             strength: 63 },
  { name: '1. FC Union Berlin',        strength: 62 },
  { name: 'FC Augsburg',               strength: 61 },
  { name: '1. FSV Mainz 05',           strength: 60 },
  { name: 'FC St. Pauli',              strength: 58 },
  { name: '1. FC Köln',                strength: 57 },
  { name: '1. FC Heidenheim',          strength: 55 },
];

// ── Full league simulation ────────────────────────────────────────────────────

// Simulates all 18×17 = 306 fixtures as proper head-to-head matches.
// Each goal scored is the opponent's conceded goal — GD is consistent.
// Returns { result, table, playerMatches } where:
//   result        — { W, D, L, GF, GA, pts, ratings } for "Dein XI"
//   table         — sorted 18-row array with pos field
//   playerMatches — [{day, home, away, hg, ag}, ...] for "Dein XI"'s 34 games
export function simulateFullLeague(slots) {
  const ratings = calcSquadRatings(slots);
  // Separate attack/defense strengths derived from positional ratings.
  // att drives goals scored; def drives goals conceded.
  const attStr = Math.min(95, Math.max(50, (ratings.att ?? 72) * 0.7 + (ratings.mid ?? 72) * 0.3));
  const defStr = Math.min(95, Math.max(50, (ratings.def ?? 72) * 0.65 + (ratings.gk  ?? 72) * 0.35));

  const teams = [
    ...LEAGUE_TEAMS.map(t => ({ ...t, att: t.strength, def: t.strength })),
    { name: 'Dein XI', att: attStr, def: defStr, isPlayer: true },
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

  return { result, table, playerMatches };
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
