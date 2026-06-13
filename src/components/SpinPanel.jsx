import { useState, useEffect, useRef } from 'react';
import {
  getClubsInDb,
  getEligiblePlayers,
  getOpenSlots,
  getCompatibleSlots,
  getDisplayRating,
  randomSpin,
  labelDE,
} from '../utils/playerUtils';
import PlayerCard from './PlayerCard';
import './SpinPanel.css';

const POS_ORDER = ['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'];

const SPIN_FRAMES = 16;
const SPIN_DELAYS = [60,60,70,80,90,110,130,155,175,200,240,270,310,350,390,440];
const ANIM_SEASONS = ['2015-16','2016-17','2017-18','2018-19','2019-20','2020-21','2021-22','2022-23','2023-24','2024-25','2025-26'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SpinPanel({
  slots,
  setup,
  players,
  clubs,
  rerollsLeft,
  pendingSpin,
  selectedSlotId,
  onPlayerPlaced,
  onReroll,
  onSetPendingSpin,
  onClearSlot,
  onSpinActiveChange,
  league = 'bl',
}) {
  const { draftMode, showRatings, ratingMode } = setup;
  const openSlots = getOpenSlots(slots);
  const allClubs = getClubsInDb(players);

  const [phase, setPhase] = useState('idle');
  const [displayedClub, setDisplayedClub] = useState('');
  const [displayedSeason, setDisplayedSeason] = useState('');
  const [animTick, setAnimTick] = useState(0);
  const [currentSpin, setCurrentSpin] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [pendingPlayer, setPendingPlayer] = useState(null);
  const [deadSpin, setDeadSpin] = useState(false);
  // Slot locked at spin-start so changing selection mid-spin can't redirect placement.
  const [lockedSlotId, setLockedSlotId] = useState(null);
  const [posFilter, setPosFilter] = useState('');

  const animRef = useRef(null);

  function doSpin(isReroll) {
    if (isReroll) onReroll();
    setDeadSpin(false);

    const activeSlot = draftMode === 'position-first' ? selectedSlotId : null;
    setLockedSlotId(activeSlot);
    onSpinActiveChange?.(true);

    const spinSlots = activeSlot !== null
      ? openSlots.filter(s => s.id === activeSlot)
      : openSlots;

    if (!spinSlots.length) return;

    const placedIds = new Set(slots.filter(s => s.player).map(s => s.player.id));
    const result = randomSpin(players, spinSlots, placedIds, league, setup.clubChallenge ?? null);

    setPhase('animating');
    const clubFrames = Array.from({ length: SPIN_FRAMES }, (_, i) =>
      i === SPIN_FRAMES - 1
        ? (result?.club ?? allClubs[0])
        : allClubs[Math.floor(Math.random() * allClubs.length)]
    );
    const seasonFrames = Array.from({ length: SPIN_FRAMES }, (_, i) =>
      i === SPIN_FRAMES - 1
        ? (result?.season ?? ANIM_SEASONS[ANIM_SEASONS.length - 1])
        : ANIM_SEASONS[Math.floor(Math.random() * ANIM_SEASONS.length)]
    );

    let idx = 0;
    function next() {
      setAnimTick(t => t + 1);
      setDisplayedClub(clubFrames[idx]);
      if (idx % 2 === 0 || idx === SPIN_FRAMES - 1) setDisplayedSeason(seasonFrames[idx]);
      idx++;
      if (idx < SPIN_FRAMES) {
        animRef.current = setTimeout(next, SPIN_DELAYS[idx - 1]);
      } else {
        if (!result) {
          setDeadSpin(true);
          setPhase('spun');
          setCurrentSpin(null);
          return;
        }
        const { club, season, candidates: pool } = result;
        setCurrentSpin({ club, season });

        const eligible = draftMode === 'position-first' && activeSlot !== null
          ? pool.filter(p => getCompatibleSlots(p, spinSlots).length > 0)
          : getEligiblePlayers(pool, openSlots);

        const sorted = showRatings
          ? [...eligible].sort((a, b) => getDisplayRating(b, ratingMode) - getDisplayRating(a, ratingMode))
          : shuffle(eligible);

        setCandidates(sorted);
        setPhase('picking');
        onSetPendingSpin({ club, season, candidates: sorted });
      }
    }
    next();
  }

  function handlePlayerClick(player) {
    const rating = getDisplayRating(player, ratingMode);

    if (draftMode === 'position-first') {
      const targetSlot = lockedSlotId ?? selectedSlotId;
      if (targetSlot !== null) {
        onPlayerPlaced(targetSlot, player, rating);
        resetToIdle();
        return;
      }
    }

    const compat = getCompatibleSlots(player, openSlots);
    if (compat.length === 1) {
      onPlayerPlaced(compat[0].id, player, rating);
      resetToIdle();
    } else {
      setPendingPlayer({ player, rating });
      setPhase('slot-choice');
    }
  }

  function handleSlotChoice(slotId) {
    if (!pendingPlayer) return;
    onPlayerPlaced(slotId, pendingPlayer.player, pendingPlayer.rating);
    setPendingPlayer(null);
    resetToIdle();
  }

  function resetToIdle() {
    setPhase('idle');
    setCurrentSpin(null);
    setCandidates([]);
    setDeadSpin(false);
    setPendingPlayer(null);
    setLockedSlotId(null);
    setPosFilter('');
    onSetPendingSpin(null);
    onSpinActiveChange?.(false);
  }

  // Restore spin result after a page reload
  useEffect(() => {
    if (pendingSpin && phase === 'idle') {
      setCurrentSpin({ club: pendingSpin.club, season: pendingSpin.season });
      setCandidates(pendingSpin.candidates);
      setPhase('picking');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (openSlots.length === 0) resetToIdle();
  }, [openSlots.length]);

  useEffect(() => () => clearTimeout(animRef.current), []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const clubMeta = currentSpin ? (clubs[currentSpin.club] ?? { color: '#e3000b', text: '#fff' }) : null;

  const spinReady = draftMode === 'position-first'
    ? selectedSlotId !== null
    : openSlots.length > 0;

  const canSpin   = (phase === 'idle' || phase === 'spun' || phase === 'picking') && spinReady;
  const canReroll = (phase === 'spun' || phase === 'picking') && rerollsLeft > 0;

  // ── Slot machine reel state ───────────────────────────────────────────────
  let machineState = 'idle';
  let reelSeason = '—', reelClub = '—';
  let reelSeasonKey = 'idle-s', reelClubKey = 'idle-c';
  let reelSeasonCls = 'reel-val reel-val--idle', reelClubCls = 'reel-val reel-val--idle';
  let reelClubStyle;

  if (phase === 'animating') {
    machineState = 'spinning';
    reelSeason = displayedSeason;
    reelClub = displayedClub;
    reelSeasonKey = `s-${animTick}`;
    reelClubKey = `c-${animTick}`;
    reelSeasonCls = 'reel-val reel-val--spin';
    reelClubCls = 'reel-val reel-val--spin';
  } else if (deadSpin) {
    machineState = 'dead';
  } else if (currentSpin) {
    machineState = 'done';
    reelSeason = currentSpin.season;
    reelClub = currentSpin.club;
    reelSeasonKey = `done-s-${currentSpin.season}`;
    reelClubKey = `done-c-${currentSpin.club}`;
    reelSeasonCls = 'reel-val reel-val--done';
    reelClubCls = 'reel-val reel-val--done';
    if (clubMeta?.color) reelClubStyle = { color: clubMeta.color };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="spin-panel">

      {draftMode === 'position-first' && phase === 'idle' && (
        <div className="position-hint fade-in">
          {selectedSlotId === null
            ? 'Wähle eine leere Position auf dem Spielfeld'
            : 'Position gewählt – jetzt drehen'}
        </div>
      )}

      {/* ── Slot machine ── */}
      <div className={`slot-machine slot-machine--${machineState}`}>
        <div className="slot-window">
          <div className="slot-payline" />
          <div className="slot-reels">
            <div className="slot-reel slot-reel--season">
              <div className="slot-reel-track">
                <span key={reelSeasonKey} className={reelSeasonCls}>{reelSeason}</span>
              </div>
              <span className="slot-reel-lbl">SAISON</span>
            </div>
            <div className="slot-reel slot-reel--club">
              <div className="slot-reel-track">
                <span key={reelClubKey} className={reelClubCls} style={reelClubStyle}>
                  {reelClub}
                </span>
              </div>
              <span className="slot-reel-lbl">KLUB</span>
            </div>
          </div>
        </div>
        <div className="slot-status">
          {machineState === 'idle' && (
            <span>{openSlots.length === 0 ? 'Kader vollständig!' : 'Bereit zum Drehen'}</span>
          )}
          {machineState === 'spinning' && (
            <span className="slot-status--spinning">● ● ●</span>
          )}
          {machineState === 'dead' && (
            <span className="slot-status--dead">
              {draftMode === 'position-first' && selectedSlotId !== null
                ? 'Keine passenden Spieler für diese Position'
                : 'Keine passenden Spieler für offene Positionen'}
            </span>
          )}
          {machineState === 'done' && (
            <span className="slot-status--count" style={{ color: clubMeta?.color }}>
              {candidates.length} Spieler
            </span>
          )}
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="spin-actions">
        {(phase === 'idle' || (phase === 'spun' && !deadSpin)) && (
          <button
            className="btn btn-primary btn-lg spin-btn"
            onClick={() => doSpin(false)}
            disabled={!canSpin}
          >
            {phase === 'idle' ? 'Drehen' : 'Nochmal drehen'}
          </button>
        )}

        {canReroll && (
          <button className="btn btn-ghost reroll-btn" onClick={() => doSpin(true)}>
            Joker einsetzen ({rerollsLeft} übrig)
          </button>
        )}

        {(deadSpin || (phase === 'spun' && candidates.length === 0)) && (
          <>
            <button className="btn btn-secondary" onClick={() => doSpin(false)}>
              Nochmal versuchen (gratis)
            </button>
            {draftMode === 'position-first' && selectedSlotId !== null && onClearSlot && (
              <button className="btn btn-ghost" onClick={() => { resetToIdle(); onClearSlot(); }}>
                Andere Position wählen
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Candidate list ── */}
      {phase === 'picking' && (
        <div className="candidates-list fade-in">
          {candidates.length === 0 ? (
            <p className="no-candidates">Keine Kandidaten für deine offenen Positionen.</p>
          ) : (() => {
            const availPos = POS_ORDER.filter(p => candidates.some(c => c.positions.includes(p)));
            const visible = posFilter ? candidates.filter(c => c.positions.includes(posFilter)) : candidates;
            return (
              <>
                <div className="candidates-header">
                  <div className="candidates-header-top">
                    <h4>Spieler wählen</h4>
                    <span className="candidates-count">{visible.length}</span>
                  </div>
                  {availPos.length > 1 && (
                    <div className="candidates-pos-filters">
                      <button className={`cand-filter-btn${posFilter === '' ? ' cand-filter-btn-active' : ''}`} onClick={() => setPosFilter('')}>Alle</button>
                      {availPos.map(p => (
                        <button key={p} className={`cand-filter-btn${posFilter === p ? ' cand-filter-btn-active' : ''}`} onClick={() => setPosFilter(posFilter === p ? '' : p)}>{labelDE(p)}</button>
                      ))}
                    </div>
                  )}
                </div>
                {visible.map(player => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    showRatings={showRatings}
                    ratingMode={ratingMode}
                    onClick={() => handlePlayerClick(player)}
                    league={league}
                  />
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Slot choice overlay ── */}
      {phase === 'slot-choice' && pendingPlayer && (
        <div className="overlay overlay-subtle">
          <div className="overlay-card">
            <h3 style={{ marginBottom: 6 }}>Position wählen</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Wo soll <strong>{pendingPlayer.player.name}</strong> spielen?
            </p>
            <div className="slot-choice-list">
              {getCompatibleSlots(pendingPlayer.player, openSlots).map(slot => (
                <button
                  key={slot.id}
                  className="btn btn-secondary slot-choice-btn"
                  onClick={() => handleSlotChoice(slot.id)}
                >
                  {labelDE(slot.label)}
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => { setPendingPlayer(null); setPhase('picking'); }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
