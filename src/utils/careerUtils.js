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

// Pick the season with rating closest to targetRating.
function attachSeasonNear(player, targetRating) {
  const s = player.seasons.reduce((best, cur) =>
    Math.abs(cur.rating - targetRating) < Math.abs(best.rating - targetRating) ? cur : best
  );
  return { ...player, seasonRating: s.rating, spunClub: s.club, spunSeason: s.season, displayRating: s.rating };
}

// Generate a pool of `count` players for the initial career draft.
// Guarantees at least (slotCount + 1) eligible players per slot type so the
// user can never be stranded with no compatible player for an open slot.
export function generateCareerDraftPool(players, formation, count = 25) {
  const slotTypeCounts = {};
  formation.slots.forEach(s => {
    slotTypeCounts[s.type] = (slotTypeCounts[s.type] || 0) + 1;
  });

  const shuffled = shuffle(players.filter(p => p.seasons?.length).map(attachSeason));
  const chosen = [];
  const usedIds = new Set();

  for (const [slotType, needed] of Object.entries(slotTypeCounts)) {
    const target = needed + 1; // one extra so the user always has a choice
    let added = 0;
    for (const e of shuffled) {
      if (usedIds.has(e.id)) continue;
      if (canPlayerFillSlot(e, slotType)) {
        chosen.push(e);
        usedIds.add(e.id);
        if (++added >= target) break;
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

// Generate transfer offers biased toward the team's current avg rating (+2 improvement).
// 20% chance for a standout player (+5 to +8 above avg). teamAvg is optional.
export function generateTransferOffers(players, excludeIds, formation, count = 5, teamAvg = null) {
  const slotTypes = formation.slots.map(s => s.type);
  const eligible = players
    .filter(p => !excludeIds.has(p.id) && p.seasons?.length)
    .filter(p => slotTypes.some(type => canPlayerFillSlot(p, type)));

  if (!teamAvg || !eligible.length) {
    return shuffle(eligible.map(attachSeason)).slice(0, count);
  }

  const shuffled = shuffle(eligible);
  const includeStandout = Math.random() < 0.2;

  const standoutPool = shuffled
    .map(p => attachSeasonNear(p, teamAvg + 7))
    .filter(p => p.seasonRating >= teamAvg + 5);

  const normalPool = shuffled
    .map(p => attachSeasonNear(p, teamAvg + 2))
    .filter(p => p.seasonRating >= teamAvg - 3);

  const result = [];
  const usedIds = new Set();

  if (includeStandout) {
    for (const p of standoutPool) {
      if (!usedIds.has(p.id)) { result.push(p); usedIds.add(p.id); break; }
    }
  }

  for (const p of normalPool) {
    if (result.length >= count) break;
    if (!usedIds.has(p.id)) { result.push(p); usedIds.add(p.id); }
  }

  for (const p of shuffled.map(attachSeason)) {
    if (result.length >= count) break;
    if (!usedIds.has(p.id)) { result.push(p); usedIds.add(p.id); }
  }

  return shuffle(result).slice(0, count);
}
