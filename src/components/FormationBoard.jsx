import { shortName, ratingClass, labelDE } from '../utils/playerUtils';
import './FormationBoard.css';

export default function FormationBoard({
  slots,
  showRatings,
  selectedSlotId,
  onSlotClick,
  draftMode,
}) {
  return (
    <div className="board-wrap">
      <div className="pitch">
        {/* SVG pitch markings */}
        <svg className="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Border */}
          <rect x="1" y="1" width="98" height="98" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
          {/* Centre line */}
          <line x1="1" y1="50" x2="99" y2="50" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
          {/* Centre circle */}
          <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
          {/* Top penalty area */}
          <rect x="22" y="1" width="56" height="15" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
          {/* Top goal area */}
          <rect x="35" y="1" width="30" height="6" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
          {/* Bottom penalty area */}
          <rect x="22" y="84" width="56" height="15" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
          {/* Bottom goal area */}
          <rect x="35" y="93" width="30" height="6" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
        </svg>

        {/* Slot tokens */}
        {slots.map(slot => {
          const isSelected = slot.id === selectedSlotId;
          const isEmpty = slot.player === null;
          const isClickable = draftMode === 'position-first' && isEmpty && !!onSlotClick;

          return (
            <button
              key={slot.id}
              className={[
                'slot-token',
                isEmpty ? 'slot-empty' : 'slot-filled',
                isSelected ? 'slot-selected' : '',
                isClickable ? 'slot-clickable' : '',
              ].filter(Boolean).join(' ')}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onClick={isClickable ? () => onSlotClick(slot.id) : undefined}
              disabled={!isClickable && isEmpty}
              title={slot.player?.name ?? slot.label}
            >
              {isEmpty ? (
                <span className="slot-label">{labelDE(slot.label)}</span>
              ) : (
                <>
                  <span className="slot-player-name">{shortName(slot.player.name)}</span>
                  {showRatings && (
                    <span className={`slot-rating ${ratingClass(slot.player.displayRating)}`}>
                      {slot.player.displayRating}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
