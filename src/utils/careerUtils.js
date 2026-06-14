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

// Age multiplier: younger = premium, older = discount.
function ageFactor(age) {
  if (age === null)  return 1.0;
  if (age <= 20)     return 1.8;
  if (age <= 23)     return 1.4;
  if (age <= 27)     return 1.0;
  if (age <= 30)     return 0.72;
  if (age <= 33)     return 0.45;
  return 0.25;
}

// Transfer fee in millions. Adjusted by age and GEM status.
function offerPrice(rating, isGem = false, age = null) {
  let base;
  if (rating >= 92)      base = 40 + Math.floor(Math.random() * 25);
  else if (rating >= 87) base = 20 + Math.floor(Math.random() * 20);
  else if (rating >= 82) base = 10 + Math.floor(Math.random() * 15);
  else if (rating >= 77) base = 4  + Math.floor(Math.random() * 8);
  else                   base = 1  + Math.floor(Math.random() * 4);
  const aged = Math.round(base * ageFactor(age));
  return Math.max(1, isGem ? Math.floor(aged * 0.55) : aged);
}

// Prize money (€M) by final league position.
export function prizeMoney(pos, division) {
  if (division === 'bl') return Math.max(3, Math.round(52 - (pos - 1) * 2.8));
  return Math.max(1, Math.round(20 - (pos - 1) * 1.1));
}

// Rival clubs want to buy 1–3 non-Icon formation players under 34.
export function generateIncomingBids(slots, currentYear = null) {
  const eligible = slots.filter(s => {
    if (!s.player || s.player.isIcon || s.type === 'BENCH') return false;
    const age = getAge(s.player.id, currentYear);
    return age === null || age < 34; // no market for 34+ players
  });
  if (!eligible.length) return [];
  const count = 1 + Math.floor(Math.random() * Math.min(3, eligible.length));
  return shuffle(eligible).slice(0, count).map(s => {
    const age = getAge(s.player.id, currentYear);
    const base = offerPrice(s.player.displayRating, false, age);
    return {
      playerId:   s.player.id,
      playerName: s.player.name,
      slotType:   s.type,
      ovr:        s.player.displayRating,
      amount:     Math.max(1, base + Math.floor(Math.random() * 3)),
    };
  });
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

// Generate up to `count` offers for a single slot type.
// Each offer is tagged with { slotType }.
function generateOffersForSlotType(players, excludeIds, slotType, count, teamAvg, currentYear) {
  const eligible = shuffle(
    players
      .filter(p => !excludeIds.has(p.id) && p.seasons?.length)
      .filter(p => canPlayerFillSlot(p, slotType))
  );

  const withPot = p => assignPotential(p);

  if (!teamAvg || !eligible.length) {
    return eligible.slice(0, count).map(p => {
      const offer = withPot(attachSeason(p));
      const age = getAge(offer.id, currentYear);
      return { ...offer, slotType, price: offerPrice(offer.seasonRating, false, age) };
    });
  }

  const result = [];
  const usedIds = new Set();

  if (Math.random() < 0.2) {
    for (const p of eligible) {
      if (usedIds.has(p.id)) continue;
      const candidate = withPot(attachSeasonNear(p, teamAvg + 7));
      if (candidate.seasonRating >= teamAvg + 5) {
        result.push(candidate); usedIds.add(p.id); break;
      }
    }
  }

  for (const p of eligible) {
    if (result.length >= count) break;
    if (usedIds.has(p.id)) continue;
    const candidate = withPot(attachSeasonNear(p, teamAvg + 1.75));
    if (candidate.seasonRating >= teamAvg - 3) { result.push(candidate); usedIds.add(p.id); }
  }

  for (const p of eligible) {
    if (result.length >= count) break;
    if (!usedIds.has(p.id)) { result.push(withPot(attachSeasonNear(p, teamAvg))); usedIds.add(p.id); }
  }

  const final = shuffle(result).slice(0, count);

  const hasRealUpgrade = final.some(p => p.seasonRating >= teamAvg - 3);
  if (teamAvg >= 90 && !hasRealUpgrade && final.length && Math.random() < 0.4) {
    const idx = Math.floor(Math.random() * final.length);
    final[idx] = { ...final[idx], isGem: true, potential: 97 + Math.floor(Math.random() * 3) };
  }

  return final.map(p => {
    const age = getAge(p.id, currentYear);
    const isYoungGem = age !== null && age <= 21 && (p.potential - p.seasonRating) >= 10;
    const isGem = !!(p.isGem || isYoungGem);
    return { ...p, isGem, slotType, price: offerPrice(p.seasonRating, isGem, age) };
  });
}

// Build a full transfer market: 5 offers per unique slot type in the formation.
export function generateTransferMarket(players, excludeIds, formation, teamAvg = null, currentYear = null) {
  const slotTypes = [...new Set(formation.slots.map(s => s.type))];
  return slotTypes.flatMap(slotType =>
    generateOffersForSlotType(players, excludeIds, slotType, 5, teamAvg, currentYear)
  );
}

// Fresh offers for one slot type — call after selling a player to replenish that position.
export function generateOffersForType(players, excludeIds, slotType, teamAvg = null, currentYear = null) {
  return generateOffersForSlotType(players, excludeIds, slotType, 5, teamAvg, currentYear);
}
