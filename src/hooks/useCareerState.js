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
};

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
      return {
        ...state,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: { ...player, displayRating } } : s
        ),
      };
    }

    case 'SET_RESULT':
      return { ...state, phase: 'result', result: action.payload };

    case 'BEGIN_TRANSFER': {
      const { newDivision, transferOffers } = action.payload;
      const history = state.result
        ? [...state.seasonHistory, {
            season: state.seasonNumber,
            division: state.division,
            pos: state.result.pos,
            pts: state.result.pts,
          }]
        : state.seasonHistory;
      return {
        ...state,
        phase: 'transfer',
        division: newDivision,
        seasonNumber: state.seasonNumber + 1,
        transferOffers,
        seasonHistory: history,
        result: null,
      };
    }

    case 'SWAP_OFFER': {
      const { offerIndex, slotId } = action.payload;
      const offer = state.transferOffers[offerIndex];
      if (!offer || offer.used || offer.skipped) return state;
      return {
        ...state,
        slots: state.slots.map(s =>
          s.id === slotId ? { ...s, player: { ...offer, displayRating: offer.seasonRating } } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: true } : o
        ),
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

    case 'RESET':
      return defaultState;

    default:
      return state;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
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
    skipOffer:     i => dispatch({ type: 'SKIP_OFFER', payload: i }),
    removePlayer:  slotId => dispatch({ type: 'REMOVE_PLAYER', payload: slotId }),
    reset:         () => dispatch({ type: 'RESET' }),
  };
}
