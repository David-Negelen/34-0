import { ratingClass, getDisplayRating } from '../utils/playerUtils';
import { CLUBS } from '../data/players';
import './PlayerCard.css';

export default function PlayerCard({ player, showRatings, ratingMode, onClick, disabled }) {
  const displayRating = getDisplayRating(player, ratingMode);
  const rcls = showRatings ? ratingClass(displayRating) : 'rating-hidden';
  const clubMeta = player.spunClub ? CLUBS[player.spunClub] : null;
  const clubColor = clubMeta?.color ?? 'var(--text-muted)';

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
          <span className="player-nat">{player.nationality}</span>
          {player.positions.map(p => (
            <span key={p} className="player-pos-badge">{p}</span>
          ))}
        </div>
        {player.spunClub && (
          <div className="player-club-row">
            <span className="player-club-dot" style={{ background: clubColor }} />
            <span className="player-club-name">{player.spunClub}</span>
            {player.spunSeason && (
              <span className="player-club-season">{player.spunSeason.replace('-', '/')}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
