import { useState, useEffect, useRef, useMemo } from 'react';
import './PokalMatchScreen.css';

const ROUND_LABELS = ['1. RUNDE', '2. RUNDE', 'ACHTELFINALE', 'VIERTELFINALE', 'HALBFINALE', 'FINALE'];
const TICK_MS = 83;   // ms per in-game minute → 90 min ≈ 7.5 s, full 120 min ≈ 10 s

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

  // Penalty kick reveal — one individual kick every 900 ms.
  useEffect(() => {
    if (simState.phase !== 'pens') return;
    if (simState.penRevealed >= kicks.length) {
      const t = setTimeout(() => setSimState(s => ({ ...s, phase: 'done' })), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setSimState(s => ({ ...s, penRevealed: s.penRevealed + 1 }));
    }, 900);
    return () => clearTimeout(t);
  }, [simState.phase, simState.penRevealed, kicks.length]);

  const { clockMin, phase, penRevealed } = simState;
  const inAet = phase === 'aet' || phase === 'aet-banner';
  const maxMin = inAet ? 120 : 90;
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

  // Rebuild round rows from flat kicks, revealing one kick at a time.
  // Each round row shows mine dot | round# | opp dot; the second dot starts as pending (·).
  const mySide  = home ? 'home' : 'away';
  const oppSide = home ? 'away' : 'home';
  const roundRows = [];
  for (const kick of kicks.slice(0, penRevealed)) {
    if (kick.side === 'home') {
      roundRows.push({ homeKick: kick, awayKick: null, sd: !!kick.sd });
    } else if (roundRows.length > 0) {
      roundRows[roundRows.length - 1].awayKick = kick;
    }
  }
  const penRoundRows = roundRows.map((r, i) => ({
    mineScored: (home ? r.homeKick : r.awayKick)?.scored ?? null,
    oppScored:  (home ? r.awayKick : r.homeKick)?.scored ?? null,
    sd: r.sd,
    roundNum: i + 1,
  }));

  const finalPenMine = kicks.filter(k => k.side === mySide  && k.scored).length;
  const finalPenOpp  = kicks.filter(k => k.side === oppSide && k.scored).length;

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
        {inAet && <div className="ms-et-mark" style={{ left: `75%` }} />}
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
          <div className="ms-banner ms-banner--pens">ELFMETERSCHIESSEN</div>
          <div className="ms-pen-header">
            <span>Deine 11</span>
            <span>{opponent}</span>
          </div>
          <div className="ms-pen-rows">
            {penRoundRows.map((row, i) => (
              <div key={i}>
                {row.sd && (i === 0 || !penRoundRows[i - 1].sd) && (
                  <div className="ms-pen-sd-label">SUDDEN DEATH</div>
                )}
                <div className="ms-pen-row">
                  <span className={`ms-pen-dot ${row.mineScored === null ? 'dot--pending' : row.mineScored ? 'dot--in' : 'dot--out'}`}>
                    {row.mineScored === null ? '·' : row.mineScored ? '●' : '○'}
                  </span>
                  <span className="ms-pen-num">{row.sd ? 'SD' : row.roundNum}</span>
                  <span className={`ms-pen-dot ms-pen-dot--r ${row.oppScored === null ? 'dot--pending' : row.oppScored ? 'dot--in' : 'dot--out'}`}>
                    {row.oppScored === null ? '·' : row.oppScored ? '●' : '○'}
                  </span>
                </div>
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
