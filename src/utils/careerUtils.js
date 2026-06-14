import { canPlayerFillSlot } from './playerUtils';
import { assignPotential } from './growthUtils';
import { getAge } from './ageUtils';

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

function attachSeasonNear(player, targetRating) {
  const s = player.seasons.reduce((best, cur) =>
    Math.abs(cur.rating - targetRating) < Math.abs(best.rating - targetRating) ? cur : best
  );
  return { ...player, seasonRating: s.rating, spunClub: s.club, spunSeason: s.season, displayRating: s.rating };
}

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

// Transfer fee in millions. GEMs are undervalued (×0.55).
function offerPrice(rating, isGem = false) {
  let base;
  if (rating >= 92)      base = 40 + Math.floor(Math.random() * 25);
  else if (rating >= 87) base = 20 + Math.floor(Math.random() * 20);
  else if (rating >= 82) base = 10 + Math.floor(Math.random() * 15);
  else if (rating >= 77) base = 4  + Math.floor(Math.random() * 8);
  else                   base = 1  + Math.floor(Math.random() * 4);
  return isGem ? Math.max(1, Math.floor(base * 0.55)) : base;
}

// Prize money (€M) by final league position.
export function prizeMoney(pos, division) {
  if (division === 'bl') return Math.max(3, Math.round(52 - (pos - 1) * 2.8));
  return Math.max(1, Math.round(20 - (pos - 1) * 1.1));
}

// Rival clubs want to buy 1–3 non-Icon formation players.
export function generateIncomingBids(slots) {
  const eligible = slots.filter(s => s.player && !s.player.isIcon && s.type !== 'BENCH');
  if (!eligible.length) return [];
  const count = 1 + Math.floor(Math.random() * Math.min(3, eligible.length));
  return shuffle(eligible).slice(0, count).map(s => ({
    playerId:   s.player.id,
    playerName: s.player.name,
    slotType:   s.type,
    ovr:        s.player.displayRating,
    amount:     offerPrice(s.player.displayRating) + 3 + Math.floor(Math.random() * 8),
  }));
}

export function generateCareerDraftPool(players, formation, count = 30) {
  const DRAFT_TARGET = 65;
  const slotTypeCounts = {};
  formation.slots.forEach(s => {
    slotTypeCounts[s.type] = (slotTypeCounts[s.type] || 0) + 1;
  });

  const shuffled = shuffle(players.filter(p => p.seasons?.length).map(p => attachSeasonWeighted(p, DRAFT_TARGET)));

  const chosen = [];
  const usedIds = new Set();

  for (const [slotType, needed] of Object.entries(slotTypeCounts)) {
    const target = needed + 1;
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

export function generateTransferOffers(players, excludeIds, formation, count = 5, teamAvg = null, currentYear = null) {
  const slotTypes = formation.slots.map(s => s.type);
  const eligible = shuffle(
    players
      .filter(p => !excludeIds.has(p.id) && p.seasons?.length)
      .filter(p => slotTypes.some(type => canPlayerFillSlot(p, type)))
  );

  const withPot = p => assignPotential(p);

  if (!teamAvg || !eligible.length) {
    return eligible.map(p => {
      const offer = withPot(attachSeason(p));
      return { ...offer, price: offerPrice(offer.seasonRating) };
    }).slice(0, count);
  }

  const result = [];
  const usedIds = new Set();

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

  for (const p of eligible) {
    if (result.length >= count) break;
    if (usedIds.has(p.id)) continue;
    const candidate = withPot(attachSeasonNear(p, teamAvg + 1.75));
    if (candidate.seasonRating >= teamAvg - 3) {
      result.push(candidate);
      usedIds.add(p.id);
    }
  }

  for (const p of eligible) {
    if (result.length >= count) break;
    if (!usedIds.has(p.id)) {
      result.push(withPot(attachSeasonNear(p, teamAvg)));
      usedIds.add(p.id);
    }
  }

  const final = shuffle(result).slice(0, count);

  // Late-game gem: low OVR, elite potential (97–99)
  const hasRealUpgrade = final.some(p => p.seasonRating >= teamAvg - 3);
  if (teamAvg >= 90 && !hasRealUpgrade && final.length && Math.random() < 0.4) {
    const idx = Math.floor(Math.random() * final.length);
    final[idx] = { ...final[idx], isGem: true, potential: 97 + Math.floor(Math.random() * 3) };
  }

  // Attach price tags and age-gated gem detection
  return final.map(p => {
    const age = getAge(p.id, currentYear);
    const isYoungGem = age !== null && age <= 21 && (p.potential - p.seasonRating) >= 10;
    const isGem = !!(p.isGem || isYoungGem);
    return { ...p, isGem, price: offerPrice(p.seasonRating, isGem) };
  });
}
