import { leagueBaseTeams } from './simulation';

// Deterministic shared-league simulation. Every client that feeds the same
// `seed` + the same set of submitted squads produces a byte-identical league
// table and an identical fixture list, so results and standings stay in sync
// without any server-side compute.

const LEAGUE_SIZE = 18;

// ── Seeded RNG (xmur3 hash → mulberry32) ─────────────────────────────────────

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedStr) {
  const seed = xmur3(String(seedStr));
  return mulberry32(seed());
}

function rngPoisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function rngGauss(rng, sigma) {
  const u = 1 - rng();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function rngShuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Same goal model as simulation.js `simulateMatch`, driven by the seeded RNG.
function rngMatch(rng, hAtt, hDef, aAtt, aDef) {
  const lambdaH = Math.max(0.40, 1.40 + 0.15 + (hAtt - aDef) * 0.040);
  const lambdaA = Math.max(0.40, 1.40 - 0.15 + (aAtt - hDef) * 0.040);
  return { hg: rngPoisson(rng, lambdaH), ag: rngPoisson(rng, lambdaA) };
}

// Circle method — identical to simulation.js `buildRoundRobinRounds` (pure).
function roundRobinRounds(n) {
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

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {string} seed              frozen room+season seed
 * @param {Array}  squads            mp_squads rows: { player_name, team_att, team_def }
 * @param {string} league            'bl' | '2bl' | '3l' (filler pool)
 * @returns {{ table, teams, rounds, matchResults }}
 *   table        — authoritative standings, sorted, one row per team
 *   teams        — canonical team list (CPU fillers first, then managers A→Z)
 *   rounds       — 34 rounds of [homeIdx, awayIdx] pairs (indices into `teams`)
 *   matchResults — parallel 34 rounds of { hg, ag }
 */
export function simulateSharedLeague(seed, squads, league = 'bl') {
  const rng = makeRng(seed);

  const managers = [...squads]
    .sort((a, b) => (a.player_name < b.player_name ? -1 : a.player_name > b.player_name ? 1 : 0))
    .map(s => ({
      name: s.player_name,
      club: s.player_name,
      att: clamp(Math.round(s.team_att), 40, 99),
      def: clamp(Math.round(s.team_def), 40, 99),
      isRealPlayer: true,
      scorerPool: [],
    }));

  // Enough CPU fillers to reach 18 teams (and to keep the count even if a room
  // ever holds an odd number of >17 managers).
  const oddPad = managers.length % 2 === 1 ? 1 : 0;
  const need = Math.max(LEAGUE_SIZE - managers.length, oddPad);
  const fillers = rngShuffle(rng, leagueBaseTeams(league)).slice(0, need).map(t => {
    const eff = Math.round(clamp(t.strength + rngGauss(rng, 5), 40, 98));
    return { name: t.name, club: t.club ?? t.name, att: eff, def: eff, isRealPlayer: false, scorerPool: [] };
  });

  const teams = [...fillers, ...managers];
  const n = teams.length;

  const single = rngShuffle(rng, roundRobinRounds(n));
  const rounds = [...single, ...single.map(round => round.map(([h, a]) => [a, h]))];
  const matchResults = rounds.map(round =>
    round.map(([hi, ai]) => rngMatch(rng, teams[hi].att, teams[hi].def, teams[ai].att, teams[ai].def)),
  );

  const st = teams.map(() => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));
  rounds.forEach((round, ri) => round.forEach(([hi, ai], pi) => {
    const { hg, ag } = matchResults[ri][pi];
    if (hg > ag) { st[hi].W++; st[ai].L++; }
    else if (hg < ag) { st[hi].L++; st[ai].W++; }
    else { st[hi].D++; st[ai].D++; }
    st[hi].GF += hg; st[hi].GA += ag;
    st[ai].GF += ag; st[ai].GA += hg;
  }));

  const table = teams
    .map((t, i) => ({
      name: t.name,
      isReal: t.isRealPlayer,
      ...st[i],
      GD: st[i].GF - st[i].GA,
      pts: st[i].W * 3 + st[i].D,
    }))
    .sort((a, b) => b.pts - a.pts || b.GD - a.GD || b.GF - a.GF)
    .map((r, i) => ({ ...r, pos: i + 1 }));

  return { table, teams, rounds, matchResults };
}
