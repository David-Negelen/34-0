import { UCL_PARTICIPANTS } from '../data/uclParticipants';
import { UEL_PARTICIPANTS } from '../data/uelParticipants';
import { calcTeamStrength, simulateKnockout, simulateMatch, simulateTwoLegTie, generateMatchEvents } from './simulation';
import { getOopPenalty } from './positionUtils';

function gauss(sigma) {
  const u = 1 - Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export function shuffleCL(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RESULT_ORDER = ['winner', 'final', 'sf', 'qf', 'r16', 'r32', 'po', 'group'];
const UCL_STRENGTH = { winner: 88, final: 84, sf: 80, qf: 76, r16: 72, r32: 69, po: 68, group: 64 };
const UEL_STRENGTH = { winner: 82, final: 78, sf: 74, qf: 70, r16: 67, r32: 64, po: 62, group: 60 };

export const CL_ROUND_LABELS = {
  playoff: 'PLAYOFF',
  r16: 'ACHTELFINALE',
  qf: 'VIERTELFINALE',
  sf: 'HALBFINALE',
  final: 'FINALE',
};

export const NEXT_CL_ROUND = {
  playoff: 'r16',
  r16: 'qf',
  qf: 'sf',
  sf: 'final',
};

export function buildCLField(slots, competition = 'ucl') {
  const { att, def } = calcTeamStrength(slots);
  const participants = competition === 'uel' ? UEL_PARTICIPANTS : UCL_PARTICIPANTS;
  const strengthTable = competition === 'uel' ? UEL_STRENGTH : UCL_STRENGTH;

  const clubMap = new Map();
  for (const p of participants) {
    if (!clubMap.has(p.club)) clubMap.set(p.club, []);
    clubMap.get(p.club).push(p);
  }

  const teamPool = [];
  for (const [club, appearances] of clubMap) {
    const latest = appearances[appearances.length - 1];
    const best = appearances.reduce((b, a) =>
      RESULT_ORDER.indexOf(a.result) < RESULT_ORDER.indexOf(b.result) ? a : b
    );
    teamPool.push({
      club,
      name: `${club} ${latest.season}`,
      season: latest.season,
      baseStrength: strengthTable[best.result] ?? 60,
    });
  }

  const cpuTeams = shuffleCL(teamPool).slice(0, 35).map(t => {
    const str = Math.round(Math.min(92, Math.max(52, t.baseStrength + gauss(4))));
    return { club: t.club, name: t.name, season: t.season, att: str, def: str };
  });

  return [{ name: 'Deine 11', att, def, isPlayer: true }, ...cpuTeams];
}

// 8-round partial round-robin for n=36 teams (circle method, first 8 of 35 rounds)
function buildCLScheduleRounds(n) {
  const rotating = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [[0, rotating[0]]];
    for (let i = 1; i < n / 2; i++) round.push([rotating[i], rotating[n - 1 - i]]);
    rotating.unshift(rotating.pop());
    rounds.push(round);
  }
  return rounds.slice(0, 8);
}

export function simulateCLLeague(teams, slots) {
  const schedule = buildCLScheduleRounds(teams.length);
  const n = teams.length;
  const stats = Array.from({ length: n }, () => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));
  const playerIdx = teams.findIndex(t => t.isPlayer);

  const squad = slots
    .filter(s => s.player && s.type !== 'BENCH')
    .map(s => {
      const base = s.player.displayRating ?? s.player.primeRating ?? 75;
      return { ...s.player, slotType: s.type, rating: Math.max(1, base - getOopPenalty(s.player.positions, s.type)) };
    });

  const playerLeagueMatches = [];

  for (const round of schedule) {
    for (const [hi, ai] of round) {
      const { hg, ag } = simulateMatch(teams[hi].att, teams[hi].def, teams[ai].att, teams[ai].def);
      if (hg > ag) { stats[hi].W++; stats[ai].L++; }
      else if (hg < ag) { stats[hi].L++; stats[ai].W++; }
      else { stats[hi].D++; stats[ai].D++; }
      stats[hi].GF += hg; stats[hi].GA += ag;
      stats[ai].GF += ag; stats[ai].GA += hg;

      if (hi === playerIdx || ai === playerIdx) {
        const isHome = hi === playerIdx;
        const opp = isHome ? teams[ai] : teams[hi];
        const own = isHome ? hg : ag;
        const opp2 = isHome ? ag : hg;
        const events = squad.length ? generateMatchEvents(own, opp2, squad, 0.01) : [];
        playerLeagueMatches.push({
          opponent: opp.name,
          home: isHome,
          ownGoals: own,
          oppGoals2: opp2,
          won: own > opp2,
          draw: own === opp2,
          events,
          oppGoals: Array.from({ length: opp2 }, () => ({
            minute: Math.floor(Math.random() * 90) + 1,
            scorerName: null,
          })).sort((a, b) => a.minute - b.minute),
        });
      }
    }
  }

  const table = teams.map((t, i) => ({
    name: t.name,
    club: t.club,
    att: t.att,
    def: t.def,
    isPlayer: !!t.isPlayer,
    ...stats[i],
    pts: stats[i].W * 3 + stats[i].D,
    gd: stats[i].GF - stats[i].GA,
  })).sort((a, b) => {
    const pd = b.pts - a.pts; if (pd) return pd;
    const gd = b.gd - a.gd; if (gd) return gd;
    return b.GF - a.GF;
  }).map((r, i) => ({ ...r, pos: i + 1 }));

  return { playerLeagueMatches, table };
}

