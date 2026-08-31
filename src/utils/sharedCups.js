import { makeRng, rngPoisson, rngGauss, rngShuffle } from './seededRng';
import {
  SCORE_WEIGHTS, POKAL_BLACKLIST, POKAL_LOWER_STRENGTH, pokalTier, pokalStrength,
} from './simulation';
import { UCL_STRENGTH, UEL_STRENGTH, RESULT_ORDER, buildCLScheduleRounds } from './clUtils';
import { dfbPokalParticipants } from '../data/dfbPokalParticipants';
import { UCL_PARTICIPANTS } from '../data/uclParticipants';
import { UEL_PARTICIPANTS } from '../data/uelParticipants';

// Deterministic shared cups. Every client that feeds the same `seed` + the same
// set of season-N `mp_squads` rows produces byte-identical brackets, ties and
// champions — one DFB-Pokal, one UCL and one UEL per room per season, with the
// room's qualified managers seeded into the same bracket (they can be drawn
// against and knocked out by each other). Manager-vs-manager ties use each
// side's submitted `team_att` / `team_def`. The solo engines in `simulation.js`
// and `clUtils.js` are untouched — this is a parallel seeded implementation,
// exactly like `sharedLeague.js`.
//
// Match entries match the normalized shape `simulatePokalMatches` /
// `simulateEuropeanCupFull` produce today; `events` is left empty for the
// caller to fill locally from its own squad (cosmetic, doesn't affect sync).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const POKAL_ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];
const POKAL_DAYS = [4.3, 10.3, 17.3, 24.3, 29.3, 34.5];

const EU_LEAGUE_DAYS = [2.5, 5.5, 8.5, 11.5, 14.5, 17.5, 20.5, 23.5];
const EU_KO_DAYS = {
  playoff: [24.3, 25.7], r16: [26.3, 27.7], qf: [28.3, 29.7], sf: [30.3, 31.7], final: [33.0],
};
const EU_KO_LABEL = {
  playoff: 'PLAYOFF', r16: 'ACHTELFINALE', qf: 'VIERTELFINALE', sf: 'HALBFINALE', final: 'FINALE',
};
const EU_KO_ORDER = ['playoff', 'r16', 'qf', 'sf', 'final'];

// ── Seeded match models (ports of simulation.js, driven by the shared RNG) ────

// simulateMatch's 90-minute goal model.
function rngMatch90(rng, hAtt, hDef, aAtt, aDef) {
  const lambdaH = Math.max(0.40, 1.40 + 0.15 + (hAtt - aDef) * 0.040);
  const lambdaA = Math.max(0.40, 1.40 - 0.15 + (aAtt - hDef) * 0.040);
  return { hg: rngPoisson(rng, lambdaH), ag: rngPoisson(rng, lambdaA) };
}

// simulateKnockout: 90 min → ET → 5-kick + sudden-death shootout.
function rngKnockout(rng, hAtt, hDef, aAtt, aDef) {
  const hAdj = Math.max(40, hAtt + rngGauss(rng, 5));
  const aAdj = Math.max(40, aAtt + rngGauss(rng, 5));
  const lambdaH = Math.max(0.25, 0.95 + (hAdj - aDef) * 0.022);
  const lambdaA = Math.max(0.25, 0.80 + (aAdj - hDef) * 0.022);
  const hg = rngPoisson(rng, lambdaH);
  const ag = rngPoisson(rng, lambdaA);
  if (hg !== ag) return { hg, ag, hgReg: hg, agReg: ag, aet: false, pens: false, penScore: null, hWins: hg > ag };

  const hTotal = hg + rngPoisson(rng, 0.45);
  const aTotal = ag + rngPoisson(rng, 0.45);
  if (hTotal !== aTotal) return { hg: hTotal, ag: aTotal, hgReg: hg, agReg: ag, aet: true, pens: false, penScore: null, hWins: hTotal > aTotal };

  const kicks = [];
  let hPen = 0, aPen = 0;
  for (let i = 0; i < 5; i++) {
    const awayKicksLeft = 5 - i, roundsAfter = 4 - i;
    const hScored = rng() < 0.75; if (hScored) hPen++;
    kicks.push({ side: 'home', scored: hScored });
    if (hPen > aPen + awayKicksLeft) break;
    const aScored = rng() < 0.75; if (aScored) aPen++;
    kicks.push({ side: 'away', scored: aScored });
    if (aPen > hPen + roundsAfter) break;
    if (hPen > aPen + roundsAfter) break;
  }
  while (hPen === aPen && kicks.length < 100) {
    const hSD = rng() < 0.75; if (hSD) hPen++;
    kicks.push({ side: 'home', scored: hSD, sd: true });
    const aSD = rng() < 0.75; if (aSD) aPen++;
    kicks.push({ side: 'away', scored: aSD, sd: true });
  }
  return { hg: hTotal, ag: aTotal, hgReg: hg, agReg: ag, aet: true, pens: true, penScore: `${hPen}:${aPen}`, hWins: hPen > aPen, kicks };
}

