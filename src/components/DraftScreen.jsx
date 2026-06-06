import { useState } from 'react';
import FormationBoard from './FormationBoard';
import SpinPanel from './SpinPanel';
import RatingsPanel from './RatingsPanel';
import { simulateFullLeague, getAchievements } from '../utils/simulation';
import './DraftScreen.css';

export default function DraftScreen({ state, fillSlot, useReroll, setResult }) {
  const { setup, draft } = state;
  const { slots, rerollsLeft, filledCount } = draft;
  const { draftMode, showRatings } = setup;

  // Position-first: which slot the user has selected on the pitch
  const [selectedSlotId, setSelectedSlotId] = useState(null);

  function handleSlotClick(slotId) {
    setSelectedSlotId(prev => prev === slotId ? null : slotId);
  }

  function handlePlayerPlaced(slotId, player, displayRating) {
    fillSlot(slotId, player, displayRating);
    setSelectedSlotId(null);

    // Check if squad is complete after this placement
    const newFilled = filledCount + 1;
    if (newFilled === 11) {
      const updatedSlots = slots.map(s =>
        s.id === slotId ? { ...s, player: { ...player, displayRating } } : s
      );
      const { result, table, playerMatches } = simulateFullLeague(updatedSlots);
      setResult({ ...result, achievements: getAchievements(result, updatedSlots), table, playerMatches });
    }
  }

  const total = slots.length;
  const pct = Math.round((filledCount / total) * 100);

  return (
    <div className="draft-screen">

      {/* ── Top bar ── */}
      <header className="draft-header">
        <div className="draft-header-left">
          <span className="draft-title">BUNDESLIGA DREAM XI</span>
          <span className="draft-formation badge badge-muted">{setup.formation}</span>
          {!showRatings && <span className="badge badge-gold">Blind-Modus</span>}
        </div>
        <div className="draft-header-right">
          <div className="progress-wrap">
            <span className="progress-label">{filledCount}/{total}</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="rerolls-display">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`reroll-dot ${i < rerollsLeft ? 'active' : ''}`}
              />
            ))}
            <span className="rerolls-label">{rerollsLeft} Joker</span>
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="draft-layout">

        {/* Left: formation board + ratings */}
        <div className="draft-left">
          <FormationBoard
            slots={slots}
            showRatings={showRatings}
            selectedSlotId={selectedSlotId}
            onSlotClick={draftMode === 'position-first' ? handleSlotClick : undefined}
            draftMode={draftMode}
          />
          <RatingsPanel slots={slots} showRatings={showRatings} />
        </div>

        {/* Right: spin panel */}
        <div className="draft-right">
          <SpinPanel
            slots={slots}
            setup={setup}
            rerollsLeft={rerollsLeft}
            selectedSlotId={selectedSlotId}
            onPlayerPlaced={handlePlayerPlaced}
            onReroll={useReroll}
            onClearSlot={() => setSelectedSlotId(null)}
          />
        </div>

      </div>
    </div>
  );
}
