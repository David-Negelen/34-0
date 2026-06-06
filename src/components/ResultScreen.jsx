import { useState } from 'react';
import FormationBoard from './FormationBoard';
import { generateResultCanvas, shareResult, downloadResult } from '../utils/export';
import { buildShareText } from '../utils/simulation';
import './ResultScreen.css';

const ACHIEVEMENT_ICONS = {
  perfect:    '🏆',
  invincible: '🛡️',
  champions:  '🥇',
  top4:       '🎯',
  tophalf:    '📊',
  midtable:   '✅',
  relegated:  '📉',
  derby:      '💀',
  century:    '⚡',
  fortress:   '🔒',
  dominant:   '💪',
};

export default function ResultScreen({ state, onPlayAgain }) {
  const { setup, draft, result } = state;
  const { slots } = draft;
  const { W, D, L, GF, GA, pts, achievements } = result;
  const [sharing, setSharing] = useState(false);

  const GD = GF - GA;
  const topAchievement = achievements?.[0];

  async function handleShare() {
    setSharing(true);
    try {
      const canvas = generateResultCanvas(slots, result, setup.formation);
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
      const canvas = generateResultCanvas(slots, result, setup.formation);
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

          {/* Primary achievement */}
          {topAchievement && (
            <div className="result-achievement-primary fade-in">
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

            {/* Simulated table position */}
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
            <div className="result-section-label">Dein XI</div>
            {slots
              .filter(s => s.player)
              .map(s => (
                <div key={s.id} className="squad-row">
                  <span className="squad-pos">{s.label}</span>
                  <span className="squad-name">{s.player.name}</span>
                  {setup.showRatings && (
                    <span className="squad-rating">{s.player.displayRating}</span>
                  )}
                </div>
              ))}
          </div>

        </div>
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
