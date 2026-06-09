import { useState, useEffect } from 'react';
import { fetchPokalStats } from '../utils/leaderboard';

function displayName(winner) {
  return winner === 'user' ? 'Deine 11' : winner;
}

export default function PokalStatsScreen() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPokalStats()
      .then(data => {
        setRows(data);
        setTotal(data.reduce((s, r) => s + r.wins, 0));
      })
      .catch(() => setError('Fehler beim Laden.'));
  }, []);

  const top = rows?.[0]?.wins ?? 1;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>DFB-Pokal</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>Pokalsieger-Statistik</div>
        {total > 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{total} Turniere gesamt</div>}
      </div>

      {error && <div style={{ color: 'var(--red-light)' }}>{error}</div>}

      {rows === null && !error && (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Laden…</div>
      )}

      {rows && (
        <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => (
            <div key={r.winner} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', minWidth: 20 }}>#{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: r.winner === 'user' ? 'var(--green)' : 'var(--text)', flex: 1 }}>
                  {displayName(r.winner)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{r.wins}×</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 40, textAlign: 'right' }}>{r.pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(r.wins / top) * 100}%`,
                  background: r.winner === 'user' ? 'var(--green)' : 'var(--accent)',
                  borderRadius: 2,
                }} />
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 32 }}>Noch keine Daten.</div>
          )}
        </div>
      )}
    </div>
  );
}
