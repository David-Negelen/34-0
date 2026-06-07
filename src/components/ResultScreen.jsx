import { useState, useEffect, useRef } from 'react';
import FormationBoard from './FormationBoard';
import { generateResultCanvas, shareResult, downloadResult } from '../utils/export';
import { buildShareText } from '../utils/simulation';
import { labelDE } from '../utils/playerUtils';
import { getSavedName, saveName, randomGuestName, submitScore } from '../utils/leaderboard';
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
  const { W, D, L, GF, GA, pts, pos = 18, achievements, table, playerMatches, playerStats, tableHistory } = result;
  const [sharing, setSharing] = useState(false);
  const [matchLogDone, setMatchLogDone] = useState(!playerMatches?.length);
  const [tableTab, setTableTab] = useState('table');
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitToast, setSubmitToast] = useState(null); // 'saved' | 'error' | null
  const scoreRef = useRef(null);

  function calcOvr() {
    const filled = slots.filter(s => s.player);
    return Math.round(filled.reduce((sum, s) => sum + s.player.displayRating, 0) / filled.length);
  }

  async function doSubmit(name) {
    const ovr = scoreRef.current?.ovr ?? calcOvr();
    try {
      await submitScore({ name, ovr, formation: setup.formation, pts, pos, w: W, d: D, l: L });
      setSubmitToast('saved');
    } catch {
      setSubmitToast('error');
    }
    setTimeout(() => setSubmitToast(null), 3000);
  }

  useEffect(() => {
    if (!matchLogDone) return;
    const ovr = calcOvr();
    scoreRef.current = { ovr };
    window.umami?.track('game-completed', { pts, pos, w: W, d: D, l: L, ovr });
    const saved = getSavedName();
    if (saved) {
      doSubmit(saved);
    } else {
      setNameInput(randomGuestName());
      setTimeout(() => setShowNameModal(true), 1400);
    }
  }, [matchLogDone]);

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
            <span className="result-eyebrow">34-0</span>
            <h1 className="result-title">Saison abgeschlossen</h1>
          </div>
          <div className="result-header-actions">
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
          <div className="result-section-label">Deine 11 — {setup.formation}</div>
          <div className="result-pitch-wrap">
            <FormationBoard
              slots={slots}
              showRatings={true}
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
                      style={{ left: `${Math.max(2, Math.min(96, 2 + ((18 - pos) / 17) * 94))}%` }}
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

              {/* League table / Fever curve */}
              <div>
                <div className="table-tabs">
                  <button className={`tab-btn${tableTab === 'table' ? ' tab-btn-active' : ''}`} onClick={() => setTableTab('table')}>Tabelle</button>
                  <button className={`tab-btn${tableTab === 'curve' ? ' tab-btn-active' : ''}`} onClick={() => setTableTab('curve')}>Fieberkurve</button>
                </div>
                {tableTab === 'table' ? <LeagueTable table={table} /> : <FeverCurve tableHistory={tableHistory} />}
              </div>

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
                      <span className="squad-rating">{s.player.displayRating}</span>
                    </div>
                  ))}
              </div>

            </div>
          )}

        </div>
      </div>
      {/* Name modal — shown on first ever submission */}
      {showNameModal && (
        <div className="overlay" onClick={() => {}}>
          <div className="overlay-card">
            <div className="result-section-label" style={{ marginBottom: 8 }}>Wähle deinen Namen</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Dein Score wird in der Rangliste gespeichert.
            </p>
            <input
              className="name-input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              maxLength={24}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  saveName(nameInput.trim());
                  setShowNameModal(false);
                  doSubmit(nameInput.trim());
                }
              }}
            />
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 12 }}
              disabled={!nameInput.trim()}
              onClick={() => {
                saveName(nameInput.trim());
                setShowNameModal(false);
                doSubmit(nameInput.trim());
              }}
            >
              Speichern
            </button>
          </div>
        </div>
      )}

      {/* Submit toast */}
      {submitToast && (
        <div className={`submit-toast submit-toast-${submitToast}`}>
          {submitToast === 'saved' ? 'In Rangliste gespeichert' : 'Speichern fehlgeschlagen'}
        </div>
      )}
    </div>
  );
}

