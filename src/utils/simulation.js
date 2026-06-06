import { calcSquadRatings } from './ratingCalc';

// Simple Poisson-distributed random integer
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Simulate 34-game Bundesliga season (34 not 38)
export function simulateSeason(slots) {
  const ratings = calcSquadRatings(slots);
  const overall = ratings.overall ?? 72;

  // League average team is 72; we scale relative to that
  const strengthAdv = (overall - 72) / 10; // -1 to +3 roughly

  // Base win probability + adjustment
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

export function getAchievements(result) {
  const { W, D, L, GF, GA, pts } = result;
  const achievements = [];

  if (L === 0 && D === 0) achievements.push({ key: 'perfect',    label: 'Perfekte Saison',      desc: '34-0-0 – Unschlagbar.' });
  else if (L === 0)       achievements.push({ key: 'invincible', label: 'Ungeschlagen',         desc: 'Die gesamte Saison unbesiegt.' });

  if (pts >= 82)          achievements.push({ key: 'champions',  label: 'Deutscher Meister!',   desc: 'Bundesliga-Champion – Schale geholt.' });
  else if (pts >= 62)     achievements.push({ key: 'top4',       label: 'Champions League',     desc: 'Top-4 – Champions League gesichert.' });
  else if (pts >= 48)     achievements.push({ key: 'tophalf',    label: 'Oberes Mittelfeld',    desc: 'Solide Saison im Mittelfeld.' });
  else if (pts >= 34)     achievements.push({ key: 'midtable',   label: 'Gerettet',             desc: 'Klassenerhalt knapp geschafft.' });
  else if (pts <= 15)     achievements.push({ key: 'derby',      label: 'Historisches Desaster',desc: 'Einer der schlechtesten Absteiger aller Zeiten.' });
  else                    achievements.push({ key: 'relegated',  label: 'Abgestiegen',          desc: 'Ab in die 2. Bundesliga.' });

  if (GF >= 90)           achievements.push({ key: 'century',    label: 'Tormaschine',          desc: '90+ Tore in einer Saison.' });
  if (GA <= 25)           achievements.push({ key: 'fortress',   label: 'Festung',              desc: 'Nur 25 Gegentore – Defensive der Extraklasse.' });
  if (W >= 30)            achievements.push({ key: 'dominant',   label: 'Dominanz',             desc: '30+ Siege in einer Saison.' });

  return achievements;
}

// Generate a simple share text
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

