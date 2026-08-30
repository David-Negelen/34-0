import { useEffect, useState } from 'react';
import { getMembers, kickMember } from '../utils/multiplayerUtils';
import './MultiplayerWaitingScreen.css';

// Shown after a manager submits their squad, while the shared season is still
// waiting on the others. Nobody is skipped automatically — a missing manager
// reconnects and submits, or the host removes them.
export default function MultiplayerWaitingScreen({ season, waitingOn = [], isHost, code, onKicked }) {
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!isHost || !code) return;
    let alive = true;
    const load = () => getMembers(code).then(m => { if (alive) setMembers(m); }).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [isHost, code]);

  async function handleKick(name) {
    const member = members.find(m => m.player_name === name);
    if (!member) return;
    setBusy(name);
    try {
      await kickMember(code, member);
      onKicked?.(name);
    } finally {
      setBusy('');
    }
  }

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
              <li key={n}>
                <span className="mp-wait-dot" />
                <span className="mp-wait-name">{n}</span>
                {isHost && (
                  <button
                    className="mp-wait-kick"
                    onClick={() => handleKick(n)}
                    disabled={busy === n || !members.some(m => m.player_name === n)}
                  >
                    {busy === n ? '…' : 'entfernen'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {waitingOn.length > 0 && (
          <p className="mp-wait-hint">
            {isHost
              ? 'Ein Manager, der nicht zurückkommt, kann entfernt werden — dann läuft die Saison ohne ihn weiter.'
              : 'Sobald alle ihre Saison eingereicht haben, geht es weiter.'}
          </p>
        )}
      </div>
    </div>
  );
}
