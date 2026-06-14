import { useReducer, useEffect } from 'react';
import { FORMATIONS } from '../data/formations';

const STORAGE_KEY = 'karriere_v1';

const defaultState = {
  phase: 'setup',
  formation: '4-3-3',
  division: '2bl',
  seasonNumber: 0,
  slots: [],
  draftPool: [],
  result: null,
  transferOffers: [],
  seasonHistory: [],
  allPlayers: [],
  careerStats: {},
  swapHistory: [],
};

function mergeStats(careerStats, playerStats) {
  const next = { ...careerStats };
  for (const p of (playerStats ?? [])) {
    const prev = next[p.name] ?? { games: 0, goals: 0, assists: 0, cleanSheets: 0, slotLabel: p.slotLabel, slotType: p.slotType };
    next[p.name] = {
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

function buildSlots(formationKey) {
  return FORMATIONS[formationKey].slots.map(s => ({ ...s, player: null }));
}

function reducer(state, action) {
  switch (action.type) {

    case 'SET_FORMATION':
      return { ...state, formation: action.payload };

    case 'BEGIN_DRAFT':
      return {
        ...defaultState,
        formation: state.formation,
        phase: 'draft',
        seasonNumber: 1,
        slots: buildSlots(state.formation),
        draftPool: action.payload,
      };

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
      const { newDivision, transferOffers } = action.payload;
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
        seasonHistory: history,
        careerStats: mergeStats(state.careerStats, state.result?.playerStats),
        result: null,
        swapHistory: [],
      };
    }

    case 'SWAP_OFFER': {
      const { offerIndex, slotId } = action.payload;
      const offer = state.transferOffers[offerIndex];
      if (!offer || offer.used || offer.skipped) return state;
      const swappedIn = { ...offer, displayRating: offer.seasonRating };
      const oldPlayer = state.slots.find(s => s.id === slotId)?.player ?? null;
      const alreadyTracked = state.allPlayers.some(p => p.id === offer.id);
      return {
        ...state,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: swappedIn } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: true } : o
        ),
        allPlayers: alreadyTracked ? state.allPlayers : [...state.allPlayers, swappedIn],
        swapHistory: [...state.swapHistory, { slotId, oldPlayer, offerIndex }],
      };
    }

    case 'UNDO_SWAP': {
      if (!state.swapHistory.length) return state;
      const { slotId, oldPlayer, offerIndex } = state.swapHistory[state.swapHistory.length - 1];
      return {
        ...state,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: oldPlayer } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: false } : o
        ),
        swapHistory: state.swapHistory.slice(0, -1),
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

    case 'RESTORE':
      return { ...defaultState, ...action.payload };

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
    setFormation:  f  => dispatch({ type: 'SET_FORMATION', payload: f }),
    beginDraft:    pool => dispatch({ type: 'BEGIN_DRAFT', payload: pool }),
    placePlayer:   (slotId, player, displayRating) =>
                     dispatch({ type: 'PLACE_PLAYER', payload: { slotId, player, displayRating } }),
    setResult:     result => dispatch({ type: 'SET_RESULT', payload: result }),
    beginTransfer: (newDivision, offers) =>
                     dispatch({ type: 'BEGIN_TRANSFER', payload: { newDivision, transferOffers: offers } }),
    swapOffer:     (offerIndex, slotId) =>
                     dispatch({ type: 'SWAP_OFFER', payload: { offerIndex, slotId } }),
    undoSwap:      () => dispatch({ type: 'UNDO_SWAP' }),
    skipOffer:     i => dispatch({ type: 'SKIP_OFFER', payload: i }),
    removePlayer:  slotId => dispatch({ type: 'REMOVE_PLAYER', payload: slotId }),
    applyGrowth:   updatedSlots => dispatch({ type: 'APPLY_GROWTH', payload: { updatedSlots } }),
    restoreState:  payload => dispatch({ type: 'RESTORE', payload }),
    reset:         () => dispatch({ type: 'RESET' }),
  };
}
