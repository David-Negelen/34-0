import { useState, useEffect } from 'react';
import { fetchLeaderboard, getSavedName, saveName } from '../utils/leaderboard';
import './LeaderboardScreen.css';

const DIFFICULTIES = [
  { key: 'easy',   label: 'Leicht' },
  { key: 'normal', label: 'Normal' },
  { key: 'hard',   label: 'Schwer' },
];

export default function LeaderboardScreen({ onBack }) {
  const [difficulty, setDifficulty] = useState('easy');
  const [ratingMode, setRatingMode] = useState('prime');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(getSavedName() ?? '');
  const myName = getSavedName();
  const mode = `${difficulty}_${ratingMode}`;

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchLeaderboard({ mode })
      .then(setRows)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mode]);

  return (
    <div className="lb-screen slide-up">
      <header className="lb-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <h1 className="lb-title">Rangliste</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => { setNameInput(getSavedName() ?? ''); setEditingName(true); }}>
          {myName ? `@${myName}` : 'Name setzen'}
        </button>
      </header>

      <div className="lb-filters">
        <div className="lb-filter-row">
          {DIFFICULTIES.map(d => (
            <button
              key={d.key}
              className={`filter-btn${difficulty === d.key ? ' filter-btn-active' : ''}`}
              onClick={() => setDifficulty(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="lb-filter-row">
          <button className={`filter-btn${ratingMode === 'prime' ? ' filter-btn-active' : ''}`} onClick={() => setRatingMode('prime')}>Prime</button>
          <button className={`filter-btn${ratingMode === 'career' ? ' filter-btn-active' : ''}`} onClick={() => setRatingMode('career')}>Saisonstärke</button>
        </div>
      </div>

      <div className="lb-body">
        {loading && <div className="lb-status">Laden…</div>}
        {error   && <div className="lb-status lb-error">Rangliste nicht erreichbar</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="lb-status">Noch keine Einträge</div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="lb-table">
            <div className="lb-row lb-row-head">
              <span className="lb-col-rank">#</span>
              <span className="lb-col-name">Name</span>
              <span className="lb-col-ovr">OVR</span>
              <span className="lb-col-form">S-U-N</span>
              <span className="lb-col-pts">Pkt</span>
            </div>
            {rows.map((row, i) => (
              <div
                key={row.id}
                className={`lb-row${row.name?.toUpperCase() === myName?.toUpperCase() ? ' lb-row-mine' : ''}`}
              >
                <span className="lb-col-rank">{rankEmoji(i + 1)}</span>
                <span className="lb-col-name">{row.name?.toUpperCase()}</span>
                <span className="lb-col-ovr">{row.ovr}</span>
                <span className="lb-col-form">{row.w}-{row.d}-{row.l}</span>
                <span className="lb-col-pts">{row.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingName && (
        <div className="overlay">
          <div className="overlay-card">
            <div className="result-section-label" style={{ marginBottom: 8 }}>Namen ändern</div>
            <input
              className="name-input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              maxLength={24}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  saveName(nameInput.trim());
                  setEditingName(false);
                }
              }}
            />
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 12 }}
              disabled={!nameInput.trim()}
              onClick={() => { saveName(nameInput.trim()); setEditingName(false); }}
            >
              Speichern
            </button>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 6 }}
              onClick={() => setEditingName(false)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function rankEmoji(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return rank;
}
