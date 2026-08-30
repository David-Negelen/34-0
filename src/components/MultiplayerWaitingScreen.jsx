import { useEffect, useState } from 'react';
import './MultiplayerWaitingScreen.css';

// Shown after a manager submits their squad, while the shared season is still
// waiting on the other managers. `waitingOn` is the list of names not yet in.
export default function MultiplayerWaitingScreen({ season, waitingOn = [], isHost, forcing, onForce }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const canForce = isHost && waitingOn.length > 0 && elapsed >= 20;

  return (
    <div className="mp-wait">
      <div className="mp-wait-card">
        <div className="mp-wait-spinner" />
        <h1 className="mp-wait-title">Saison {season}</h1>
        <p className="mp-wait-sub">
          {waitingOn.length === 0
            ? 'Werte die Liga aus…'
            : `Warte auf ${waitingOn.length} Manager…`}
        </p>

        {waitingOn.length > 0 && (
          <ul className="mp-wait-list">
            {waitingOn.map(n => (
              <li key={n}><span className="mp-wait-dot" />{n}</li>
            ))}
          </ul>
        )}

        {canForce && (
          <button className="mp-wait-force" onClick={onForce} disabled={forcing}>
            {forcing ? 'Starte…' : 'Ohne fehlende Manager fortfahren'}
          </button>
        )}
        {isHost && waitingOn.length > 0 && !canForce && (
          <p className="mp-wait-hint">Fortfahren ohne alle ist in {20 - elapsed}s möglich</p>
        )}
      </div>
    </div>
  );
}
