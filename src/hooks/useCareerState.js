import { useReducer, useEffect } from 'react';
import { FORMATIONS } from '../data/formations';

const STORAGE_KEY = 'karriere_v3';

const defaultState = {
  phase: 'setup',
  formation: '4-3-3',
  startingDivision: '2bl',
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

    case 'SET_STARTING_DIVISION':
      return { ...state, startingDivision: action.payload };

    case 'CHANGE_FORMATION': {
      const newKey = action.payload;
      if (newKey === state.formation) return state;
      const newFormSlots = FORMATIONS[newKey].slots.map(s => ({ ...s, player: null }));
      const benchSlots   = state.slots.filter(s => s.type === 'BENCH').map(s => ({ ...s }));
      const toPlace      = state.slots.filter(s => s.type !== 'BENCH' && s.player).map(s => s.player);

      // 1. Match players to slots by natural position
      const placed = new Set();
      for (const slot of newFormSlots) {
        const match = toPlace.find(p => !placed.has(p.id) && p.positions?.includes(slot.type));
        if (match) { slot.player = match; placed.add(match.id); }
      }
      // 2. Fill remaining empty slots with leftover players (out of position)
      const leftover = toPlace.filter(p => !placed.has(p.id));
      const emptyNew = newFormSlots.filter(s => !s.player);
      leftover.forEach((p, i) => {
        if (i < emptyNew.length) { emptyNew[i].player = p; placed.add(p.id); }
      });
      // 3. Any remaining go to bench; overflow bench → released
      toPlace.filter(p => !placed.has(p.id)).forEach(p => {
        const b = benchSlots.find(s => !s.player);
        if (b) b.player = p;
      });

      return { ...state, formation: newKey, slots: [...newFormSlots, ...benchSlots] };
    }

    case 'BEGIN_DRAFT': {
      const { pool, division: startDiv } = action.payload;
      const years = pool.map(p => parseInt(p.spunSeason)).filter(y => !isNaN(y));
      const careerStartYear = years.length
        ? Math.round(years.reduce((a, b) => a + b, 0) / years.length)
        : 2000;
      const div = startDiv ?? state.startingDivision ?? '2bl';
      return {
        ...defaultState,
        formation: state.formation,
        startingDivision: div,
        division: div,
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

    // Buy a player — always lands on the bench first (bench must have a free slot).
    case 'BUY_OFFER': {
      const { offerIndex } = action.payload;
      const offer = state.transferOffers[offerIndex];
      if (!offer || offer.used || offer.skipped) return state;
      const price = offer.price ?? 0;
      if ((state.budget ?? 0) < price) return state;

      const emptyBench = state.slots.find(s => s.type === 'BENCH' && !s.player);
      if (!emptyBench) return state; // bench full — caller should guard

      const swappedIn = { ...offer, displayRating: offer.seasonRating };
      const alreadyTracked = state.allPlayers.some(p => p.id === offer.id);

      return {
        ...state,
        budget: (state.budget ?? 0) - price,
        slots: state.slots.map(s =>
          s.id === emptyBench.id ? { ...s, player: swappedIn } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: true } : o
        ),
        allPlayers: alreadyTracked ? state.allPlayers : [...state.allPlayers, swappedIn],
        swapHistory: [...state.swapHistory, { benchSlotId: emptyBench.id, offerIndex, price }],
      };
    }

    case 'UNDO_BUY': {
      if (!state.swapHistory.length) return state;
      const { benchSlotId, offerIndex, price = 0 } = state.swapHistory[state.swapHistory.length - 1];
      return {
        ...state,
        budget: (state.budget ?? 0) + price,
        slots: state.slots.map(s =>
          s.id === benchSlotId ? { ...s, player: null } : s
        ),
        transferOffers: state.transferOffers.map((o, i) =>
          i === offerIndex ? { ...o, used: false } : o
        ),
        swapHistory: state.swapHistory.slice(0, -1),
      };
    }

    // Free move between any two squad slots (bench ↔ formation, formation ↔ formation).
    case 'MOVE_IN_SQUAD': {
      const { fromSlotId, toSlotId } = action.payload;
      const fromSlot = state.slots.find(s => s.id === fromSlotId);
      const toSlot   = state.slots.find(s => s.id === toSlotId);
      if (!fromSlot?.player) return state;
      return {
        ...state,
        slots: state.slots.map(s => {
          if (s.id === fromSlotId) return { ...s, player: toSlot?.player ?? null };
          if (s.id === toSlotId)   return { ...s, player: fromSlot.player };
          return s;
        }),
      };
    }

    case 'SELL_PLAYER': {
      const { playerId, amount, newOffers = [] } = action.payload;
      return {
        ...state,
        budget: (state.budget ?? 0) + amount,
        slots: state.slots.map(s =>
          s.player?.id === playerId ? { ...s, player: null } : s
        ),
        incomingBids: state.incomingBids.filter(b => b.playerId !== playerId),
        transferOffers: [...state.transferOffers, ...newOffers],
        swapHistory: [], // sells can't be undone; clear so undo doesn't revert an older buy
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
    setFormation:          f => dispatch({ type: 'SET_FORMATION', payload: f }),
    setStartingDivision:   d => dispatch({ type: 'SET_STARTING_DIVISION', payload: d }),
    changeFormation: f => dispatch({ type: 'CHANGE_FORMATION', payload: f }),
    beginDraft:    (pool, division) => dispatch({ type: 'BEGIN_DRAFT', payload: { pool, division } }),
    placePlayer:   (slotId, player, displayRating) =>
                     dispatch({ type: 'PLACE_PLAYER', payload: { slotId, player, displayRating } }),
    setResult:     result => dispatch({ type: 'SET_RESULT', payload: result }),
    beginTransfer: (newDivision, offers, retiredThisSeason, prize, incomingBids) =>
                     dispatch({ type: 'BEGIN_TRANSFER', payload: { newDivision, transferOffers: offers, retiredThisSeason, prize, incomingBids } }),
    buyOffer:      (offerIndex) =>
                     dispatch({ type: 'BUY_OFFER', payload: { offerIndex } }),
    undoBuy:       () => dispatch({ type: 'UNDO_BUY' }),
    moveInSquad:   (fromSlotId, toSlotId) =>
                     dispatch({ type: 'MOVE_IN_SQUAD', payload: { fromSlotId, toSlotId } }),
    sellPlayer:    (playerId, amount, newOffers = []) =>
                     dispatch({ type: 'SELL_PLAYER', payload: { playerId, amount, newOffers } }),
    skipOffer:     i => dispatch({ type: 'SKIP_OFFER', payload: i }),
    removePlayer:  slotId => dispatch({ type: 'REMOVE_PLAYER', payload: slotId }),
    applyGrowth:   updatedSlots => dispatch({ type: 'APPLY_GROWTH', payload: { updatedSlots } }),
    reset:         () => dispatch({ type: 'RESET' }),
  };
}