// simulateTwoLegTie: leg 1 = 90 min; leg 2 = 90 + optional ET + optional pens.
function rngTwoLegTie(rng, hAtt, hDef, aAtt, aDef) {
  const { hg: l1h, ag: l1a } = rngMatch90(rng, hAtt, hDef, aAtt, aDef);
  const { hg: l2h90, ag: l2a90 } = rngMatch90(rng, aAtt, aDef, hAtt, hDef);
  const mk = (leg2, hWins) => ({ leg1: { hg: l1h, ag: l1a }, leg2, hWins });

  if (l1h + l2a90 !== l1a + l2h90) {
    return mk({ hg: l2h90, ag: l2a90, hgReg: l2h90, agReg: l2a90, aet: false, pens: false, penScore: null }, l1h + l2a90 > l1a + l2h90);
  }
  const l2h = l2h90 + rngPoisson(rng, 0.45);
  const l2a = l2a90 + rngPoisson(rng, 0.45);
  if (l1h + l2a !== l1a + l2h) {
    return mk({ hg: l2h, ag: l2a, hgReg: l2h90, agReg: l2a90, aet: true, pens: false, penScore: null }, l1h + l2a > l1a + l2h);
  }
  const kicks = [];
  let ap = 0, hp = 0;
  for (let i = 0; i < 5; i++) {
    const hKicksLeft = 5 - i, rAfter = 4 - i;
    const aScored = rng() < 0.75; if (aScored) ap++;
    kicks.push({ side: 'home', scored: aScored });
    if (ap > hp + hKicksLeft) break;
    const hScored = rng() < 0.75; if (hScored) hp++;
    kicks.push({ side: 'away', scored: hScored });
    if (hp > ap + rAfter || ap > hp + rAfter) break;
  }
  while (ap === hp && kicks.length < 100) {
    const aSD = rng() < 0.75; if (aSD) ap++;
    kicks.push({ side: 'home', scored: aSD, sd: true });
    const hSD = rng() < 0.75; if (hSD) hp++;
    kicks.push({ side: 'away', scored: hSD, sd: true });
  }
  return mk({ hg: l2h, ag: l2a, hgReg: l2h90, agReg: l2a90, aet: true, pens: true, penScore: `${ap}:${hp}`, kicks }, hp > ap);
}

// ── Scorer / goal helpers ───────────────────────────────────────────────────

// Pick a scorer name from a manager's uploaded XI (`scorers`: [{name, pos}]),
// weighted like the solo engine. CPU opponents have no scorers → null minute.
function pickScorer(rng, scorers) {
  if (!scorers || !scorers.length) return null;
  const w = scorers.map(s => SCORE_WEIGHTS[s.pos] ?? 1);
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return scorers[Math.floor(rng() * scorers.length)]?.name ?? null;
  let r = rng() * total;
  for (let i = 0; i < scorers.length; i++) { r -= w[i]; if (r <= 0) return scorers[i].name; }
  return scorers[scorers.length - 1].name;
}

function buildOppGoals(rng, count, oppScorers, aet = false, regCount = null) {
  const reg = regCount == null ? count : regCount;
  return Array.from({ length: count }, (_, gi) => {
    const inEt = aet && gi >= reg;
    const minute = inEt ? Math.floor(rng() * 30) + 91 : Math.floor(rng() * 90) + 1;
    return { minute, scorerName: pickScorer(rng, oppScorers) };
  }).sort((a, b) => a.minute - b.minute);
}

