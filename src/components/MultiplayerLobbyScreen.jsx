import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createRoom, joinRoom, getRoom, getMembers, startRoom, leaveRoom, touchMember,
  setMpSession, getMpSession, clearMpSession,
} from '../utils/multiplayerUtils';
import './MultiplayerLobbyScreen.css';

const LEAGUE_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga', '3l': '3. Liga' };

export default function MultiplayerLobbyScreen() {
  const navigate = useNavigate();
  const existing = getMpSession();

  const [phase, setPhase] = useState(existing ? 'lobby' : 'form');
  const [session, setSession] = useState(existing ?? null);
  const [playerName, setPlayerName] = useState(existing?.playerName ?? '');
  const [league, setLeague] = useState(existing?.league ?? '2bl');
  const [showJoin, setShowJoin] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [members, setMembers] = useState([]);
  const [hostName, setHostName] = useState(existing?.playerName && existing?.isHost ? existing.playerName : '');
  const [roomStatus, setRoomStatus] = useState('open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const name = playerName.trim();

  async function handleCreate() {
    if (!name || busy) return;
    setBusy(true); setError('');
    try {
      const { code, clientId } = await createRoom(name, league);
      const s = { code, playerName: name, clientId, isHost: true, league };
      setMpSession(s);
      setSession(s);
      setHostName(name);
      setPhase('lobby');
    } catch (e) {
      setError(e.message || 'Raum konnte nicht erstellt werden');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    const code = inputCode.trim().toUpperCase();
    if (!name || code.length < 4 || busy) return;
    setBusy(true); setError('');
    try {
      const { clientId, isHost, room } = await joinRoom(code, name);
      const s = { code, playerName: name, clientId, isHost, league: room?.league ?? '2bl' };
      setMpSession(s);
      setSession(s);
      setLeague(s.league);
      setHostName(room?.host_name ?? '');
      setPhase('lobby');
    } catch (e) {
      setError(e.message || 'Beitritt fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  const refreshLobby = useCallback(async () => {
    if (!session?.code) return;
    try {
      const [room, mem] = await Promise.all([getRoom(session.code), getMembers(session.code)]);
      if (!room) { setError('Der Raum wurde geschlossen.'); return; }
      setRoomStatus(room.status);
      setHostName(room.host_name ?? '');
      setMembers(mem);
      if (room.league && room.league !== session.league) {
        const s = { ...session, league: room.league };
        setMpSession(s); setSession(s); setLeague(room.league);
      }
      if (room.status === 'active') navigate('/karriere');
    } catch {
      /* transient — keep last known roster */
    }
  }, [session, navigate]);

  useEffect(() => {
    if (phase !== 'lobby') return;
    refreshLobby();
    const poll = setInterval(refreshLobby, 3000);
    const beat = setInterval(() => session && touchMember(session.code, session.playerName), 20000);
    return () => { clearInterval(poll); clearInterval(beat); };
  }, [phase, refreshLobby, session]);

  async function handleStart() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await startRoom(session.code);
      navigate('/karriere');
    } catch (e) {
      setError(e.message || 'Start fehlgeschlagen');
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (session) await leaveRoom(session.code, session.playerName).catch(() => {});
    clearMpSession();
    setSession(null);
    setMembers([]);
    setInputCode('');
    setShowJoin(false);
    setError('');
    setPhase('form');
  }

  function handleCopy() {
    navigator.clipboard?.writeText(session.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby' && session) {
    const isHost = session.isHost;
    const started = roomStatus === 'active';
    return (
      <div className="mp-lobby">
        <button className="mp-back" onClick={handleLeave}>← Verlassen</button>
        <h1 className="mp-title">Multiplayer</h1>
        <p className="mp-label">Raumcode</p>
        <div className="mp-code-display">
          <span>{session.code}</span>
          <button className="mp-copy-btn" onClick={handleCopy}>{copied ? '✓' : 'Kopieren'}</button>
        </div>
        <p className="mp-name-display">Start-Liga: <strong>{LEAGUE_LABEL[session.league] ?? '2. Bundesliga'}</strong></p>

        <p className="mp-label">Manager im Raum ({members.length})</p>
        <ul className="mp-roster">
          {members.map(m => (
            <li key={m.id} className={m.player_name === session.playerName ? 'mp-roster-me' : ''}>
              <span className="mp-roster-name">{m.player_name}</span>
              {m.player_name === hostName && <span className="mp-roster-tag">Host</span>}
              {m.player_name === session.playerName && <span className="mp-roster-tag">Du</span>}
            </li>
          ))}
          {members.length === 0 && <li className="mp-roster-empty">Lade…</li>}
        </ul>

        <p className="mp-hint">
          Alle starten in derselben Liga und teilen sich Tabelle und Ergebnisse.
          Wer auf- oder absteigt, spielt in seiner neuen Liga weiter.
        </p>

        {error && <p className="mp-error">{error}</p>}

        {started ? (
          <button className="mp-start-btn" onClick={() => navigate('/karriere')}>Weiter zur Karriere →</button>
        ) : isHost ? (
          <button className="mp-start-btn" onClick={handleStart} disabled={busy || members.length < 2}>
            {members.length < 2 ? 'Warte auf Mitspieler…' : 'Liga starten →'}
          </button>
        ) : (
          <p className="mp-waiting-host">Warte auf den Host…</p>
        )}
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="mp-lobby">
      <button className="mp-back" onClick={() => navigate('/')}>← Zurück</button>
      <h1 className="mp-title">Multiplayer</h1>
      <p className="mp-subtitle">Eine gemeinsame Liga — jeder mit eigenem Kader.</p>

      <div className="mp-field">
        <label className="mp-field-label">Dein Name</label>
        <input
          className="mp-input"
          type="text"
          placeholder="z.B. Seppl"
          maxLength={20}
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
        />
      </div>

      {!showJoin ? (
        <div className="mp-actions">
          <div className="mp-field" style={{ marginBottom: 4 }}>
            <label className="mp-field-label">Start-Liga (für alle)</label>
            <div className="mp-league-picker">
              {Object.entries(LEAGUE_LABEL).map(([key, label]) => (
                <button
                  key={key}
                  className={`mp-league-btn${league === key ? ' mp-league-btn--active' : ''}`}
                  onClick={() => setLeague(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="mp-action-btn mp-action-btn--primary"
            disabled={!name || busy}
            onClick={handleCreate}
          >
            {busy ? 'Erstelle…' : 'Neuen Raum erstellen'}
          </button>
          <button className="mp-action-btn" disabled={!name} onClick={() => { setShowJoin(true); setError(''); }}>
            Mit Code beitreten
          </button>
        </div>
      ) : (
        <div className="mp-join-form">
          <div className="mp-field">
            <label className="mp-field-label">Raumcode</label>
            <input
              className="mp-input mp-input--code"
              type="text"
              placeholder="z.B. ADLER5"
              maxLength={6}
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="mp-actions">
            <button
              className="mp-action-btn mp-action-btn--primary"
              disabled={!name || inputCode.trim().length < 4 || busy}
              onClick={handleJoin}
            >
              {busy ? 'Trete bei…' : 'Beitreten'}
            </button>
            <button className="mp-action-btn" onClick={() => { setShowJoin(false); setError(''); }}>
              Zurück
            </button>
          </div>
        </div>
      )}

      {error && <p className="mp-error">{error}</p>}
    </div>
  );
}
