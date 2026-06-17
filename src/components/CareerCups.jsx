import { useState } from 'react';
import PokalDrawScreen from './PokalDrawScreen';
import PokalMatchScreen from './PokalMatchScreen';
import PokalRoundResultsScreen from './PokalRoundResultsScreen';
import { buildPokalField, drawPokalRound } from '../utils/simulation';
import {
  buildCLField, simulateCLLeague, drawCLRound, classifyCLTable,
  simulatePlayoffRound, NEXT_CL_ROUND, CL_ROUND_LABELS,
} from '../utils/clUtils';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import './CLScreen.css';

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

export function CareerPokal({ slots, onDone }) {
  const [pk, setPk] = useState(() => {
    const teams = buildPokalField(slots, ALL_BL_PLAYERS);
    const { matchups, winners } = drawPokalRound(teams, 0, slots);
    return { phase: 'draw', round: 0, teams, matchups, winners, playerMatches: [] };
  });

  function handleMatchDone() {
    const pm = pk.matchups.find(m => m.isPlayerMatch)?.playerMatch;
    if (!pm) return;
    setPk(p => ({ ...p, phase: 'round-results', playerMatches: [...p.playerMatches, pm] }));
  }

  function handleRoundContinue() {
    const last = pk.playerMatches[pk.playerMatches.length - 1];
    const won = last?.won ?? false;
    const isFinal = pk.round === 5;
    if (!won || isFinal) { onDone(); return; }
    const { matchups, winners } = drawPokalRound(pk.winners, pk.round + 1, slots);
    setPk(p => ({ ...p, phase: 'draw', round: p.round + 1, matchups, winners }));
  }

  if (pk.phase === 'draw') {
    return (
      <PokalDrawScreen
        matchups={pk.matchups}
        round={pk.round}
        onContinue={() => setPk(p => ({ ...p, phase: 'match' }))}
      />
    );
  }
  if (pk.phase === 'match') {
    const matchup = pk.matchups.find(m => m.isPlayerMatch);
    if (!matchup) return null;
    return (
      <PokalMatchScreen
        key={pk.round}
        match={matchup.playerMatch}
        roundIndex={pk.round}
        onContinue={handleMatchDone}
      />
    );
  }
  if (pk.phase === 'round-results') {
    const last = pk.playerMatches[pk.playerMatches.length - 1];
    return (
      <PokalRoundResultsScreen
        matchups={pk.matchups}
        round={pk.round}
        playerWon={last?.won ?? false}
        onContinue={handleRoundContinue}
      />
    );
  }
  return null;
}

// ── UCL / UEL ─────────────────────────────────────────────────────────────────