function MatchLog({ matches, onDone }) {
  const [visible, setVisible] = useState(0);
  const listRef = useRef(null);
  const doneCalled = useRef(false);

  useEffect(() => {
    if (visible >= matches.length) {
      if (!doneCalled.current) { doneCalled.current = true; onDone?.(); }
      return;
    }
    const t = setTimeout(() => setVisible(v => v + 1), 480);
    return () => clearTimeout(t);
  }, [visible, matches]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible]);

  let runW = 0, runD = 0, runL = 0, runGF = 0, runGA = 0;
  for (let i = 0; i < visible; i++) {
    const m = matches[i];
    const isHome = m.home === 'Deine 11';
    const own = isHome ? m.hg : m.ag;
    const opp = isHome ? m.ag : m.hg;
    runGF += own; runGA += opp;
    if (own > opp) runW++;
    else if (own < opp) runL++;
    else runD++;
  }
  const runPts = runW * 3 + runD;

  return (
    <div className="match-log">
      <div className="ml-header">
        <span className="ml-matchday">Spieltag {visible} / {matches.length}</span>
        <span className="ml-running">
          {runW}S {runD}U {runL}N · <strong>{runPts} Pkt</strong> · {runGF}:{runGA}
        </span>
      </div>
      <div className="ml-list" ref={listRef}>
        {matches.map((m, i) => {
          if (i >= visible) return null;
          const isHome = m.home === 'Deine 11';
          const own = isHome ? m.hg : m.ag;
          const opp = isHome ? m.ag : m.hg;
          const res = own > opp ? 'w' : own < opp ? 'l' : 'd';
          const opponent = isHome ? m.away : m.home;
          const ourGoals = (m.events ?? []).filter(e => e.type === 'goal');
          const oppMins = m.oppMinutes ?? [];
          return (
            <div key={i} className={`ml-card ml-card-${res}`}>
              <div className={`ml-badge ml-badge-${res}`}>{res.toUpperCase()}</div>
              <div className="ml-card-body">
                <div className="ml-card-top">
                  <span className="ml-opponent">{opponent}</span>
                  <span className={`ml-score ml-score-${res}`}>{own}–{opp}</span>
                </div>
                {(ourGoals.length > 0 || oppMins.length > 0) && (
                  <div className="ml-scorers">
                    {ourGoals.length > 0 && (
                      <span className="ml-our-goals">⚽ {ourGoals.map(e => `${e.scorer.name} ${e.minute}'`).join('  ')}</span>
                    )}
                    {oppMins.length > 0 && (
                      <span className="ml-opp-goals">{ourGoals.length > 0 ? '  · ' : '· '}{oppMins.map(min => `${min}'`).join(' ')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
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
      </div>
      {sorted.map(p => (
        <div key={p.name} className={`ps-row ${p.goals > 0 ? 'ps-row-scorer' : ''}`}>
          <span className="ps-name">
            <span className="ps-pos">{labelDE(p.slotLabel)}</span>
            <span className="ps-pname">{p.name}</span>
          </span>
          <span className="ps-col">{p.goals  || '—'}</span>
          <span className="ps-col">{p.assists || '—'}</span>
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

function FeverCurve({ tableHistory }) {
  if (!tableHistory?.length) return null;

  const W = 460, H = 220;
  const pL = 22, pR = 36, pT = 10, pB = 22;
  const cW = W - pL - pR, cH = H - pT - pB;
  const N = tableHistory.length;
  const bandH = cH / 17;

  const xi = i  => pL + (i       / (N - 1)) * cW;
  const yp = p  => pT + ((p - 1) / 17)      * cH;

  const teamNames = tableHistory[0].map(t => t.name);
  const paths = teamNames.map(name => {
    const positions = tableHistory.map(snap => snap.find(t => t.name === name)?.pos ?? 18);
    return {
      name,
      isPlayer: name === 'Deine 11',
      finalPos: positions[N - 1],
      d: positions.map((p, i) => `${i === 0 ? 'M' : 'L'}${xi(i).toFixed(1)},${yp(p).toFixed(1)}`).join(' '),
    };
  });
  const sorted = [...paths.filter(p => !p.isPlayer), ...paths.filter(p => p.isPlayer)];
  const divX = xi(16.5);

  return (
    <div className="fever-curve-wrap">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {/* Zone bands */}
        <rect x={pL} y={yp(1) - bandH / 2} width={cW} height={bandH}        fill="rgba(245,197,24,0.07)" />
        <rect x={pL} y={yp(2) - bandH / 2} width={cW} height={3 * bandH}    fill="rgba(59,130,246,0.06)" />
        <rect x={pL} y={yp(5) - bandH / 2} width={cW} height={2 * bandH}    fill="rgba(249,115,22,0.05)" />
        <rect x={pL} y={yp(17) - bandH / 2} width={cW} height={2 * bandH}   fill="rgba(239,68,68,0.07)" />

        {/* Hinrunde / Rückrunde divider */}
        <line x1={divX} y1={pT} x2={divX} y2={pT + cH}
          stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3,2" />
        <text x={divX - 4} y={pT + 9} fill="rgba(255,255,255,0.25)" fontSize="6.5" textAnchor="end">H</text>
        <text x={divX + 4} y={pT + 9} fill="rgba(255,255,255,0.25)" fontSize="6.5" textAnchor="start">R</text>

        {/* Horizontal rules */}
        {[1, 4, 6, 16, 18].map(p => (
          <line key={p} x1={pL} y1={yp(p)} x2={pL + cW} y2={yp(p)}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}

        {/* Y-axis labels */}
        {[1, 4, 6, 10, 16, 18].map(p => (
          <text key={p} x={pL - 4} y={yp(p) + 3}
            fill="rgba(255,255,255,0.28)" fontSize="7" textAnchor="end">{p}</text>
        ))}

        {/* X-axis labels */}
        {[1, 5, 10, 17, 20, 25, 30, 34].map(day => (
          <text key={day} x={xi(day - 1)} y={H - 4}
            fill="rgba(255,255,255,0.2)" fontSize="7" textAnchor="middle">{day}</text>
        ))}

        {/* Team lines */}
        {sorted.map(({ name, d, isPlayer, finalPos }) => (
          <g key={name}>
            <path d={d} fill="none"
              stroke={isPlayer ? '#e3000b' : 'rgba(255,255,255,0.09)'}
              strokeWidth={isPlayer ? 2.5 : 1}
              strokeLinejoin="round" />
            {isPlayer && (
              <>
                <circle cx={xi(N - 1)} cy={yp(finalPos)} r="3.5" fill="#e3000b" />
                <text x={xi(N - 1) + 6} y={yp(finalPos) + 3.5}
                  fill="#e3000b" fontSize="9" fontWeight="bold">{finalPos}.</text>
              </>
            )}
          </g>
        ))}

        {/* Border */}
        <rect x={pL} y={pT} width={cW} height={cH}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      </svg>
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
