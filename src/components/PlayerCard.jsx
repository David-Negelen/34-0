import { ratingClass, getDisplayRating, labelDE } from '../utils/playerUtils';
import './PlayerCard.css';

export default function PlayerCard({ player, showRatings, ratingMode, onClick, disabled }) {
  const displayRating = getDisplayRating(player, ratingMode);
  const rcls = showRatings ? ratingClass(displayRating) : 'rating-hidden';

  return (
    <button
      className={`player-card ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <div className={`player-rating rating ${rcls}`}>
        {showRatings ? displayRating : '?'}
      </div>
      <div className="player-info">
        <div className="player-name">{player.name}</div>
        <div className="player-meta">
          {player.positions.map(p => (
            <span key={p} className="player-pos-badge">{labelDE(p)}</span>
          ))}
        </div>
      </div>
    </button>
  );
}
