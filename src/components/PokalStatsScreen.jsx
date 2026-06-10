import { useState, useEffect } from 'react';
import { fetchPokalStats } from '../utils/leaderboard';
import './LeaderboardScreen.css';

function displayName(winner) {
  return winner === 'user' ? 'Deine 11' : winner;
}

export default function PokalStatsScreen({ onBack }) {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPokalStats()
      .then(data => {
        setRows(data);
        setTotal(data.reduce((s, r) => s + r.wins, 0));
      })
      .catch(() => setError(true));
  }, []);

  const filtered = rows
    ? rows.filter(r => displayName(r.winner).toLowerCase().includes(search.toLowerCase()))
    : null;

  const top = rows?.[0]?.wins ?? 1;

  return (
    <div className="lb-screen slide-up">
      <header className="lb-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <h1 className="lb-title">DFB-Pokal · Sieger</h1>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 80, textAlign: 'right' }}>
          {total > 0 ? `${total} Turniere` : ''}
        </span>
      </header>

      <div className="lb-filters">
        <div className="lb-filter-row">
          <input
            className="name-input"
            style={{ fontSize: 13, padding: '5px 10px', height: 30, flex: 1 }}
            placeholder="Verein suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="lb-body">
        {error && <div className="lb-status lb-error">Statistik nicht erreichbar</div>}
        {rows === null && !error && <div className="lb-status">Laden…</div>}

        {filtered !== null && (
          <div className="lb-table">
            <div
              className="lb-row lb-row-head"
              style={{ gridTemplateColumns: '36px 1fr 56px 52px' }}
            >
              <span className="lb-col-rank">#</span>
              <span>Verein</span>
              <span style={{ textAlign: 'right' }}>Titel</span>
              <span style={{ textAlign: 'right' }}>Win%</span>
            </div>

            {filtered.length === 0 && (
              <div className="lb-status" style={{ padding: '24px 0' }}>Kein Ergebnis</div>
            )}

            {filtered.map(r => {
              const rank = rows.indexOf(r) + 1;
              const isUser = r.winner === 'user';
              const barColor = isUser ? 'var(--green)' : 'var(--accent)';

              return (
                <div
                  key={r.winner}
                  className={`lb-row${isUser ? ' lb-row-mine' : ''}`}
                  style={{ gridTemplateColumns: '36px 1fr 56px 52px' }}
                >
                  <span className="lb-col-rank">{rank}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <div
                      className="lb-col-name"
                      style={{ color: isUser ? 'var(--green)' : undefined }}
                    >
                      {displayName(r.winner)}
                    </div>
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ height: '100%', width: `${(r.wins / top) * 100}%`, background: barColor, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 800, color: isUser ? 'var(--green)' : 'var(--text)', alignSelf: 'center' }}>
                    {r.wins}×
                  </span>
                  <span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12, alignSelf: 'center' }}>
                    {r.pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
