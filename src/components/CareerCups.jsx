import { useState } from 'react';
import { buildPokalField, drawPokalRound } from '../utils/simulation';
import {
  buildCLField, simulateCLLeague, drawCLRound, drawCLRoundTwoLegs, classifyCLTable,
  simulatePlayoffRound, simulateToWinner, NEXT_CL_ROUND, CL_ROUND_LABELS,
} from '../utils/clUtils';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import './PokalRoundResultsScreen.css';

const ALL_BL_PLAYERS = [
  ...BL_PLAYERS.map(p => ({ ...p, _league: 'bl' })),
  ...BL2_PLAYERS.map(p => ({ ...p, _league: '2bl' })),
];

function scoreStr(m) {
  const base = `${m.hg}–${m.ag}`;
  if (m.pens) return `${base} n.V. (${m.penScore} i.E.)`;
  if (m.aet)  return `${base} n.V.`;
  return base;
}

// ── DFB Pokal ─────────────────────────────────────────────────────────────────

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];
const POKAL_DAYS   = [4.3, 10.3, 17.3, 24.3, 29.3, 34.5];

function normalizeCupMatch(pm, competition, roundLabel, day) {
  // penScore convention in simulation is always "home:away" for that specific leg.
  // Normalise to "player:opponent" so the display is unambiguous.
  let penScore = pm.penScore;
  if (pm.pens && penScore && !pm.home) {
    const [a, b] = penScore.split(':');
    penScore = `${b}:${a}`;
  }
  return {
    home: pm.home ? 'Deine 11' : pm.opponent,
    away: pm.home ? pm.opponent : 'Deine 11',
    hg: pm.home ? pm.ownGoals : pm.oppGoals2,
    ag: pm.home ? pm.oppGoals2 : pm.ownGoals,
    events: pm.events ?? [],
    oppGoals: pm.oppGoals ?? [],
    aet: pm.aet,
    pens: pm.pens,
    penScore,
    won: pm.won,    // overall cup advancement result (undefined for leg 1 of two-legged ties)
    competition,
    roundLabel,
    day,
  };
}

export function simulatePokalMatches(slots) {
  const playerMatches = [];
  let teams = buildPokalField(slots, ALL_BL_PLAYERS);
  let won = false;
  for (let round = 0; round < 6; round++) {
    const { matchups, winners } = drawPokalRound(teams, round, slots);
    const playerMatchup = matchups.find(m => m.isPlayerMatch);
    const pm = playerMatchup?.playerMatch;
    if (pm) {
      const otherResults = matchups
        .filter(m => !m.isPlayerMatch)
        .map(m => ({ home: m.home, away: m.away, hg: m.hg, ag: m.ag, homeWon: m.homeWon, aet: m.aet, pens: m.pens, penScore: m.penScore }));
      playerMatches.push({ ...normalizeCupMatch(pm, 'pokal', ROUND_LABELS[round], POKAL_DAYS[round]), otherResults });
      won = pm.won;
    }
    teams = winners;
    if (!pm?.won) break;
  }
  return { playerMatches, won };
}