export function classifyCLTable(table) {
  return {
    direct: table.filter(r => r.pos <= 8),
    playoff: table.filter(r => r.pos >= 9 && r.pos <= 24),
    eliminated: table.filter(r => r.pos >= 25),
  };
}

export function simulateToWinner(teams) {
  let remaining = [...teams];
  while (remaining.length > 1) {
    const sh = shuffleCL(remaining);
    const next = [];
    for (let i = 0; i + 1 < sh.length; i += 2) {
      const [a, b] = [sh[i], sh[i + 1]];
      const r = simulateKnockout(a.att, a.def, b.att, b.def);
      next.push((r.pens ? r.hWins : r.hg > r.ag) ? a : b);
    }
    remaining = next;
  }
  return remaining[0]?.name ?? 'Unbekannt';
}

export function simulatePlayoffRound(playoffTeams) {
  const sh = shuffleCL(playoffTeams);
  const winners = [];
  for (let i = 0; i + 1 < sh.length; i += 2) {
    const [a, b] = [sh[i], sh[i + 1]];
    const r = simulateKnockout(a.att, a.def, b.att, b.def);
    winners.push((r.pens ? r.hWins : r.hg > r.ag) ? a : b);
  }
  return winners;
}

export function drawCLRound(teams, roundLabel, slots) {
  const shuffled = shuffleCL(teams);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) pairs.push([shuffled[i], shuffled[i + 1]]);

  const squad = slots.filter(s => s.player && s.type !== 'BENCH').map(s => {
    const base = s.player.displayRating ?? s.player.primeRating ?? 75;
    return { ...s.player, slotType: s.type, rating: Math.max(1, base - getOopPenalty(s.player.positions, s.type)) };
  });

  const matchups = [];
  const winners = [];

  for (const [a, b] of pairs) {
    const [home, away] = Math.random() < 0.5 ? [a, b] : [b, a];
    const isPlayerMatch = !!(home.isPlayer || away.isPlayer);
    const result = simulateKnockout(home.att, home.def, away.att, away.def);
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

      const events = squad.length
        ? generateMatchEvents(own, opp, squad, 0.04, result.aet, ownReg)
        : [];
      const oppGoals = Array.from({ length: opp }, (_, gi) => ({
        minute: result.aet && gi >= oppReg
          ? Math.floor(Math.random() * 30) + 91
          : Math.floor(Math.random() * 90) + 1,
        scorerName: null,
      })).sort((a, b) => a.minute - b.minute);

      entry.playerMatch = {
        round: roundLabel,
        opponent: oppTeam.name,
        home: playerIsHome,
        ownGoals: own,
        oppGoals2: opp,
        aet: result.aet, pens: result.pens, penScore: result.penScore ?? null,
        won, events, oppGoals, kicks: result.kicks ?? [],
      };
    }

    matchups.push(entry);
    winners.push(homeWon ? home : away);
  }

  return { matchups, winners };
}