const normalizePen = (ps, iAmHome) => {
  if (!ps) return null;
  if (iAmHome) return ps;
  const [a, b] = ps.split(':');
  return `${b}:${a}`;
};

// One team per submitted squad row. Managers are sorted by name so the field
// order — and therefore every draw — is identical on every client.
function managerTeams(squads) {
  return [...squads]
    .sort((a, b) => (a.player_name < b.player_name ? -1 : a.player_name > b.player_name ? 1 : 0))
    .map(s => ({
      name: s.player_name,
      att: clamp(Math.round(s.team_att), 40, 99),
      def: clamp(Math.round(s.team_def), 40, 99),
      isRealPlayer: true,
      scorers: Array.isArray(s.scorers) ? s.scorers : [],
      tier: s.division === 'bl' ? 'bl' : '2bl',
    }));
}

// ── DFB-Pokal — shared 64-team single-elimination ───────────────────────────

/**
 * @param {string} seed          frozen `mp_cups` seed for (room, season, 'pokal')
 * @param {Array}  pokalSquads   season-N mp_squads rows whose division is bl or 2bl
 * @returns {{ champion: string, perManager: Object }}
 *   perManager[name] = { matches: [normalized…], exitRound: string|null, won: bool }
 */
export function simulateSharedPokal(seed, pokalSquads) {
  const rng = makeRng(seed);
  const managers = managerTeams(pokalSquads);

  // 64 teams: 40 "upper" (managers + BL/2BL CPU) + 24 lower/amateur CPU.
  const pool = dfbPokalParticipants
    .filter(e => !POKAL_BLACKLIST.has(e.club))
    .map(e => ({ club: e.club, season: e.season, tier: pokalTier(e.club, e.season), strength: pokalStrength(e.club, e.season) }));
  const upperPool = rngShuffle(rng, pool.filter(e => e.tier === 'bl' || e.tier === '2bl'));
  const lowerPool = rngShuffle(rng, pool.filter(e => e.tier === 'lower'));

  const mkUpper = e => {
    const s = Math.round(clamp(e.strength + rngGauss(rng, 5), 40, 98));
    return { name: `${e.club} ${e.season}`, att: s, def: s, isRealPlayer: false, scorers: [], tier: e.tier };
  };
  const mkLower = e => {
    const s = Math.round(clamp(POKAL_LOWER_STRENGTH + rngGauss(rng, 5), 35, 60));
    return { name: `${e.club} ${e.season}`, att: s, def: s, isRealPlayer: false, scorers: [], tier: 'lower' };
  };

  const upperCpu = upperPool.slice(0, Math.max(0, 40 - managers.length)).map(mkUpper);
  const lowerCpu = lowerPool.slice(0, 24).map(mkLower);
  let teams = [...managers, ...upperCpu, ...lowerCpu]; // canonical 64

  const roundResults = [];
  for (let round = 0; round < 6 && teams.length > 1; round++) {
    let pairs;
    if (round === 0) {
      const lower = rngShuffle(rng, teams.filter(t => t.tier === 'lower'));
      const nonLower = rngShuffle(rng, teams.filter(t => t.tier !== 'lower'));
      pairs = [];
      for (const lt of lower) pairs.push([nonLower.pop(), lt]);
      while (nonLower.length >= 2) pairs.push([nonLower.pop(), nonLower.pop()]);
    } else {
      const sh = rngShuffle(rng, teams);
      pairs = [];
      for (let i = 0; i + 1 < sh.length; i += 2) pairs.push([sh[i], sh[i + 1]]);
    }
    // R1–R2: lower team at home. Otherwise random.
    pairs = pairs.map(([a, b]) => {
      if (round <= 1) {
        if (b.tier === 'lower') return [b, a];
        if (a.tier === 'lower') return [a, b];
      }
      return rng() < 0.5 ? [b, a] : [a, b];
    });

    const matchups = [];
    const winners = [];
    for (const [home, away] of pairs) {
      const res = rngKnockout(rng, home.att, home.def, away.att, away.def);
      const homeWon = res.pens ? res.hWins : res.hg > res.ag;
      const mu = { home, away, res, homeWon };
      if (home.isRealPlayer) mu.homeOppGoals = buildOppGoals(rng, res.ag, away.scorers, res.aet, res.agReg);
      if (away.isRealPlayer) mu.awayOppGoals = buildOppGoals(rng, res.hg, home.scorers, res.aet, res.hgReg);
      matchups.push(mu);
      winners.push(homeWon ? home : away);
    }
    roundResults.push(matchups);
    teams = winners;
  }

  const champion = teams[0]?.name ?? null;
  const perManager = {};
  for (const m of managers) {
    const matches = [];
    let exitRound = null, won = false;
    for (let r = 0; r < roundResults.length; r++) {
      const mu = roundResults[r].find(x => x.home.name === m.name || x.away.name === m.name);
      if (!mu) break;
      const iAmHome = mu.home.name === m.name;
      const opp = iAmHome ? mu.away : mu.home;
      const myWon = iAmHome ? mu.homeWon : !mu.homeWon;
      matches.push({
        competition: 'pokal',
        roundLabel: POKAL_ROUND_LABELS[r],
        day: POKAL_DAYS[r],
        opponent: opp.name,
        home: iAmHome,
        ownGoals: iAmHome ? mu.res.hg : mu.res.ag,
        oppGoals2: iAmHome ? mu.res.ag : mu.res.hg,
        ownGoalsReg: iAmHome ? mu.res.hgReg : mu.res.agReg,
        aet: mu.res.aet,
        pens: mu.res.pens,
        penScore: normalizePen(mu.res.penScore, iAmHome),
        kicks: mu.res.kicks ?? [],
        won: myWon,
        events: [],
        oppGoals: (iAmHome ? mu.homeOppGoals : mu.awayOppGoals) ?? [],
        otherResults: [],
      });
      exitRound = POKAL_ROUND_LABELS[r];
      won = myWon && r === roundResults.length - 1;
      if (!myWon) break;
    }
    perManager[m.name] = { matches, exitRound, won };
  }

  return { champion, perManager };
}

