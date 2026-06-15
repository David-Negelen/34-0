import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerState } from '../hooks/useCareerState';
import FormationBoard from './FormationBoard';
import { FORMATIONS, FORMATION_KEYS } from '../data/formations';
import { generateCareerDraftPool, generateTransferMarket, generateOffersForType, generateIncomingBids, prizeMoney } from '../utils/careerUtils';
import { simulateFullLeague, getAchievements } from '../utils/simulation';
import { FeverCurve, PlayerStats } from './ResultScreen';
import { canPlayerFillSlot, getCompatibleSlots, labelDE } from '../utils/playerUtils';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import { applyGrowth, potentialTier, ovrColorClass } from '../utils/growthUtils';
import './CareerScreen.css';

const DIV_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga' };

const PLAYOFF_OPPONENTS = {
  bl:  ['Hamburger SV', 'FC Schalke 04', 'Hannover 96', '1. FC Köln', 'Hertha BSC',
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

export default function CareerScreen() {
  const navigate = useNavigate();
  const career = useCareerState();
  const { state } = career;
  const [endData, setEndData] = useState(null);
  const [entwicklungData, setEntwicklungData] = useState(null);
  function runSeason(slots, division, seasonNumber) {
    const players = getPlayers(division);
    const { result, table, playerMatches, playerStats, tableHistory } =
      simulateFullLeague(slots, division, players);
    const needsPlayoff = (result.pos === 3 && division === '2bl') ||
                         (result.pos === 16 && division === 'bl');
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
    // Merge last season's stats (BEGIN_TRANSFER not yet called when ending from result screen)
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
        id:          p.id,
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
      <CareerEndScreen
        data={endData}
        onNewCareer={() => { career.reset(); setEndData(null); }}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

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
        onRemove={career.removePlayer}
        onResult={(slots) => runSeason(slots, '2bl', state.seasonNumber)}
        onReset={() => career.reset()}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'result') {
    const pos      = state.result?.pos ?? 18;
    const playoff  = state.result?.playoff ?? null;
    const directPromoted  = state.division === '2bl' && pos <= 2;
    const directRelegated = state.division === 'bl'  && pos >= 17;
    const playoffPromoted  = state.division === '2bl' && pos === 3  && playoff?.won === true;
    const playoffRelegated = state.division === 'bl'  && pos === 16 && playoff?.won === false;
    const promoted  = directPromoted  || playoffPromoted;
    const relegated = directRelegated || playoffRelegated;
    const newDivision = promoted ? 'bl' : relegated ? '2bl' : state.division;

    if (entwicklungData) {
      return (
        <CareerEntwicklung
          growthLog={entwicklungData.growthLog}
          retirements={entwicklungData.retirements}
          seasonNumber={state.seasonNumber}
          onContinue={() => {
            career.applyGrowth(entwicklungData.updatedSlots);
            const currentYear = (state.careerStartYear ?? 2000) + state.seasonNumber - 1;
            const divPlayers = getPlayers(newDivision);
            const filled = entwicklungData.updatedSlots.filter(s => s.player && s.type !== 'BENCH');
            const excludeIds = new Set(entwicklungData.updatedSlots.filter(s => s.player).map(s => s.player.id));
            const teamAvg = filled.length
              ? Math.round(filled.reduce((sum, s) => sum + (s.player.displayRating ?? 0), 0) / filled.length)
              : null;
            const offers = generateTransferMarket(divPlayers, excludeIds, FORMATIONS[state.formation], teamAvg, currentYear);
            const prize = prizeMoney(state.result?.pos ?? 18, state.division);
            const incomingBids = generateIncomingBids(entwicklungData.updatedSlots, currentYear);
            career.beginTransfer(newDivision, offers, entwicklungData.retirements, prize, incomingBids);
            setEntwicklungData(null);
          }}
        />
      );
    }

    return (
      <CareerResult
        state={state}
        promoted={promoted}
        relegated={relegated}
        onContinue={() => {
          const currentYear = (state.careerStartYear ?? 2000) + state.seasonNumber - 1;
          const { updatedSlots, growthLog, retirements } = applyGrowth(state.slots, state.result?.playerStats, state.careerStats, currentYear);
          setEntwicklungData({ updatedSlots, growthLog, retirements });
        }}
        onEnd={handleEndCareer}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'transfer') {
    function handleSell(playerId, amount) {
      const bid = state.incomingBids.find(b => b.playerId === playerId);
      const slotType = bid?.slotType;
      const divPlayers = getPlayers(state.division);
      const currentYear = (state.careerStartYear ?? 2000) + state.seasonNumber - 1;
      const filled = state.slots.filter(s => s.player && s.type !== 'BENCH' && s.player.id !== playerId);
      const teamAvg = filled.length
        ? Math.round(filled.reduce((sum, s) => sum + (s.player.displayRating ?? 0), 0) / filled.length)
        : null;
      const excludeIds = new Set(state.slots.filter(s => s.player && s.player.id !== playerId).map(s => s.player.id));
      const newOffers = slotType ? generateOffersForType(divPlayers, excludeIds, slotType, teamAvg, currentYear) : [];
      career.sellPlayer(playerId, amount, newOffers);
    }

    return (
      <CareerTransfer
        state={state}
        onBuy={career.buyOffer}
        onUndo={career.undoBuy}
        onMove={career.moveInSquad}
        onSell={handleSell}
        onRelease={career.removePlayer}
        onChangeFormation={career.changeFormation}
        onStartSeason={() => runSeason(state.slots, state.division, state.seasonNumber)}
        onEnd={handleEndCareer}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  return null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function CareerSetup({ formation, onSetFormation, onStart, onBack }) {
  return (
    <div className="career-screen">
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
          <div className="career-info-row">Wähle deine Startelf aus 30 zufälligen 2.-Liga-Spielern</div>
          <div className="career-info-row">Platz 1 oder 2: Aufstieg in die Bundesliga</div>
          <div className="career-info-row">Nach jeder Saison: 5 neue Spielerangebote</div>
        </div>

        <button className="start-btn" onClick={onStart}>
          Karriere starten →
        </button>
      </div>
    </div>
  );
}

// ── Draft ─────────────────────────────────────────────────────────────────────


function CareerDraft({ state, onPlace, onRemove, onResult, onReset, onHome }) {
  const { slots, draftPool, formation } = state;
  const [slotPickTarget, setSlotPickTarget] = useState(null);
  const [posFilter, setPosFilter] = useState('');

  const formationSlots = slots.filter(s => s.type !== 'BENCH');
  const filledFormation = formationSlots.filter(s => s.player !== null).length;

  const placedIds     = new Set(slots.filter(s => s.player).map(s => s.player.id));
  const playerSlotMap = Object.fromEntries(slots.filter(s => s.player).map(s => [s.player.id, s.id]));
  const unplacedPool  = draftPool.filter(p => !placedIds.has(p.id));

  const openFormSlots = formationSlots.filter(s => s.player === null);
  const stuckSlots    = openFormSlots.filter(slot =>
    !unplacedPool.some(p => canPlayerFillSlot(p, slot.type))
  );

  function handleCardClick(player) {
    if (placedIds.has(player.id)) {
      onRemove(playerSlotMap[player.id]);
      return;
    }
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
          <button
            className="btn btn-ghost btn-sm draft-nav-btn"
            onClick={() => window.confirm('Draft abbrechen und zum Menü?') && onHome()}
          >← <span className="draft-nav-label">Menü</span></button>
          <span className="career-draft-title">KARRIERE — SAISON 1 — 2. BUNDESLIGA</span>
          <span className="badge badge-muted">{FORMATIONS[formation].name}</span>
        </div>
        <div className="career-draft-header-right">
          <span className="career-draft-progress">{filledFormation} / 11</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => window.confirm('Draft neu starten?') && onReset()}
          >↺</button>
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
                <button
                  key={slot.id}
                  className="btn btn-secondary slot-choice-btn"
                  onClick={() => commit(slot.id, slotPickTarget.player)}
                >
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

function CareerResult({ state, promoted, relegated, onContinue, onEnd, onHome }) {
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
            <span className="career-eyebrow">KARRIERE · SAISON {seasonNumber}</span>
            <h1 className="career-result-title">Saison abgeschlossen</h1>
            <div className="career-result-div-badge">{DIV_LABEL[division]}</div>
          </div>
          {logDone && (
            <div className="career-result-actions">
              <button className="btn btn-primary" onClick={onContinue}>
                Transferfenster →
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onEnd}>
                Karriere beenden
              </button>
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
            <CareerMatchLog
              matches={playerMatches}
              onDone={() => setLogDone(true)}
              done={logDone}
            />
          )}

          {logDone && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {!playoff && (promoted || relegated) && (
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

// ── Transfer ──────────────────────────────────────────────────────────────────

function CareerTransfer({ state, onBuy, onUndo, onMove, onSell, onRelease, onChangeFormation, onStartSeason, onEnd }) {
  const { slots, transferOffers, incomingBids = [], division, seasonNumber, seasonHistory, swapHistory, budget = 0, formation } = state;
  const formationSlots  = slots.filter(s => s.type !== 'BENCH');
  const benchSlots      = slots.filter(s => s.type === 'BENCH');
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [posFilter, setPosFilter] = useState('');
  const [activeBidIdx, setActiveBidIdx] = useState(null);

  const prevDivision  = seasonHistory[seasonHistory.length - 1]?.division;
  const justPromoted  = prevDivision === '2bl' && division === 'bl';
  const justRelegated = prevDivision === 'bl'  && division === '2bl';

  const filledFormation     = formationSlots.filter(s => s.player !== null).length;
  const emptyFormationSlots = formationSlots.filter(s => !s.player);
  const canStart            = filledFormation === 11;
  const benchFull           = benchSlots.filter(s => s.player).length >= 5;

  const selectedSlot    = selectedSlotId ? slots.find(s => s.id === selectedSlotId) : null;
  const isBenchSelected = selectedSlot?.type === 'BENCH';

  const allAvailableOffers = transferOffers.filter(o => !o.used && !o.skipped);

  // Active bid: clicking a bid row shows replacements + affordability based on post-sale budget
  const activeBid         = activeBidIdx !== null ? (incomingBids[activeBidIdx] ?? null) : null;
  const effectiveBudget   = activeBid ? budget + activeBid.amount : budget;
  const overviewOffers    = activeBid
    ? allAvailableOffers.filter(o => o.slotType === activeBid.slotType)
    : allAvailableOffers.filter(o => !posFilter || o.slotType === posFilter);

  // Market offers for the selected formation slot's position type
  const marketOffers = !isBenchSelected && selectedSlot
    ? transferOffers.filter(o => !o.used && !o.skipped && o.slotType === selectedSlot.type)
    : [];

  // Formation slots the selected bench player can fill
  const formationTargets = isBenchSelected && selectedSlot?.player
    ? formationSlots.filter(s => canPlayerFillSlot(selectedSlot.player, s.type))
    : [];

  const highlightSlotIds = formationTargets.map(s => s.id);

  function handleFormationClick(slotId) {
    if (isBenchSelected && selectedSlot?.player && formationTargets.some(s => s.id === slotId)) {
      onMove(selectedSlotId, slotId);
      setSelectedSlotId(null);
    } else {
      setSelectedSlotId(prev => prev === slotId ? null : slotId);
    }
  }

  function handleBenchClick(slotId) {
    setSelectedSlotId(prev => prev === slotId ? null : slotId);
  }

  function handleBuyOffer(offerIndex) {
    onBuy(offerIndex);
    setSelectedSlotId(null);
  }

  // Sell from incoming bid: auto-select the now-empty slot so the market opens for that position
  function handleBidSell(bid) {
    const soldSlot = formationSlots.find(s => s.player?.id === bid.playerId)
      ?? formationSlots.find(s => s.type === bid.slotType);
    onSell(bid.playerId, bid.amount);
    if (soldSlot) setSelectedSlotId(soldSlot.id);
    setActiveBidIdx(null);
    setPosFilter('');
  }

  function handleBuyFromOverview(offerIndex) {
    onBuy(offerIndex);
    setActiveBidIdx(null);
  }

  return (
    <div className="career-screen">
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
        <button className="btn btn-ghost btn-sm" onClick={onEnd}>Karriere beenden</button>
      </header>

      <div className="career-transfer-layout">

        {/* Left: squad */}
        <div className="career-transfer-left">
          <div className="result-section-label">Startelf</div>
          <FormationBoard
            slots={formationSlots}
            showRatings
            league={division}
            selectedSlotId={selectedSlotId}
            highlightSlotIds={highlightSlotIds}
            onSlotClick={handleFormationClick}
          />

          <div className="career-formation-picker">
            {FORMATION_KEYS.map(f => (
              <button
                key={f}
                className={`career-formation-btn${f === formation ? ' career-formation-btn--active' : ''}`}
                onClick={() => { onChangeFormation(f); setSelectedSlotId(null); }}
              >{f}</button>
            ))}
          </div>

          {benchSlots.some(s => s.player) && (
          <div className="career-bench">
            <div className="result-section-label" style={{ marginTop: 16 }}>Bank</div>
            <div className="career-bench-row">
              {benchSlots.map(s => {
                const isSelected = s.id === selectedSlotId;
                return (
                  <div
                    key={s.id}
                    className={[
                      'career-bench-slot',
                      !s.player  ? 'career-bench-slot--empty'   : '',
                      isSelected ? 'career-bench-slot--selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => s.player ? handleBenchClick(s.id) : null}
                    style={{ cursor: s.player ? 'pointer' : 'default' }}
                  >
                    {s.player ? (
                      <>
                        <span className={`career-bench-ovr rating rating-sm ${s.player.isIcon ? 'rating-icon' : ovrColorClass(s.player.displayRating)}`}>
                          {s.player.displayRating}
                        </span>
                        <span className="career-bench-name">{s.player.name.split(' ').pop()}</span>
                      </>
                    ) : (
                      <span className="career-bench-empty-label">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {swapHistory.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={onUndo}>
              ↩ Letzten Kauf rückgängig
            </button>
          )}
        </div>

        {/* Right: context panel */}
        <div className="career-transfer-right">

          {/* No slot selected — overview */}
          {!selectedSlot && (
            <>
              <div className="career-budget-display">
                <span className="career-budget-label">Budget</span>
                <span className="career-budget-value">€ {budget}M</span>
              </div>

              {/* Missing players prompt */}
              {emptyFormationSlots.length > 0 && (
                <div className="career-missing-banner">
                  <span className="career-missing-label">
                    {emptyFormationSlots.length} Position{emptyFormationSlots.length > 1 ? 'en' : ''} unbesetzt:
                  </span>
                  <div className="career-missing-slots">
                    {emptyFormationSlots.map(s => (
                      <button
                        key={s.id}
                        className="career-missing-slot-btn"
                        onClick={() => { setSelectedSlotId(s.id); setPosFilter(''); setActiveBidIdx(null); }}
                      >
                        {labelDE(s.type)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming bids — selectable to preview replacements */}
              {incomingBids.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="result-section-label" style={{ marginBottom: 6 }}>Kaufangebote</div>
                  {incomingBids.map((bid, i) => (
                    <div
                      key={i}
                      className={`career-bid-row${activeBidIdx === i ? ' career-bid-row--active' : ''}`}
                      onClick={() => setActiveBidIdx(prev => prev === i ? null : i)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="career-bid-info">
                        <span className={`career-bid-ovr rating rating-sm ${ovrColorClass(bid.ovr)}`}>{bid.ovr}</span>
                        <span className="career-bid-pos">{labelDE(bid.slotType)}</span>
                        <span className="career-bid-name">{bid.playerName}</span>
                      </div>
                      <div className="career-bid-actions">
                        <span className="career-bid-amount">€{bid.amount}M</span>
                        <button
                          className="career-bid-accept"
                          onClick={e => { e.stopPropagation(); handleBidSell(bid); }}
                        >
                          Verkaufen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Context banner when a bid is selected */}
              {activeBid && (
                <div className="career-sell-context">
                  <div className="career-sell-context-info">
                    <span className="career-sell-context-label">Nach Verkauf von {activeBid.playerName}</span>
                    <span className="career-sell-context-budget">Budget: €{budget}M + €{activeBid.amount}M = <strong>€{effectiveBudget}M</strong></span>
                  </div>
                  <button className="career-sell-context-close" onClick={() => setActiveBidIdx(null)}>✕</button>
                </div>
              )}

              {/* Transfer offers */}
              {benchFull && (
                <div className="career-start-warning" style={{ marginBottom: 8 }}>
                  Bank ist voll — setze einen Bankspieler in die Startelf ein oder gib ihn frei.
                </div>
              )}
              {allAvailableOffers.length > 0 ? (
                <>
                  <div className="result-section-label">
                    {activeBid ? `Ersatz für ${labelDE(activeBid.slotType)}` : 'Transferangebote'}
                  </div>
                  {!activeBid && (
                    <div className="career-pos-filters">
                      <button
                        className={`career-filter-btn${!posFilter ? ' career-filter-btn-active' : ''}`}
                        onClick={() => setPosFilter('')}
                      >Alle</button>
                      {[...new Set(allAvailableOffers.map(o => o.slotType))].map(pos => {
                        return (
                          <button
                            key={pos}
                            className={[
                              'career-filter-btn',
                              posFilter === pos ? 'career-filter-btn-active' : '',
                              emptyFormationSlots.some(s => s.type === pos) ? 'career-filter-btn--missing' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => setPosFilter(prev => prev === pos ? '' : pos)}
                          >
                            {labelDE(pos)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {overviewOffers.length === 0 ? (
                    <div className="career-swap-empty">Keine Ersatz-Angebote für {labelDE(activeBid?.slotType)}.</div>
                  ) : (
                    overviewOffers.map(offer => {
                      const idx = transferOffers.indexOf(offer);
                      return (
                        <TransferOfferCard
                          key={`${offer.id}-${idx}`}
                          offer={offer}
                          division={division}
                          canAfford={effectiveBudget >= (offer.price ?? 0)}
                          benchFull={benchFull}
                          onBuy={() => { setActiveBidIdx(null); handleBuyFromOverview(idx); }}
                        />
                      );
                    })
                  )}
                </>
              ) : (
                <div className="career-market-hint">Keine Transferangebote verfügbar.</div>
              )}

              <div style={{ marginTop: 24 }}>
                {!canStart && (
                  <div className="career-start-warning">
                    Alle 11 Positionen müssen besetzt sein ({filledFormation}/11)
                  </div>
                )}
                <button
                  className="btn btn-primary btn-lg career-transfer-inline-btn"
                  style={{ width: '100%' }}
                  onClick={onStartSeason}
                  disabled={!canStart}
                >
                  Saison {seasonNumber} starten →
                </button>
              </div>
            </>
          )}

          {/* Formation slot selected */}
          {selectedSlot && !isBenchSelected && (
            <div className="career-market-panel fade-in">
              <div className="career-market-header">
                <div>
                  <span className="career-market-pos">{labelDE(selectedSlot.type)}</span>
                  {selectedSlot.player && (
                    <span className="career-market-current">{selectedSlot.player.name}</span>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSlotId(null)}>✕</button>
              </div>
              {selectedSlot.player ? (
                <button
                  className="btn btn-ghost btn-sm career-release-btn"
                  onClick={() => { onRelease(selectedSlotId); setSelectedSlotId(null); }}
                >
                  {selectedSlot.player.name.split(' ').pop()} freigeben
                </button>
              ) : (
                <div className="career-swap-empty">Position leer — kaufe einen Spieler über den Markt.</div>
              )}
            </div>
          )}

          {/* Bench slot selected */}
          {selectedSlot && isBenchSelected && (
            <div className="career-market-panel fade-in">
              <div className="career-market-header">
                <div>
                  <span className="career-market-pos">Bank</span>
                  {selectedSlot.player && (
                    <span className="career-market-current">{selectedSlot.player.name}</span>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSlotId(null)}>✕</button>
              </div>
              {selectedSlot.player ? (
                <>
                  {formationTargets.length > 0 && (
                    <div className="career-from-bench">
                      <div className="career-from-bench-label">In die Startelf:</div>
                      {formationTargets.map(s => (
                        <button key={s.id} className="career-bench-pick-row" onClick={() => { onMove(selectedSlotId, s.id); setSelectedSlotId(null); }}>
                          <span className="career-market-pos">{labelDE(s.type)}</span>
                          <span className="career-bench-pick-name">{s.player?.name ?? '— leer —'}</span>
                          <span className="career-bench-pick-tag">einsetzen →</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {formationTargets.length === 0 && (
                    <div className="career-swap-empty">Keine kompatible Formation-Position.</div>
                  )}
                  <button
                    className="btn btn-ghost btn-sm career-release-btn"
                    onClick={() => { onRelease(selectedSlotId); setSelectedSlotId(null); }}
                  >
                    {selectedSlot.player.name.split(' ').pop()} freigeben
                  </button>
                </>
              ) : (
                <div className="career-swap-empty">Leerer Bankplatz.</div>
              )}
            </div>
          )}

        </div>
      </div>

      <div className="career-transfer-sticky-bar">
        {!canStart && (
          <div className="career-start-warning">
            Alle 11 Positionen müssen besetzt sein ({filledFormation}/11)
          </div>
        )}
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          onClick={onStartSeason}
          disabled={!canStart}
        >
          Saison {seasonNumber} starten →
        </button>
      </div>
    </div>
  );
}

function TransferOfferCard({ offer, division, canAfford = true, benchFull = false, onBuy }) {
  const rcls = ovrColorClass(offer.seasonRating);
  const tier = potentialTier(offer);
  const price = offer.price ?? 0;
  const canBuy = canAfford && !benchFull;

  return (
    <div className={[
      'career-offer-card',
      rcls,
      offer.isGem ? 'career-offer-card--gem' : '',
      !canAfford  ? 'career-offer-card--unaffordable' : '',
    ].filter(Boolean).join(' ')}>
      <div className="career-card-rating-wrap">
        <div className={`rating rating-sm ${rcls}`}>{offer.seasonRating}</div>
        {tier && <span className={`career-card-potential ${ovrColorClass(offer.potential)}`}>→{offer.potential}</span>}
      </div>
      <div className="career-offer-info">
        <div className="career-offer-name">
          {offer.name}
          {offer.isGem && <span className="career-gem-badge">◆ GEM</span>}
        </div>
        <div className="career-offer-meta">
          {offer.positions?.map(p => (
            <span key={p} className={`player-pos-badge pos-${p}`}>{labelDE(p)}</span>
          ))}
          <span>{offer.spunClub}</span>
          <span>{shortSeason(offer.spunSeason)}</span>
        </div>
      </div>
      <div className="career-offer-actions">
        <span className="career-offer-price">€{price}M</span>
        <button className="btn btn-primary btn-sm" onClick={onBuy} disabled={!canBuy} title={benchFull ? 'Bank ist voll' : undefined}>
          Verpflichten
        </button>
      </div>
    </div>
  );
}

// ── Entwicklung ───────────────────────────────────────────────────────────────

function CareerEntwicklung({ growthLog, retirements = [], seasonNumber, onContinue }) {
  const gains    = [...growthLog].filter(e => e.gain > 0).sort((a, b) => b.gain - a.gain);
  const declines = [...growthLog].filter(e => e.gain < 0);
  const hasContent = growthLog.length > 0 || retirements.length > 0;

  return (
    <div className="career-screen">
      <header className="career-header">
        <div />
        <div className="career-header-title">
          <span className="career-eyebrow">KARRIERE · SAISON {seasonNumber}</span>
          <h1 className="career-main-title">ENTWICKLUNG</h1>
          <p className="career-main-sub">Spieler die sich diese Saison verbessert haben</p>
        </div>
        <div />
      </header>

      <div className="entw-body">
        {retirements.length > 0 && (
          <div className="entw-icon-section">
            <div className="entw-icon-header">Karriereende</div>
            <div className="entw-icon-cards">
              {retirements.map((entry, i) => {
                const s = entry.stats;
                if (entry.isIcon) {
                  return (
                    <div key={i} className="entw-icon-card entw-retirement-card">
                      <div className="entw-icon-card-stars">★ ★ ★</div>
                      <div className="entw-icon-card-label">IKONE</div>
                      <div className="entw-icon-card-ovr">{entry.newRating}</div>
                      <div className="entw-icon-card-pos">{labelDE(entry.slotType)}</div>
                      <div className="entw-icon-card-name">{entry.name}</div>
                      <div className="entw-icon-card-seasons">{entry.seasons} Saisons im Kader</div>
                      {s && (
                        <div className="entw-retirement-stats">
                          <span>{s.games} Spiele</span>
                          {s.goals > 0 && <span>{s.goals} Tore</span>}
                          {s.assists > 0 && <span>{s.assists} Assists</span>}
                          {s.cleanSheets > 0 && <span>{s.cleanSheets} Zu-Null</span>}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={i} className="entw-retirement-plain">
                    <div className="entw-retirement-plain-pos">{labelDE(entry.slotType)}</div>
                    <div className="entw-retirement-plain-name">{entry.name}</div>
                    <div className="entw-retirement-plain-seasons">{entry.seasons} Saisons · Karriereende</div>
                    {s && (
                      <div className="entw-retirement-stats">
                        <span>{s.games} Spiele</span>
                        {s.goals > 0 && <span>{s.goals} Tore</span>}
                        {s.assists > 0 && <span>{s.assists} Assists</span>}
                        {s.cleanSheets > 0 && <span>{s.cleanSheets} Zu-Null</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!hasContent ? (
          <div className="entw-empty">Keine Entwicklung diese Saison.</div>
        ) : (
          <>
            {gains.length > 0 && (
              <div className="entw-list">
                {gains.map((entry, i) => (
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
            {declines.length > 0 && (
              <div className="entw-list entw-list--declines">
                {declines.map((entry, i) => (
                  <div key={i} className="entw-row entw-row--decline">
                    <span className="entw-gain-badge entw-gain-badge--decline">{entry.gain}</span>
                    <span className="entw-pos">{labelDE(entry.slotType)}</span>
                    <span className="entw-name">{entry.name}</span>
                    <span className="entw-ratings">
                      <span className="entw-old">{entry.oldRating}</span>
                      <span className="entw-arrow">→</span>
                      <span className="entw-new entw-new--decline">{entry.newRating}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button className="btn btn-primary entw-cta" onClick={onContinue}>
          Transferfenster →
        </button>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function CareerCard({ player, league, picked, incompatible, offRole, onClick }) {
  const rcls = ovrColorClass(player.seasonRating);
  const tier = potentialTier(player);
  const cls = [
    'career-card',
    picked       ? 'career-card--picked'  : '',
    incompatible ? 'career-card--dim'     : '',
    offRole      ? 'career-card--offrole' : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} onClick={onClick}>
      <div className="career-card-rating-wrap">
        <div className={`rating rating-sm ${rcls}`}>{player.seasonRating}</div>
        {tier && (
          <span className={`career-card-potential ${ovrColorClass(player.potential)}`}>
            →{player.potential}
          </span>
        )}
      </div>
      <div className="career-card-info">
        <div className="career-card-name">{player.name}</div>
        <div className="career-card-meta">
          <span className="career-card-club">{player.spunClub}</span>
          <span className="career-card-season">{shortSeason(player.spunSeason)}</span>
          <span>
            {player.positions.map(p => (
              <span key={p} className={`player-pos-badge pos-${p}`} style={{ marginLeft: 3 }}>
                {labelDE(p)}
              </span>
            ))}
          </span>
        </div>
      </div>
      {picked   && <span className="career-card-check">✓</span>}
      {offRole  && <span className="career-card-offrole-badge">!</span>}
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
    if (pos <= 2)   return 'ucl';
    if (pos === 3)  return 'playoff-up';
    if (pos >= 17)  return 'relegated';
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

// ── Playoff card ─────────────────────────────────────────────────────────────

function CareerPlayoffCard({ playoff, division }) {
  const { opponent, leg1, leg2, totalOwn, totalOpp, penalties, won } = playoff;
  const isPromotion = division === '2bl';

  let outcomeText, outcomeClass;
  if (isPromotion) {
    outcomeText = won ? 'Aufstieg!' : 'Kein Aufstieg';
    outcomeClass = won ? 'career-playoff-outcome--won' : 'career-playoff-outcome--lost';
  } else {
    outcomeText = won ? 'Klassenerhalt!' : 'Abstieg';
    outcomeClass = won ? 'career-playoff-outcome--won' : 'career-playoff-outcome--lost';
  }

  return (
    <div className={`career-playoff-card ${won ? 'career-playoff--won' : 'career-playoff--lost'}`}>
      <div className="career-playoff-header">
        <span className="career-playoff-label">Relegation</span>
        <span className="career-playoff-opponent">{opponent}</span>
      </div>
      <div className="career-playoff-legs">
        <div className="career-playoff-leg">
          <span className="career-playoff-leg-name">Hinspiel</span>
          <span className="career-playoff-leg-score">{leg1.own} – {leg1.opp}</span>
        </div>
        <div className="career-playoff-divider" />
        <div className="career-playoff-leg">
          <span className="career-playoff-leg-name">Rückspiel</span>
          <span className="career-playoff-leg-score">{leg2.own} – {leg2.opp}</span>
        </div>
      </div>
      <div className="career-playoff-footer">
        <span className="career-playoff-agg">
          Gesamt {totalOwn} – {totalOpp}{penalties ? ' (n.E.)' : ''}
        </span>
        <span className={`career-playoff-outcome ${outcomeClass}`}>{outcomeText}</span>
      </div>
    </div>
  );
}

// ── End Screen ────────────────────────────────────────────────────────────────

function CareerEndScreen({ data, onNewCareer, onHome }) {
  const { history, slots = [], careerStats = {}, allPlayers = [] } = data;
  const totalSeasons = history.length;
  const totalPts = history.reduce((sum, s) => sum + (s.pts ?? 0), 0);
  const totalGF  = history.reduce((sum, s) => sum + (s.GF  ?? 0), 0);
  const totalGA  = history.reduce((sum, s) => sum + (s.GA  ?? 0), 0);
  const lastDivision = history[history.length - 1]?.division ?? '2bl';

  const ratingById = Object.fromEntries(
    allPlayers.map(p => [p.id, { displayRating: p.displayRating, isIcon: p.isIcon }])
  );

  const [sortCol, setSortCol] = useState('games');
  const [sortDir, setSortDir] = useState(-1);

  function handleSort(col) {
    if (col === sortCol) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(-1); }
  }

  const base = Object.values(careerStats).map(stats => ({
    ...stats,
    displayRating: ratingById[stats.id]?.displayRating,
    isIcon: ratingById[stats.id]?.isIcon,
  }));
  const statsList = [...base].sort((a, b) => {
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
          <div className="career-end-stat">
            <div className="career-end-stat-val">{totalSeasons}</div>
            <div className="career-end-stat-label">Saisons</div>
          </div>
{totalPts > 0 && (
            <div className="career-end-stat">
              <div className="career-end-stat-val">{totalPts}</div>
              <div className="career-end-stat-label">Punkte</div>
            </div>
          )}
          {(totalGF > 0 || totalGA > 0) && (
            <div className="career-end-stat">
              <div className="career-end-stat-val">{totalGF}:{totalGA}</div>
              <div className="career-end-stat-label">Tore</div>
            </div>
          )}
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
              {[['displayRating','OVR'],['games','Sp'],['goals','T'],['assists','V']].map(([col, label]) => (
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
            {statsList.map((p, i) => {
              const ovrClass = p.displayRating ? ovrColorClass(p.displayRating) : '';
              return (
                <div key={`${p.name}-${i}`} className={[
                  'ces-row',
                  p.isIcon ? 'ces-row--icon' : (ovrClass ? `ces-row--${ovrClass}` : ''),
                  p.goals > 0 ? 'ces-row-scorer' : '',
                ].filter(Boolean).join(' ')}>
                  <span className="ces-name">
                    <span className="ces-pos">{labelDE(p.slotLabel)}</span>
                    <span className="ces-pname">{p.name}</span>
                  </span>
                  <span className={`ces-col ces-col-ovr${p.isIcon ? ' ces-col-ovr--icon' : (ovrClass ? ` ${ovrClass}` : '')}`}>
                    {p.displayRating ?? '—'}
                  </span>
                  <span className="ces-col">{p.games}</span>
                  <span className="ces-col">{p.goals || '—'}</span>
                  <span className="ces-col">{p.assists || '—'}</span>
                  {hasGK && (
                    <span className="ces-col ces-ww">
                      {p.slotType === 'GK' ? (p.cleanSheets || '—') : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="career-end-actions">
          <button className="btn btn-primary btn-lg" onClick={onNewCareer}>
            Neue Karriere
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            Startseite
          </button>
        </div>
      </div>
    </div>
  );
}
