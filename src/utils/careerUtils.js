import { canPlayerFillSlot } from './playerUtils';
import { assignPotential, markPrime } from './growthUtils';

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

// Pick a season using weighted random selection biased toward targetRating.
// Seasons near the target are more likely but any season can win, giving natural spread.
function attachSeasonWeighted(player, targetRating) {
  const { seasons } = player;
  const sigma = 10;
  const weights = seasons.map(s => Math.exp(-0.5 * ((s.rating - targetRating) / sigma) ** 2));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let chosen = seasons[seasons.length - 1];
  for (let i = 0; i < seasons.length; i++) {
    r -= weights[i];
    if (r <= 0) { chosen = seasons[i]; break; }
  }
  return { ...player, seasonRating: chosen.rating, spunClub: chosen.club, spunSeason: chosen.season, displayRating: chosen.rating };
}

// Generate a pool of `count` players for the initial career draft.
// Guarantees at least (slotCount + 1) eligible players per slot type so the
// user can never be stranded with no compatible player for an open slot.
// Players are biased toward a rating of ~65 (2. Bundesliga starting level).
export function generateCareerDraftPool(players, formation, count = 30) {
  const DRAFT_TARGET = 65;
  const slotTypeCounts = {};
  formation.slots.forEach(s => {
    slotTypeCounts[s.type] = (slotTypeCounts[s.type] || 0) + 1;
  });

  // Weighted random season selection biased toward 65 — gives natural spread rather than
  // everyone landing at exactly 65.
  const shuffled = shuffle(players.filter(p => p.seasons?.length).map(p => attachSeasonWeighted(p, DRAFT_TARGET)));

  const chosen = [];
  const usedIds = new Set();

  for (const [slotType, needed] of Object.entries(slotTypeCounts)) {
    const target = needed + 1; // one extra so the user always has a choice
    let added = 0;
    for (const e of shuffled) {
      if (usedIds.has(e.id)) continue;
      if (canPlayerFillSlot(e, slotType)) {
        chosen.push(assignPotential(e));
        usedIds.add(e.id);
        if (++added >= target) break;
      }
    }
  }

  const GK_MAX = 3;
  for (const e of shuffled) {
    if (chosen.length >= count) break;
    if (!usedIds.has(e.id)) {
      if (canPlayerFillSlot(e, 'GK') && chosen.filter(p => canPlayerFillSlot(p, 'GK')).length >= GK_MAX) continue;
      chosen.push(assignPotential(e));
      usedIds.add(e.id);
    }
  }

  return shuffle(chosen).slice(0, count);
}

// Generate transfer offers. Always includes 1 potential gem (lower OVR, high ceiling)
// alongside normal/standout offers. All offers have potential assigned.
export function generateTransferOffers(players, excludeIds, formation, count = 5, teamAvg = null) {
  const slotTypes = formation.slots.map(s => s.type);
  const eligible = shuffle(
    players
      .filter(p => !excludeIds.has(p.id) && p.seasons?.length)
      .filter(p => slotTypes.some(type => canPlayerFillSlot(p, type)))
  );

  const withPot = p => markPrime(assignPotential(p));

  if (!teamAvg || !eligible.length) {
    return eligible.map(p => withPot(attachSeason(p))).slice(0, count);
  }

  const result = [];
  const usedIds = new Set();

  // 1. Optional standout: significantly above team avg (20% chance)
  if (Math.random() < 0.2) {
    for (const p of eligible) {
      if (usedIds.has(p.id)) continue;
      const candidate = withPot(attachSeasonNear(p, teamAvg + 7));
      if (candidate.seasonRating >= teamAvg + 5) {
        result.push(candidate);
        usedIds.add(p.id);
        break;
      }
    }
  }

  // 2. Normal offers: OVR near team avg
  for (const p of eligible) {
    if (result.length >= count) break;
    if (usedIds.has(p.id)) continue;
    const candidate = withPot(attachSeasonNear(p, teamAvg + 1.75));
    if (candidate.seasonRating >= teamAvg - 3) {
      result.push(candidate);
      usedIds.add(p.id);
    }
  }

  // 3. Fallback: remaining players, still biased toward team avg
  for (const p of eligible) {
    if (result.length >= count) break;
    if (!usedIds.has(p.id)) {
      result.push(withPot(attachSeasonNear(p, teamAvg)));
      usedIds.add(p.id);
    }
  }

  const final = shuffle(result).slice(0, count);

  // Late-game only (teamAvg ≥ 85): one random offer gets a gem chance.
  // 5% normally, 7% if the player is already high-rated (≥ 85).
  if (teamAvg >= 85 && final.length) {
    const idx = Math.floor(Math.random() * final.length);
    const p = final[idx];
    const chance = p.seasonRating >= 85 ? 0.07 : 0.05;
    if (Math.random() < chance) {
      final[idx] = { ...p, isGem: true, potential: 97 + Math.floor(Math.random() * 3) };
    }
  }

  return final;
}
