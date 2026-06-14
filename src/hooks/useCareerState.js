import { useReducer, useEffect } from 'react';
import { FORMATIONS } from '../data/formations';

const STORAGE_KEY = 'karriere_v2';

const defaultState = {
  phase: 'setup',
  formation: '4-3-3',
  division: '2bl',
  seasonNumber: 0,
  careerStartYear: null,
  slots: [],
  draftPool: [],
  result: null,
  transferOffers: [],
  incomingBids: [],
  seasonHistory: [],
  allPlayers: [],
  careerStats: {},
  swapHistory: [],
  retiredThisSeason: [],
  budget: 0,
};

function mergeStats(careerStats, playerStats) {
  const next = { ...careerStats };
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

const BENCH_COUNT = 5;

function buildSlots(formationKey) {
  const formation = FORMATIONS[formationKey].slots.map(s => ({ ...s, player: null }));
  const bench = Array.from({ length: BENCH_COUNT }, (_, i) => ({
    id: `bench_${i + 1}`,
    type: 'BENCH',
    label: 'Bank',
    player: null,
  }));
  return [...formation, ...bench];
}

function reducer(state, action) {
  switch (action.type) {

    case 'SET_FORMATION':
      return { ...state, formation: action.payload };

    case 'BEGIN_DRAFT': {
      const pool = action.payload;
      const years = pool.map(p => parseInt(p.spunSeason)).filter(y => !isNaN(y));
      const careerStartYear = years.length
        ? Math.round(years.reduce((a, b) => a + b, 0) / years.length)
        : 2000;
      return {
        ...defaultState,
        formation: state.formation,
        phase: 'draft',
        seasonNumber: 1,
        careerStartYear,
        slots: buildSlots(state.formation),
        draftPool: pool,
      };
    }

    case 'PLACE_PLAYER': {
      const { slotId, player, displayRating } = action.payload;
      const placed = { ...player, displayRating };
      const alreadyTracked = state.allPlayers.some(p => p.id === player.id);
      return {
        ...state,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: placed } : s
        ),
        allPlayers: alreadyTracked ? state.allPlayers : [...state.allPlayers, placed],
      };
    }

    case 'SET_RESULT':
      return { ...state, phase: 'result', result: action.payload, swapHistory: [] };

    case 'BEGIN_TRANSFER': {
      const { newDivision, transferOffers, retiredThisSeason, prize, incomingBids } = action.payload;
      const history = state.result
        ? [...state.seasonHistory, {
            season: state.seasonNumber,
            division: state.division,
            pos: state.result.pos,
            pts: state.result.pts,
            GF: state.result.GF ?? 0,
            GA: state.result.GA ?? 0,
          }]
        : state.seasonHistory;
      return {
        ...state,
        phase: 'transfer',
        division: newDivision,
        seasonNumber: state.seasonNumber + 1,
        transferOffers,
        incomingBids: incomingBids ?? [],
        seasonHistory: history,
        careerStats: mergeStats(state.careerStats, state.result?.playerStats),
        budget: (state.budget ?? 0) + (prize ?? 0),
        result: null,
        swapHistory: [],
        retiredThisSeason: retiredThisSeason ?? [],
      };
    }

    case 'SWAP_OFFER': {
      const { offerIndex, slotId } = action.payload;
      const offer = state.transferOffers[offerIndex];
      if (!offer || offer.used || offer.skipped) return state;
      const price = offer.price ?? 0;
      if ((state.budget ?? 0) < price) return state;
      const swappedIn = { ...offer, displayRating: offer.seasonRating };
      const oldPlayer = state.slots.find(s => s.id === slotId)?.player ?? null;
      const alreadyTracked = state.allPlayers.some(p => p.id === offer.id);
      return {
        ...state,
        budget: (state.budget ?? 0) - price,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: swappedIn } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: true } : o
        ),
        allPlayers: alreadyTracked ? state.allPlayers : [...state.allPlayers, swappedIn],
        swapHistory: [...state.swapHistory, { slotId, oldPlayer, offerIndex, price }],
      };
    }

    case 'UNDO_SWAP': {
      if (!state.swapHistory.length) return state;
      const { slotId, oldPlayer, offerIndex, price = 0 } = state.swapHistory[state.swapHistory.length - 1];
      return {
        ...state,
        budget: (state.budget ?? 0) + price,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: oldPlayer } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: false } : o
        ),
        swapHistory: state.swapHistory.slice(0, -1),
      };
    }

    case 'SELL_PLAYER': {
      const { playerId, amount } = action.payload;
      return {
        ...state,
        budget: (state.budget ?? 0) + amount,
        slots: state.slots.map(s =>
          s.player?.id === playerId ? { ...s, player: null } : s
        ),
        incomingBids: state.incomingBids.filter(b => b.playerId !== playerId),
      };
    }

    case 'REMOVE_PLAYER':
      return {
        ...state,
        slots: state.slots.map(s => s.id === action.payload ? { ...s, player: null } : s),
      };

    case 'SKIP_OFFER':
      return {
        ...state,
        transferOffers: state.transferOffers.map((o, i) =>
          i === action.payload ? { ...o, skipped: true } : o
        ),
      };

    case 'APPLY_GROWTH': {
      const { updatedSlots } = action.payload;
      const playerUpdates = Object.fromEntries(
        updatedSlots.filter(s => s.player).map(s => [s.player.id, {
          displayRating: s.player.displayRating,
          potential: s.player.potential,
          seasonsInSquad: s.player.seasonsInSquad,
          isIcon: s.player.isIcon,
        }])
      );
      return {
        ...state,
        slots: updatedSlots,
        allPlayers: state.allPlayers.map(p =>
          playerUpdates[p.id] != null ? { ...p, ...playerUpdates[p.id] } : p
        ),
      };
    }

    case 'RESET':
      return defaultState;

    default:
      return state;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch {}
  return defaultState;
}

export function useCareerState() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return {
    state,
    setFormation:  f => dispatch({ type: 'SET_FORMATION', payload: f }),
    beginDraft:    pool => dispatch({ type: 'BEGIN_DRAFT', payload: pool }),
    placePlayer:   (slotId, player, displayRating) =>
                     dispatch({ type: 'PLACE_PLAYER', payload: { slotId, player, displayRating } }),
    setResult:     result => dispatch({ type: 'SET_RESULT', payload: result }),
    beginTransfer: (newDivision, offers, retiredThisSeason, prize, incomingBids) =>
                     dispatch({ type: 'BEGIN_TRANSFER', payload: { newDivision, transferOffers: offers, retiredThisSeason, prize, incomingBids } }),
    swapOffer:     (offerIndex, slotId) =>
                     dispatch({ type: 'SWAP_OFFER', payload: { offerIndex, slotId } }),
    undoSwap:      () => dispatch({ type: 'UNDO_SWAP' }),
    sellPlayer:    (playerId, amount) => dispatch({ type: 'SELL_PLAYER', payload: { playerId, amount } }),
    skipOffer:     i => dispatch({ type: 'SKIP_OFFER', payload: i }),
    removePlayer:  slotId => dispatch({ type: 'REMOVE_PLAYER', payload: slotId }),
    applyGrowth:   updatedSlots => dispatch({ type: 'APPLY_GROWTH', payload: { updatedSlots } }),
    reset:         () => dispatch({ type: 'RESET' }),
  };
}
