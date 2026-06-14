import birthDates from '../data/playerBirthDates.json';

// Extracts the numeric TM id suffix from a player id like "miroslav_klose_8198" → "8198"
function tmIdFromPlayerId(id) {
  const m = id?.match(/_(\d+)$/);
  return m ? m[1] : null;
}

export function getBirthYear(playerId) {
  const tmId = tmIdFromPlayerId(playerId);
  if (!tmId) return null;
  const d = birthDates[tmId];
  if (!d) return null;
  return parseInt(d.slice(0, 4), 10);
}

export function getAge(playerId, currentYear) {
  const by = getBirthYear(playerId);
  if (!currentYear) return 25;
  if (!by) return 25;
  return currentYear - by;
}
