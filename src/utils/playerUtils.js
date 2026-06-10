import { SLOT_COMPAT } from '../data/formations';

// All unique clubs that have player data
export function getClubsInDb(players) {
  const clubs = new Set();
  players.forEach(p => p.seasons.forEach(s => clubs.add(s.club)));
  return [...clubs].sort();
}

// All seasons for a specific club (sorted)
export function getSeasonsForClub(players, club) {
  const seasons = new Set();
  players.forEach(p => {
    p.seasons.forEach(s => {
      if (s.club === club) seasons.add(s.season);
    });
  });
  return [...seasons].sort();
}

// Players at a club in a season, with seasonRating + spin context attached
export function getPlayersForClubSeason(players, club, season) {
  return players
    .filter(p => p.seasons.some(s => s.club === club && s.season === season))
    .map(p => {
      const entry = p.seasons.find(s => s.club === club && s.season === season);
      return { ...p, seasonRating: entry.rating, spunClub: club, spunSeason: season };
    });
}

// Can player fill a given slot type?
export function canPlayerFillSlot(player, slotType) {
  if (player.id === 'kevin_grosskreutz_44521') return true; // he played every position
  const compatible = SLOT_COMPAT[slotType] ?? [];
  return player.positions.some(pos => compatible.includes(pos));
}

// Get open (unfilled) slots
export function getOpenSlots(slots) {
  return slots.filter(s => s.player === null);
}

// Players eligible to fill any of the given open slots
export function getEligiblePlayers(players, openSlots) {
  return players.filter(p =>
    openSlots.some(slot => canPlayerFillSlot(p, slot.type))
  );
}

// Compatible open slots for a given player
export function getCompatibleSlots(player, openSlots) {
  return openSlots.filter(slot => canPlayerFillSlot(player, slot.type));
}

// Per-league tier config.
// bad    — maxRating <= badMaxRating
// mid    — 0 eligible players above decentThreshold
// decent — 1+ eligible players above decentThreshold, but 0 above goodThreshold
// good   — 1+ eligible players above goodThreshold
const TIER_CONFIG = {
  bl: {
    badMaxRating:    75,
    decentThreshold: 81,
    goodThreshold:   84,
    targets: { bad: 0.05, mid: 0.20, decent: 0.40, good: 0.35 },
  },
  '2bl': {
    badMaxRating:    65,
    decentThreshold: 74,
    goodThreshold:   78,
    targets: { bad: 0.05, mid: 0.20, decent: 0.40, good: 0.35 },
  },
};

function spinTier(pool, openSlots, league = 'bl') {
  const cfg = TIER_CONFIG[league] ?? TIER_CONFIG.bl;
  const maxRating = Math.max(...pool.map(p => p.seasonRating ?? p.primeRating));
  if (maxRating <= cfg.badMaxRating) return 'bad';
  const hasDecent = pool.some(p =>
    (p.seasonRating ?? p.primeRating) > cfg.decentThreshold &&
    openSlots.some(s => canPlayerFillSlot(p, s.type))
  );
  if (!hasDecent) return 'mid';
  const hasGood = pool.some(p =>
    (p.seasonRating ?? p.primeRating) > cfg.goodThreshold &&
    openSlots.some(s => canPlayerFillSlot(p, s.type))
  );
  return hasGood ? 'good' : 'decent';
}

// Build a weighted-random picker for a set of pairs using a given league config.
// Returns a weight function: pair → number.
function makeTierWeightFn(pairs, league) {
  const cfg = TIER_CONFIG[league] ?? TIER_CONFIG.bl;
  const counts = { bad: 0, mid: 0, decent: 0, good: 0 };
  for (const p of pairs) counts[p.tier]++;
  const activeSum = Object.keys(cfg.targets).reduce(
    (s, t) => s + (counts[t] > 0 ? cfg.targets[t] : 0), 0
  );
  return p => counts[p.tier] > 0 ? (cfg.targets[p.tier] / activeSum) / counts[p.tier] : 0;
}

