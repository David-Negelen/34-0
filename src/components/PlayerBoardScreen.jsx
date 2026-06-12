import { useState, useMemo } from 'react';
import { PLAYERS as BL_PLAYERS, CLUBS as BL_CLUBS } from '../data/players';
import { PLAYERS as BL2_PLAYERS, CLUBS as BL2_CLUBS } from '../data/players2bl';
import './LeaderboardScreen.css';
import './PlayerBoardScreen.css';

const ALL_CLUBS = { ...BL_CLUBS, ...BL2_CLUBS };

const ALL_PLAYERS = [
  ...BL_PLAYERS.map(p => ({ ...p, _league: 'bl' })),
  ...BL2_PLAYERS.map(p => ({ ...p, _league: '2bl' })),
];

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
const PAGE_SIZE = 100;

function primeClub(player) {
  return player.seasons.find(s => s.rating === player.primeRating)?.club ?? player.seasons.at(-1)?.club ?? '—';
}

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
    let list = ALL_PLAYERS;
    if (league !== 'all') list = list.filter(p => p._league === league);
    if (pos) list = list.filter(p => p.positions.includes(pos));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.primeRating - a.primeRating);
  }, [league, pos, search]);

  const visible = filtered.slice(0, showCount);
  const remaining = filtered.length - visible.length;

  return (
    <div className="lb-screen">
      <header className="lb-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <h1 className="lb-title">Spielerdatenbank</h1>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 80, textAlign: 'right' }}>
          {filtered.length.toLocaleString('de')} Spieler
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
              {p}
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

            {visible.map((p, i) => {
              const club = primeClub(p);
              const [primaryPos, ...secondaryPos] = p.positions;
              return (
                <div key={p.id} className="lb-row pb-row">
                  <span className="lb-col-rank">{i + 1}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <div className="lb-col-name">{p.name}</div>
                    <div className="pb-club">{club}</div>
                  </div>
                  <span className="pb-col-pos" style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                    {primaryPos}
                  </span>
                  <span className="pb-col-pos" style={{ alignSelf: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                    {secondaryPos.join(' · ')}
                  </span>
                  <span className="lb-col-ovr" style={{ textAlign: 'right', alignSelf: 'center' }}>
                    {p.primeRating}
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
