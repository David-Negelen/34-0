import { canPlayerFillSlot } from './playerUtils';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function attachSeason(player) {
  const s = player.seasons[Math.floor(Math.random() * player.seasons.length)];
  return { ...player, seasonRating: s.rating, spunClub: s.club, spunSeason: s.season, displayRating: s.rating };
}

// Generate a pool of `count` players for the initial career draft.
// Guarantees at least 2 eligible players per slot type in the formation.
export function generateCareerDraftPool(players, formation, count = 25) {
  const neededTypes = [...new Set(formation.slots.map(s => s.type))];
  const shuffled = shuffle(players.filter(p => p.seasons?.length).map(attachSeason));

  const chosen = [];
  const usedIds = new Set();

  for (const slotType of neededTypes) {
    let added = 0;
    for (const e of shuffled) {
      if (usedIds.has(e.id)) continue;
      if (canPlayerFillSlot(e, slotType)) {
        chosen.push(e);
        usedIds.add(e.id);
        if (++added >= 2) break;
      }
    }
  }

  for (const e of shuffled) {
    if (chosen.length >= count) break;
    if (!usedIds.has(e.id)) {
      chosen.push(e);
      usedIds.add(e.id);
    }
  }

  return shuffle(chosen).slice(0, count);
}

// Generate transfer offers: random players from `players` excluding current squad,
// filtered so each offer is compatible with at least one slot in the formation.
export function generateTransferOffers(players, excludeIds, formation, count = 5) {
  const slotTypes = formation.slots.map(s => s.type);
  return shuffle(
    players
      .filter(p => !excludeIds.has(p.id) && p.seasons?.length)
      .filter(p => slotTypes.some(type => canPlayerFillSlot(p, type)))
      .map(attachSeason)
  ).slice(0, count);
}
