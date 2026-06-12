import { calcSquadRatings } from '../utils/ratingCalc';
import './SeasonPrognoseScreen.css';

function estimatePos(overall, league) {
  const base = league === '2bl' ? 63 : 68;
  return Math.max(1, Math.min(18, Math.round(18 - ((overall - base) / 20) * 17)));
}

function RatingBar({ label, value }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, ((value - 60) / 40) * 100));
  return (
    <div className="sprg-bar-row">
      <span className="sprg-bar-label">{label}</span>
      <div className="sprg-bar-track">
        <div className="sprg-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="sprg-bar-val">{value}</span>
    </div>
  );
}

export default function SeasonPrognoseScreen({ slots, league, seasonLabel, onStart, onStartWithPos }) {
  const { overall, gk, def, mid, att } = calcSquadRatings(slots);
  const pos = overall != null ? estimatePos(overall, league) : null;
  const markerPct = pos != null ? Math.max(2, Math.min(96, 2 + ((18 - pos) / 17) * 94)) : 50;

  const is2bl = league === '2bl';

  return (
    <div className="sprg-screen">
      <header className="sprg-header">
        <div className="sprg-eyebrow">{is2bl ? '2. BUNDESLIGA' : 'BUNDESLIGA'}{seasonLabel ? ` · ${seasonLabel}` : ''}</div>
        <div className="sprg-title">Saisonprognose</div>
      </header>

      <div className="sprg-card">
        <div className="sprg-section-label">Kader</div>
        <div className="sprg-bars">
          <RatingBar label="GES" value={overall} />
          <div className="sprg-divider" />
          <RatingBar label="Tor" value={gk} />
          <RatingBar label="Abw" value={def} />
          <RatingBar label="Mit" value={mid} />
          <RatingBar label="Ang" value={att} />
        </div>
      </div>

      {pos != null && (
        <div className="sprg-card">
          <div className="sprg-section-label">Prognose</div>
          <div className="sprg-pos-label">Geschätzter Tabellenplatz</div>
          <div className="sprg-pos-bar">
            <div className="sprg-pos-marker" style={{ left: `${markerPct}%` }} />
            <div className="sprg-pos-zone sprg-zone-rel" style={{ width: '22%' }} />
            <div className="sprg-pos-zone sprg-zone-mid" style={{ width: '44%', left: '22%' }} />
            <div className="sprg-pos-zone sprg-zone-eur" style={{ width: '22%', left: '66%' }} />
            <div className="sprg-pos-zone sprg-zone-top" style={{ width: '12%', left: '88%' }} />
          </div>
          <div className="sprg-pos-key">
            <span className="sprg-key-item sprg-key-rel">Abstieg</span>
            <span className="sprg-key-item sprg-key-mid">Mittelfeld</span>
            <span className="sprg-key-item sprg-key-eur">{is2bl ? 'Aufstieg' : 'Europa'}</span>
            <span className="sprg-key-item sprg-key-top">Meister</span>
          </div>
          <div className="sprg-pos-est">Platz {pos}</div>
        </div>
      )}

      <div className="sprg-footer">
        <button className="btn btn-primary sprg-start-btn" onClick={() => onStart(pos)}>
          Saison starten →
        </button>
      </div>
    </div>
  );
}
