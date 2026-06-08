import { useState, useEffect, useRef, useMemo } from 'react';
import './PokalMatchScreen.css';

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];
const TICK_MS = 22;   // ms per in-game minute → 90 min ≈ 2 s, ET 30 min ≈ 0.66 s

export default function PokalMatchScreen({ match, roundIndex, onContinue }) {
  const {
    home = true,
    aet = false,
    pens = false,
    events = [],
    oppGoals = [],
    kicks = [],
    ownGoals = 0,
    oppGoals2 = 0,
    won = false,
    opponent = '',
  } = match;

  // Merge and sort all goal events by minute
  const allGoals = useMemo(() => [
    ...events.filter(e => e.type === 'goal').map(e => ({
      side: 'mine', minute: e.minute, name: e.scorer?.name ?? '',
    })),
    ...oppGoals.map(g => ({
      side: 'opp', minute: g.minute, name: g.scorerName ?? '',
    })),
  ].sort((a, b) => a.minute - b.minute), [events, oppGoals]);

  const [simState, setSimState] = useState({
    clockMin: 0,
    phase: 'normal',  // 'normal' | 'aet-banner' | 'aet' | 'pen-banner' | 'pens' | 'done'
    penRevealed: 0,
  });

  const stateRef = useRef(simState);
  stateRef.current = simState;

  // Single clock loop — uses stateRef to avoid stale closures
  useEffect(() => {
    let active = true;

    function tick() {
      if (!active) return;
      const { clockMin, phase } = stateRef.current;

      if (phase === 'normal') {
        if (clockMin < 90) {
          setSimState(s => ({ ...s, clockMin: s.clockMin + 1 }));
          setTimeout(tick, TICK_MS);
        } else if (aet) {
          setSimState(s => ({ ...s, phase: 'aet-banner' }));
          setTimeout(() => {
            if (!active) return;
            setSimState(s => ({ ...s, phase: 'aet', clockMin: 90 }));
            setTimeout(tick, TICK_MS);
          }, 1400);
        } else if (pens) {
          setSimState(s => ({ ...s, phase: 'pen-banner' }));
          setTimeout(() => {
            if (!active) return;
            setSimState(s => ({ ...s, phase: 'pens' }));
          }, 1400);
        } else {
          setSimState(s => ({ ...s, phase: 'done' }));
        }
      } else if (phase === 'aet') {
        if (clockMin < 120) {
          setSimState(s => ({ ...s, clockMin: s.clockMin + 1 }));
          setTimeout(tick, TICK_MS);
        } else if (pens) {
          setSimState(s => ({ ...s, phase: 'pen-banner' }));
          setTimeout(() => {
            if (!active) return;
            setSimState(s => ({ ...s, phase: 'pens' }));
          }, 1400);
        } else {
          setSimState(s => ({ ...s, phase: 'done' }));
        }
      }
    }

    setTimeout(tick, 500);
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Penalty kick reveal — one kick-round per 780 ms
  useEffect(() => {
    if (simState.phase !== 'pens') return;
    if (simState.penRevealed >= kicks.length) {
      const t = setTimeout(() => setSimState(s => ({ ...s, phase: 'done' })), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setSimState(s => ({ ...s, penRevealed: s.penRevealed + 1 }));
    }, 780);
    return () => clearTimeout(t);
  }, [simState.phase, simState.penRevealed, kicks.length]);

  const { clockMin, phase, penRevealed } = simState;
  const maxMin = aet ? 120 : 90;
  const progress = Math.min(100, (clockMin / maxMin) * 100);

  // Visible goals at current clock minute
  const visibleGoals = allGoals.filter(g => g.minute <= clockMin);
  const myScore  = visibleGoals.filter(g => g.side === 'mine').length;
  const oppScore = visibleGoals.filter(g => g.side === 'opp').length;
  const myGoalList  = visibleGoals.filter(g => g.side === 'mine');
  const oppGoalList = visibleGoals.filter(g => g.side === 'opp');

  const showAetBanner = phase === 'aet-banner' || phase === 'aet';
  const showPenSection = phase === 'pen-banner' || phase === 'pens' || (phase === 'done' && pens);
  const isDone = phase === 'done';

  // Running pen tallies for display
  const penRows = kicks.slice(0, penRevealed).map((kick, i) => {
    const mineScored  = home ? kick.home : kick.away;
    const theirScored = home ? kick.away : kick.home;
    const myRunning   = kicks.slice(0, i + 1).filter(k => home ? k.home : k.away).length;
    const oppRunning  = kicks.slice(0, i + 1).filter(k => home ? k.away : k.home).length;
    return { mineScored, theirScored, myRunning, oppRunning, idx: i };
  });

  const finalPenMine = kicks.filter(k => home ? k.home : k.away).length;
  const finalPenOpp  = kicks.filter(k => home ? k.away : k.home).length;

  return (
    <div className="ms-screen">
      <div className="ms-round-label">{ROUND_LABELS[roundIndex]}</div>

      {/* Score row */}
      <div className="ms-matchup">
        <span className="ms-team ms-team--mine">Deine 11</span>
        <div className="ms-scorebox">
          <span className={`ms-score ms-score--${myScore > oppScore ? 'lead' : myScore < oppScore ? 'trail' : 'level'}`}>
            {myScore}
          </span>
          <span className="ms-sep">:</span>
          <span className={`ms-score ms-score--${oppScore > myScore ? 'lead' : oppScore < myScore ? 'trail' : 'level'}`}>
            {oppScore}
          </span>
        </div>
        <span className="ms-team ms-team--opp">{opponent}</span>
      </div>

      {/* Clock / progress */}
      {!showPenSection && (
        <div className="ms-clock-row">
          <span className="ms-clock">{clockMin}'</span>
        </div>
      )}
      <div className="ms-progress-track">
        <div className="ms-progress-fill" style={{ width: `${progress}%` }} />
        {aet && <div className="ms-et-mark" style={{ left: `${(90 / maxMin) * 100}%` }} />}
      </div>

      {/* VERLÄNGERUNG banner */}
      {showAetBanner && (
        <div className="ms-banner ms-banner--aet">VERLÄNGERUNG</div>
      )}

      {/* Goal events */}
      <div className="ms-goals">
        <div className="ms-goals-col ms-goals--mine">
          {myGoalList.map((g, i) => (
            <div key={i} className="ms-goal">
              <span className="ms-goal-name">{g.name || 'Tor'}</span>
              <span className="ms-goal-min">{g.minute}'</span>
            </div>
          ))}
        </div>
        <div className="ms-goals-col ms-goals--opp">
          {oppGoalList.map((g, i) => (
            <div key={i} className="ms-goal ms-goal--opp">
              <span className="ms-goal-min">{g.minute}'</span>
              <span className="ms-goal-name">{g.name || 'Tor'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Penalty section */}
      {showPenSection && (
        <div className="ms-pen-section">
          <div className="ms-banner ms-banner--pens">ELFMETERSCHISSEN</div>
          <div className="ms-pen-header">
            <span>Deine 11</span>
            <span>{opponent}</span>
          </div>
          <div className="ms-pen-rows">
            {penRows.map(row => (
              <div key={row.idx} className="ms-pen-row">
                <span className={`ms-pen-dot ${row.mineScored ? 'dot--in' : 'dot--out'}`}>
                  {row.mineScored ? '●' : '○'}
                </span>
                <span className="ms-pen-num">{row.idx + 1}</span>
                <span className={`ms-pen-dot ms-pen-dot--r ${row.theirScored ? 'dot--in' : 'dot--out'}`}>
                  {row.theirScored ? '●' : '○'}
                </span>
              </div>
            ))}
          </div>
          {isDone && pens && (
            <div className="ms-pen-final">{finalPenMine} : {finalPenOpp}</div>
          )}
        </div>
      )}

      {/* Result + continue */}
      {isDone && (
        <>
          <div className={`ms-result-badge ${won ? 'ms-result--win' : 'ms-result--loss'}`}>
            {won ? 'Weiter ✓' : 'Ausgeschieden'}
          </div>
          <button className="btn btn-primary ms-continue" onClick={onContinue}>
            {won ? 'Nächste Runde →' : 'Zusammenfassung →'}
          </button>
        </>
      )}
    </div>
  );
}