// Two-legged version: leg 1 = 90 min, leg 2 = 90+ET+pens if needed.
// Returns { matchups, winners } where player matchups have playerLeg1/playerLeg2.
export function drawCLRoundTwoLegs(teams, roundLabel, slots) {
  const shuffled = shuffleCL(teams);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) pairs.push([shuffled[i], shuffled[i + 1]]);

  const squad = slots.filter(s => s.player && s.type !== 'BENCH').map(s => {
    const base = s.player.displayRating ?? s.player.primeRating ?? 75;
    return { ...s.player, slotType: s.type, rating: Math.max(1, base - getOopPenalty(s.player.positions, s.type)) };
  });

  const matchups = [];
  const winners  = [];

  for (const [a, b] of pairs) {
    const [home, away] = Math.random() < 0.5 ? [a, b] : [b, a];
    const isPlayerMatch = !!(home.isPlayer || away.isPlayer);
    const { leg1, leg2, hWins } = simulateTwoLegTie(home.att, home.def, away.att, away.def);
    const homeWinsOverall = hWins;

    // Aggregate scores for display (home = leg1-home team)
    const homeAgg = leg1.hg + leg2.ag; // leg1-home's total: scored in leg1 + scored away in leg2
    const awayAgg = leg1.ag + leg2.hg;

    const entry = {
      homeTeam: home, awayTeam: away,
      home: home.name, away: away.name,
      hg: homeAgg, ag: awayAgg,
      homeWon: homeWinsOverall, isPlayerMatch,
      aet: leg2.aet, pens: leg2.pens, penScore: leg2.penScore,
    };

    if (isPlayerMatch) {
      const playerIsHomeLeg1 = !!home.isPlayer;
      const oppTeam = playerIsHomeLeg1 ? away : home;
      const playerWon = playerIsHomeLeg1 ? homeWinsOverall : !homeWinsOverall;

      // Leg 1 (player home or away, 90 min)
      const own1 = playerIsHomeLeg1 ? leg1.hg : leg1.ag;
      const opp1 = playerIsHomeLeg1 ? leg1.ag : leg1.hg;
      const ev1 = squad.length ? generateMatchEvents(own1, opp1, squad, 0.04, false, own1) : [];
      const og1 = Array.from({ length: opp1 }, () => ({ minute: Math.floor(Math.random() * 90) + 1, scorerName: null })).sort((a, b) => a.minute - b.minute);

      // Leg 2 (home/away reversed)
      // In leg2: away becomes home, home becomes away
      // leg2.hg = leg2 home goals = original away team's goals
      // leg2.ag = leg2 away goals = original home team's goals
      const own2 = playerIsHomeLeg1 ? leg2.ag : leg2.hg;
      const opp2 = playerIsHomeLeg1 ? leg2.hg : leg2.ag;
      const ownReg2 = playerIsHomeLeg1 ? leg2.agReg : leg2.hgReg;
      const ev2 = squad.length ? generateMatchEvents(own2, opp2, squad, 0.04, leg2.aet, ownReg2) : [];
      const og2 = Array.from({ length: opp2 }, (_, gi) => ({
        minute: leg2.aet && gi >= (playerIsHomeLeg1 ? leg2.agReg : leg2.hgReg)
          ? Math.floor(Math.random() * 30) + 91
          : Math.floor(Math.random() * 90) + 1,
        scorerName: null,
      })).sort((a, b) => a.minute - b.minute);

      entry.playerLeg1 = {
        round: roundLabel, opponent: oppTeam.name,
        home: playerIsHomeLeg1, ownGoals: own1, oppGoals2: opp1,
        aet: false, pens: false, penScore: null,
        events: ev1, oppGoals: og1, kicks: [],
        aggOwn: own1 + own2, aggOpp: opp1 + opp2,
      };
      entry.playerLeg2 = {
        round: roundLabel, opponent: oppTeam.name,
        home: !playerIsHomeLeg1, ownGoals: own2, oppGoals2: opp2,
        aet: leg2.aet, pens: leg2.pens, penScore: leg2.penScore,
        events: ev2, oppGoals: og2, kicks: leg2.kicks ?? [],
        aggOwn: own1 + own2, aggOpp: opp1 + opp2,
        won: playerWon,
      };
      entry.playerWon = playerWon;
    }

    matchups.push(entry);
    winners.push(homeWinsOverall ? home : away);
  }

  return { matchups, winners };
}
