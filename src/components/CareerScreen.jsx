import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerState } from '../hooks/useCareerState';
import FormationBoard from './FormationBoard';
import { FORMATIONS, FORMATION_KEYS } from '../data/formations';
import { generateCareerDraftPool, generateTransferOffers } from '../utils/careerUtils';
import { simulateFullLeague, getAchievements } from '../utils/simulation';
import { canPlayerFillSlot, getCompatibleSlots, labelDE, ratingClass } from '../utils/playerUtils';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import './CareerScreen.css';

const DIV_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga' };

function getPlayers(div) {
  return div === 'bl' ? BL_PLAYERS : BL2_PLAYERS;
}

export default function CareerScreen() {
  const navigate = useNavigate();
  const career = useCareerState();
  const { state } = career;

  if (state.phase === 'setup') {
    return (
      <CareerSetup
        formation={state.formation}
        onSetFormation={career.setFormation}
        onStart={() => {
          const pool = generateCareerDraftPool(getPlayers('2bl'), FORMATIONS[state.formation]);
          career.beginDraft(pool);
        }}
        onBack={() => navigate('/')}
      />
    );
  }

  if (state.phase === 'draft') {
    return (
      <CareerDraft
        state={state}
        onPlace={career.placePlayer}
        onResult={(slots) => {
          const { result, table, playerMatches, playerStats, tableHistory } =
            simulateFullLeague(slots, '2bl', getPlayers('2bl'));
          career.setResult({
            ...result,
            achievements: getAchievements(result, slots, '2bl'),
            table, playerMatches, playerStats, tableHistory,
          });
        }}
        onReset={() => career.reset()}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'result') {
    const pos = state.result?.pos ?? 18;
    const promoted  = state.division === '2bl' && pos <= 2;
    const relegated = state.division === 'bl'  && pos >= 17;
    const newDivision = promoted ? 'bl' : relegated ? '2bl' : state.division;

    return (
      <CareerResult
        state={state}
        promoted={promoted}
        relegated={relegated}
        onContinue={() => {
          const divPlayers = getPlayers(newDivision);
          const excludeIds = new Set(state.slots.filter(s => s.player).map(s => s.player.id));
          const offers = generateTransferOffers(divPlayers, excludeIds, FORMATIONS[state.formation]);
          career.beginTransfer(newDivision, offers);
        }}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'transfer') {
    return (
      <CareerTransfer
        state={state}
        onSwap={career.swapOffer}
        onSkip={career.skipOffer}
        onStartSeason={() => {
          const players = getPlayers(state.division);
          const { result, table, playerMatches, playerStats, tableHistory } =
            simulateFullLeague(state.slots, state.division, players);
          career.setResult({
            ...result,
            achievements: getAchievements(result, state.slots, state.division),
            table, playerMatches, playerStats, tableHistory,
          });
        }}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  return null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function CareerSetup({ formation, onSetFormation, onStart, onBack }) {
  return (
    <div className="career-screen slide-up">
      <header className="career-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <div className="career-header-title">
          <span className="career-eyebrow">34-0</span>
          <h1 className="career-main-title">KARRIERE</h1>
          <p className="career-main-sub">Starte in der 2. Bundesliga und kämpfe um den Aufstieg</p>
        </div>
        <div />
      </header>

      <div className="career-setup-body">
        <section className="setup-section">
          <h3 className="setup-label">Formation</h3>
          <div className="formation-btns">
            {FORMATION_KEYS.map(key => (
              <button
                key={key}
                className={`formation-btn ${formation === key ? 'selected' : ''}`}
                onClick={() => onSetFormation(key)}
              >
                {key}
              </button>
            ))}
          </div>
          <PitchMini slots={FORMATIONS[formation].slots} />
          <p className="formation-desc">{FORMATIONS[formation].description}</p>
        </section>

        <div className="career-setup-info">
          <div className="career-info-row">
            <span className="career-info-icon">🎯</span>
            <span>Wähle deine Startelf aus 25 zufälligen 2.-Liga-Spielern</span>
          </div>
          <div className="career-info-row">
            <span className="career-info-icon">⬆️</span>
            <span>Platz 1 oder 2: Aufstieg in die Bundesliga</span>
          </div>
          <div className="career-info-row">
            <span className="career-info-icon">🔄</span>
            <span>Nach jeder Saison: 5 neue Spielerangebote</span>
          </div>
        </div>

        <button className="start-btn" onClick={onStart}>
          Karriere starten →
        </button>
      </div>
    </div>
  );
}

// ── Draft ─────────────────────────────────────────────────────────────────────

function CareerDraft({ state, onPlace, onResult, onReset, onHome }) {
  const { slots, draftPool, formation } = state;
  const [slotPickTarget, setSlotPickTarget] = useState(null);

  const filledCount = slots.filter(s => s.player !== null).length;
  const openSlots   = slots.filter(s => s.player === null);
  const placedIds   = new Set(slots.filter(s => s.player).map(s => s.player.id));

  function handleCardClick(player) {
    const compat = getCompatibleSlots(player, openSlots);
    if (!compat.length) return;
    if (compat.length === 1) {
      commit(compat[0].id, player);
    } else {
      setSlotPickTarget({ player, compat });
    }
  }

  function commit(slotId, player) {
    const displayRating = player.seasonRating;
    onPlace(slotId, player, displayRating);

    if (filledCount + 1 === 11) {
      const updatedSlots = slots.map(s =>
        s.id === slotId ? { ...s, player: { ...player, displayRating } } : s
      );
      onResult(updatedSlots);
    }
    setSlotPickTarget(null);
  }

  return (
    <div className="career-screen">
      <header className="career-draft-header">
        <div className="career-draft-header-left">
          <button
            className="btn btn-ghost btn-sm draft-nav-btn"
            onClick={() => window.confirm('Draft abbrechen und zum Menü?') && onHome()}
          >← <span className="draft-nav-label">Menü</span></button>
          <span className="career-draft-title">KARRIERE — SAISON 1 — 2. BUNDESLIGA</span>
          <span className="badge badge-muted">{FORMATIONS[formation].name}</span>
        </div>
        <div className="career-draft-header-right">
          <span className="career-draft-progress">{filledCount} / 11</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => window.confirm('Draft neu starten?') && onReset()}
          >↺</button>
        </div>
      </header>

      <div className="career-draft-layout">
        <div className="career-draft-left">
          <FormationBoard slots={slots} showRatings league="2bl" />
        </div>

        <div className="career-draft-right">
          <div className="career-pool-label">
            Wähle {11 - filledCount} weitere Spieler
          </div>
          <div className="career-pool-grid">
            {draftPool.map(player => {
              const picked = placedIds.has(player.id);
              const compat = getCompatibleSlots(player, openSlots);
              return (
                <CareerCard
                  key={player.id}
                  player={player}
                  league="2bl"
                  picked={picked}
                  incompatible={!picked && !compat.length}
                  onClick={!picked && compat.length ? () => handleCardClick(player) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      {slotPickTarget && (
        <div className="overlay">
          <div className="overlay-card">
            <h3 style={{ marginBottom: 6 }}>Position wählen</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Wo soll <strong>{slotPickTarget.player.name}</strong> spielen?
            </p>
            <div className="slot-choice-list">
              {slotPickTarget.compat.map(slot => (
                <button
                  key={slot.id}
                  className="btn btn-secondary slot-choice-btn"
                  onClick={() => commit(slot.id, slotPickTarget.player)}
                >
                  {labelDE(slot.label)}
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => setSlotPickTarget(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────────

function CareerResult({ state, promoted, relegated, onContinue, onHome }) {
  const { result, division, seasonNumber, seasonHistory, slots } = state;
  const [logDone, setLogDone] = useState(!(result?.playerMatches?.length));

  const { W, D, L, GF, GA, pts, pos = 18, table, playerMatches } = result ?? {};
  const GD = (GF ?? 0) - (GA ?? 0);

  return (
    <div className="career-screen slide-up">
      <header className="career-result-header">
        <div className="career-result-header-inner">
          <div>
            <span className="career-eyebrow">KARRIERE · SAISON {seasonNumber}</span>
            <h1 className="career-result-title">Saison abgeschlossen</h1>
            <div className="career-result-div-badge">{DIV_LABEL[division]}</div>
          </div>
          {logDone && (
            <div className="career-result-actions">
              <button className="btn btn-primary" onClick={onContinue}>
                Transferfenster →
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onHome}>
                Beenden
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="career-result-body">
        <div className="career-result-left">
          <div className="result-section-label">Deine 11 — {state.formation}</div>
          <FormationBoard slots={slots} showRatings league={division} />
        </div>

        <div className="career-result-right">
          {playerMatches?.length > 0 && (
            <CareerMatchLog
              matches={playerMatches}
              onDone={() => setLogDone(true)}
              done={logDone}
            />
          )}

          {logDone && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {(promoted || relegated) && (
                <div className={`career-banner ${promoted ? 'career-banner--up' : 'career-banner--down'}`}>
                  {promoted
                    ? `⬆️  Aufstieg! Nächste Saison spielst du in der Bundesliga.`
                    : `⬇️  Abstieg. Nächste Saison in der 2. Bundesliga.`}
                </div>
              )}

              <div className="career-stats-card">
                <div className="result-section-label">
                  Saison {seasonNumber} — {DIV_LABEL[division]}
                </div>
                <div className="season-wdl">
                  <StatPill label="S" value={W} color="var(--green)" />
                  <StatPill label="U" value={D} color="var(--text-muted)" />
                  <StatPill label="N" value={L} color="var(--red)" />
                </div>
                <div className="season-details">
                  <SeasonStat label="Punkte"       value={pts} big />
                  <SeasonStat label="Tore"         value={GF} />
                  <SeasonStat label="Gegentore"    value={GA} />
                  <SeasonStat label="Tordifferenz" value={`${GD > 0 ? '+' : ''}${GD}`} />
                </div>
                <div className="league-position-bar">
                  <div className="lp-label">Tabellenplatz: <strong>{pos}.</strong></div>
                  <div className="lp-bar">
                    <div
                      className="lp-marker"
                      style={{ left: `${Math.max(2, Math.min(96, 2 + ((18 - pos) / 17) * 94))}%` }}
                    />
                    <div className="lp-zone lp-relegation" style={{ width: '22%' }} />
                    <div className="lp-zone lp-midtable"   style={{ width: '44%', left: '22%' }} />
                    <div className="lp-zone lp-europe"     style={{ width: '22%', left: '66%' }} />
                    <div className="lp-zone lp-title"      style={{ width: '12%', left: '88%' }} />
                  </div>
                  <div className="lp-key">
                    <span className="lp-key-item relegation">Abstieg</span>
                    <span className="lp-key-item europe">{division === '2bl' ? 'Aufstieg' : 'Europa'}</span>
                    <span className="lp-key-item title">Meister</span>
                  </div>
                </div>
              </div>

              {table?.length > 0 && <CareerTable table={table} league={division} />}

              {seasonHistory.length > 0 && (
                <div className="career-history-card">
                  <div className="result-section-label">Karriere-Verlauf</div>
                  {seasonHistory.map((s, i) => (
                    <div key={i} className="career-history-row">
                      <span className="ch-season">Saison {s.season}</span>
                      <span className="ch-division">{DIV_LABEL[s.division]}</span>
                      <span className="ch-pos">{s.pos}. Platz</span>
                      <span className="ch-pts">{s.pts} Pkt</span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Transfer ──────────────────────────────────────────────────────────────────

function CareerTransfer({ state, onSwap, onSkip, onStartSeason, onHome }) {
  const { slots, transferOffers, division, seasonNumber, seasonHistory } = state;
  const [activeOffer, setActiveOffer] = useState(null);

  const prevDivision = seasonHistory[seasonHistory.length - 1]?.division;
  const justPromoted  = prevDivision === '2bl' && division === 'bl';
  const justRelegated = prevDivision === 'bl'  && division === '2bl';

  const selectedOffer = activeOffer !== null ? transferOffers[activeOffer] : null;
  const compatSlots   = selectedOffer
    ? slots.filter(s => s.player && canPlayerFillSlot(selectedOffer, s.type))
    : [];

  function handleUseOffer(i) {
    setActiveOffer(prev => prev === i ? null : i);
  }

  function handleSwap(slotId) {
    onSwap(activeOffer, slotId);
    setActiveOffer(null);
  }

  const pending = transferOffers.filter(o => !o.used && !o.skipped).length;

  return (
    <div className="career-screen slide-up">
      <header className="career-transfer-header">
        <div className="career-transfer-header-left">
          <span className="career-eyebrow">KARRIERE · TRANSFERFENSTER</span>
          <h1 className="career-transfer-title">
            Saison {seasonNumber} — {DIV_LABEL[division]}
          </h1>
          {(justPromoted || justRelegated) && (
            <div className={`career-banner career-banner--sm ${justPromoted ? 'career-banner--up' : 'career-banner--down'}`}>
              {justPromoted ? '⬆️  Aufstieg in die Bundesliga!' : '⬇️  Abstieg in die 2. Bundesliga'}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onHome}>Karriere beenden</button>
      </header>

      <div className="career-transfer-layout">

        {/* Left: formation + swap list */}
        <div className="career-transfer-left">
          <div className="result-section-label">Aktuelle Startelf</div>
          <FormationBoard slots={slots} showRatings league={division} />

          {selectedOffer && (
            <div className="career-swap-list fade-in">
              <div className="career-swap-header">
                Wen ersetzen durch <strong>{selectedOffer.name}</strong>?
              </div>
              {compatSlots.length === 0 ? (
                <p className="career-swap-empty">Keine kompatible Position im Kader.</p>
              ) : (
                compatSlots.map(s => (
                  <button key={s.id} className="career-swap-row" onClick={() => handleSwap(s.id)}>
                    <span className="career-swap-pos">{labelDE(s.label)}</span>
                    <span className="career-swap-name">{s.player.name}</span>
                    <span className={`career-swap-rating rating rating-sm ${ratingClass(s.player.displayRating, division)}`}>
                      {s.player.displayRating}
                    </span>
                    <span className="career-swap-arrow">→</span>
                    <span className={`career-swap-rating rating rating-sm ${ratingClass(selectedOffer.seasonRating, division)}`}>
                      {selectedOffer.seasonRating}
                    </span>
                  </button>
                ))
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => setActiveOffer(null)}
              >
                Abbrechen
              </button>
            </div>
          )}
        </div>

        {/* Right: offer cards */}
        <div className="career-transfer-right">
          <div className="result-section-label">
            Angebote — {pending} von {transferOffers.length} ausstehend
          </div>

          {transferOffers.map((offer, i) => (
            <TransferOfferCard
              key={`${offer.id}-${i}`}
              offer={offer}
              division={division}
              isActive={activeOffer === i}
              onUse={() => handleUseOffer(i)}
              onSkip={() => { onSkip(i); if (activeOffer === i) setActiveOffer(null); }}
            />
          ))}

          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 20 }}
            onClick={onStartSeason}
          >
            Saison {seasonNumber} starten →
          </button>
        </div>

      </div>
    </div>
  );
}

function TransferOfferCard({ offer, division, isActive, onUse, onSkip }) {
  const rcls = ratingClass(offer.seasonRating, division);

  if (offer.used || offer.skipped) {
    return (
      <div className={`career-offer-card career-offer-card--done`}>
        <div className={`rating rating-sm ${rcls}`}>{offer.seasonRating}</div>
        <div className="career-offer-info">
          <div className="career-offer-name">{offer.name}</div>
          <div className="career-offer-meta">{offer.spunClub}</div>
        </div>
        <span className={`career-offer-status ${offer.used ? 'career-offer-status--used' : 'career-offer-status--skipped'}`}>
          {offer.used ? '✓' : '—'}
        </span>
      </div>
    );
  }

  return (
    <div className={`career-offer-card ${isActive ? 'career-offer-card--active' : ''}`}>
      <div className={`rating rating-sm ${rcls}`}>{offer.seasonRating}</div>
      <div className="career-offer-info">
        <div className="career-offer-name">{offer.name}</div>
        <div className="career-offer-meta">
          <span>{offer.spunClub}</span>
          <span>
            {offer.positions.slice(0, 2).map(p => (
              <span key={p} className={`player-pos-badge pos-${p}`} style={{ marginLeft: 4 }}>
                {labelDE(p)}
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="career-offer-actions">
        <button className="btn btn-primary btn-sm" onClick={onUse}>
          {isActive ? 'Abbrechen' : 'Einsetzen'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onSkip}>
          Überspringen
        </button>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function CareerCard({ player, league, picked, incompatible, onClick }) {
  const rcls = ratingClass(player.seasonRating, league);
  return (
    <button
      className={`career-card ${picked ? 'career-card--picked' : ''} ${incompatible ? 'career-card--dim' : ''}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className={`rating rating-sm ${rcls}`}>{player.seasonRating}</div>
      <div className="career-card-info">
        <div className="career-card-name">{player.name}</div>
        <div className="career-card-meta">
          <span className="career-card-club">{player.spunClub}</span>
          <span>
            {player.positions.slice(0, 2).map(p => (
              <span key={p} className={`player-pos-badge pos-${p}`} style={{ marginLeft: 3 }}>
                {labelDE(p)}
              </span>
            ))}
          </span>
        </div>
      </div>
      {picked && <span className="career-card-check">✓</span>}
    </button>
  );
}

function CareerMatchLog({ matches, onDone, done }) {
  const [visible, setVisible] = useState(0);
  const listRef   = useRef(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (done || visible >= matches.length) {
      if (!calledRef.current) { calledRef.current = true; onDone?.(); }
      return;
    }
    const progress = visible / Math.max(1, matches.length - 1);
    const delay    = 500 + Math.pow(progress, 2) * 300;
    const t = setTimeout(() => setVisible(v => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible, done, matches.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible]);

  return (
    <div className="match-log">
      <div className="ml-header">
        <span className="ml-matchday">Spieltag {visible} / {matches.length}</span>
      </div>
      <div className="ml-list" ref={listRef}>
        {matches.slice(0, visible).map((m, i) => {
          const isHome = m.home === 'Deine 11';
          const own = isHome ? m.hg : m.ag;
          const opp = isHome ? m.ag : m.hg;
          const res = own > opp ? 'w' : own < opp ? 'l' : 'd';
          const events = (m.events ?? []).filter(e => e.type === 'goal').sort((a, b) => a.minute - b.minute);
          const oppGoals = (m.oppGoals ?? []).sort((a, b) => a.minute - b.minute);
          return (
            <div key={i} className={`ml-card ml-card-${res}`}>
              <div className={`ml-badge ml-badge-${res}`}>{res.toUpperCase()}</div>
              <div className="ml-card-body">
                <div className="ml-card-top">
                  <span className="ml-opponent">{isHome ? m.away : m.home}</span>
                  <span className={`ml-score ml-score-${res}`}>{own}–{opp}</span>
                </div>
                {events.length > 0 && (
                  <div className="ml-scorers ml-scorers-ours">
                    {events.map((e, j) => (
                      <span key={j}>{j > 0 && '  '}{e.scorer.name} {e.minute}'</span>
                    ))}
                  </div>
                )}
                {oppGoals.length > 0 && (
                  <div className="ml-scorers ml-scorers-opp">
                    {oppGoals.map((g, j) => (
                      <span key={j}>{j > 0 && '  '}{g.scorerName ? `${g.scorerName} ${g.minute}'` : `${g.minute}'`}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CareerTable({ table, league }) {
  if (!table?.length) return null;
  const playerRow = table.find(r => r.isPlayer);
  return (
    <div className="league-table">
      <div className="result-section-label" style={{ padding: '0 16px', marginBottom: 10 }}>
        Tabelle
        {playerRow && <span className="lt-player-pos">{playerRow.pos}. Platz</span>}
      </div>
      {table.map(row => {
        const gd = row.GF - row.GA;
        const zone = tableZone(row.pos, league);
        return (
          <div key={row.name} className={`lt-row lt-zone-${zone} ${row.isPlayer ? 'lt-row-player' : ''}`}>
            <span className="lt-pos">{row.pos}</span>
            <span className="lt-name">{row.name}</span>
            <span className="lt-wdl">{row.W}-{row.D}-{row.L}</span>
            <span className="lt-gd">{gd > 0 ? '+' : ''}{gd}</span>
            <span className="lt-pts">{row.pts}</span>
          </div>
        );
      })}
    </div>
  );
}

function tableZone(pos, league) {
  if (league === '2bl') {
    if (pos <= 2)  return 'ucl';
    if (pos >= 17) return 'relegated';
    if (pos === 16) return 'playoff';
    return 'mid';
  }
  if (pos === 1)  return 'champion';
  if (pos <= 4)   return 'ucl';
  if (pos <= 6)   return 'uel';
  if (pos === 16) return 'playoff';
  if (pos >= 17)  return 'relegated';
  return 'mid';
}

function StatPill({ label, value, color }) {
  return (
    <div className="stat-pill">
      <span className="stat-pill-val" style={{ color }}>{value}</span>
      <span className="stat-pill-label">{label}</span>
    </div>
  );
}

function SeasonStat({ label, value, big }) {
  return (
    <div className="season-stat">
      <span className="season-stat-label">{label}</span>
      <span className={`season-stat-val ${big ? 'big' : ''}`}>{value}</span>
    </div>
  );
}

function PitchMini({ slots }) {
  return (
    <div className="pitch-mini">
      <div className="pm-center-line" />
      <div className="pm-center-circle" />
      <div className="pm-box pm-box-top" />
      <div className="pm-box pm-box-bottom" />
      {slots.map(s => (
        <span key={s.id} className="pm-dot" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
          {labelDE(s.label)}
        </span>
      ))}
    </div>
  );
}
