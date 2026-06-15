import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCareerStateClassic } from '../hooks/useCareerStateClassic';
import FormationBoard from './FormationBoard';
import { FORMATIONS, FORMATION_KEYS } from '../data/formations';
import { generateCareerDraftPool, generateTransferMarket, prizeMoney } from '../utils/careerUtils';
import { simulateFullLeague, getAchievements } from '../utils/simulation';
import { FeverCurve, PlayerStats } from './ResultScreen';
import { canPlayerFillSlot, getCompatibleSlots, labelDE } from '../utils/playerUtils';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import { applyGrowthClassic, potentialTier, ovrColorClass } from '../utils/growthUtils';
import './CareerScreen.css';

const DIV_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga' };

const PLAYOFF_OPPONENTS = {
  bl:    ['Hamburger SV', 'FC Schalke 04', 'Hannover 96', '1. FC Köln', 'Hertha BSC',
          'VfB Stuttgart', 'Werder Bremen', 'FC Augsburg', 'Fortuna Düsseldorf', 'Eintracht Braunschweig'],
  '2bl': ['Greuther Fürth', 'FC Heidenheim', 'SV Darmstadt 98', '1. FC Nürnberg',
          'Karlsruher SC', 'FC Hansa Rostock', '1. FC Kaiserslautern', 'SV Sandhausen', 'FC Erzgebirge Aue'],
};

function randGoals() {
  const r = Math.random();
  if (r < 0.15) return 0;
  if (r < 0.42) return 1;
  if (r < 0.67) return 2;
  if (r < 0.84) return 3;
  if (r < 0.94) return 4;
  return 5;
}

function generatePlayoff(myDivision) {
  const oppDivision = myDivision === '2bl' ? 'bl' : '2bl';
  const pool = PLAYOFF_OPPONENTS[oppDivision];
  const opponent = pool[Math.floor(Math.random() * pool.length)];
  const leg1 = { own: randGoals(), opp: randGoals() };
  const leg2 = { own: randGoals(), opp: randGoals() };
  const totalOwn = leg1.own + leg2.own;
  const totalOpp = leg1.opp + leg2.opp;
  const penalties = totalOwn === totalOpp;
  const won = penalties ? Math.random() < 0.5 : totalOwn > totalOpp;
  return { opponent, leg1, leg2, totalOwn, totalOpp, penalties, won };
}

function shortSeason(s) {
  if (!s) return '';
  const parts = s.split('-');
  if (parts.length === 2) return `${parts[0].slice(2)}/${parts[1]}`;
  return s;
}

function getPlayers(div) {
  return div === 'bl' ? BL_PLAYERS : BL2_PLAYERS;
}