// ── UCL / UEL — shared 36-team league phase + knockout ──────────────────────

/**
 * @param {string} seed         frozen `mp_cups` seed for (room, season, comp)
 * @param {Array}  euroSquads   season-N mp_squads rows for the qualified managers only
 * @param {string} competition  'ucl' | 'uel'
 * @returns {{ table, champion, perManager }}
 */
export function simulateSharedEuro(seed, euroSquads, competition = 'ucl') {
  const rng = makeRng(seed);
  const managers = managerTeams(euroSquads);

  // 36 teams: managers (name order) + CPU clubs from the participant pool.
  const participants = competition === 'uel' ? UEL_PARTICIPANTS : UCL_PARTICIPANTS;
  const strengthTable = competition === 'uel' ? UEL_STRENGTH : UCL_STRENGTH;
  const clubMap = new Map();
  for (const p of participants) {
    if (!clubMap.has(p.club)) clubMap.set(p.club, []);
    clubMap.get(p.club).push(p);
  }
  const teamPool = [];
  for (const [club, apps] of clubMap) {
    const latest = apps[apps.length - 1];
    const best = apps.reduce((b, a) => (RESULT_ORDER.indexOf(a.result) < RESULT_ORDER.indexOf(b.result) ? a : b));
    teamPool.push({ name: `${club} ${latest.season}`, baseStrength: strengthTable[best.result] ?? 60 });
  }
  const cpu = rngShuffle(rng, teamPool).slice(0, Math.max(0, 36 - managers.length)).map(t => {
    const s = Math.round(clamp(t.baseStrength + rngGauss(rng, 4), 52, 92));
    return { name: t.name, att: s, def: s, isRealPlayer: false, scorers: [] };
  });
  const teams = [...managers, ...cpu]; // canonical 36

  // League phase — 8 rounds of a partial round-robin.
  const schedule = buildCLScheduleRounds(teams.length);
  const st = teams.map(() => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));
  const leagueMatches = {};
  teams.forEach(t => { if (t.isRealPlayer) leagueMatches[t.name] = []; });

  for (const round of schedule) {
    for (const [hi, ai] of round) {
      const { hg, ag } = rngMatch90(rng, teams[hi].att, teams[hi].def, teams[ai].att, teams[ai].def);
      if (hg > ag) { st[hi].W++; st[ai].L++; } else if (hg < ag) { st[hi].L++; st[ai].W++; } else { st[hi].D++; st[ai].D++; }
      st[hi].GF += hg; st[hi].GA += ag; st[ai].GF += ag; st[ai].GA += hg;
      for (const idx of [hi, ai]) {
        if (!teams[idx].isRealPlayer) continue;
        const isHome = idx === hi;
        const oppIdx = isHome ? ai : hi;
        const own = isHome ? hg : ag, oppG = isHome ? ag : hg;
        const day = EU_LEAGUE_DAYS[leagueMatches[teams[idx].name].length] ?? (2.5 + leagueMatches[teams[idx].name].length * 3);
        leagueMatches[teams[idx].name].push({
          competition, roundLabel: 'LIGAPHASE', day,
          opponent: teams[oppIdx].name, home: isHome,
          ownGoals: own, oppGoals2: oppG, ownGoalsReg: own,
          aet: false, pens: false, penScore: null, kicks: [],
          won: own > oppG, draw: own === oppG,
          events: [], oppGoals: buildOppGoals(rng, oppG, teams[oppIdx].scorers), otherResults: [],
        });
      }
    }
  }

  const table = teams
    .map((t, i) => ({ name: t.name, isReal: !!t.isRealPlayer, ...st[i], pts: st[i].W * 3 + st[i].D, gd: st[i].GF - st[i].GA }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.GF - a.GF)
    .map((r, i) => ({ ...r, pos: i + 1 }));

  const byName = Object.fromEntries(teams.map(t => [t.name, t]));
  const direct = table.filter(r => r.pos <= 8).map(r => byName[r.name]);
  const playoff = table.filter(r => r.pos >= 9 && r.pos <= 24).map(r => byName[r.name]);
  const leaguePos = Object.fromEntries(table.map(r => [r.name, r.pos]));

  // Knockout — one shared bracket. Two-legged until the single-leg final.
  const koRounds = {}; // roundId -> [{home,away,twoLeg?/res, hWins}]
  let stage = 'playoff';
  let current = playoff;
  let pendingDirect = direct;
  while (stage) {
    const isFinal = stage === 'final';
    const sh = rngShuffle(rng, current);
    const matchups = [];
    const winners = [];
    for (let i = 0; i + 1 < sh.length; i += 2) {
      const [a, b] = [sh[i], sh[i + 1]];
      const [home, away] = rng() < 0.5 ? [a, b] : [b, a];
      let mu;
      if (isFinal) {
        const res = rngKnockout(rng, home.att, home.def, away.att, away.def);
        const homeWon = res.pens ? res.hWins : res.hg > res.ag;
        mu = { home, away, res, homeWon, twoLeg: false };
        if (home.isRealPlayer) mu.homeOppGoals = buildOppGoals(rng, res.ag, away.scorers, res.aet, res.agReg);
        if (away.isRealPlayer) mu.awayOppGoals = buildOppGoals(rng, res.hg, home.scorers, res.aet, res.hgReg);
        winners.push(homeWon ? home : away);
      } else {
        const t = rngTwoLegTie(rng, home.att, home.def, away.att, away.def);
        mu = { home, away, tie: t, homeWon: t.hWins, twoLeg: true };
        if (home.isRealPlayer) {
          mu.homeLeg1Opp = buildOppGoals(rng, t.leg1.ag, away.scorers);
          mu.homeLeg2Opp = buildOppGoals(rng, t.leg2.ag, away.scorers, t.leg2.aet, t.leg2.agReg);
        }
        if (away.isRealPlayer) {
          mu.awayLeg1Opp = buildOppGoals(rng, t.leg1.hg, home.scorers);
          mu.awayLeg2Opp = buildOppGoals(rng, t.leg2.hg, home.scorers, t.leg2.aet, t.leg2.hgReg);
        }
        winners.push(t.hWins ? home : away);
      }
      matchups.push(mu);
    }
    koRounds[stage] = matchups;

    if (isFinal) break;
    let next = winners;
    if (stage === 'playoff') { next = [...pendingDirect, ...winners]; pendingDirect = []; }
    stage = EU_KO_ORDER[EU_KO_ORDER.indexOf(stage) + 1];
    current = next;
  }

  const champion = (() => {
    const f = koRounds.final?.[0];
    if (!f) return null;
    return f.homeWon ? f.home.name : f.away.name;
  })();

  // Per-manager slices.
  const perManager = {};
  for (const m of managers) {
    const matches = [...(leagueMatches[m.name] ?? [])];
    let exitRound = 'LIGAPHASE';
    let won = false;

    for (const stageId of EU_KO_ORDER) {
      const mu = (koRounds[stageId] ?? []).find(x => x.home.name === m.name || x.away.name === m.name);
      if (!mu) continue;
      const iAmHome = mu.home.name === m.name;
      const opp = iAmHome ? mu.away : mu.home;
      const label = EU_KO_LABEL[stageId];
      const days = EU_KO_DAYS[stageId];

      if (mu.twoLeg) {
        const t = mu.tie;
        const own1 = iAmHome ? t.leg1.hg : t.leg1.ag;
        const opp1 = iAmHome ? t.leg1.ag : t.leg1.hg;
        const own2 = iAmHome ? t.leg2.ag : t.leg2.hg; // leg 2 home/away is swapped
        const opp2 = iAmHome ? t.leg2.hg : t.leg2.ag;
        const own2reg = iAmHome ? t.leg2.agReg : t.leg2.hgReg;
        const myWon = iAmHome ? t.hWins : !t.hWins;
        matches.push({
          competition, roundLabel: `${label} — HINSPIEL`, day: days[0],
          opponent: opp.name, home: iAmHome,
          ownGoals: own1, oppGoals2: opp1, ownGoalsReg: own1,
          aet: false, pens: false, penScore: null, kicks: [],
          won: undefined, events: [],
          oppGoals: (iAmHome ? mu.homeLeg1Opp : mu.awayLeg1Opp) ?? [],
          aggOwn: own1 + own2, aggOpp: opp1 + opp2, otherResults: [],
        });
        matches.push({
          competition, roundLabel: `${label} — RÜCKSPIEL`, day: days[1] ?? days[0] + 1.5,
          opponent: opp.name, home: !iAmHome,
          ownGoals: own2, oppGoals2: opp2, ownGoalsReg: own2reg,
          aet: t.leg2.aet, pens: t.leg2.pens,
          penScore: normalizePen(t.leg2.penScore, !iAmHome),
          kicks: t.leg2.kicks ?? [],
          won: myWon, events: [],
          oppGoals: (iAmHome ? mu.homeLeg2Opp : mu.awayLeg2Opp) ?? [],
          aggOwn: own1 + own2, aggOpp: opp1 + opp2, otherResults: [],
        });
        exitRound = label;
        won = myWon && stageId === 'final';
        if (!myWon) break;
      } else {
        const myWon = iAmHome ? mu.homeWon : !mu.homeWon;
        matches.push({
          competition, roundLabel: label, day: days[0],
          opponent: opp.name, home: iAmHome,
          ownGoals: iAmHome ? mu.res.hg : mu.res.ag,
          oppGoals2: iAmHome ? mu.res.ag : mu.res.hg,
          ownGoalsReg: iAmHome ? mu.res.hgReg : mu.res.agReg,
          aet: mu.res.aet, pens: mu.res.pens,
          penScore: normalizePen(mu.res.penScore, iAmHome),
          kicks: mu.res.kicks ?? [], won: myWon, events: [],
          oppGoals: (iAmHome ? mu.homeOppGoals : mu.awayOppGoals) ?? [],
          otherResults: [],
        });
        exitRound = label;
        won = myWon && stageId === 'final';
        if (!myWon) break;
      }
    }

    // Managers eliminated in the league phase never entered the KO.
    if ((leaguePos[m.name] ?? 99) >= 25) exitRound = 'LIGAPHASE';
    perManager[m.name] = { matches, exitRound, won };
  }

  return { table, champion, perManager };
}
