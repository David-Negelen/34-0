import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateCode, setMpSession, getMpSession, clearMpSession } from '../utils/multiplayerUtils';
import './MultiplayerLobbyScreen.css';

export default function MultiplayerLobbyScreen() {
  const navigate = useNavigate();
  const existing = getMpSession();

  const [playerName, setPlayerName] = useState(existing?.playerName ?? '');
  const [inputCode, setInputCode] = useState('');
  const [activeCode, setActiveCode] = useState(existing?.code ?? '');
  const [mode, setMode] = useState(existing ? 'ready' : 'initial'); // 'initial'|'create'|'join'|'ready'
  const [copied, setCopied] = useState(false);

  function handleCreate() {
    if (!playerName.trim()) return;
    const code = generateCode();
    setActiveCode(code);
    setMode('ready');
  }

  function handleJoin() {
    if (!playerName.trim() || inputCode.trim().length < 4) return;
    setActiveCode(inputCode.trim().toUpperCase());
    setMode('ready');
  }

  function handleStart() {
    setMpSession(activeCode, playerName.trim());
    navigate('/karriere');
  }

  function handleCopy() {
    navigator.clipboard?.writeText(activeCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleLeave() {
    clearMpSession();
    setActiveCode('');
    setPlayerName('');
    setMode('initial');
  }

  if (mode === 'ready') {
    return (
      <div className="mp-lobby">
        <button className="mp-back" onClick={handleLeave}>← Verlassen</button>
        <h1 className="mp-title">Multiplayer</h1>
        <p className="mp-label">Dein Raumcode</p>
        <div className="mp-code-display">
          <span>{activeCode}</span>
          <button className="mp-copy-btn" onClick={handleCopy}>{copied ? '✓' : 'Kopieren'}</button>
        </div>
        <p className="mp-hint">Teile diesen Code mit deinen Mitspielern. Alle spielen ihre eigene Karriere in derselben Liga.</p>
        <p className="mp-name-display">Spieler: <strong>{playerName}</strong></p>
        <button className="mp-start-btn" onClick={handleStart}>Karriere starten →</button>
      </div>
    );
  }

  return (
    <div className="mp-lobby">
      <button className="mp-back" onClick={() => navigate('/')}>← Zurück</button>
      <h1 className="mp-title">Multiplayer</h1>
      <p className="mp-subtitle">Spielt in derselben Liga — jeder mit eigenem Kader.</p>

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

      {mode === 'initial' && (
        <div className="mp-actions">
          <button
            className="mp-action-btn mp-action-btn--primary"
            disabled={!playerName.trim()}
            onClick={handleCreate}
          >
            Neuen Raum erstellen
          </button>
          <button
            className="mp-action-btn"
            disabled={!playerName.trim()}
            onClick={() => setMode('join')}
          >
            Mit Code beitreten
          </button>
        </div>
      )}

      {mode === 'join' && (
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
              disabled={!playerName.trim() || inputCode.trim().length < 4}
              onClick={handleJoin}
            >
              Beitreten
            </button>
            <button className="mp-action-btn" onClick={() => setMode('initial')}>
              Zurück
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
