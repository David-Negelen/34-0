import { useState, useEffect, useRef } from 'react';
import { CLUBS } from '../data/players';
import { PLAYERS } from '../data/players';
import {
  getClubsInDb,
  getEligiblePlayers,
  getOpenSlots,
  getCompatibleSlots,
  getDisplayRating,
  getSeasonsForClub,
  getPlayersForClubSeason,
  randomSpin,
  labelDE,
} from '../utils/playerUtils';
import PlayerCard from './PlayerCard';
import './SpinPanel.css';

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
  rerollsLeft,
  selectedSlotId,   // managed by parent (position-first mode)
  onPlayerPlaced,
  onReroll,
  onClearSlot,
}) {
  const { draftMode, showRatings, ratingMode } = setup;
  const openSlots = getOpenSlots(slots);
  const allClubs = getClubsInDb(PLAYERS);


  const [phase, setPhase] = useState('idle');
  // idle | animating | spun | picking | slot-choice
  const [displayedClub, setDisplayedClub] = useState('');
  const [displayedSeason, setDisplayedSeason] = useState('');
  const [currentSpin, setCurrentSpin] = useState(null);   // { club, season }
  const [candidates, setCandidates] = useState([]);
  const [pendingPlayer, setPendingPlayer] = useState(null);
  const [deadSpin, setDeadSpin] = useState(false);
  const [manualClub, setManualClub] = useState('');
  const [manualSeason, setManualSeason] = useState('');

  const animRef = useRef(null);

  // ── Spin logic ────────────────────────────────────────────────────────────
  function doSpin(isReroll) {
    if (isReroll) onReroll();
    setDeadSpin(false);

    const spinSlots = draftMode === 'position-first' && selectedSlotId !== null
      ? openSlots.filter(s => s.id === selectedSlotId)
      : openSlots;

    if (!spinSlots.length) return;

    const placedIds = new Set(slots.filter(s => s.player).map(s => s.player.id));
    const result = randomSpin(PLAYERS, spinSlots, placedIds);

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
      setDisplayedClub(clubFrames[idx]);
      // season reel runs at half speed for slot-machine stagger
      if (idx % 2 === 0 || idx === SPIN_FRAMES - 1) setDisplayedSeason(seasonFrames[idx]);
      idx++;
      if (idx < frames.length) {
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

        const eligible = draftMode === 'position-first' && selectedSlotId !== null
          ? pool.filter(p => getCompatibleSlots(p, spinSlots).length > 0)
          : getEligiblePlayers(pool, openSlots);

        const sorted = showRatings
          ? [...eligible].sort((a, b) => getDisplayRating(b, ratingMode) - getDisplayRating(a, ratingMode))
          : shuffle(eligible);

        setCandidates(sorted);
        setPhase('picking');
      }
    }
    next();
  }

  function handlePlayerClick(player) {
    const rating = getDisplayRating(player, ratingMode);

    if (draftMode === 'position-first' && selectedSlotId !== null) {
      onPlayerPlaced(selectedSlotId, player, rating);
      resetToIdle();
      return;
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
  }

  // ── Manual club+season selection ──────────────────────────────────────────
  const manualClubValid = allClubs.includes(manualClub);
  const manualSeasons = manualClubValid
    ? getSeasonsForClub(PLAYERS, manualClub).filter(s => parseInt(s) >= 2015)
    : [];

  function doManualSpin() {
    if (!manualClubValid || !manualSeason) return;
    const placedIds = new Set(slots.filter(s => s.player).map(s => s.player.id));
    const pool = getPlayersForClubSeason(PLAYERS, manualClub, manualSeason)
      .filter(p => !placedIds.has(p.id));

    const spinSlots = draftMode === 'position-first' && selectedSlotId !== null
      ? openSlots.filter(s => s.id === selectedSlotId)
      : openSlots;

    const eligible = draftMode === 'position-first' && selectedSlotId !== null
      ? pool.filter(p => getCompatibleSlots(p, spinSlots).length > 0)
      : getEligiblePlayers(pool, openSlots);

    const sorted = showRatings
      ? [...eligible].sort((a, b) => getDisplayRating(b, ratingMode) - getDisplayRating(a, ratingMode))
      : shuffle(eligible);

    setCurrentSpin({ club: manualClub, season: manualSeason });
    setCandidates(sorted);
    setDeadSpin(false);
    setPhase('picking');
  }

  // Reset to idle when all slots filled
  useEffect(() => {
    if (openSlots.length === 0) resetToIdle();
  }, [openSlots.length]);

  useEffect(() => () => clearTimeout(animRef.current), []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const clubMeta = currentSpin ? (CLUBS[currentSpin.club] ?? { color: '#e3000b', text: '#fff' }) : null;

  const spinReady = draftMode === 'position-first'
    ? selectedSlotId !== null
    : openSlots.length > 0;

  const canSpin   = (phase === 'idle' || phase === 'spun' || phase === 'picking') && spinReady;
  const canReroll = (phase === 'spun' || phase === 'picking') && rerollsLeft > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="spin-panel">

      {draftMode === 'position-first' && (phase === 'idle') && (
        <div className="position-hint fade-in">
          {selectedSlotId === null
            ? 'Wähle eine leere Position auf dem Spielfeld'
            : 'Position gewählt – jetzt drehen'}
        </div>
      )}

      {/* ── Spin display ── */}
      <div className="spin-display">
        {phase === 'idle' && (
          <div className="spin-idle">
            <span className="spin-idle-label">
              {openSlots.length === 0 ? 'Kader vollständig!' : 'Bereit zum Drehen'}
            </span>
          </div>
        )}

        {phase === 'animating' && (
          <div className="spin-animating">
            <span key={displayedSeason} className="spin-season">{displayedSeason}</span>
            <span key={displayedClub} className="spin-club-anim">{displayedClub}</span>
          </div>
        )}

        {(phase === 'spun' || phase === 'picking' || phase === 'slot-choice') && currentSpin && (
          <div className="spin-result fade-in">
            <span className="spin-season">{currentSpin.season}</span>
            <span
              className="spin-club"
              style={{ color: clubMeta?.color }}
            >
              {currentSpin.club}
            </span>
            <span className="spin-count">
              {candidates.length} Kandidat{candidates.length !== 1 ? 'en' : ''}
            </span>
          </div>
        )}

        {deadSpin && (
          <div className="spin-dead fade-in">
            <span className="spin-dead-title">Kein Treffer</span>
            <span className="spin-dead-sub">
              {draftMode === 'position-first' && selectedSlotId !== null
                ? `Kein passender Spieler für diese Position – anderen Slot wählen oder nochmal drehen.`
                : 'Keine passenden Spieler für offene Positionen.'}
            </span>
          </div>
        )}
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

      {/* ── Manual picker ── */}
      {phase === 'idle' && openSlots.length > 0 && (
        <div className="manual-picker">
          <div className="manual-picker-row">
            <div className="manual-field">
              <label className="manual-label">KLUB</label>
              <input
                className="manual-input"
                list="manual-club-list"
                value={manualClub}
                onChange={e => { setManualClub(e.target.value); setManualSeason(''); }}
                placeholder="Suchen…"
              />
              <datalist id="manual-club-list">
                {allClubs.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <span className="manual-sep">×</span>
            <div className="manual-field">
              <label className="manual-label">SAISON</label>
              <select
                className="manual-input"
                value={manualSeason}
                onChange={e => setManualSeason(e.target.value)}
                disabled={!manualSeasons.length}
              >
                <option value="">—</option>
                {manualSeasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {manualClubValid && manualSeason && (
            <button className="btn btn-secondary btn-sm manual-load-btn" onClick={doManualSpin}>
              Laden
            </button>
          )}
        </div>
      )}

      {/* ── Candidate list ── */}
      {phase === 'picking' && (
        <div className="candidates-list fade-in">
          <div className="candidates-header">
            <h4>Spieler wählen</h4>
          </div>
          {candidates.length === 0 ? (
            <p className="no-candidates">Keine Kandidaten für deine offenen Positionen.</p>
          ) : (
            candidates.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                showRatings={showRatings}
                ratingMode={ratingMode}
                onClick={() => handlePlayerClick(player)}
              />
            ))
          )}
        </div>
      )}

      {/* ── Slot choice overlay ── */}
      {phase === 'slot-choice' && pendingPlayer && (
        <div className="overlay">
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
