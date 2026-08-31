import { useEffect, useState } from 'react';
import { getRoom, getMembers, kickMember, getMpSession, HOST_STALE_MS } from '../utils/multiplayerUtils';
import './MultiplayerWaitingScreen.css';

// Coarse "last seen X ago" for the presence readout.
function since(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} Min.`;
  return `${Math.round(m / 60)} Std.`;
}

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
            {waitingOn.map(n => {
              const mem = members.find(m => m.player_name === n);
              const age = mem ? Date.now() - new Date(mem.updated).getTime() : null;
              const away = age != null && age >= HOST_STALE_MS;
              return (
                <li key={n} className="mp-wait-pending">
                  <span className={`mp-wait-dot${away ? ' mp-wait-dot--away' : ''}`} />
                  <span className="mp-wait-name">{n}{n === meName ? ' (Du)' : ''}</span>
                  {age != null && (
                    <span className={`mp-wait-presence mp-wait-presence--${away ? 'away' : 'active'}`}>
                      {away ? `weg · ${since(age)}` : 'aktiv'}
                    </span>
                  )}
                  {amHost && (
                    <button
                      className="mp-wait-kick"
                      onClick={() => handleKick(n)}
                      disabled={busy === n || !mem}
                    >
                      {busy === n ? '…' : 'entfernen'}
                    </button>
                  )}
                </li>
              );
            })}
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
