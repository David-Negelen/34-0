import { useReducer, useEffect } from 'react';
import { FORMATIONS } from '../data/formations';

const STORAGE_KEYS = {
  bl:  'bundesliga_draft_v1',
  '2bl': 'zweite_liga_draft_v1',
};

const REROLLS = { easy: 3, normal: 1, hard: 0 };

const defaultSetup = {
  formation: '4-3-3',
  difficulty: 'normal',
  showRatings: true,
  draftMode: 'squad-first',
  ratingMode: 'career',
};

const defaultState = {
  phase: 'setup',     // 'setup' | 'draft' | 'result'
  setup: defaultSetup,
  draft: null,
  result: null,
};

function loadState(league) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[league] ?? STORAGE_KEYS.bl);
    if (raw) return JSON.parse(raw);
  } catch {}
  return defaultState;
}

function buildSlots(formationKey) {
  return FORMATIONS[formationKey].slots.map(s => ({ ...s, player: null }));
}

function reducer(state, action) {
  switch (action.type) {

    case 'UPDATE_SETUP':
      return { ...state, setup: { ...state.setup, ...action.payload } };

    case 'START_DRAFT': {
      const { setup } = state;
      return {
        ...state,
        phase: 'draft',
        draft: {
          slots: buildSlots(setup.formation),
          rerollsLeft: REROLLS[setup.difficulty],
          filledCount: 0,
          pendingSpin: null,
        },
        result: null,
      };
    }

    case 'FILL_SLOT': {
      const { slotId, player, displayRating } = action.payload;
      const slots = state.draft.slots.map(s =>
        s.id === slotId ? { ...s, player: { ...player, displayRating } } : s
      );
      const filledCount = slots.filter(s => s.player !== null).length;
      return { ...state, draft: { ...state.draft, slots, filledCount, pendingSpin: null } };
    }

    case 'USE_REROLL':
      return {
        ...state,
        draft: { ...state.draft, rerollsLeft: Math.max(0, state.draft.rerollsLeft - 1), pendingSpin: null },
      };

    case 'SET_PENDING_SPIN':
      return { ...state, draft: { ...state.draft, pendingSpin: action.payload } };

    case 'SET_RESULT':
      return { ...state, phase: 'result', result: action.payload };

    case 'RESET':
      return { ...defaultState, setup: state.setup };

    default:
      return state;
  }
}

export function useGameState(league = 'bl') {
  const [state, dispatch] = useReducer(reducer, league, loadState);
  const storageKey = STORAGE_KEYS[league] ?? STORAGE_KEYS.bl;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  const actions = {
    updateSetup: payload => dispatch({ type: 'UPDATE_SETUP', payload }),
    startDraft: () => dispatch({ type: 'START_DRAFT' }),
    fillSlot: (slotId, player, displayRating) =>
      dispatch({ type: 'FILL_SLOT', payload: { slotId, player, displayRating } }),
    useReroll: () => dispatch({ type: 'USE_REROLL' }),
    setPendingSpin: payload => dispatch({ type: 'SET_PENDING_SPIN', payload }),
    setResult: payload => dispatch({ type: 'SET_RESULT', payload }),
    reset: () => dispatch({ type: 'RESET' }),
  };

  return { state, ...actions };
}
