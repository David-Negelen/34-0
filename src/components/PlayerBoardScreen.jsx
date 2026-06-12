import { useState, useMemo } from 'react';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import './LeaderboardScreen.css';
import './PlayerBoardScreen.css';

const ALL_SEASONS = [
  ...BL_PLAYERS.map(p => ({ ...p, _league: 'bl' })),
  ...BL2_PLAYERS.map(p => ({ ...p, _league: '2bl' })),
].flatMap(p => p.seasons.map(s => ({ player: p, club: s.club, season: s.season, rating: s.rating, _league: p._league })));

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

const POS_DE = { GK: 'TW', CB: 'IV', LB: 'LV', RB: 'RV', DM: 'DM', CM: 'ZM', AM: 'OM', LW: 'LA', RW: 'RA', ST: 'ST' };
const PAGE_SIZE = 100;

export default function PlayerBoardScreen({ onBack }) {
  const [league, setLeague] = useState('all');
  const [pos, setPos] = useState('');
  const [search, setSearch] = useState('');
  const [showCount, setShowCount] = useState(PAGE_SIZE);

  function setFilter(fn) {
    fn();
    setShowCount(PAGE_SIZE);
  }

  const filtered = useMemo(() => {
    let list = ALL_SEASONS;
    if (league !== 'all') list = list.filter(s => s._league === league);
    if (pos) list = list.filter(s => s.player.positions.includes(pos));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.player.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.rating - a.rating);
  }, [league, pos, search]);

  const visible = filtered.slice(0, showCount);
  const remaining = filtered.length - visible.length;

  return (
    <div className="lb-screen">
      <header className="lb-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <h1 className="lb-title">Spielerdatenbank</h1>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 80, textAlign: 'right' }}>
          {filtered.length.toLocaleString('de')} Saisons
        </span>
      </header>

      <div className="lb-filters">
        <div className="lb-filter-row">
          {[['all', 'Alle'], ['bl', '1. BL'], ['2bl', '2. BL']].map(([val, label]) => (
            <button
              key={val}
              className={`filter-btn${league === val ? ' filter-btn-active' : ''}`}
              onClick={() => setFilter(() => setLeague(val))}
            >
              {label}
            </button>
          ))}
          <input
            className="name-input"
            style={{ fontSize: 13, padding: '5px 10px', height: 30, flex: 1 }}
            placeholder="Spieler suchen…"
            value={search}
            onChange={e => setFilter(() => setSearch(e.target.value))}
          />
        </div>
        <div className="lb-filter-row pb-pos-row">
          <button
            className={`filter-btn${pos === '' ? ' filter-btn-active' : ''}`}
            onClick={() => setFilter(() => setPos(''))}
          >
            Alle
          </button>
          {POSITIONS.map(p => (
            <button
              key={p}
              className={`filter-btn${pos === p ? ' filter-btn-active' : ''}`}
              onClick={() => setFilter(() => setPos(pos === p ? '' : p))}
            >
              {POS_DE[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="lb-body">
        {filtered.length === 0 ? (
          <div className="lb-status">Kein Ergebnis</div>
        ) : (
          <div className="lb-table">
            <div className="lb-row lb-row-head pb-row">
              <span className="lb-col-rank">#</span>
              <span>Spieler</span>
              <span className="pb-col-pos">Pos</span>
              <span className="pb-col-pos">2. Pos</span>
              <span style={{ textAlign: 'right' }}>OVR</span>
            </div>

            {visible.map((s, i) => {
              const [primaryPos, ...secondaryPos] = s.player.positions;
              return (
                <div key={`${s.player.id}-${s.season}`} className="lb-row pb-row">
                  <span className="lb-col-rank">{i + 1}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <div className="lb-col-name">{s.player.name}</div>
                    <div className="pb-club">{s.club} · {s.season}</div>
                  </div>
                  <span className="pb-col-pos" style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                    {POS_DE[primaryPos] ?? primaryPos}
                  </span>
                  <span className="pb-col-pos" style={{ alignSelf: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                    {secondaryPos.map(p => POS_DE[p] ?? p).join(' · ')}
                  </span>
                  <span className="lb-col-ovr" style={{ textAlign: 'right', alignSelf: 'center' }}>
                    {s.rating}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {remaining > 0 && (
          <button
            className="btn btn-ghost pb-load-more"
            onClick={() => setShowCount(c => c + PAGE_SIZE)}
          >
            {remaining} weitere laden
          </button>
        )}
      </div>
    </div>
  );
}
