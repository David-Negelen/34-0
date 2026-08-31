import { useEffect, useState } from 'react';
import { getRoom, getMembers, kickMember, getMpSession } from '../utils/multiplayerUtils';
import './MultiplayerWaitingScreen.css';

// Shown after a manager submits their squad, while the shared season is still
// waiting on the others. Nobody is skipped automatically — a missing manager
// reconnects and submits, or the host removes them.
export default function MultiplayerWaitingScreen({ season, waitingOn = [], submitted = [], total = 0, code, onKicked }) {
  const [members, setMembers] = useState([]);
  const [hostName, setHostName] = useState('');
  const [busy, setBusy] = useState('');
  const meName = getMpSession()?.playerName;
  // Host is read live from the room, not a session flag that can go stale — only
  // the manager the server currently records as host gets kick controls.
  const amHost = !!hostName && hostName === meName;

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const load = () => Promise.all([getRoom(code), getMembers(code)])
      .then(([room, m]) => { if (alive) { setHostName(room?.host_name ?? ''); setMembers(m); } })
      .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [code]);

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

  const readyCount = submitted.length;
  const roster = total || readyCount + waitingOn.length;
  const pct = roster ? Math.round((readyCount / roster) * 100) : 0;

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

        {roster > 0 && (
          <div className="mp-wait-progress">
            <div className="mp-wait-progress-track">
              <div className="mp-wait-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="mp-wait-progress-label">{readyCount} / {roster} Manager bereit</span>
          </div>
        )}

        {(submitted.length > 0 || waitingOn.length > 0) && (
          <ul className="mp-wait-list">
            {submitted.map(n => (
              <li key={n} className="mp-wait-ready">
                <span className="mp-wait-tick">✓</span>
                <span className="mp-wait-name">{n}{n === meName ? ' (Du)' : ''}</span>
                <span className="mp-wait-status">bereit</span>
              </li>
            ))}
            {waitingOn.map(n => (
              <li key={n} className="mp-wait-pending">
                <span className="mp-wait-dot" />
                <span className="mp-wait-name">{n}{n === meName ? ' (Du)' : ''}</span>
                {amHost && (
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
            {amHost
              ? 'Ein Manager, der nicht zurückkommt, kann entfernt werden — dann läuft die Saison ohne ihn weiter.'
              : 'Sobald alle ihre Saison eingereicht haben, geht es weiter.'}
          </p>
        )}
      </div>
    </div>
  );
}