export default function CareerClassicScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const career = useCareerStateClassic();
  const { state } = career;
  const [endData, setEndData] = useState(null);
  const [entwicklungData, setEntwicklungData] = useState(null);

  const presetFormation = searchParams.get('formation');
  useEffect(() => {
    if (state.phase === 'setup' && presetFormation && FORMATION_KEYS.includes(presetFormation)) {
      const pool = generateCareerDraftPool(getPlayers('2bl'), FORMATIONS[presetFormation]);
      career.beginDraft(pool, presetFormation);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function runSeason(slots, division) {
    const players = getPlayers(division);
    const { result, table, playerMatches, playerStats, tableHistory } =
      simulateFullLeague(slots, division, players);
    const needsPlayoff = (result.pos === 3 && division === '2bl') || (result.pos === 16 && division === 'bl');
    const playoff = needsPlayoff ? generatePlayoff(division) : null;
    career.setResult({
      ...result,
      achievements: getAchievements(result, slots, division),
      table, playerMatches, playerStats, tableHistory, playoff,
    });
  }

  function handleEndCareer() {
    const currentRecord = state.result
      ? { season: state.seasonNumber, division: state.division, pos: state.result.pos, pts: state.result.pts, GF: state.result.GF ?? 0, GA: state.result.GA ?? 0 }
      : null;
    const history = [...state.seasonHistory, ...(currentRecord ? [currentRecord] : [])];
    const careerStats = mergeStats(state.careerStats, state.result?.playerStats ?? []);
    setEndData({ history, slots: state.slots, allPlayers: state.allPlayers, careerStats });
  }

  function mergeStats(base, playerStats) {
    const next = { ...base };
    for (const p of (playerStats ?? [])) {
      const key = p.id ?? p.name;
      const prev = next[key] ?? { games: 0, goals: 0, assists: 0, cleanSheets: 0, slotLabel: p.slotLabel, slotType: p.slotType };
      next[key] = {
        ...prev,
        name:        p.name,
        games:       prev.games       + (p.games       ?? 34),
        goals:       prev.goals       + (p.goals        ?? 0),
        assists:     prev.assists     + (p.assists      ?? 0),
        cleanSheets: prev.cleanSheets + (p.cleanSheets  ?? 0),
        slotLabel: p.slotLabel,
        slotType:  p.slotType,
      };
    }
    return next;
  }

  if (endData) {
    return (
      <ClassicEndScreen
        data={endData}
        onNewCareer={() => { career.reset(); setEndData(null); }}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'setup') {
    return (
      <ClassicSetup
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
      <ClassicDraft
        state={state}
        onPlace={career.placePlayer}
        onRemove={career.removePlayer}
        onResult={(slots) => runSeason(slots, '2bl')}
        onReset={() => career.reset()}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'result') {
    const pos = state.result?.pos ?? 18;
    const playoff = state.result?.playoff ?? null;
    const directPromoted   = state.division === '2bl' && pos <= 2;
    const directRelegated  = state.division === 'bl'  && pos >= 17;
    const playoffPromoted  = state.division === '2bl' && pos === 3  && playoff?.won === true;
    const playoffRelegated = state.division === 'bl'  && pos === 16 && playoff?.won === false;
    const promoted  = directPromoted  || playoffPromoted;
    const relegated = directRelegated || playoffRelegated;
    const newDivision = promoted ? 'bl' : relegated ? '2bl' : state.division;

    if (entwicklungData) {
      return (
        <ClassicEntwicklung
          growthLog={entwicklungData.growthLog}
          iconLog={entwicklungData.iconLog}
          seasonNumber={state.seasonNumber}
          onContinue={() => {
            career.applyGrowth(entwicklungData.updatedSlots);
            const divPlayers = getPlayers(newDivision);
            const excludeIds = new Set(entwicklungData.updatedSlots.filter(s => s.player).map(s => s.player.id));
            const filled = entwicklungData.updatedSlots.filter(s => s.player);
            const teamAvg = filled.length
              ? Math.round(filled.reduce((sum, s) => sum + (s.player.displayRating ?? 0), 0) / filled.length)
              : null;
            const offers = generateTransferMarket(divPlayers, excludeIds, FORMATIONS[state.formation], teamAvg);
            career.beginTransfer(newDivision, offers);
            setEntwicklungData(null);
          }}
        />
      );
    }

    return (
      <ClassicResult
        state={state}
        promoted={promoted}
        relegated={relegated}
        newDivision={newDivision}
        onContinue={() => {
          const { updatedSlots, growthLog, iconLog } = applyGrowthClassic(state.slots, state.result?.playerStats);
          setEntwicklungData({ updatedSlots, growthLog, iconLog });
        }}
        onEnd={handleEndCareer}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'transfer') {
    return (
      <ClassicTransfer
        state={state}
        onSwap={career.swapOffer}
        onUndo={career.undoSwap}
        onStartSeason={() => runSeason(state.slots, state.division)}
        onEnd={handleEndCareer}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  return null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function ClassicSetup({ formation, onSetFormation, onStart, onBack }) {
  return (
    <div className="career-screen">
      <header className="career-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <div className="career-header-title">
          <span className="career-eyebrow">34-0</span>
          <h1 className="career-main-title">KARRIERE KLASSIK</h1>
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
          <div className="career-info-row">Wähle deine Startelf aus 30 zufälligen 2.-Liga-Spielern</div>
          <div className="career-info-row">Platz 1 oder 2: Aufstieg in die Bundesliga</div>
          <div className="career-info-row">Nach jeder Saison: 5 Transferangebote zum direkten Einsetzen</div>
        </div>

        <button className="start-btn" onClick={onStart}>
          Karriere starten →
        </button>
      </div>
    </div>
  );
}

// ── Draft ─────────────────────────────────────────────────────────────────────

function ClassicDraft({ state, onPlace, onRemove, onResult, onReset, onHome }) {
  const { slots, draftPool, formation } = state;
  const [slotPickTarget, setSlotPickTarget] = useState(null);
  const [posFilter, setPosFilter] = useState('');

  const formationSlots  = slots.filter(s => s.type !== 'BENCH');
  const filledFormation = formationSlots.filter(s => s.player !== null).length;
  const placedIds       = new Set(slots.filter(s => s.player).map(s => s.player.id));
  const playerSlotMap   = Object.fromEntries(slots.filter(s => s.player).map(s => [s.player.id, s.id]));
  const unplacedPool    = draftPool.filter(p => !placedIds.has(p.id));
  const openFormSlots   = formationSlots.filter(s => s.player === null);
  const stuckSlots      = openFormSlots.filter(slot =>
    !unplacedPool.some(p => canPlayerFillSlot(p, slot.type))
  );

  function handleCardClick(player) {
    if (placedIds.has(player.id)) { onRemove(playerSlotMap[player.id]); return; }
    const compat = getCompatibleSlots(player, openFormSlots);
    if (compat.length) {
      if (compat.length === 1) { commit(compat[0].id, player); return; }
      setSlotPickTarget({ player, compat, offRole: false });
      return;
    }
    if (stuckSlots.length) {
      if (stuckSlots.length === 1) { commit(stuckSlots[0].id, player); return; }
      setSlotPickTarget({ player, compat: stuckSlots, offRole: true });
    }
  }

  function commit(slotId, player) {
    onPlace(slotId, player, player.seasonRating);
    setSlotPickTarget(null);
  }

  const poolFiltered = draftPool.filter(p => !posFilter || p.positions.includes(posFilter));

  return (
    <div className="career-screen">
      <header className="career-draft-header">
        <div className="career-draft-header-left">
          <button className="btn btn-ghost btn-sm draft-nav-btn" onClick={() => window.confirm('Draft abbrechen?') && onHome()}>
            ← <span className="draft-nav-label">Menü</span>
          </button>
          <span className="career-draft-title">KARRIERE KLASSIK — SAISON 1 — 2. BUNDESLIGA</span>
          <span className="badge badge-muted">{FORMATIONS[formation].name}</span>
        </div>
        <div className="career-draft-header-right">
          <span className="career-draft-progress">{filledFormation} / 11</span>
          <button className="btn btn-ghost btn-sm" onClick={() => window.confirm('Draft neu starten?') && onReset()}>↺</button>
        </div>
      </header>

      <div className="career-draft-layout">
        <div className="career-draft-left">
          <FormationBoard slots={formationSlots} showRatings league="2bl" />
        </div>
        <div className="career-draft-right">
          <div className="career-pool-label">Wähle deine Startelf</div>
          {stuckSlots.length > 0 && (
            <div className="career-stuck-banner">
              Keine Spieler mehr für {stuckSlots.map(s => labelDE(s.label)).join(', ')} — wähle einen Ersatz
            </div>
          )}
          {filledFormation === 11 && (
            <button className="btn btn-primary btn-lg career-draft-start-btn-top" onClick={() => onResult(slots)}>
              Saison starten →
            </button>
          )}
          <div className="career-pos-filters">
            <button className={`career-filter-btn${posFilter === '' ? ' career-filter-btn-active' : ''}`} onClick={() => setPosFilter('')}>Alle</button>
            {[...new Set(formationSlots.map(s => s.type))].filter(p => draftPool.some(pl => pl.positions.includes(p))).map(p => (
              <button key={p} className={`career-filter-btn${posFilter === p ? ' career-filter-btn-active' : ''}`} onClick={() => setPosFilter(posFilter === p ? '' : p)}>{labelDE(p)}</button>
            ))}
          </div>
          <div className="career-pool-grid">
            {poolFiltered.map(player => {
              const picked = placedIds.has(player.id);
              const compat = getCompatibleSlots(player, openFormSlots);
              const canOffRole = !picked && !compat.length && stuckSlots.length > 0;
              const incompatible = !picked && !compat.length && !canOffRole;
              return (
                <CareerCard
                  key={player.id}
                  player={player}
                  league="2bl"
                  picked={picked}
                  incompatible={incompatible}
                  offRole={canOffRole}
                  onClick={() => handleCardClick(player)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {filledFormation === 11 && (
        <div className="career-draft-sticky-bar">
          <div className="career-draft-sticky-inner">
            <button className="btn btn-primary btn-lg career-draft-sticky-btn" onClick={() => onResult(slots)}>
              Saison starten →
            </button>
          </div>
        </div>
      )}

      {slotPickTarget && (
        <div className="overlay">
          <div className="overlay-card">
            {slotPickTarget.offRole ? (
              <>
                <h3 style={{ marginBottom: 6 }}>Außerhalb der Position</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  <strong>{slotPickTarget.player.name}</strong> ist für diese Position nicht vorgesehen.
                </p>
              </>
            ) : (
              <>
                <h3 style={{ marginBottom: 6 }}>Position wählen</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  Wo soll <strong>{slotPickTarget.player.name}</strong> spielen?
                </p>
              </>
            )}
            <div className="slot-choice-list">
              {slotPickTarget.compat.map(slot => (
                <button key={slot.id} className="btn btn-secondary slot-choice-btn" onClick={() => commit(slot.id, slotPickTarget.player)}>
                  {labelDE(slot.label)}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setSlotPickTarget(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────────

function ClassicResult({ state, promoted, relegated, newDivision, onContinue, onEnd, onHome }) {
  const { result, division, seasonNumber, seasonHistory, slots } = state;
  const playoff = result?.playoff ?? null;
  const [logDone, setLogDone] = useState(!(result?.playerMatches?.length));
  const [tableTab, setTableTab] = useState('table');
  const { W, D, L, GF, GA, pts, pos = 18, table, playerMatches, tableHistory, playerStats } = result ?? {};
  const GD = (GF ?? 0) - (GA ?? 0);

  return (
    <div className="career-screen">
      <header className="career-result-header">
        <div className="career-result-header-inner">
          <div>
            <span className="career-eyebrow">KARRIERE KLASSIK · SAISON {seasonNumber}</span>
            <h1 className="career-result-title">Saison abgeschlossen</h1>
            <div className="career-result-div-badge">{DIV_LABEL[division]}</div>
          </div>
          {logDone && (
            <div className="career-result-actions">
              <button className="btn btn-primary" onClick={onContinue}>Transferfenster →</button>
              <button className="btn btn-ghost btn-sm" onClick={onEnd}>Karriere beenden</button>
            </div>
          )}
        </div>
      </header>

      <div className="career-result-body">
        <div className="career-result-left">
          <div className="result-section-label">Deine 11 — {state.formation}</div>
          <FormationBoard slots={slots.filter(s => s.type !== 'BENCH')} showRatings league={division} />
        </div>
        <div className="career-result-right">
          {playerMatches?.length > 0 && (
            <CareerMatchLog matches={playerMatches} onDone={() => setLogDone(true)} done={logDone} />
          )}
          {logDone && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!playoff && (promoted || relegated) && (
                <div className={`career-banner ${promoted ? 'career-banner--up' : 'career-banner--down'}`}>
                  {promoted
                    ? `⬆️  Aufstieg! Nächste Saison in der ${DIV_LABEL[newDivision]}.`
                    : `⬇️  Abstieg. Nächste Saison in der ${DIV_LABEL[newDivision]}.`}
                </div>
              )}
              <div className="career-stats-card">
                <div className="result-section-label">Saison {seasonNumber} — {DIV_LABEL[division]}</div>
                <div className="season-wdl">
                  <StatPill label="S" value={W} color="var(--green)" />
                  <StatPill label="U" value={D} color="var(--text-muted)" />
                  <StatPill label="N" value={L} color="var(--red)" />
                </div>
                <div className="season-details">
                  <SeasonStat label="Punkte" value={pts} big />
                  <SeasonStat label="Tore" value={GF} />
                  <SeasonStat label="Gegentore" value={GA} />
                  <SeasonStat label="Tordifferenz" value={`${GD > 0 ? '+' : ''}${GD}`} />
                </div>
                <div className="league-position-bar">
                  <div className="lp-label">Tabellenplatz: <strong>{pos}.</strong></div>
                  <div className="lp-bar">
                    <div className="lp-marker" style={{ left: `${Math.max(2, Math.min(96, 2 + ((18 - pos) / 17) * 94))}%` }} />
                    <div className="lp-zone lp-relegation" style={{ width: '22%' }} />
                    <div className="lp-zone lp-midtable" style={{ width: '44%', left: '22%' }} />
                    <div className="lp-zone lp-europe" style={{ width: '22%', left: '66%' }} />
                    <div className="lp-zone lp-title" style={{ width: '12%', left: '88%' }} />
                  </div>
                  <div className="lp-key">
                    <span className="lp-key-item relegation">Abstieg</span>
                    <span className="lp-key-item europe">{division !== 'bl' ? 'Aufstieg' : 'Europa'}</span>
                    <span className="lp-key-item title">Meister</span>
                  </div>
                </div>
              </div>
              {table?.length > 0 && (
                <div>
                  <div className="table-tabs">
                    <button className={`tab-btn${tableTab === 'table' ? ' tab-btn-active' : ''}`} onClick={() => setTableTab('table')}>Tabelle</button>
                    {tableHistory?.length > 0 && (
                      <button className={`tab-btn${tableTab === 'curve' ? ' tab-btn-active' : ''}`} onClick={() => setTableTab('curve')}>Fieberkurve</button>
                    )}
                  </div>
                  {tableTab === 'table'
                    ? <CareerTable table={table} league={division} />
                    : <FeverCurve tableHistory={tableHistory} league={division} />}
                </div>
              )}
              <PlayerStats stats={playerStats} />
              {playoff && <CareerPlayoffCard playoff={playoff} division={division} />}
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
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={onContinue}>
                Transferfenster →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Transfer (classic swap) ───────────────────────────────────────────────────

function ClassicTransfer({ state, onSwap, onUndo, onStartSeason, onEnd }) {
  const { slots, transferOffers, division, seasonNumber, seasonHistory, swapHistory } = state;
  const [activeOffer, setActiveOffer] = useState(null);

  const prevDivision  = seasonHistory[seasonHistory.length - 1]?.division;
  const justPromoted  = prevDivision === '2bl' && division === 'bl';
  const justRelegated = prevDivision === 'bl'  && division === '2bl';

  const selectedOffer = activeOffer !== null ? transferOffers[activeOffer] : null;
  const compatSlots   = selectedOffer
    ? slots.filter(s => s.player && canPlayerFillSlot(selectedOffer, s.type))
    : [];

  function handleSwap(slotId) {
    const slot = slots.find(s => s.id === slotId);
    if (slot?.player?.isIcon && !window.confirm(`${slot.player.name} ist eine Legende. Wirklich entfernen?`)) return;
    onSwap(activeOffer, slotId);
    setActiveOffer(null);
  }

  const usedCount = transferOffers.filter(o => o.used).length;

  return (
    <div className="career-screen">
      <header className="career-transfer-header">
        <div className="career-transfer-header-left">
          <span className="career-eyebrow">KARRIERE KLASSIK · TRANSFERFENSTER</span>
          <h1 className="career-transfer-title">Saison {seasonNumber} — {DIV_LABEL[division]}</h1>
          {(justPromoted || justRelegated) && (
            <div className={`career-banner career-banner--sm ${justPromoted ? 'career-banner--up' : 'career-banner--down'}`}>
              {justPromoted ? '⬆️  Aufstieg in die Bundesliga!' : '⬇️  Abstieg in die 2. Bundesliga'}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEnd}>Karriere beenden</button>
      </header>

      <div className="career-transfer-layout">
        <div className="career-transfer-left">
          <div className="result-section-label">Aktuelle Startelf</div>
          <FormationBoard slots={slots.filter(s => s.type !== 'BENCH')} showRatings league={division} />
          {selectedOffer && (
            <div className="career-swap-list fade-in">
              <div className="career-swap-header">
                Wen ersetzen durch <strong>{selectedOffer.name}</strong>?
              </div>
              {compatSlots.length === 0 ? (
                <p className="career-swap-empty">Keine kompatible Position im Kader.</p>
              ) : (
                compatSlots.map(s => (
                  <button
                    key={s.id}
                    className={`career-swap-row${s.player.isIcon ? ' career-swap-row--icon' : ''}`}
                    onClick={() => handleSwap(s.id)}
                  >
                    <span className="career-swap-pos">{labelDE(s.label)}</span>
                    <span className="career-swap-name">{s.player.name}</span>
                    {s.player.isIcon && <span className="career-swap-icon-tag">IKONE</span>}
                    <div className="career-card-rating-wrap">
                      <span className={`career-swap-rating rating rating-sm${s.player.isIcon ? ' career-swap-rating--icon' : ` ${ovrColorClass(s.player.displayRating)}`}`}>
                        {s.player.displayRating}
                      </span>
                      {!s.player.isIcon && potentialTier(s.player) && (
                        <span className={`career-card-potential ${ovrColorClass(s.player.potential)}`}>→{s.player.potential}</span>
                      )}
                    </div>
                    <span className="career-swap-arrow">→</span>
                    <div className="career-card-rating-wrap">
                      <span className={`career-swap-rating rating rating-sm ${ovrColorClass(selectedOffer.seasonRating)}`}>
                        {selectedOffer.seasonRating}
                      </span>
                      {potentialTier(selectedOffer) && (
                        <span className={`career-card-potential ${ovrColorClass(selectedOffer.potential)}`}>→{selectedOffer.potential}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={() => setActiveOffer(null)}>
                Abbrechen
              </button>
            </div>
          )}
        </div>

        <div className="career-transfer-right">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="result-section-label" style={{ marginBottom: 0 }}>
              Angebote — {usedCount} von {transferOffers.length} eingesetzt
            </div>
            {swapHistory.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={onUndo}>↩ Rückgängig</button>
            )}
          </div>

          {transferOffers.map((offer, i) => (
            <ClassicOfferCard
              key={`${offer.id}-${i}`}
              offer={offer}
              division={division}
              isActive={activeOffer === i}
              onUse={() => setActiveOffer(prev => prev === i ? null : i)}
            />
          ))}

          <button className="btn btn-primary btn-lg career-transfer-inline-btn" style={{ width: '100%', marginTop: 20 }} onClick={onStartSeason}>
            Saison {seasonNumber} starten →
          </button>
        </div>
      </div>

      <div className="career-transfer-sticky-bar">
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={onStartSeason}>
          Saison {seasonNumber} starten →
        </button>
      </div>
    </div>
  );
}

function ClassicOfferCard({ offer, division, isActive, onUse }) {
  const rcls = ovrColorClass(offer.seasonRating);
  const tier = potentialTier(offer);

  if (offer.used) {
    return (
      <div className={`career-offer-card career-offer-card--done${offer.isGem ? ' career-offer-card--gem' : ''}`}>
        <div className="career-card-rating-wrap">
          <div className={`rating rating-sm ${rcls}`}>{offer.seasonRating}</div>
          {tier && <span className={`career-card-potential ${ovrColorClass(offer.potential)}`}>→{offer.potential}</span>}
        </div>
        <div className="career-offer-info">
          <div className="career-offer-name">{offer.name}{offer.isGem && <span className="career-gem-badge">◆ GEM</span>}</div>
          <div className="career-offer-meta">{offer.age != null && <span className="career-offer-age">{offer.age} J.</span>}<span>{offer.spunClub}</span><span>{shortSeason(offer.spunSeason)}</span></div>
        </div>
        <span className="career-offer-status career-offer-status--used">✓</span>
      </div>
    );
  }

  return (
    <div className={`career-offer-card${isActive ? ' career-offer-card--active' : ''}${offer.isGem ? ' career-offer-card--gem' : ''}`}>
      <div className="career-card-rating-wrap">
        <div className={`rating rating-sm ${rcls}`}>{offer.seasonRating}</div>
        {tier && <span className={`career-card-potential ${ovrColorClass(offer.potential)}`}>→{offer.potential}</span>}
      </div>
      <div className="career-offer-info">
        <div className="career-offer-name">{offer.name}{offer.isGem && <span className="career-gem-badge">◆ GEM</span>}</div>
        <div className="career-offer-meta">
          {offer.age != null && <span className="career-offer-age">{offer.age} J.</span>}
          <span>{offer.spunClub}</span>
          <span>{shortSeason(offer.spunSeason)}</span>
          <span>{offer.positions.map(p => <span key={p} className={`player-pos-badge pos-${p}`} style={{ marginLeft: 4 }}>{labelDE(p)}</span>)}</span>
        </div>
      </div>
      <div className="career-offer-actions">
        <button className="btn btn-primary btn-sm" onClick={onUse}>{isActive ? 'Abbrechen' : 'Einsetzen'}</button>
      </div>
    </div>
  );
}

// ── Entwicklung ───────────────────────────────────────────────────────────────

function ClassicEntwicklung({ growthLog, iconLog = [], seasonNumber, onContinue }) {
  const sorted = [...growthLog].sort((a, b) => b.gain - a.gain);
  const hasContent = sorted.length > 0 || iconLog.length > 0;

  return (
    <div className="career-screen">
      <header className="career-header">
        <div />
        <div className="career-header-title">
          <span className="career-eyebrow">KARRIERE KLASSIK · SAISON {seasonNumber}</span>
          <h1 className="career-main-title">ENTWICKLUNG</h1>
          <p className="career-main-sub">Spieler die sich diese Saison verbessert haben</p>
        </div>
        <div />
      </header>
      <div className="entw-body">
        {iconLog.length > 0 && (
          <div className="entw-icon-section">
            <div className="entw-icon-header">Upgrade zur Legende</div>
            <div className="entw-icon-cards">
              {iconLog.map((entry, i) => (
                <div key={i} className="entw-icon-card">
                  <div className="entw-icon-card-stars">★ ★ ★</div>
                  <div className="entw-icon-card-label">IKONE</div>
                  <div className="entw-icon-card-ovr">{entry.newRating}</div>
                  <div className="entw-icon-card-pos">{labelDE(entry.slotType)}</div>
                  <div className="entw-icon-card-name">{entry.name}</div>
                  <div className="entw-icon-card-seasons">{entry.seasons} Saisons im Kader</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!hasContent ? (
          <div className="entw-empty">Keine Entwicklung diese Saison.</div>
        ) : sorted.length > 0 && (
          <div className="entw-list">
            {sorted.map((entry, i) => (
              <div key={i} className="entw-row">
                <span className="entw-gain-badge">+{entry.gain}</span>
                <span className="entw-pos">{labelDE(entry.slotType)}</span>
                <span className="entw-name">{entry.name}</span>
                <span className="entw-ratings">
                  <span className="entw-old">{entry.oldRating}</span>
                  <span className="entw-arrow">→</span>
                  <span className="entw-new">{entry.newRating}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary entw-cta" onClick={onContinue}>Transferfenster →</button>
      </div>
    </div>
  );
}

// ── End Screen ────────────────────────────────────────────────────────────────

function ClassicEndScreen({ data, onNewCareer, onHome }) {
  const { history, slots = [], careerStats = {} } = data;
  const totalSeasons = history.length;
  const totalPts = history.reduce((sum, s) => sum + (s.pts ?? 0), 0);
  const totalGF  = history.reduce((sum, s) => sum + (s.GF  ?? 0), 0);
  const totalGA  = history.reduce((sum, s) => sum + (s.GA  ?? 0), 0);
  const lastDivision = history[history.length - 1]?.division ?? '2bl';
  const [sortCol, setSortCol] = useState('games');
  const [sortDir, setSortDir] = useState(-1);

  function handleSort(col) {
    if (col === sortCol) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(-1); }
  }

  const statsList = Object.values(careerStats).sort((a, b) => {
    const diff = (a[sortCol] ?? 0) - (b[sortCol] ?? 0);
    return diff !== 0 ? diff * sortDir : 0;
  });

  const hasGK = statsList.some(p => p.slotType === 'GK');

  return (
    <div className="career-screen">
      <header className="career-header">
        <button className="btn btn-ghost btn-sm" onClick={onHome}>← Menü</button>
        <div className="career-header-title">
          <span className="career-eyebrow">34-0</span>
          <h1 className="career-main-title">KARRIERE BEENDET</h1>
        </div>
        <div />
      </header>
      <div className="career-end-body">
        <div className="career-end-stats">
          <div className="career-end-stat"><div className="career-end-stat-val">{totalSeasons}</div><div className="career-end-stat-label">Saisons</div></div>
          {totalPts > 0 && <div className="career-end-stat"><div className="career-end-stat-val">{totalPts}</div><div className="career-end-stat-label">Punkte</div></div>}
          {(totalGF > 0 || totalGA > 0) && <div className="career-end-stat"><div className="career-end-stat-val">{totalGF}:{totalGA}</div><div className="career-end-stat-label">Tore</div></div>}
        </div>
        {slots.some(s => s.player) && (
          <div className="career-history-card career-end-squad">
            <div className="result-section-label">Letzte Startelf</div>
            <FormationBoard slots={slots.filter(s => s.type !== 'BENCH')} showRatings league={lastDivision} />
          </div>
        )}
        {history.length > 0 && (
          <div className="career-history-card">
            <div className="result-section-label">Karriere-Verlauf</div>
            {history.map((s, i) => (
              <div key={i} className="career-history-row">
                <span className="ch-season">Saison {s.season}</span>
                <span className="ch-division">{DIV_LABEL[s.division]}</span>
                <span className="ch-pos">{s.pos}. Platz</span>
                <span className="ch-pts">{s.pts} Pkt</span>
              </div>
            ))}
          </div>
        )}
        {statsList.length > 0 && (
          <div className="career-history-card ces-card">
            <div className="result-section-label">Spieler-Statistiken</div>
            <div className="ces-header">
              <span className="ces-name" />
              {[['games','Sp'],['goals','T'],['assists','V']].map(([col, label]) => (
                <button key={col} className={`ces-col ces-col-label ces-sort-btn${sortCol === col ? ' ces-sort-active' : ''}`} onClick={() => handleSort(col)}>
                  {label}{sortCol === col ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
                </button>
              ))}
              {hasGK && (
                <button className={`ces-col ces-col-label ces-ww ces-sort-btn${sortCol === 'cleanSheets' ? ' ces-sort-active' : ''}`} onClick={() => handleSort('cleanSheets')}>
                  WW{sortCol === 'cleanSheets' ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
                </button>
              )}
            </div>
            {statsList.map((p, i) => (
              <div key={`${p.name}-${i}`} className="ces-row">
                <span className="ces-name">
                  <span className="ces-pos">{labelDE(p.slotLabel)}</span>
                  <span className="ces-pname">{p.name}</span>
                </span>
                <span className="ces-col">{p.games}</span>
                <span className="ces-col">{p.goals || '—'}</span>
                <span className="ces-col">{p.assists || '—'}</span>
                {hasGK && <span className="ces-col ces-ww">{p.slotType === 'GK' ? (p.cleanSheets || '—') : ''}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="career-end-actions">
          <button className="btn btn-primary btn-lg" onClick={onNewCareer}>Neue Karriere</button>
          <button className="btn btn-ghost" onClick={onHome}>Startseite</button>
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function CareerCard({ player, league, picked, incompatible, offRole, onClick }) {
  const rcls = ovrColorClass(player.seasonRating);
  const tier = potentialTier(player);
  const cls = ['career-card', picked ? 'career-card--picked' : '', incompatible ? 'career-card--dim' : '', offRole ? 'career-card--offrole' : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick}>
      <div className="career-card-rating-wrap">
        <div className={`rating rating-sm ${rcls}`}>{player.seasonRating}</div>
        {tier && <span className={`career-card-potential ${ovrColorClass(player.potential)}`}>→{player.potential}</span>}
      </div>
      <div className="career-card-info">
        <div className="career-card-name">{player.name}</div>
        <div className="career-card-meta">
          <span className="career-card-club">{player.spunClub}</span>
          <span className="career-card-season">{shortSeason(player.spunSeason)}</span>
          <span>{player.positions.map(p => <span key={p} className={`player-pos-badge pos-${p}`} style={{ marginLeft: 3 }}>{labelDE(p)}</span>)}</span>
        </div>
      </div>
      {picked && <span className="career-card-check">✓</span>}
      {offRole && <span className="career-card-offrole-badge">!</span>}
    </button>
  );
}

function CareerMatchLog({ matches, onDone, done }) {
  const [visible, setVisible] = useState(0);
  const listRef = useRef(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (done || visible >= matches.length) {
      if (!calledRef.current) { calledRef.current = true; onDone?.(); }
      return;
    }
    const progress = visible / Math.max(1, matches.length - 1);
    const delay = 500 + Math.pow(progress, 2) * 300;
    const t = setTimeout(() => setVisible(v => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible, done, matches.length]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [visible]);

  return (
    <div className="match-log">
      <div className="ml-header">
        <span className="ml-matchday">Spieltag {visible} / {matches.length}</span>
        {visible < matches.length && (
          <button className="ml-skip-btn" onClick={() => setVisible(matches.length)}>Überspringen</button>
        )}
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
                {events.length > 0 && <div className="ml-scorers ml-scorers-ours">{events.map((e, j) => <span key={j}>{j > 0 && '  '}{e.scorer.name} {e.minute}'</span>)}</div>}
                {oppGoals.length > 0 && <div className="ml-scorers ml-scorers-opp">{oppGoals.map((g, j) => <span key={j}>{j > 0 && '  '}{g.scorerName ? `${g.scorerName} ${g.minute}'` : `${g.minute}'`}</span>)}</div>}
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
        Tabelle{playerRow && <span className="lt-player-pos">{playerRow.pos}. Platz</span>}
      </div>
      {table.map(row => {
        const gd = row.GF - row.GA;
        const zone = league === '2bl'
          ? (row.pos <= 2 ? 'ucl' : row.pos === 3 ? 'playoff-up' : row.pos >= 17 ? 'relegated' : row.pos === 16 ? 'playoff' : 'mid')
          : (row.pos === 1 ? 'champion' : row.pos <= 4 ? 'ucl' : row.pos <= 6 ? 'uel' : row.pos === 16 ? 'playoff' : row.pos >= 17 ? 'relegated' : 'mid');
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

function CareerPlayoffCard({ playoff, division }) {
  const { opponent, leg1, leg2, totalOwn, totalOpp, penalties, won } = playoff;
  const isPromotion = division === '2bl';
  const outcomeText = isPromotion ? (won ? 'Aufstieg!' : 'Kein Aufstieg') : (won ? 'Klassenerhalt!' : 'Abstieg');
  const outcomeClass = won ? 'career-playoff-outcome--won' : 'career-playoff-outcome--lost';
  return (
    <div className={`career-playoff-card ${won ? 'career-playoff--won' : 'career-playoff--lost'}`}>
      <div className="career-playoff-header">
        <span className="career-playoff-label">Relegation</span>
        <span className="career-playoff-opponent">{opponent}</span>
      </div>
      <div className="career-playoff-legs">
        <div className="career-playoff-leg"><span className="career-playoff-leg-name">Hinspiel</span><span className="career-playoff-leg-score">{leg1.own} – {leg1.opp}</span></div>
        <div className="career-playoff-divider" />
        <div className="career-playoff-leg"><span className="career-playoff-leg-name">Rückspiel</span><span className="career-playoff-leg-score">{leg2.own} – {leg2.opp}</span></div>
      </div>
      <div className="career-playoff-footer">
        <span className="career-playoff-agg">Gesamt {totalOwn} – {totalOpp}{penalties ? ' (n.E.)' : ''}</span>
        <span className={`career-playoff-outcome ${outcomeClass}`}>{outcomeText}</span>
      </div>
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
        <span key={s.id} className="pm-dot" style={{ left: `${s.x}%`, top: `${s.y}%` }}>{labelDE(s.label)}</span>
      ))}
    </div>
  );
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
