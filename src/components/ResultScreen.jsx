import { useState, useEffect, useRef, useMemo } from 'react';
import FormationBoard from './FormationBoard';
import { generateResultCanvas, shareResult, downloadResult } from '../utils/export';
import { buildShareText } from '../utils/simulation';
import { labelDE } from '../utils/playerUtils';
import './ResultScreen.css';

const ACHIEVEMENT_ICONS = {
  perfect:        '🏆',
  invincible:     '🛡️',
  champions:      '🥇',
  top4:           '🎯',
  europe:         '🌍',
  tophalf:        '📊',
  midtable:       '✅',
  relegated:      '📉',
  derby:          '💀',
  century:        '⚡',
  goalflood:      '⚽',
  fortress:       '🔒',
  bunker:         '🏰',
  dominant:       '💪',
  mister_draw:    '🤝',
  one_club:       '❤️',
  all_stars:      '⭐',
};

export default function ResultScreen({ state, onPlayAgain }) {
  const { setup, draft, result } = state;
  const { slots } = draft;
  const { W, D, L, GF, GA, pts, achievements, table, playerMatches, playerStats } = result;
  const [sharing, setSharing] = useState(false);
  const [matchLogDone, setMatchLogDone] = useState(!playerMatches?.length);

  const GD = GF - GA;
  const topAchievement = achievements?.[0];

  async function handleShare() {
    setSharing(true);
    try {
      const canvas = generateResultCanvas(slots, result, setup.formation, achievements);
      const text = buildShareText(slots, result, setup.formation);
      await shareResult(canvas, text);
    } catch (e) {
      console.error('Share failed:', e);
    } finally {
      setSharing(false);
    }
  }

  async function handleDownload() {
    setSharing(true);
    try {
      const canvas = generateResultCanvas(slots, result, setup.formation, achievements);
      await downloadResult(canvas);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="result-screen slide-up">

      {/* ── Header ── */}
      <header className="result-header">
        <div className="result-header-inner">
          <div className="result-title-group">
            <span className="result-eyebrow">Bundesliga Dream XI</span>
            <h1 className="result-title">Saison abgeschlossen</h1>
          </div>
          <div className="result-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={handleDownload} disabled={sharing}>
              ↓ Speichern
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleShare} disabled={sharing}>
              Teilen
            </button>
            <button className="btn btn-primary" onClick={onPlayAgain}>
              Nochmal spielen
            </button>
          </div>
        </div>
      </header>

      <div className="result-body">

        {/* Left: formation board */}
        <div className="result-left">
          <div className="result-section-label">Your XI — {setup.formation}</div>
          <div className="result-pitch-wrap">
            <FormationBoard
              slots={slots}
              showRatings={setup.showRatings}
              draftMode="squad-first"
            />
          </div>
        </div>

        {/* Right: season results */}
        <div className="result-right">

          {/* Match log — animates first, gates everything else */}
          {playerMatches?.length > 0 && (
            <MatchLog matches={playerMatches} onDone={() => setMatchLogDone(true)} />
          )}

          {matchLogDone && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Primary achievement */}
              {topAchievement && (
                <div className="result-achievement-primary">
                  <span className="ach-icon">{ACHIEVEMENT_ICONS[topAchievement.key] ?? '🏅'}</span>
                  <div>
                    <div className="ach-label">{topAchievement.label}</div>
                    <div className="ach-desc">{topAchievement.desc}</div>
                  </div>
                </div>
              )}

              {/* Season stats */}
              <div className="result-stats-card">
                <div className="result-section-label">Simulierte Saison — 34 Spieltage</div>

                <div className="season-wdl">
                  <StatPill label="S" value={W} color="var(--green)" />
                  <StatPill label="U" value={D} color="var(--text-muted)" />
                  <StatPill label="N" value={L} color="var(--red)" />
                </div>

                <div className="season-details">
                  <SeasonStat label="Punkte" value={pts} big />
                  <SeasonStat label="Tore" value={GF} />
                  <SeasonStat label="Gegentore" value={GA} />
                  <SeasonStat label="Tordifferenz" value={`${GD > 0 ? '+' : ''}${GD}`} />
                  <SeasonStat label="Siegquote" value={`${Math.round((W / 34) * 100)}%`} />
                </div>

                <div className="league-position-bar">
                  <div className="lp-label">Geschätzter Tabellenplatz</div>
                  <div className="lp-bar">
                    <div
                      className="lp-marker"
                      style={{ left: `${Math.max(2, Math.min(96, 100 - (pts / 102) * 100))}%` }}
                    />
                    <div className="lp-zone lp-relegation" style={{ width: '22%' }} title="Relegation zone" />
                    <div className="lp-zone lp-midtable" style={{ width: '44%', left: '22%' }} />
                    <div className="lp-zone lp-europe" style={{ width: '22%', left: '66%' }} />
                    <div className="lp-zone lp-title" style={{ width: '12%', left: '88%' }} />
                  </div>
                  <div className="lp-key">
                    <span className="lp-key-item relegation">Abstieg</span>
                    <span className="lp-key-item midtable">Mittelfeld</span>
                    <span className="lp-key-item europe">Europa</span>
                    <span className="lp-key-item title">Meister</span>
                  </div>
                </div>
              </div>

              {/* League table */}
              <LeagueTable table={table} />

              {/* Player statistics */}
              <PlayerStats stats={playerStats} />

              {/* Additional achievements */}
              {achievements?.length > 1 && (
                <div className="result-extra-achievements">
                  <div className="result-section-label">Errungenschaften</div>
                  <div className="ach-list">
                    {achievements.slice(1).map(a => (
                      <div key={a.key} className="ach-item">
                        <span>{ACHIEVEMENT_ICONS[a.key] ?? '🏅'}</span>
                        <div>
                          <div className="ach-item-label">{a.label}</div>
                          <div className="ach-item-desc">{a.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Squad list */}
              <div className="result-squad-list">
                <div className="result-section-label">Deine 11</div>
                {slots
                  .filter(s => s.player)
                  .map(s => (
                    <div key={s.id} className="squad-row">
                      <span className="squad-pos">{labelDE(s.label)}</span>
                      <span className="squad-name">{s.player.name}</span>
                      {setup.showRatings && (
                        <span className="squad-rating">{s.player.displayRating}</span>
                      )}
                    </div>
                  ))}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function MatchLog({ matches, onDone }) {
  const [visible, setVisible] = useState(0);
  const listRef = useRef(null);
  const doneCalled = useRef(false);

  const items = useMemo(() => {
    const out = [];
    for (const m of matches) {
      const isHome = m.home === 'Deine 11';
      const own = isHome ? m.hg : m.ag;
      const opp = isHome ? m.ag : m.hg;
      const res = own > opp ? 'w' : own < opp ? 'l' : 'd';
      out.push({ kind: 'match', m, res, isHome, own, opp });
      for (const ev of (m.events ?? [])) {
        if (ev.type === 'goal') out.push({ kind: 'goal', ev });
      }
    }
    return out;
  }, [matches]);

  useEffect(() => {
    if (visible >= items.length) {
      if (!doneCalled.current) { doneCalled.current = true; onDone?.(); }
      return;
    }
    const delay = items[visible]?.kind === 'goal' ? 220 : 400;
    const t = setTimeout(() => setVisible(v => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible, items]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible]);

  let runW = 0, runD = 0, runL = 0, runGF = 0, runGA = 0, matchCount = 0;
  for (let i = 0; i < visible; i++) {
    if (items[i].kind !== 'match') continue;
    matchCount++;
    const { own, opp, res } = items[i];
    runGF += own; runGA += opp;
    if (res === 'w') runW++;
    else if (res === 'l') runL++;
    else runD++;
  }
  const runPts = runW * 3 + runD;

  return (
    <div className="match-log">
      <div className="ml-header">
        <span className="result-section-label" style={{ margin: 0 }}>Spieltagsergebnisse</span>
        <span className="ml-running">
          {matchCount}/{matches.length} · <strong>{runPts} Pkt</strong> · {runW}S {runD}U {runL}N · {runGF}:{runGA}
        </span>
      </div>
      <div className="ml-list" ref={listRef}>
        {items.map((item, i) => {
          if (i >= visible) return null;
          if (item.kind === 'match') {
            const { m, res, isHome } = item;
            return (
              <div key={i} className={`ml-row ml-row-${res}`}>
                <span className="ml-day">{m.day}.</span>
                <span className={`ml-team ml-home${isHome ? ' ml-player' : ''}`}>{m.home}</span>
                <span className="ml-score">{m.hg}:{m.ag}</span>
                <span className={`ml-team ml-away${!isHome ? ' ml-player' : ''}`}>{m.away}</span>
                <span className={`ml-badge ml-badge-${res}`}>{res.toUpperCase()}</span>
              </div>
            );
          }
          if (item.kind === 'goal') {
            const { ev } = item;
            return (
              <div key={i} className="ml-event">
                <span className="ml-event-icon">⚽</span>
                <span className="ml-event-minute">{ev.minute}'</span>
                <span className="ml-event-scorer">{ev.scorer.name}</span>
                {ev.assister && <span className="ml-event-assist">↗ {ev.assister.name}</span>}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function PlayerStats({ stats }) {
  if (!stats?.length) return null;
  const sorted = [...stats].sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  return (
    <div className="player-stats-card">
      <div className="result-section-label" style={{ padding: '0 16px', marginBottom: 8 }}>Spielerstatistiken</div>
      <div className="ps-header">
        <span className="ps-name"></span>
        <span className="ps-col" title="Tore">⚽</span>
        <span className="ps-col" title="Vorlagen">🅰️</span>
        <span className="ps-col" title="Gelbe Karten">🟨</span>
        <span className="ps-col" title="Rote Karten">🟥</span>
      </div>
      {sorted.map(p => (
        <div key={p.name} className={`ps-row ${p.goals > 0 ? 'ps-row-scorer' : ''}`}>
          <span className="ps-name">
            <span className="ps-pos">{labelDE(p.slotLabel)}</span>
            <span className="ps-pname">{p.name}</span>
          </span>
          <span className="ps-col">{p.goals  || '—'}</span>
          <span className="ps-col">{p.assists || '—'}</span>
          <span className="ps-col">{p.yellows || '—'}</span>
          <span className={`ps-col ${p.reds > 0 ? 'ps-red' : ''}`}>{p.reds || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function tableZone(pos) {
  if (pos === 1)  return 'champion';
  if (pos <= 4)   return 'ucl';
  if (pos <= 6)   return 'uel';
  if (pos === 7)  return 'conference';
  if (pos === 16) return 'playoff';
  if (pos >= 17)  return 'relegated';
  return 'mid';
}

function LeagueTable({ table }) {
  if (!table?.length) return null;
  const playerRow = table.find(r => r.isPlayer);

  return (
    <div className="league-table">
      <div className="result-section-label" style={{ padding: '0 16px', marginBottom: 10 }}>
        Liga-Tabelle — Simulierte Saison
        {playerRow && (
          <span className="lt-player-pos">
            {playerRow.pos}. Platz
          </span>
        )}
      </div>
      {table.map(row => {
        const gd = row.GF - row.GA;
        return (
          <div
            key={row.name}
            className={`lt-row lt-zone-${tableZone(row.pos)} ${row.isPlayer ? 'lt-row-player' : ''}`}
          >
            <span className="lt-pos">{row.pos}</span>
            <span className="lt-name">{row.name}</span>
            <span className="lt-wdl">{row.W}-{row.D}-{row.L}</span>
            <span className="lt-gd">{gd > 0 ? '+' : ''}{gd}</span>
            <span className="lt-pts">{row.pts}</span>
          </div>
        );
      })}
      <div className="lt-legend">
        <span className="lt-legend-item lt-legend-champion">Meister</span>
        <span className="lt-legend-item lt-legend-ucl">Champions League</span>
        <span className="lt-legend-item lt-legend-uel">Europa League</span>
        <span className="lt-legend-item lt-legend-conference">Conference League</span>
        <span className="lt-legend-item lt-legend-playoff">Relegation</span>
        <span className="lt-legend-item lt-legend-relegated">Abstieg</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div className="stat-pill">
      <span className="stat-pill-val" style={{ color }}>{value}</span>
      <span className="stat-pill-label">{label}</span>
    </div>
  );
}

function SeasonStat({ label, value, big }) {
  return (
    <div className="season-stat">
      <span className="season-stat-label">{label}</span>
      <span className={`season-stat-val ${big ? 'big' : ''}`}>{value}</span>
    </div>
  );
}
