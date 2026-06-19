import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../hooks/useGameState';
import SetupScreen from './SetupScreen';
import DraftScreen from './DraftScreen';
import PokalMatchScreen from './PokalMatchScreen';
import { PLAYERS_EUROPEAN } from '../data/playersEuropean';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import {
  buildCLField, simulateCLLeague, drawCLRound, drawCLRoundTwoLegs, classifyCLTable,
  simulateToWinner, simulatePlayoffRound, NEXT_CL_ROUND, CL_ROUND_LABELS,
} from '../utils/clUtils';
import './CLScreen.css';

const EURO_IDS = new Set(PLAYERS_EUROPEAN.map(p => p.id));
const ALL_PLAYERS = [
  ...PLAYERS_EUROPEAN,
  ...[...BL_PLAYERS, ...BL2_PLAYERS].filter(p => !EURO_IDS.has(p.id)),
];
const ALL_CLUBS = {};
const CL_KEY = 'cl_state_v1';

function scoreStr(m) {
  const base = `${m.hg}–${m.ag}`;
  if (m.pens) return `${base} n.V. (${m.penScore} i.E.)`;
  if (m.aet)  return `${base} n.V.`;
  return base;
}

export default function CLScreen() {
  const navigate = useNavigate();
  const { state, updateSetup, startDraft, fillSlot, useReroll, setPendingSpin, setResult, reset } =
    useGameState('ucl');
  const [cl, setCl] = useState(null);

  useEffect(() => {
    if (state.phase !== 'result' || !state.result?.slots || cl !== null) return;
    try {
      const saved = localStorage.getItem(CL_KEY);
      if (saved) { setCl(JSON.parse(saved)); return; }
    } catch {}
    const teams = buildCLField(state.result.slots);
    const { table, playerLeagueMatches } = simulateCLLeague(teams, state.result.slots);
    setCl({
      phase: 'league-match',
      leagueMatchIdx: 0,
      slots: state.result.slots,
      leagueTeams: teams,
      leagueTable: table,
      playerLeagueMatches,
      directR16Teams: null,
      koRoundId: null,
      koMatchups: null,
      koWinners: null,
      playerKOMatches: [],
      champion: null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.result]);

  useEffect(() => {
    if (!cl) return;
    if (cl.phase === 'done') { localStorage.removeItem(CL_KEY); return; }
    try { localStorage.setItem(CL_KEY, JSON.stringify(cl)); } catch {}
  }, [cl]);

  useEffect(() => {
    if (state.phase === 'setup') { setCl(null); localStorage.removeItem(CL_KEY); }
  }, [state.phase]);

  function handleReset() {
    localStorage.removeItem(CL_KEY);
    reset();
    setCl(null);
  }

  function handleLeagueMatchDone() {
    const nextIdx = (cl.leagueMatchIdx ?? 0) + 1;
    if (nextIdx >= cl.playerLeagueMatches.length) {
      setCl(p => ({ ...p, phase: 'league' }));
    } else {
      setCl(p => ({ ...p, leagueMatchIdx: nextIdx }));
    }
  }

  function handleTableContinue() {
    const classified = classifyCLTable(cl.leagueTable);
    const playerRow = cl.leagueTable.find(r => r.isPlayer);
    const playerPos = playerRow?.pos ?? 36;
    const { slots, leagueTeams } = cl;

    const rowToTeam = r => leagueTeams.find(t => t.name === r.name) ?? { name: r.name, club: r.club, att: 70, def: 70 };
    const directTeams = classified.direct.map(rowToTeam);
    const playoffTeams = classified.playoff.map(rowToTeam);

    if (playerPos >= 25) {
      const playoffWinners = simulatePlayoffRound(playoffTeams);
      const champion = simulateToWinner([...directTeams, ...playoffWinners]);
      setCl(p => ({ ...p, phase: 'done', champion }));
      return;
    }

    if (playerPos >= 9) {
      const { matchups, winners } = drawCLRoundTwoLegs(playoffTeams, CL_ROUND_LABELS.playoff, slots);
      setCl(p => ({ ...p, phase: 'ko-draw', koRoundId: 'playoff', directR16Teams: directTeams, koMatchups: matchups, koWinners: winners }));
    } else {
      const playoffWinners = simulatePlayoffRound(playoffTeams);
      const r16Teams = [...directTeams, ...playoffWinners];
      const { matchups, winners } = drawCLRoundTwoLegs(r16Teams, CL_ROUND_LABELS.r16, slots);
      setCl(p => ({ ...p, phase: 'ko-draw', koRoundId: 'r16', directR16Teams: directTeams, koMatchups: matchups, koWinners: winners }));
    }
  }

  function handleMatchDone() {
    const matchup = cl.koMatchups?.find(m => m.isPlayerMatch);
    if (!matchup) return;
    let pm;
    if (cl.koRoundId === 'final') {
      pm = matchup.playerMatch;
    } else {
      // Two-legged: push aggregate entry so the done screen shows one row per round
      pm = {
        round: CL_ROUND_LABELS[cl.koRoundId],
        opponent: matchup.playerLeg1?.opponent ?? matchup.playerLeg2?.opponent ?? '',
        ownGoals: (matchup.playerLeg1?.ownGoals ?? 0) + (matchup.playerLeg2?.ownGoals ?? 0),
        oppGoals2: (matchup.playerLeg1?.oppGoals2 ?? 0) + (matchup.playerLeg2?.oppGoals2 ?? 0),
        won: matchup.playerWon ?? false,
      };
    }
    setCl(p => ({ ...p, phase: 'ko-results', playerKOMatches: [...p.playerKOMatches, pm] }));
  }

  function handleRoundContinue() {
    const last = cl.playerKOMatches[cl.playerKOMatches.length - 1];
    const playerWon = last?.won ?? false;

    if (!playerWon || cl.koRoundId === 'final') {
      const champion = playerWon
        ? 'Deine 11'
        : simulateToWinner(cl.koWinners.filter(t => !t.isPlayer));
      setCl(p => ({ ...p, phase: 'done', champion }));
      return;
    }

    const nextRoundId = NEXT_CL_ROUND[cl.koRoundId];
    let nextTeams = cl.koWinners;
    if (cl.koRoundId === 'playoff') {
      nextTeams = [...(cl.directR16Teams ?? []), ...cl.koWinners];
    }

    // Final is single-leg; all other rounds are two-legged
    const { matchups, winners } = nextRoundId === 'final'
      ? drawCLRound(nextTeams, CL_ROUND_LABELS[nextRoundId], cl.slots)
      : drawCLRoundTwoLegs(nextTeams, CL_ROUND_LABELS[nextRoundId], cl.slots);
    setCl(p => ({ ...p, phase: 'ko-draw', koRoundId: nextRoundId, koMatchups: matchups, koWinners: winners }));
  }

  // ── Setup ────────────────────────────────────────────────────────────────────

  if (state.phase === 'setup') {
    return (
      <SetupScreen
        setup={state.setup}
        onUpdate={updateSetup}
        players={ALL_PLAYERS}
        onStart={startDraft}
        onBack={() => { handleReset(); navigate('/'); }}
        titleLeft="CL"
      />
    );
  }

  // ── Draft ────────────────────────────────────────────────────────────────────

  if (state.phase === 'draft') {
    return (
      <DraftScreen
        state={state}
        league="ucl"
        players={ALL_PLAYERS}
        clubs={ALL_CLUBS}
        fillSlot={fillSlot}
        useReroll={useReroll}
        setPendingSpin={setPendingSpin}
        setResult={setResult}
        onGoHome={() => { handleReset(); navigate('/'); }}
        onReset={handleReset}
      />
    );
  }

  // ── Tournament ───────────────────────────────────────────────────────────────

  if (state.phase === 'result' && cl) {

    if (cl.phase === 'league-match') {
      const idx = cl.leagueMatchIdx ?? 0;
      const match = cl.playerLeagueMatches[idx];
      if (!match) { setCl(p => ({ ...p, phase: 'league' })); return null; }
      const total = cl.playerLeagueMatches.length;
      return (
        <PokalMatchScreen
          key={`league-${idx}`}
          match={match}
          roundLabel={`LIGAPHASE · SPIELTAG ${idx + 1} / ${total}`}
          closeLabel={idx + 1 < total ? 'Nächster Spieltag →' : 'Zur Übersicht →'}
          hideBadge
          onContinue={handleLeagueMatchDone}
        />
      );
    }

    if (cl.phase === 'league') {
      const leagueStats = cl.playerLeagueMatches.reduce(
        (acc, m) => ({ W: acc.W + (m.won ? 1 : 0), D: acc.D + (m.draw ? 1 : 0), L: acc.L + (!m.won && !m.draw ? 1 : 0), GF: acc.GF + m.ownGoals, GA: acc.GA + m.oppGoals2 }),
        { W: 0, D: 0, L: 0, GF: 0, GA: 0 }
      );
      return (
        <div className="cl-screen">
          <header className="cl-header">
            <div className="cl-title">LIGAPHASE</div>
            <div className="cl-sub">CHAMPIONS LEAGUE · 8 SPIELTAGE</div>
          </header>
          <div className="cl-league-summary">
            <span>{leagueStats.W}S</span>
            <span>{leagueStats.D}U</span>
            <span>{leagueStats.L}N</span>
            <span>{leagueStats.GF}:{leagueStats.GA}</span>
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
      const pos = playerRow?.pos ?? 36;
      const zone = pos <= 8 ? 'direct' : pos <= 24 ? 'playoff' : 'out';
      return (
        <div className="cl-screen">
          <header className="cl-header">
            <div className="cl-title">LIGAPHASE · TABELLE</div>
            <div className={`cl-player-zone cl-zone-badge--${zone}`}>
              {zone === 'direct' ? 'Direkt ins Achtelfinale' : zone === 'playoff' ? 'Playoff' : 'Ausgeschieden'}
            </div>
          </header>
          <div className="cl-table-wrap">
            <table className="cl-table">
              <thead>
                <tr>
                  <th className="cl-th-pos">#</th>
                  <th className="cl-th-name">Team</th>
                  <th>S</th><th>U</th><th>N</th>
                  <th className="cl-th-goals">Tore</th>
                  <th>Pkt</th>
                </tr>
              </thead>
              <tbody>
                {cl.leagueTable.map((row, i) => (
                  <tr
                    key={i}
                    className={[
                      row.isPlayer ? 'cl-row--player' : '',
                      row.pos <= 8 ? 'cl-zone--direct' : row.pos <= 24 ? 'cl-zone--playoff' : 'cl-zone--out',
                    ].join(' ')}
                  >
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
            <button className="btn btn-primary" onClick={handleTableContinue}>
              {pos >= 25 ? 'Ergebnis →' : 'Weiter →'}
            </button>
          </div>
        </div>
      );
    }

    if (cl.phase === 'ko-draw') {
      const sorted = [...(cl.koMatchups ?? [])].sort((a, b) =>
        a.isPlayerMatch ? -1 : b.isPlayerMatch ? 1 : 0
      );
      return (
        <div className="cl-screen cl-draw">
          <header className="cl-header">
            <div className="cl-title">AUSLOSUNG</div>
            <div className="cl-sub">{CL_ROUND_LABELS[cl.koRoundId]} · CHAMPIONS LEAGUE</div>
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
            <button className="btn btn-primary" onClick={() => setCl(p => ({
              ...p, phase: cl.koRoundId === 'final' ? 'ko-match' : 'ko-match-leg1',
            }))}>
              Zum Spiel →
            </button>
          </div>
        </div>
      );
    }

    if (cl.phase === 'ko-match-leg1') {
      const matchup = cl.koMatchups?.find(m => m.isPlayerMatch);
      if (!matchup?.playerLeg1) return null;
      return (
        <PokalMatchScreen
          key={cl.koRoundId + '-leg1'}
          match={matchup.playerLeg1}
          roundLabel={`${CL_ROUND_LABELS[cl.koRoundId]} — HINSPIEL`}
          closeLabel="Zum Rückspiel →"
          hideBadge
          onContinue={() => setCl(p => ({ ...p, phase: 'ko-match-leg2' }))}
        />
      );
    }

    if (cl.phase === 'ko-match-leg2') {
      const matchup = cl.koMatchups?.find(m => m.isPlayerMatch);
      if (!matchup?.playerLeg2) return null;
      return (
        <PokalMatchScreen
          key={cl.koRoundId + '-leg2'}
          match={matchup.playerLeg2}
          roundLabel={`${CL_ROUND_LABELS[cl.koRoundId]} — RÜCKSPIEL`}
          onContinue={handleMatchDone}
        />
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
      const sorted = [...(cl.koMatchups ?? [])].sort((a, b) =>
        a.isPlayerMatch ? -1 : b.isPlayerMatch ? 1 : 0
      );
      const last = cl.playerKOMatches[cl.playerKOMatches.length - 1];
      const playerWon = last?.won ?? false;
      const isFinal = cl.koRoundId === 'final';
      return (
        <div className="cl-screen cl-results">
          <header className="cl-header">
            <div className="cl-title">{CL_ROUND_LABELS[cl.koRoundId]}</div>
            <div className="cl-sub">ERGEBNISSE</div>
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
              {isFinal ? 'Zusammenfassung' : playerWon ? 'Nächste Runde →' : 'Zum Ergebnis'}
            </button>
          </div>
        </div>
      );
    }

    if (cl.phase === 'done') {
      const won = cl.champion === 'Deine 11';
      const leagueRow = cl.leagueTable?.find(r => r.isPlayer);
      return (
        <div className="cl-screen cl-done">
          <div className={`cl-done-badge ${won ? 'cl-done-badge--win' : 'cl-done-badge--loss'}`}>
            {won ? '★ Champions League Sieger!' : 'Ausgeschieden'}
          </div>
          {!won && cl.champion && (
            <div className="cl-done-champion">Champion: <strong>{cl.champion}</strong></div>
          )}
          {leagueRow && (
            <div className="cl-done-league">Ligaphase: Platz {leagueRow.pos} von 36</div>
          )}
          {cl.playerKOMatches?.length > 0 && (
            <div className="cl-done-matches">
              <div className="cl-done-matches-title">K.o.-Runden</div>
              {cl.playerKOMatches.map((m, i) => (
                <div key={i} className={`cl-done-match ${m.won ? 'cl-done-match--win' : 'cl-done-match--loss'}`}>
                  <span className="cl-done-match-round">{m.round}</span>
                  <span className="cl-done-match-score">{m.ownGoals}:{m.oppGoals2}</span>
                  <span className="cl-done-match-opp">{m.opponent}</span>
                </div>
              ))}
            </div>
          )}
          <div className="cl-footer cl-done-footer">
            <button className="btn btn-primary" onClick={() => { handleReset(); navigate('/'); }}>
              Startseite
            </button>
            <button className="btn btn-ghost" onClick={handleReset}>
              Nochmal
            </button>
          </div>
        </div>
      );
    }
  }

  return null;
}
