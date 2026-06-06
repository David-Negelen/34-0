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

// Players at a club in a season, with seasonRating attached
export function getPlayersForClubSeason(players, club, season) {
  return players
    .filter(p => p.seasons.some(s => s.club === club && s.season === season))
    .map(p => {
      const entry = p.seasons.find(s => s.club === club && s.season === season);
      return { ...p, seasonRating: entry.rating };
    });
}

// Can player fill a given slot type?
export function canPlayerFillSlot(player, slotType) {
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

// Pick a random club and season that has eligible candidates for the open slots
// Returns { club, season, candidates } or null if nothing found after maxTries
export function randomSpin(players, openSlots, maxTries = 30) {
  const clubs = getClubsInDb(players);
  for (let i = 0; i < maxTries; i++) {
    const club = clubs[Math.floor(Math.random() * clubs.length)];
    const seasons = getSeasonsForClub(players, club);
    if (!seasons.length) continue;
    const season = seasons[Math.floor(Math.random() * seasons.length)];
    const pool = getPlayersForClubSeason(players, club, season);
    const eligible = getEligiblePlayers(pool, openSlots);
    if (eligible.length > 0) return { club, season, candidates: pool };
  }
  return null;
}

// Rating to display for a player based on ratingMode
export function getDisplayRating(player, ratingMode) {
  return ratingMode === 'prime' ? player.primeRating : player.seasonRating;
}

// CSS class for a rating value
export function ratingClass(rating) {
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
