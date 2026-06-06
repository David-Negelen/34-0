import { calcSquadRatings } from '../utils/ratingCalc';
import './RatingsPanel.css';

function RatingBar({ label, value }) {
  const pct = value ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className="rating-row">
      <span className="rating-row-label">{label}</span>
      <div className="rating-bar-track">
        <div
          className="rating-bar-fill"
          style={{ width: value ? `${pct}%` : '0%', opacity: value ? 1 : 0.3 }}
        />
      </div>
      <span className="rating-row-val">{value ?? '—'}</span>
    </div>
  );
}

export default function RatingsPanel({ slots, showRatings }) {
  if (!showRatings) return null;

  const { overall, gk, def, mid, att } = calcSquadRatings(slots);

  return (
    <div className="ratings-panel">
      <div className="ratings-overall">
        <span className="ratings-overall-label">Overall</span>
        <span className="ratings-overall-val">{overall ?? '—'}</span>
      </div>
      <div className="ratings-bars">
        <RatingBar label="GK"  value={gk} />
        <RatingBar label="DEF" value={def} />
        <RatingBar label="MID" value={mid} />
        <RatingBar label="ATT" value={att} />
      </div>
    </div>
  );
}
