import { useState, useEffect, useCallback } from 'react';
import { getSeasonTable, getSeasonSummary } from '../utils/multiplayerUtils';
import './MultiplayerTableOverlay.css';

const DIV_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga', '3l': '3. Liga' };
const DIV_ORDER = { bl: 0, '2bl': 1, '3l': 2 };

// Floating access to the authoritative shared-league standings for a season.
// A room can span several tiers, so there's a per-tier table (this manager's)
// plus a cross-tier list of where every manager stands.
export default function MultiplayerTableOverlay({ code, seasonNumber, division, myPlayerName }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('mine'); // 'mine' | 'all'
  const [rows, setRows] = useState([]);
  const [resolved, setResolved] = useState(false);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [onlyManagers, setOnlyManagers] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ table, resolved: done }, sum] = await Promise.all([
        getSeasonTable(code, seasonNumber, division),
        getSeasonSummary(code, seasonNumber),
      ]);
      setRows(Array.isArray(table) ? table : []);
      setResolved(!!done);
      setSummary(sum);
    } catch {
      setRows([]);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [code, seasonNumber, division]);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const t = setInterval(fetchAll, 5000);
    return () => clearInterval(t);
  }, [open, fetchAll]);

  if (!open) {
    return (
      <button className="mp-table-trigger" onClick={() => setOpen(true)}>
        Liga-Tabelle
      </button>
    );
  }

  const shown = onlyManagers ? rows.filter(r => r.isReal) : rows;

  // flatten every tier's managers into one "who's where" list
  const allManagers = summary
    .flatMap(s => (s.table || [])
      .filter(r => r.isReal)
      .map(r => ({ ...r, division: s.division, resolved: s.resolved })))
    .sort((a, b) =>
      (DIV_ORDER[a.division] ?? 9) - (DIV_ORDER[b.division] ?? 9) || a.pos - b.pos);
  const multiTier = new Set(summary.map(s => s.division)).size > 1;

  return (
    <div className="mp-table-backdrop" onClick={() => setOpen(false)}>
      <div className="mp-table-panel" onClick={e => e.stopPropagation()}>
        <div className="mp-table-header">
          <div>
            <div className="mp-table-title">Liga-Tabelle</div>
            <div className="mp-table-meta">
              Saison {seasonNumber} · {code}{view === 'mine' ? ` · ${DIV_LABEL[division] ?? division}` : ''}
            </div>
          </div>
          <button className="mp-table-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        {multiTier && (
          <div className="mp-table-viewtabs">
            <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>Meine Liga</button>
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>Alle Manager</button>
          </div>
        )}

        {view === 'all' ? (
          allManagers.length === 0 ? (
            <div className="mp-table-loading">{loading ? 'Lade…' : 'Noch keine Ergebnisse.'}</div>
          ) : (
            <ul className="mp-table-summary">
              {allManagers.map(m => (
                <li key={`${m.division}-${m.name}`} className={m.name === myPlayerName ? 'mp-table-me' : ''}>
                  <span className="mp-sum-pos">{m.pos}.</span>
                  <span className="mp-sum-name">{m.name}</span>
                  <span className="mp-sum-div">{DIV_LABEL[m.division] ?? m.division}</span>
                  <span className="mp-sum-pts">{m.pts} Pkt{!m.resolved ? ' *' : ''}</span>
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <div className="mp-table-loading">
            {loading ? 'Lade…' : `Saison ${seasonNumber} läuft noch — die Tabelle erscheint, sobald alle Manager gespielt haben.`}
          </div>
        ) : (
          <>
            {!resolved && <div className="mp-table-pending">Vorläufig — noch nicht alle Manager fertig</div>}
            <table className="mp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>S-U-N</th>
                  <th>TD</th>
                  <th>Pkt</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr
                    key={r.name}
                    className={[
                      r.name === myPlayerName ? 'mp-table-me' : '',
                      r.isReal ? 'mp-table-real' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="mp-table-pos">{r.pos}.</td>
                    <td className="mp-table-name">
                      {r.name}
                      {r.isReal && r.name !== myPlayerName && <span className="mp-table-tag">Live</span>}
                    </td>
                    <td className="mp-table-wdl">{r.W}-{r.D}-{r.L}</td>
                    <td className="mp-table-gd">{(r.GD ?? r.GF - r.GA) > 0 ? '+' : ''}{r.GD ?? r.GF - r.GA}</td>
                    <td className="mp-table-pts">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mp-table-actions">
              <button className="mp-table-refresh" onClick={() => setOnlyManagers(v => !v)}>
                {onlyManagers ? 'Ganze Liga zeigen' : 'Nur Manager zeigen'}
              </button>
              <button className="mp-table-refresh" onClick={fetchAll}>↻ Aktualisieren</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