export function CareerEuropean({ slots, label, onDone }) {
  const [cl, setCl] = useState(() => {
    const teams = buildCLField(slots);
    const { table, playerLeagueMatches } = simulateCLLeague(teams, slots);
    return {
      phase: 'league',
      leagueTeams: teams, leagueTable: table, playerLeagueMatches,
      directR16Teams: null, koRoundId: null, koMatchups: null, koWinners: null, playerKOMatches: [],
    };
  });

  function handleTableContinue() {
    const classified = classifyCLTable(cl.leagueTable);
    const playerRow  = cl.leagueTable.find(r => r.isPlayer);
    const playerPos  = playerRow?.pos ?? 36;
    const rowToTeam  = r => cl.leagueTeams.find(t => t.name === r.name) ?? { name: r.name, att: 70, def: 70 };
    const directTeams  = classified.direct.map(rowToTeam);
    const playoffTeams = classified.playoff.map(rowToTeam);

    if (playerPos >= 25) { onDone(); return; }

    if (playerPos >= 9) {
      const { matchups, winners } = drawCLRound(playoffTeams, CL_ROUND_LABELS.playoff, slots);
      setCl(p => ({ ...p, phase: 'ko-draw', koRoundId: 'playoff', directR16Teams: directTeams, koMatchups: matchups, koWinners: winners }));
    } else {
      const playoffWinners = simulatePlayoffRound(playoffTeams);
      const { matchups, winners } = drawCLRound([...directTeams, ...playoffWinners], CL_ROUND_LABELS.r16, slots);
      setCl(p => ({ ...p, phase: 'ko-draw', koRoundId: 'r16', directR16Teams: directTeams, koMatchups: matchups, koWinners: winners }));
    }
  }

  function handleMatchDone() {
    const pm = cl.koMatchups?.find(m => m.isPlayerMatch)?.playerMatch;
    if (!pm) return;
    setCl(p => ({ ...p, phase: 'ko-results', playerKOMatches: [...p.playerKOMatches, pm] }));
  }

  function handleRoundContinue() {
    const last = cl.playerKOMatches[cl.playerKOMatches.length - 1];
    const playerWon = last?.won ?? false;
    if (!playerWon || cl.koRoundId === 'final') { onDone(); return; }
    const nextRoundId = NEXT_CL_ROUND[cl.koRoundId];
    let nextTeams = cl.koWinners;
    if (cl.koRoundId === 'playoff') nextTeams = [...(cl.directR16Teams ?? []), ...cl.koWinners];
    const { matchups, winners } = drawCLRound(nextTeams, CL_ROUND_LABELS[nextRoundId], slots);
    setCl(p => ({ ...p, phase: 'ko-draw', koRoundId: nextRoundId, koMatchups: matchups, koWinners: winners }));
  }

  if (cl.phase === 'league') {
    const stats = cl.playerLeagueMatches.reduce(
      (acc, m) => ({ W: acc.W + (m.won ? 1 : 0), D: acc.D + (m.draw ? 1 : 0), L: acc.L + (!m.won && !m.draw ? 1 : 0), GF: acc.GF + m.ownGoals, GA: acc.GA + m.oppGoals2 }),
      { W: 0, D: 0, L: 0, GF: 0, GA: 0 }
    );
    return (
      <div className="cl-screen">
        <header className="cl-header">
          <div className="cl-title">LIGAPHASE</div>
          <div className="cl-sub">{label.toUpperCase()} · 8 SPIELTAGE</div>
        </header>
        <div className="cl-league-summary">
          <span>{stats.W}S</span><span>{stats.D}U</span><span>{stats.L}N</span>
          <span>{stats.GF}:{stats.GA}</span>
        </div>
        <div className="cl-match-list">
          {cl.playerLeagueMatches.map((m, i) => (
            <div key={i} className={`cl-match-row cl-match--${m.won ? 'win' : m.draw ? 'draw' : 'loss'}`}>
              <span className="cl-match-venue">{m.home ? 'H' : 'A'}</span>
              <span className="cl-match-opp">{m.opponent}</span>
              <span className="cl-match-score">{m.ownGoals}:{m.oppGoals2}</span>
              <span className="cl-match-badge">{m.won ? 'S' : m.draw ? 'U' : 'N'}</span>
            </div>
          ))}
        </div>
        <div className="cl-footer">
          <button className="btn btn-primary" onClick={() => setCl(p => ({ ...p, phase: 'table' }))}>
            Zur Tabelle →
          </button>
        </div>
      </div>
    );
  }

  if (cl.phase === 'table') {
    const playerRow = cl.leagueTable.find(r => r.isPlayer);
    const pos  = playerRow?.pos ?? 36;
    const zone = pos <= 8 ? 'direct' : pos <= 24 ? 'playoff' : 'out';
    return (
      <div className="cl-screen">
        <header className="cl-header">
          <div className="cl-title">LIGAPHASE · TABELLE</div>
          <div className="cl-sub">{label.toUpperCase()}</div>
          <div className={`cl-player-zone cl-zone-badge--${zone}`}>
            {zone === 'direct' ? 'Direkt ins Achtelfinale' : zone === 'playoff' ? 'Playoff' : 'Ausgeschieden'}
          </div>
        </header>
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead><tr>
              <th className="cl-th-pos">#</th>
              <th className="cl-th-name">Team</th>
              <th>S</th><th>U</th><th>N</th>
              <th className="cl-th-goals">Tore</th>
              <th>Pkt</th>
            </tr></thead>
            <tbody>
              {cl.leagueTable.map((row, i) => (
                <tr key={i} className={[
                  row.isPlayer ? 'cl-row--player' : '',
                  row.pos <= 8 ? 'cl-zone--direct' : row.pos <= 24 ? 'cl-zone--playoff' : 'cl-zone--out',
                ].join(' ')}>
                  <td>{row.pos}</td>
                  <td className="cl-cell-name">{row.name}</td>
                  <td>{row.W}</td><td>{row.D}</td><td>{row.L}</td>
                  <td className="cl-cell-goals">{row.GF}:{row.GA}</td>
                  <td><strong>{row.pts}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cl-legend">
          <span className="cl-legend--direct">1–8 Achtelfinale</span>
          <span className="cl-legend--playoff">9–24 Playoff</span>
          <span className="cl-legend--out">25–36 Aus</span>
        </div>
        <div className="cl-footer">
          <button className="btn btn-primary" onClick={handleTableContinue}>Weiter →</button>
        </div>
      </div>
    );
  }

  if (cl.phase === 'ko-draw') {
    const sorted = [...(cl.koMatchups ?? [])].sort((a, b) => a.isPlayerMatch ? -1 : b.isPlayerMatch ? 1 : 0);
    return (
      <div className="cl-screen cl-draw">
        <header className="cl-header">
          <div className="cl-title">AUSLOSUNG · {CL_ROUND_LABELS[cl.koRoundId]}</div>
          <div className="cl-sub">{label.toUpperCase()}</div>
        </header>
        <div className="cl-draw-list">
          {sorted.map((m, i) => (
            <div key={i} className={`cl-draw-pair${m.isPlayerMatch ? ' cl-draw-pair--you' : ''}`}>
              <span className="cl-draw-team">{m.home}</span>
              <span className="cl-draw-vs">vs</span>
              <span className="cl-draw-team cl-draw-team--r">{m.away}</span>
            </div>
          ))}
        </div>
        <div className="cl-footer">
          <button className="btn btn-primary" onClick={() => setCl(p => ({ ...p, phase: 'ko-match' }))}>
            Zum Spiel →
          </button>
        </div>
      </div>
    );
  }

  if (cl.phase === 'ko-match') {
    const matchup = cl.koMatchups?.find(m => m.isPlayerMatch);
    if (!matchup) return null;
    return (
      <PokalMatchScreen
        key={cl.koRoundId}
        match={matchup.playerMatch}
        roundIndex={2}
        roundLabel={CL_ROUND_LABELS[cl.koRoundId]}
        onContinue={handleMatchDone}
      />
    );
  }

  if (cl.phase === 'ko-results') {
    const sorted = [...(cl.koMatchups ?? [])].sort((a, b) => a.isPlayerMatch ? -1 : b.isPlayerMatch ? 1 : 0);
    const last = cl.playerKOMatches[cl.playerKOMatches.length - 1];
    const playerWon = last?.won ?? false;
    const isFinal = cl.koRoundId === 'final';
    return (
      <div className="cl-screen cl-results">
        <header className="cl-header">
          <div className="cl-title">{CL_ROUND_LABELS[cl.koRoundId]}</div>
          <div className="cl-sub">ERGEBNISSE · {label.toUpperCase()}</div>
        </header>
        <div className="cl-results-list">
          {sorted.map((m, i) => (
            <div key={i} className={`cl-result-row${m.isPlayerMatch ? ' cl-result-row--player' : ''}`}>
              <span className={`cl-result-team${m.homeWon ? ' cl-result--winner' : ''}`}>{m.home}</span>
              <span className="cl-result-score">{scoreStr(m)}</span>
              <span className={`cl-result-team cl-result-team--r${!m.homeWon ? ' cl-result--winner' : ''}`}>{m.away}</span>
            </div>
          ))}
        </div>
        <div className="cl-footer">
          <button className="btn btn-primary" onClick={handleRoundContinue}>
            {isFinal || !playerWon ? 'Weiter' : 'Nächste Runde →'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
