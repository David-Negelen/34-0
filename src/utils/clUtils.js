import { UCL_PARTICIPANTS } from '../data/uclParticipants';
import { calcTeamStrength, simulateKnockout, simulateMatch, generateMatchEvents } from './simulation';
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

const RESULT_ORDER = ['winner', 'final', 'sf', 'qf', 'r16', 'po', 'group'];
const RESULT_STRENGTH = {
  winner: 88, final: 84, sf: 80, qf: 76, r16: 72, po: 68, group: 64,
};

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

export function buildCLField(slots, allPlayers = []) {
  const { att, def } = calcTeamStrength(slots);

  const clubMap = new Map();
  for (const p of UCL_PARTICIPANTS) {
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
      baseStrength: RESULT_STRENGTH[best.result] ?? 64,
    });
  }

  const cpuTeams = shuffleCL(teamPool).slice(0, 35).map(t => {
    const str = Math.round(Math.min(95, Math.max(55, t.baseStrength + gauss(4))));
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