// Pick a random club/season that has eligible candidates for the open slots.
// league controls tier thresholds and targets.
// Pokal: players tagged with _league='bl'|'2bl' are split 75% BL / 25% 2BL.
// excludeIds: Set of player IDs already placed — excluded from pool and eligibility.
// Returns { club, season, candidates } or null.
export function randomSpin(players, openSlots, excludeIds = new Set(), league = 'bl') {
  const isPokal = league === 'pokal';
  const pairs = [];
  for (const club of getClubsInDb(players)) {
    for (const season of getSeasonsForClub(players, club)) {
      const pool = getPlayersForClubSeason(players, club, season)
        .filter(p => !excludeIds.has(p.id));
      if (!getEligiblePlayers(pool, openSlots).length) continue;
      const pairLeague = isPokal ? (pool[0]?._league ?? 'bl') : league;
      pairs.push({ club, season, pool, tier: spinTier(pool, openSlots, pairLeague), _league: pairLeague });
    }
  }
  if (!pairs.length) return null;

  let weightFn;
  if (isPokal) {
    const blPairs  = pairs.filter(p => p._league === 'bl');
    const bl2Pairs = pairs.filter(p => p._league === '2bl');
    const blW  = makeTierWeightFn(blPairs,  'bl');
    const bl2W = makeTierWeightFn(bl2Pairs, '2bl');
    weightFn = p => p._league === 'bl' ? 0.75 * blW(p) : 0.25 * bl2W(p);
  } else {
    weightFn = makeTierWeightFn(pairs, league);
  }

  const totalWeight = pairs.reduce((s, p) => s + weightFn(p), 0);
  let r = Math.random() * totalWeight;
  let picked = pairs[pairs.length - 1];
  for (const p of pairs) {
    r -= weightFn(p);
    if (r <= 0) { picked = p; break; }
  }
  return { club: picked.club, season: picked.season, candidates: picked.pool };
}

// German position label mapping
const LABEL_DE = {
  GK: 'TW', RB: 'RV', CB: 'IV', LB: 'LV',
  DM: 'ZDM', CM: 'ZM', AM: 'ZOM',
  RW: 'RF', LW: 'LF', ST: 'ST',
  RM: 'RM', LM: 'LM', RWB: 'RAV', LWB: 'LAV',
};
export const labelDE = label => LABEL_DE[label] ?? label;

// Rating to display for a player based on ratingMode
export function getDisplayRating(player, ratingMode) {
  return ratingMode === 'prime' ? player.primeRating : player.seasonRating;
}

// CSS class for a rating value (thresholds differ per league)
export function ratingClass(rating, league = 'bl') {
  if (league === '2bl') {
    if (rating >= 76) return 'rating-high';
    if (rating >= 71) return 'rating-good';
    if (rating >= 66) return 'rating-mid';
    return 'rating-low';
  }
  if (rating >= 90) return 'rating-high';
  if (rating >= 84) return 'rating-good';
  if (rating >= 78) return 'rating-mid';
  return 'rating-low';
}

// Short display name for the pitch token (surname or first 10 chars)
export function shortName(name) {
  const parts = name.split(' ');
  if (parts.length === 1) return name.slice(0, 10);
  return parts[parts.length - 1].slice(0, 10);
}

// Returns [line1, line2|null] for pitch token display.
// Names ≤ 8 chars are shown whole; longer ones are split at a syllable boundary.
export function tokenName(name) {
  const surname = name.split(' ').pop();
  if (surname.length <= 10) return [surname, null];
  return syllableSplit(surname);
}

function syllableSplit(word) {
  const VOWELS = 'aeiouäöüáéíóúàèìòùAEIOUÄÖÜÁÉÍÓÚÀÈÌÒÙ';
  const isV = c => VOWELS.includes(c);
  const mid = Math.floor(word.length / 2);

  const positions = [mid];
  for (let d = 1; d <= 4; d++) positions.push(mid + d, mid - d);

  // V|C boundary: if the consonant is surrounded by vowels (V|C|V), keep C with
  // the following syllable (e.g. "Mertes|acker" not "Merte|sacker")
  for (const pos of positions) {
    if (pos <= 1 || pos >= word.length - 1) continue;
    const prev = word[pos - 1], curr = word[pos], next = word[pos + 1] ?? '';
    if (isV(prev) && !isV(curr)) {
      const splitAt = isV(next) ? pos + 1 : pos;
      return [word.slice(0, splitAt), word.slice(splitAt)];
    }
  }
  // Fallback: C|C boundary
  for (const pos of positions) {
    if (pos <= 1 || pos >= word.length - 1) continue;
    const prev = word[pos - 1], curr = word[pos];
    if (!isV(prev) && !isV(curr)) return [word.slice(0, pos), word.slice(pos)];
  }
  return [word.slice(0, mid), word.slice(mid)];
}
