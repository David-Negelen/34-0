import { useState } from 'react';
import { getRoomSeason } from '../utils/multiplayerUtils';
import './MultiplayerTableOverlay.css';

export default function MultiplayerTableOverlay({ code, seasonNumber, myPlayerName }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchTable() {
    setLoading(true);
    try {
      const items = await getRoomSeason(code, seasonNumber);
      const sorted = items
        .filter(i => i.result_pts != null)
        .sort((a, b) => b.result_pts - a.result_pts || b.result_gf - b.result_ga - (a.result_gf - a.result_ga));
      setRows(sorted);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    fetchTable();
  }

  if (!open) {
    return (
      <button className="mp-table-trigger" onClick={handleOpen}>
        Liga-Tabelle
      </button>
    );
  }

  return (
    <div className="mp-table-backdrop" onClick={() => setOpen(false)}>
      <div className="mp-table-panel" onClick={e => e.stopPropagation()}>
        <div className="mp-table-header">
          <div>
            <div className="mp-table-title">Liga-Tabelle</div>
            <div className="mp-table-meta">Saison {seasonNumber} · {code}</div>
          </div>
          <button className="mp-table-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        {loading ? (
          <div className="mp-table-loading">Lade...</div>
        ) : (
          <>
            <table className="mp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Spieler</th>
                  <th>Pts</th>
                  <th>GD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={r.player_name === myPlayerName ? 'mp-table-me' : ''}>
                    <td className="mp-table-pos">{i + 1}.</td>
                    <td className="mp-table-name">{r.player_name}</td>
                    <td className="mp-table-pts">{r.result_pts}</td>
                    <td className="mp-table-gd">{r.result_gf != null ? `${r.result_gf > r.result_ga ? '+' : ''}${r.result_gf - r.result_ga}` : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="mp-table-empty">Noch keine Ergebnisse für Saison {seasonNumber}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <button className="mp-table-refresh" onClick={fetchTable}>↻ Aktualisieren</button>
          </>
        )}
      </div>
    </div>
  );
}
