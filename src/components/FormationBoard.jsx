import { tokenName, labelDE } from '../utils/playerUtils';
import { ovrColorClass } from '../utils/growthUtils';
import { calcSquadRatings } from '../utils/ratingCalc';
import { getOopPenalty } from '../utils/positionUtils';
import './FormationBoard.css';

export default function FormationBoard({
  slots,
  showRatings,
  selectedSlotId,
  highlightSlotIds = [],
  onSlotClick,
  draftMode,
  league = 'bl',
}) {
  const ratings = showRatings ? calcSquadRatings(slots) : null;
  const filledCount = slots.filter(s => s.player).length;

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
          const isHighlighted = highlightSlotIds.includes(slot.id);
          const isEmpty = slot.player === null;
          const isClickable = !!onSlotClick && (draftMode !== 'position-first' || isEmpty);
          const oopPenalty = !isEmpty ? getOopPenalty(slot.player.positions, slot.type) : 0;

          return (
            <button
              key={slot.id}
              className={[
                'slot-token',
                isEmpty ? 'slot-empty' : `slot-filled ${ovrColorClass(slot.player.displayRating)}`,
                isSelected    ? 'slot-selected'   : '',
                isHighlighted ? 'slot-highlight'  : '',
                isClickable   ? 'slot-clickable'  : '',
                !isEmpty && slot.player.isIcon  ? 'slot-token--icon'  : '',
                !isEmpty && slot.player.isPrime ? 'slot-token--prime' : '',
                !isEmpty && slot.player.isGem   ? 'slot-token--gem'   : '',
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
                  <span className="slot-player-name">
                    {(() => { const [a, b] = tokenName(slot.player.name); return b ? <>{a}<br />{b}</> : a; })()}
                  </span>
                  {showRatings && (
                    <span className="slot-rating">
                      {slot.player.displayRating}
                    </span>
                  )}
                  {oopPenalty > 0 && (
                    <span className="slot-oop-badge">-{oopPenalty}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      {ratings && filledCount > 0 && (
        <div className="board-ovr-bar">
          {ratings.overall && (
            <span className="board-ovr-main">
              <span className="board-ovr-label">OVR</span>
              <span className={`rating rating-sm ${ovrColorClass(ratings.overall)}`}>{ratings.overall}</span>
            </span>
          )}
          <span className="board-ovr-sep" />
          {[['TW', ratings.gk], ['ABW', ratings.def], ['MIT', ratings.mid], ['ANG', ratings.att]].map(([label, val]) =>
            val ? (
              <span key={label} className="board-ovr-group">
                <span className="board-ovr-label">{label}</span>
                <span className={`board-ovr-num ${ovrColorClass(val)}`}>{val}</span>
              </span>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