export function CareerPokal({ slots, onDone }) {
  const rounds = useState(() => {
    const allRounds = [];
    let teams = buildPokalField(slots, ALL_BL_PLAYERS);
    for (let round = 0; round < 6; round++) {
      const { matchups, winners } = drawPokalRound(teams, round, slots);
      const playerWon = matchups.find(m => m.isPlayerMatch)?.playerMatch?.won ?? false;
      allRounds.push({ round, matchups, playerWon });
      teams = winners;
      if (!playerWon) break;
    }
    return allRounds;
  })[0];

  const last = rounds[rounds.length - 1];
  const won = last?.playerWon ?? false;

  return (
    <div className="prr-screen">
      <header className="prr-header">
        <div className="prr-round">DFB-POKAL</div>
        <div className="prr-sub">
          {won && last?.round === 5 ? 'POKALSIEGER!' : `AUSGESCHIEDEN — ${ROUND_LABELS[last?.round ?? 0]}`}
        </div>
      </header>

      {rounds.map(({ round, matchups }) => {
        const sorted = [...matchups].sort((a, b) => a.isPlayerMatch ? -1 : b.isPlayerMatch ? 1 : 0);
        return (
          <div key={round} style={{ width: '100%', maxWidth: 560 }}>
            <div className="prr-sub" style={{ marginBottom: 6, paddingLeft: 4 }}>{ROUND_LABELS[round]}</div>
            <div className="prr-list">
              {sorted.map((m, i) => (
                <div key={i} className={`prr-row${m.isPlayerMatch ? ' prr-row--player' : ''}`}>
                  <span className={`prr-team prr-home${m.homeWon ? ' prr-winner' : ''}`}>{m.home}</span>
                  <span className="prr-score">{scoreStr(m)}</span>
                  <span className={`prr-team prr-away${!m.homeWon ? ' prr-winner' : ''}`}>{m.away}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="prr-actions">
        <button className="btn btn-primary" onClick={onDone}>Weiter →</button>
      </div>
    </div>
  );
}

// ── UCL / UEL — full simulation (runs during runSeason) ───────────────────────

const EU_LEAGUE_DAYS = [2.5, 5.5, 8.5, 11.5, 14.5, 17.5, 20.5, 23.5];
// [leg1, leg2] for two-legged rounds; final is single leg after season
const EU_KO_DAYS = {
  playoff: [18.7, 20.3],
  r16:     [22.7, 24.3],
  qf:      [26.7, 28.3],
  sf:      [30.7, 32.3],
  final:   [35],
};

export function simulateEuropeanCupFull(slots, competition = 'ucl') {
  const teams = buildCLField(slots);
  const { table, playerLeagueMatches } = simulateCLLeague(teams, slots);

  const classified = classifyCLTable(table);
  const playerRow  = table.find(r => r.isPlayer);
  const playerPos  = playerRow?.pos ?? 36;

  const rowToTeam = r => teams.find(t => t.name === r.name) ?? { name: r.name, att: 70, def: 70 };
  const directTeams  = classified.direct.map(rowToTeam);
  const playoffTeams = classified.playoff.map(rowToTeam);

  const normalizedLeagueMatches = playerLeagueMatches.map((pm, i) =>
    normalizeCupMatch(pm, competition, 'LIGAPHASE', EU_LEAGUE_DAYS[i] ?? (2.5 + i * 3))
  );

  // Eliminated in league phase
  if (playerPos >= 25) {
    const playoffWinners = simulatePlayoffRound(playoffTeams);
    const champion = simulateToWinner([...directTeams, ...playoffWinners]);
    return { table, playerLeagueMatches, koRounds: [], playerPos, champion, normalizedPlayerMatches: normalizedLeagueMatches };
  }

  // Start KO phase
  let currentRoundId;
  let currentTeams;
  let directR16 = null;

  if (playerPos <= 8) {
    // Direct to R16; simulate playoff without player
    const playoffWinners = simulatePlayoffRound(playoffTeams);
    currentRoundId = 'r16';
    currentTeams   = [...directTeams, ...playoffWinners];
  } else {
    // Player in playoff
    currentRoundId = 'playoff';
    currentTeams   = playoffTeams;
    directR16      = directTeams;
  }

  const koRounds = [];
  const normalizedKoMatches = [];

  while (currentRoundId) {
    const isFinal = currentRoundId === 'final';
    const days = EU_KO_DAYS[currentRoundId] ?? [35];
    const roundLabel = CL_ROUND_LABELS[currentRoundId];

    let matchups, winners, playerWon;

    if (isFinal) {
      // Single leg final
      ({ matchups, winners } = drawCLRound(currentTeams, roundLabel, slots));
      const pm = matchups.find(m => m.isPlayerMatch);
      playerWon = pm?.playerMatch?.won ?? false;
      koRounds.push({ roundId: currentRoundId, matchups, playerWon });

      if (pm?.playerMatch) {
        const otherResults = matchups.filter(m => !m.isPlayerMatch)
          .map(m => ({ home: m.home, away: m.away, hg: m.hg, ag: m.ag, homeWon: m.homeWon, aet: m.aet, pens: m.pens, penScore: m.penScore }));
        normalizedKoMatches.push({
          ...normalizeCupMatch(pm.playerMatch, competition, roundLabel, days[0]),
          otherResults,
        });
      }
    } else {
      // Two-legged round
      ({ matchups, winners } = drawCLRoundTwoLegs(currentTeams, roundLabel, slots));
      const pm = matchups.find(m => m.isPlayerMatch);
      playerWon = pm?.playerWon ?? false;
      koRounds.push({ roundId: currentRoundId, matchups, playerWon });

      if (pm?.playerLeg1 && pm?.playerLeg2) {
        const otherResults = matchups.filter(m => !m.isPlayerMatch)
          .map(m => ({ home: m.home, away: m.away, hg: m.hg, ag: m.ag, homeWon: m.homeWon, aet: m.aet, pens: m.pens, penScore: m.penScore }));
        // Leg 1
        normalizedKoMatches.push({
          ...normalizeCupMatch(pm.playerLeg1, competition, `${roundLabel} — HINSPIEL`, days[0]),
          otherResults: [],
        });
        // Leg 2 (with aggregate + other results)
        const leg2Match = normalizeCupMatch(pm.playerLeg2, competition, `${roundLabel} — RÜCKSPIEL`, days[1] ?? days[0] + 1.5);
        leg2Match.aggOwn = pm.playerLeg2.aggOwn;
        leg2Match.aggOpp = pm.playerLeg2.aggOpp;
        normalizedKoMatches.push({ ...leg2Match, otherResults });
      }
    }

    if (!playerWon || isFinal) break;

    if (currentRoundId === 'playoff') {
      currentTeams = [...(directR16 ?? []), ...winners];
      directR16 = null;
    } else {
      currentTeams = winners;
    }
    currentRoundId = NEXT_CL_ROUND[currentRoundId];
  }

  const lastRound  = koRounds[koRounds.length - 1];
  const playerWon  = lastRound?.playerWon && lastRound?.roundId === 'final';
  const champion   = playerWon
    ? 'Deine 11'
    : simulateToWinner(
        (lastRound?.matchups ?? []).map(m => m.homeWon ? m.homeTeam : m.awayTeam).filter(t => !t?.isPlayer)
      );

  return { table, playerLeagueMatches, koRounds, playerPos, champion, normalizedPlayerMatches: [...normalizedLeagueMatches, ...normalizedKoMatches] };
}

// ── UCL / UEL — display component (receives pre-simulated data) ───────────────

export function CareerEuropean({ data, label, onDone }) {
  const { table, playerLeagueMatches, koRounds, playerPos, champion } = data;

  const stats = playerLeagueMatches.reduce(
    (acc, m) => ({ W: acc.W + (m.won ? 1 : 0), D: acc.D + (m.draw ? 1 : 0), L: acc.L + (!m.won && !m.draw ? 1 : 0), GF: acc.GF + m.ownGoals, GA: acc.GA + m.oppGoals2 }),
    { W: 0, D: 0, L: 0, GF: 0, GA: 0 }
  );

  const zone       = playerPos <= 8 ? 'direct' : playerPos <= 24 ? 'playoff' : 'out';
  const lastKO     = koRounds[koRounds.length - 1];
  const won        = champion === 'Deine 11';
  const eliminated = zone === 'out' || (lastKO && !lastKO.playerWon);

  return (
    <div className="prr-screen">
      <header className="prr-header">
        <div className="prr-round">{label.toUpperCase()}</div>
        <div className="prr-sub">
          {won ? 'SIEGER!' : eliminated && lastKO ? `AUSGESCHIEDEN — ${CL_ROUND_LABELS[lastKO.roundId]}` : eliminated ? 'LIGAPHASE — AUSGESCHIEDEN' : ''}
        </div>
      </header>

      {/* League phase */}
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div className="prr-sub" style={{ marginBottom: 6, paddingLeft: 4 }}>
          LIGAPHASE · PLATZ {playerPos} · {zone === 'direct' ? 'ACHTELFINALE' : zone === 'playoff' ? 'PLAYOFF' : 'AUSGESCHIEDEN'}
        </div>
        <div className="prr-list">
          {playerLeagueMatches.map((m, i) => {
            const playerHome = m.home;
            const homeTeam = playerHome ? 'Deine 11' : m.opponent;
            const awayTeam = playerHome ? m.opponent : 'Deine 11';
            const homeWon  = playerHome ? m.won : !m.won && !m.draw;
            return (
              <div key={i} className="prr-row prr-row--player">
                <span className={`prr-team prr-home${homeWon ? ' prr-winner' : ''}`}>{homeTeam}</span>
                <span className="prr-score">{playerHome ? m.ownGoals : m.oppGoals2}:{playerHome ? m.oppGoals2 : m.ownGoals}</span>
                <span className={`prr-team prr-away${!homeWon ? ' prr-winner' : ''}`}>{awayTeam}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* KO rounds */}
      {koRounds.map(({ roundId, matchups }) => {
        const sorted = [...matchups].sort((a, b) => a.isPlayerMatch ? -1 : b.isPlayerMatch ? 1 : 0);
        return (
          <div key={roundId} style={{ width: '100%', maxWidth: 560 }}>
            <div className="prr-sub" style={{ marginBottom: 6, paddingLeft: 4 }}>{CL_ROUND_LABELS[roundId]}</div>
            <div className="prr-list">
              {sorted.map((m, i) => (
                <div key={i} className={`prr-row${m.isPlayerMatch ? ' prr-row--player' : ''}`}>
                  <span className={`prr-team prr-home${m.homeWon ? ' prr-winner' : ''}`}>{m.home}</span>
                  <span className="prr-score">{scoreStr(m)}</span>
                  <span className={`prr-team prr-away${!m.homeWon ? ' prr-winner' : ''}`}>{m.away}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!won && champion && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Sieger: <strong style={{ color: 'var(--text)' }}>{champion}</strong>
        </div>
      )}

      <div className="prr-actions">
        <button className="btn btn-primary" onClick={onDone}>Weiter →</button>
      </div>
    </div>
  );
}
