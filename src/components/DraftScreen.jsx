import { useState } from 'react';
import FormationBoard from './FormationBoard';
import SpinPanel from './SpinPanel';
import RatingsPanel from './RatingsPanel';
import SeasonPrognoseScreen from './SeasonPrognoseScreen';
import { simulateFullLeague, getAchievements } from '../utils/simulation';
import './DraftScreen.css';

export default function DraftScreen({ state, league, players, clubs, fillSlot, useReroll, setPendingSpin, setResult, onGoHome, onReset }) {
  const { setup, draft } = state;
  const { slots, rerollsLeft, filledCount, pendingSpin } = draft;
  const { draftMode, showRatings } = setup;

  // Position-first: which slot the user has selected on the pitch
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [spinActive, setSpinActive] = useState(false);
  const [prognoseSlots, setPrognoseSlots] = useState(null);

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
      if (league === 'pokal') {
        setResult({ mode: 'pokal', slots: updatedSlots });
      } else {
        setPrognoseSlots(updatedSlots);
      }
    }
  }

  const total = slots.length;
  const pct = Math.round((filledCount / total) * 100);

  if (prognoseSlots) {
    return (
      <SeasonPrognoseScreen
        slots={prognoseSlots}
        league={league}
        onStart={(predictedPos) => {
          const { result, table, playerMatches, playerStats, tableHistory } = simulateFullLeague(prognoseSlots, league, players);
          setResult({ ...result, achievements: getAchievements(result, prognoseSlots, league), table, playerMatches, playerStats, tableHistory, predictedPos });
        }}
      />
    );
  }

  return (
    <div className="draft-screen">

      {/* ── Top bar ── */}
      <header className="draft-header">
        <div className="draft-header-left">
          <button
            className="btn btn-ghost btn-sm draft-nav-btn"
            onClick={() => window.confirm('Draft abbrechen und zum Menü?') && onGoHome()}
          >← <span className="draft-nav-label">Menü</span></button>
          <span className="draft-title">{league === 'pokal' ? 'DFB-POKAL' : league === '2bl' ? '2. BUNDESLIGA' : 'BUNDESLIGA'} DREAM XI</span>
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
          <button
            className="btn btn-ghost btn-sm draft-nav-btn"
            onClick={() => window.confirm('Draft neu starten?') && onReset()}
          >↺</button>
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
            onSlotClick={draftMode === 'position-first' && !spinActive ? handleSlotClick : undefined}
            draftMode={draftMode}
            league={league}
          />
          <RatingsPanel slots={slots} showRatings={showRatings} />
        </div>

        {/* Right: spin panel */}
        <div className="draft-right">
          <SpinPanel
            slots={slots}
            setup={setup}
            players={players}
            clubs={clubs}
            rerollsLeft={rerollsLeft}
            pendingSpin={pendingSpin}
            selectedSlotId={selectedSlotId}
            onPlayerPlaced={handlePlayerPlaced}
            onReroll={useReroll}
            onSetPendingSpin={setPendingSpin}
            onClearSlot={() => setSelectedSlotId(null)}
            onSpinActiveChange={setSpinActive}
            league={league}
          />
        </div>

      </div>
    </div>
  );
}
