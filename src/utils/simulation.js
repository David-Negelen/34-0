import { calcSquadRatings } from './ratingCalc';

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Simulate a 34-game Bundesliga season from squad slots
export function simulateSeason(slots) {
  const ratings = calcSquadRatings(slots);
  const overall = ratings.overall ?? 72;

  const strengthAdv = (overall - 72) / 10;
  const winProb  = Math.min(0.85, Math.max(0.08, 0.39 + strengthAdv * 0.12));
  const drawProb = 0.24;
  const lossProb = Math.max(0.03, 1 - winProb - drawProb);

  let W = 0, D = 0, L = 0, GF = 0, GA = 0;
  const attFactor = ((ratings.att ?? overall) / 100) * 2.8;
  const defFactor = (1 - (ratings.def ?? overall) / 100) * 2.2;

  for (let match = 0; match < 34; match++) {
    const r = Math.random();
    const gf = poisson(attFactor);
    const ga = poisson(defFactor);

    if (r < winProb) {
      W++;
      GF += Math.max(gf, 1);
      GA += Math.max(ga - 1, 0);
    } else if (r < winProb + drawProb) {
      D++;
      const g = poisson(attFactor * 0.7);
      GF += g; GA += g;
    } else {
      L++;
      GF += Math.max(gf - 1, 0);
      GA += Math.max(ga, 1);
    }
  }

  const pts = W * 3 + D;
  return { W, D, L, GF, GA, pts, ratings };
}

// ── League table simulation ───────────────────────────────────────────────────

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

function simulateTeam(strength) {
  const adv   = (strength - 70) / 12;
  const winP  = Math.min(0.80, Math.max(0.08, 0.36 + adv * 0.13));
  const drawP = 0.23;
  const attF  = (strength / 100) * 2.7;
  const defF  = (1 - strength / 100) * 2.4;
  let W = 0, D = 0, L = 0, GF = 0, GA = 0;
  for (let i = 0; i < 34; i++) {
    const r = Math.random();
    if (r < winP) {
      W++; GF += Math.max(poisson(attF), 1); GA += Math.max(poisson(defF) - 1, 0);
    } else if (r < winP + drawP) {
      D++; const g = poisson(attF * 0.75); GF += g; GA += g;
    } else {
      L++; GF += Math.max(poisson(attF) - 1, 0); GA += Math.max(poisson(defF), 1);
    }
  }
  return { W, D, L, GF, GA, pts: W * 3 + D };
}

export function simulateLeagueTable(playerResult) {
  const rows = LEAGUE_TEAMS.map(t => ({
    ...simulateTeam(t.strength),
    name: t.name,
    isPlayer: false,
  }));

  const { W, D, L, GF, GA, pts } = playerResult;
  rows.push({ W, D, L, GF, GA, pts, name: 'Dein XI', isPlayer: true });

  rows.sort((a, b) => {
    const pd = b.pts - a.pts;
    if (pd !== 0) return pd;
    const gd = (b.GF - b.GA) - (a.GF - a.GA);
    if (gd !== 0) return gd;
    return b.GF - a.GF;
  });

  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

// ── Achievements ─────────────────────────────────────────────────────────────

// slots is optional — pass draft.slots for squad-composition achievements
export function getAchievements(result, slots = []) {
  const { W, D, L, GF, GA, pts } = result;
  const achievements = [];

  // Unbeaten / perfect run
  if (L === 0 && D === 0) achievements.push({ key: 'perfect',    label: 'Perfekte Saison',      desc: '34-0-0 – Eine Legende der Bundesliga.' });
  else if (L === 0)       achievements.push({ key: 'invincible', label: 'Ungeschlagen',         desc: 'Die gesamte Saison unbesiegt.' });

  // League standing
  if (pts >= 82)          achievements.push({ key: 'champions',  label: 'Deutscher Meister!',   desc: 'Bundesliga-Champion – die Schale geholt.' });
  else if (pts >= 62)     achievements.push({ key: 'top4',       label: 'Champions League',     desc: 'Top-4 – ein Platz in der Königsklasse.' });
  else if (pts >= 52)     achievements.push({ key: 'europe',     label: 'Europa League',        desc: 'Europacup-Platz gesichert.' });
  else if (pts >= 48)     achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',    desc: 'Solide Saison in der oberen Tabellenhälfte.' });
  else if (pts >= 34)     achievements.push({ key: 'midtable',   label: 'Gerettet',             desc: 'Klassenerhalt knapp geschafft.' });
  else if (pts <= 15)     achievements.push({ key: 'derby',      label: 'Historisches Desaster',desc: 'Einer der schlechtesten Absteiger aller Zeiten.' });
  else                    achievements.push({ key: 'relegated',  label: 'Abgestiegen',          desc: 'Ab in die 2. Bundesliga.' });

  // Goals scored
  if (GF >= 100)          achievements.push({ key: 'century',    label: 'Tormaschine',          desc: '100+ Tore – historische Offensivleistung.' });
  else if (GF >= 85)      achievements.push({ key: 'goalflood',  label: 'Torflut',              desc: '85+ Tore – Angriffspower auf höchstem Niveau.' });

  // Goals conceded
  if (GA <= 18)           achievements.push({ key: 'bunker',     label: 'Festung',              desc: 'Nur 18 Gegentore – defensiv unantastbar.' });
  else if (GA <= 28)      achievements.push({ key: 'fortress',   label: 'Solide Abwehr',        desc: 'Nur 28 Gegentore – Defensive der Extraklasse.' });

  // Win streak achievements
  if (W >= 30)            achievements.push({ key: 'dominant',   label: 'Dominanz',             desc: '30+ Siege – beherrschend von Anfang bis Ende.' });
  if (D >= 10)            achievements.push({ key: 'mister_draw',label: 'Remis-König',          desc: '10+ Unentschieden – das konsistenteste Team.' });

  // Squad composition achievements (only when full squad provided)
  const filled = slots.filter(s => s.player);
  if (filled.length === 11) {
    const clubs = [
      ...new Set(
        filled
          .map(s => s.player?.seasons?.[0]?.club)
          .filter(Boolean)
      ),
    ];

    if (clubs.length === 1) {
      achievements.push({
        key:   'one_club',
        label: `${clubs[0]} XI`,
        desc:  'Alle 11 Spieler aus demselben Klub.',
      });
    } else if (clubs.length >= 9) {
      achievements.push({
        key:   'all_stars',
        label: 'Liga-Allstars',
        desc:  `Spieler aus ${clubs.length} verschiedenen Klubs – die beste Liga der Welt vertreten.`,
      });
    }
  }

  return achievements;
}

// Generate share text for the result
export function buildShareText(slots, result, formation) {
  const { W, D, L, GF, GA, pts } = result;
  const filled = slots.filter(s => s.player);
  const lines = filled.map(s => `${s.label}: ${s.player.name}`).join('\n');
  return [
    '🏟️ Bundesliga Dream XI',
    `Formation: ${formation}`,
    '',
    lines,
    '',
    `📊 ${W}W ${D}D ${L}L | ${GF}:${GA} | ${pts} pts`,
    getAchievements(result).map(a => `🏆 ${a.label}`).join(' · '),
    '',
    '#BundesligaDraftXI',
  ].join('\n');
}
