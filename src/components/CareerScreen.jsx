import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCareerState } from '../hooks/useCareerState';
import FormationBoard from './FormationBoard';
import { FORMATIONS, FORMATION_KEYS } from '../data/formations';
import { generateCareerDraftPool, generateTransferMarket, generateIncomingBids, prizeMoney } from '../utils/careerUtils';
import { simulateFullLeague, getAchievements } from '../utils/simulation';
import { FeverCurve, PlayerStats } from './ResultScreen';
import { canPlayerFillSlot, getCompatibleSlots, labelDE } from '../utils/playerUtils';
import { PLAYERS as BL_PLAYERS } from '../data/players';
import { PLAYERS as BL2_PLAYERS } from '../data/players2bl';
import { PLAYERS as BL3_PLAYERS } from '../data/players3l';
import { applyGrowth, potentialTier, ovrColorClass } from '../utils/growthUtils';
import './CareerScreen.css';

const DIV_LABEL = { bl: 'Bundesliga', '2bl': '2. Bundesliga', '3l': '3. Liga' };

const PLAYOFF_OPPONENTS = {
  bl:   ['Hamburger SV', 'FC Schalke 04', 'Hannover 96', '1. FC Köln', 'Hertha BSC',
         'VfB Stuttgart', 'Werder Bremen', 'FC Augsburg', 'Fortuna Düsseldorf', 'Eintracht Braunschweig'],
  '2bl': ['Greuther Fürth', 'FC Heidenheim', 'SV Darmstadt 98', '1. FC Nürnberg',
          'Karlsruher SC', 'FC Hansa Rostock', '1. FC Kaiserslautern', 'SV Sandhausen', 'FC Erzgebirge Aue'],
  '3l': ['1. FC Saarbrücken', 'Dynamo Dresden', 'TSV 1860 München', 'Hallescher FC',
         'FC Viktoria Köln', 'SV Waldhof Mannheim', 'VfL Osnabrück', 'SpVgg Unterhaching'],
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

function generatePlayoff(myDivision, pos) {
  const isPromotion = pos === 3;
  const oppDivision = isPromotion
    ? (myDivision === '3l' ? '2bl' : 'bl')
    : '2bl';
  const pool = PLAYOFF_OPPONENTS[oppDivision];
  const opponent = pool[Math.floor(Math.random() * pool.length)];
  const leg1 = { own: randGoals(), opp: randGoals() };
  const leg2 = { own: randGoals(), opp: randGoals() };
  const totalOwn = leg1.own + leg2.own;
  const totalOpp = leg1.opp + leg2.opp;
  const penalties = totalOwn === totalOpp;
  const won = penalties ? Math.random() < 0.5 : totalOwn > totalOpp;
  return { opponent, leg1, leg2, totalOwn, totalOpp, penalties, won, isPromotion };
}

function shortSeason(s) {
  if (!s) return '';
  const parts = s.split('-');
  if (parts.length === 2) return `${parts[0].slice(2)}/${parts[1]}`;
  return s;
}

function getPlayers(div) {
  if (div === 'bl')  return BL_PLAYERS;
  if (div === '3l')  return BL3_PLAYERS;
  return BL2_PLAYERS;
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
    const needsPlayoff =
      (result.pos === 3  && (division === '2bl' || division === '3l')) ||
      (result.pos === 16 && (division === 'bl'  || division === '2bl'));
    const playoff = needsPlayoff ? generatePlayoff(division, result.pos) : null;
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
        startingDivision={state.startingDivision ?? '2bl'}
        onSetFormation={career.setFormation}
        onSetStartingDivision={career.setStartingDivision}
        onStart={(mode) => {
          if (mode === 'klassik') {
            navigate(`/karriere-klassik?formation=${state.formation}`);
            return;
          }
          const div = state.startingDivision ?? '2bl';
          const pool = generateCareerDraftPool(getPlayers(div), FORMATIONS[state.formation], 30, div);
          career.beginDraft(pool, div);
        }}
        onBack={() => navigate('/')}
      />
    );
  }

  if (state.phase === 'draft') {
    const draftDiv = state.division ?? '2bl';
    return (
      <CareerDraft
        state={state}
        onPlace={career.placePlayer}
        onRemove={career.removePlayer}
        onResult={(slots) => runSeason(slots, draftDiv, state.seasonNumber)}
        onReset={() => career.reset()}
        onHome={() => { career.reset(); navigate('/'); }}
      />
    );
  }

  if (state.phase === 'result') {
    const pos      = state.result?.pos ?? 18;
    const playoff  = state.result?.playoff ?? null;
    const div      = state.division;

    // Promotion
    const directPromoted =
      (div === '3l'  && pos <= 2) ||
      (div === '2bl' && pos <= 2);
    const playoffPromoted =
      (div === '3l'  && pos === 3 && playoff?.won === true) ||
      (div === '2bl' && pos === 3 && playoff?.won === true);
    const promoted = directPromoted || playoffPromoted;

    // Relegation
    const directRelegated =
      (div === 'bl'  && pos >= 17) ||
      (div === '2bl' && pos >= 17);
    const playoffRelegated =
      (div === 'bl'  && pos === 16 && playoff?.won === false) ||
      (div === '2bl' && pos === 16 && playoff?.won === false);
    const relegated = directRelegated || playoffRelegated;

    const newDivision = promoted
      ? (div === '3l' ? '2bl' : 'bl')
      : relegated
        ? (div === 'bl' ? '2bl' : '3l')
        : div;

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
            const filled = entwicklungData.updatedSlots.filter(s => s.player);
            const excludeIds = new Set([
              ...entwicklungData.updatedSlots.filter(s => s.player).map(s => s.player.id),
              ...(state.kader ?? []).map(p => p.id),
            ]);
            const teamAvg = filled.length
              ? Math.round(filled.reduce((sum, s) => sum + (s.player.displayRating ?? 0), 0) / filled.length)
              : null;
            const offers = generateTransferMarket(divPlayers, excludeIds, FORMATIONS[state.formation], teamAvg, currentYear);
            const prize = prizeMoney(state.result?.pos ?? 18, state.division);
            const incomingBids = generateIncomingBids(entwicklungData.updatedSlots, currentYear, state.division);
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
        newDivision={newDivision}
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
      career.sellPlayer(playerId, amount);
    }

    return (
      <CareerTransfer
        state={state}
        onBuy={career.buyOffer}
        onUndo={career.undoBuy}
        onMove={career.moveInSquad}
        onMoveFromKader={career.moveFromKader}
        onSell={handleSell}
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

const DIV_INFO = {
  '3l':  { label: '3. Liga',       sub: 'Aufstieg in die 2. Bundesliga möglich' },
  '2bl': { label: '2. Bundesliga', sub: 'Aufstieg in die Bundesliga möglich' },
  'bl':  { label: 'Bundesliga',    sub: 'Höchste Spielklasse — Kampf um den Meistertitel' },
};

function CareerSetup({ formation, startingDivision, onSetFormation, onSetStartingDivision, onStart, onBack }) {
  const [mode, setMode] = useState('standard');
  const divInfo = mode === 'klassik' ? DIV_INFO['2bl'] : (DIV_INFO[startingDivision] ?? DIV_INFO['2bl']);
  return (
    <div className="career-screen">
      <header className="career-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <div className="career-header-title">
          <span className="career-eyebrow">34-0</span>
          <h1 className="career-main-title">KARRIERE</h1>
          <p className="career-main-sub">{divInfo.sub}</p>
        </div>
        <div />
      </header>

      <div className="career-setup-body">
        <section className="setup-section">
          <h3 className="setup-label">Modus</h3>
          <div className="formation-btns">
            <button
              className={`formation-btn ${mode === 'standard' ? 'selected' : ''}`}
              onClick={() => setMode('standard')}
            >
              Transfermarkt
            </button>
            <button
              className={`formation-btn ${mode === 'klassik' ? 'selected' : ''}`}
              onClick={() => setMode('klassik')}
            >
              Klassik
            </button>
          </div>
          {mode === 'klassik' && (
            <p className="formation-desc">Start in der 2. Bundesliga · Direkte Transfers · kein Budget</p>
          )}
        </section>

        {mode !== 'klassik' && (
          <section className="setup-section">
            <h3 className="setup-label">Startliga</h3>
            <div className="formation-btns">
              {Object.entries(DIV_INFO).map(([key, info]) => (
                <button
                  key={key}
                  className={`formation-btn ${startingDivision === key ? 'selected' : ''}`}
                  onClick={() => onSetStartingDivision(key)}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </section>
        )}

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
          <div className="career-info-row">Wähle deine Startelf aus 30 zufälligen {divInfo.label}-Spielern</div>
          <div className="career-info-row">Platz 1 oder 2: direkter Aufstieg</div>
          <div className="career-info-row">
            {mode === 'klassik'
              ? 'Nach jeder Saison: direkter Spielertausch'
              : 'Nach jeder Saison: Transfermarkt mit Budget'}
          </div>
        </div>

        <button className="start-btn" onClick={() => onStart(mode)}>
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
          <span className="career-draft-title">KARRIERE — SAISON 1 — {DIV_LABEL[state.division ?? '2bl'].toUpperCase()}</span>
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
          <FormationBoard slots={formationSlots} showRatings league={state.division ?? '2bl'} />
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
                  league={state.division ?? '2bl'}
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

function CareerResult({ state, promoted, relegated, newDivision, onContinue, onEnd, onHome }) {
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
                    ? `⬆️  Aufstieg! Nächste Saison in der ${DIV_LABEL[newDivision]}.`
                    : `⬇️  Abstieg. Nächste Saison in der ${DIV_LABEL[newDivision]}.`}
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

              {playoff && <CareerPlayoffCard playoff={playoff} />}

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

function CareerTransfer({ state, onBuy, onUndo, onMove, onMoveFromKader, onSell, onChangeFormation, onStartSeason, onEnd }) {
  const { slots, transferOffers, incomingBids = [], division, seasonNumber, seasonHistory, swapHistory,
          budget = 0, formation, kader = [], kaderLeft = [] } = state;
  const formationSlots  = slots;
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [selectedKaderId, setSelectedKaderId] = useState(null);
  const [posFilter, setPosFilter] = useState('');

  const DIV_RANK = { '3l': 0, '2bl': 1, 'bl': 2 };
  const prevDivision  = seasonHistory[seasonHistory.length - 1]?.division;
  const justPromoted  = prevDivision && DIV_RANK[division] > DIV_RANK[prevDivision];
  const justRelegated = prevDivision && DIV_RANK[division] < DIV_RANK[prevDivision];

  const filledFormation     = formationSlots.filter(s => s.player !== null).length;
  const emptyFormationSlots = formationSlots.filter(s => !s.player);
  const canStart            = filledFormation === 11;

  const selectedSlot      = selectedSlotId ? slots.find(s => s.id === selectedSlotId) : null;
  const selectedKaderPlayer = selectedKaderId ? kader.find(p => p.id === selectedKaderId) : null;

  const byOvr = (a, b) => b.seasonRating - a.seasonRating;
  const allAvailableOffers = transferOffers.filter(o => !o.used && !o.skipped).sort(byOvr);
  const overviewOffers = allAvailableOffers.filter(o => !posFilter || o.slotType === posFilter);

  const marketOffers = selectedSlot
    ? transferOffers.filter(o => !o.used && !o.skipped && o.slotType === selectedSlot.type).sort(byOvr)
    : [];

  // Formation slots the selected kader player can fill (highlighted green)
  const kaderFormationTargets = selectedKaderPlayer
    ? formationSlots.filter(s => canPlayerFillSlot(selectedKaderPlayer, s.type))
    : [];
  const highlightSlotIds = kaderFormationTargets.map(s => s.id);

  function handleFormationClick(slotId) {
    if (selectedKaderId && kaderFormationTargets.some(s => s.id === slotId)) {
      onMoveFromKader(selectedKaderId, slotId);
      setSelectedKaderId(null);
    } else {
      setSelectedSlotId(prev => prev === slotId ? null : slotId);
      setSelectedKaderId(null);
    }
  }

  function handleKaderClick(playerId) {
    const player = kader.find(p => p.id === playerId);
    if (!player) return;
    const emptySlot = formationSlots.find(s => !s.player && canPlayerFillSlot(player, s.type));
    if (emptySlot) {
      onMoveFromKader(playerId, emptySlot.id);
      return;
    }
    // No empty slot — select so board shows green highlights for manual swap
    setSelectedKaderId(prev => prev === playerId ? null : playerId);
    setSelectedSlotId(null);
  }

  function handleBuyOffer(offerIndex) {
    onBuy(offerIndex, selectedSlotId ?? null);
    setSelectedSlotId(null);
  }

  function handleBidSell(bid) {
    onSell(bid.playerId, bid.amount);
  }

  function handleBuyFromOverview(offerIndex) {
    const offer = transferOffers[offerIndex];
    const emptySlot = formationSlots.find(s => !s.player && s.type === offer?.slotType);
    onBuy(offerIndex, emptySlot?.id ?? null);
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
              {justPromoted ? `⬆️  Aufstieg in die ${DIV_LABEL[division]}!` : `⬇️  Abstieg in die ${DIV_LABEL[division]}`}
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
                onClick={() => { onChangeFormation(f); setSelectedSlotId(null); setSelectedKaderId(null); }}
              >{f}</button>
            ))}
          </div>

          {kader.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="result-section-label">Kader</div>
              <div className="career-bench-row">
                {kader.map(p => {
                  const gap = (p.potential ?? p.displayRating) - p.displayRating;
                  const leavingNextSeason = (p.inactiveSeasons ?? 0) >= 3 && gap < 8;
                  return (
                    <div
                      key={p.id}
                      className={['career-bench-slot', p.id === selectedKaderId ? 'career-bench-slot--selected' : '', leavingNextSeason ? 'career-bench-slot--leaving' : ''].filter(Boolean).join(' ')}
                      onClick={() => handleKaderClick(p.id)}
                    >
                      <span className={`career-bench-ovr rating rating-sm ${p.isIcon ? 'rating-icon' : ovrColorClass(p.displayRating)}`}>
                        {p.displayRating}
                      </span>
                      <span className="career-bench-name">{p.name.split(' ').pop()}</span>
                      {gap >= 1 && <span className={`career-bench-pot ${ovrColorClass(p.potential)}`}>→{p.potential}</span>}
                      {leavingNextSeason && <span className="career-bench-leaving">!</span>}
                    </div>
                  );
                })}
              </div>
              {kader.some(p => (p.inactiveSeasons ?? 0) >= 3 && ((p.potential ?? p.displayRating) - p.displayRating) < 8) && (
                <div className="career-kader-warning">
                  ⚠ Verlassen den Kader nächste Saison:{' '}
                  {(names => names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`)(
                    kader.filter(p => (p.inactiveSeasons ?? 0) >= 3 && ((p.potential ?? p.displayRating) - p.displayRating) < 8).map(p => p.name.split(' ').pop())
                  )}
                </div>
              )}
            </div>
          )}

          {swapHistory.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={onUndo}>
              ↩ Letzten Transfer rückgängig
            </button>
          )}
        </div>

        {/* Right: context panel */}
        <div className="career-transfer-right">

          {/* No slot/kader selected — overview */}
          {!selectedSlot && !selectedKaderPlayer && (
            <>
              <div className="career-budget-display">
                <span className="career-budget-label">Budget</span>
                <span className="career-budget-value">€ {budget}M</span>
              </div>

              <button
                className="btn btn-primary btn-lg career-transfer-inline-btn"
                style={{ width: '100%', marginBottom: 16 }}
                onClick={onStartSeason}
                disabled={!canStart}
              >
                {canStart ? `Saison ${seasonNumber} starten →` : `${filledFormation}/11 Positionen besetzt`}
              </button>

              {kaderLeft.length > 0 && (
                <div className="career-kader-left-msg">
                  {(names => names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`)(kaderLeft.map(p => p.name.split(' ').pop()))} {kaderLeft.length === 1 ? 'hat' : 'haben'} den Verein verlassen
                </div>
              )}

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
                        onClick={() => { setSelectedSlotId(s.id); setPosFilter(''); }}
                      >
                        {labelDE(s.type)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {incomingBids.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="result-section-label" style={{ marginBottom: 6 }}>Kaufangebote</div>
                  {incomingBids.map((bid, i) => (
                    <div key={i} className="career-bid-block">
                      {bid.buyingClub && (
                        <div className="career-bid-club-header">{bid.buyingClub} möchte kaufen:</div>
                      )}
                      <div className="career-bid-row">
                        <div className="career-bid-info">
                          <span className={`career-bid-ovr rating rating-sm ${ovrColorClass(bid.ovr)}`}>{bid.ovr}</span>
                          <span className="career-bid-pos">{labelDE(bid.slotType)}</span>
                          <span className="career-bid-name">{bid.playerName}</span>
                          {bid.age != null && <span className="career-bid-age">{bid.age} J.</span>}
                        </div>
                        <div className="career-bid-actions">
                          <span className="career-bid-amount">€{bid.amount}M</span>
                          <button className="career-bid-accept" onClick={() => handleBidSell(bid)}>
                            Verkaufen
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {allAvailableOffers.length > 0 ? (
                <>
                  <div className="result-section-label">Transfermarkt</div>
                  <div className="career-pos-filters">
                    <button
                      className={`career-filter-btn${!posFilter ? ' career-filter-btn-active' : ''}`}
                      onClick={() => setPosFilter('')}
                    >Alle</button>
                    {['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LW', 'RW', 'ST'].filter(pos => allAvailableOffers.some(o => o.slotType === pos)).map(pos => (
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
                    ))}
                  </div>
                  {overviewOffers.map(offer => {
                    const idx = transferOffers.indexOf(offer);
                    return (
                      <TransferOfferCard
                        key={`${offer.id}-${idx}`}
                        offer={offer}
                        division={division}
                        canAfford={budget >= (offer.price ?? 0)}
                        onBuy={() => handleBuyFromOverview(idx)}
                      />
                    );
                  })}
                </>
              ) : (
                <div className="career-market-hint">Keine Transferangebote verfügbar.</div>
              )}

              <div style={{ marginTop: 24, marginBottom: 8 }}>
                <button
                  className="btn btn-primary btn-lg career-transfer-inline-btn"
                  style={{ width: '100%' }}
                  onClick={onStartSeason}
                  disabled={!canStart}
                >
                  {canStart ? `Saison ${seasonNumber} starten →` : `${filledFormation}/11 Positionen besetzt`}
                </button>
              </div>
            </>
          )}

          {/* Formation slot selected */}
          {selectedSlot && (
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
              {!selectedSlot.player && (
                <div className="career-swap-empty">Position leer — kaufe einen Spieler über den Markt.</div>
              )}
              {marketOffers.length > 0 && (
                <>
                  <div className="result-section-label" style={{ marginTop: 12, marginBottom: 8 }}>Transfermarkt</div>
                  {marketOffers.map(offer => {
                    const idx = transferOffers.indexOf(offer);
                    return (
                      <TransferOfferCard
                        key={`${offer.id}-${idx}`}
                        offer={offer}
                        division={division}
                        canAfford={budget >= (offer.price ?? 0)}
                        onBuy={() => handleBuyOffer(idx)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Kader player selected — replace list */}
          {selectedKaderPlayer && !selectedSlot && (
            <div className="career-market-panel fade-in">
              <div className="career-market-header">
                <span className="career-replace-title">Wen ersetzen durch {selectedKaderPlayer.name}?</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedKaderId(null)}>✕</button>
              </div>
              {kaderFormationTargets.filter(s => s.player).length > 0 ? (
                <div className="career-replace-list">
                  {kaderFormationTargets.filter(s => s.player).map(s => (
                    <button
                      key={s.id}
                      className="career-replace-row"
                      onClick={() => { onMoveFromKader(selectedKaderId, s.id); setSelectedKaderId(null); }}
                    >
                      <span className="career-replace-pos">{labelDE(s.type)}</span>
                      <span className="career-replace-name">{s.player.name}</span>
                      <span className="career-replace-ratings">
                        <span className={`rating rating-sm ${ovrColorClass(s.player.displayRating)}`}>{s.player.displayRating}</span>
                        <span className="career-replace-arrow">→</span>
                        <span className={`rating rating-sm ${ovrColorClass(selectedKaderPlayer.displayRating)}`}>{selectedKaderPlayer.displayRating}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="career-swap-empty">Keine kompatible Formation-Position.</div>
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

function TransferOfferCard({ offer, division, canAfford = true, onBuy }) {
  const rcls = ovrColorClass(offer.seasonRating);
  const tier = potentialTier(offer);
  const price = offer.price ?? 0;
  const canBuy = canAfford;

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
          {offer.age != null && <span className="career-offer-age">{offer.age} J.</span>}
          <span>{offer.spunClub}</span>
          <span>{shortSeason(offer.spunSeason)}</span>
        </div>
      </div>
      <div className="career-offer-actions">
        <span className="career-offer-price">€{price}M</span>
        <button className="btn btn-primary btn-sm" onClick={onBuy} disabled={!canBuy}>
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
  if (league === '3l') {
    if (pos <= 2)   return 'ucl';
    if (pos === 3)  return 'playoff-up';
    if (pos === 16) return 'playoff';
    if (pos >= 17)  return 'relegated';
    return 'mid';
  }
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

function CareerPlayoffCard({ playoff }) {
  const { opponent, leg1, leg2, totalOwn, totalOpp, penalties, won, isPromotion } = playoff;

  const outcomeText = isPromotion
    ? (won ? 'Aufstieg!' : 'Aufstieg verpasst')
    : (won ? 'Klassenerhalt!' : 'Abstieg');
  const outcomeClass = won ? 'career-playoff-outcome--won' : 'career-playoff-outcome--lost';

  return (
    <div className={`career-playoff-card ${won ? 'career-playoff--won' : 'career-playoff--lost'}`}>
      <div className="career-playoff-header">
        <span className="career-playoff-label">{isPromotion ? 'Aufstiegsrelegation' : 'Relegation'}</span>
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
