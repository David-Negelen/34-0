import { canPlayerFillSlot } from './playerUtils';
import { assignPotential } from './growthUtils';
import { getAge, seasonToYear } from './ageUtils';

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
  if (age <= 30)     return 0.7;
  if (age <= 33)     return 0.4;
  return 0.2;
}

// Potential ceiling bonus: high upside drives up price.
function potentialMultiplier(potential) {
  if (!potential)      return 1.0;
  if (potential >= 93) return 2.2;
  if (potential >= 88) return 1.7;
  if (potential >= 83) return 1.3;
  if (potential >= 78) return 1.1;
  return 1.0;
}

// Transfer fee in millions. Adjusted by age and potential.
function offerPrice(rating, _isGem = false, age = null, potential = null) {
  let base;
  if (rating >= 92)      base = 70 + Math.floor(Math.random() * 40);
  else if (rating >= 87) base = 35 + Math.floor(Math.random() * 30);
  else if (rating >= 82) base = 15 + Math.floor(Math.random() * 18);
  else if (rating >= 77) base = 6  + Math.floor(Math.random() * 10);
  else if (rating >= 72) base = 2  + Math.floor(Math.random() * 5);
  else                   base = 1  + Math.floor(Math.random() * 2);
  return Math.max(1, Math.round(base * ageFactor(age) * potentialMultiplier(potential)));
}

// Prize money (€M) by final league position.
export function prizeMoney(pos, division) {
  if (division === 'bl')  return Math.max(3, Math.round(52 - (pos - 1) * 2.8));
  if (division === '2bl') return Math.max(1, Math.round(20 - (pos - 1) * 1.1));
  return Math.max(0, Math.round(8 - (pos - 1) * 0.4));  // 3. Liga
}

const BID_CLUBS = {
  bl:  ['FC Bayern München', 'Borussia Dortmund', 'Bayer 04 Leverkusen', 'VfB Stuttgart', 'Eintracht Frankfurt', 'SC Freiburg', 'Borussia Mönchengladbach', 'Werder Bremen', 'VfL Wolfsburg'],
  '2bl': ['FC Schalke 04', 'Hannover 96', 'Fortuna Düsseldorf', 'Hertha BSC', '1. FC Kaiserslautern', 'Arminia Bielefeld', '1. FC Nürnberg', 'SpVgg Greuther Fürth', 'Karlsruher SC'],
  '3l': ['TSV 1860 München', 'Dynamo Dresden', 'FC Hansa Rostock', 'SV Wehen Wiesbaden', 'VfL Osnabrück', 'Hallescher FC', 'FC Ingolstadt 04', 'MSV Duisburg', 'SpVgg Unterhaching'],
};

// Rival clubs want to buy 1–3 non-Icon formation players under 34.
export function generateIncomingBids(slots, currentYear = null, division = '2bl') {
  const eligible = slots.filter(s => {
    if (!s.player || s.player.isIcon || s.type === 'BENCH') return false;
    const age = getAge(s.player.id, currentYear);
    return age === null || age < 34; // no market for 34+ players
  });
  if (!eligible.length) return [];
  // Buying clubs are from the same division or one above
  const clubPool = division === '3l'
    ? [...BID_CLUBS['2bl'], ...BID_CLUBS['3l']]
    : division === '2bl'
    ? [...BID_CLUBS['bl'], ...BID_CLUBS['2bl']]
    : BID_CLUBS['bl'];
  const shuffledClubs = shuffle(clubPool);
  const count = 1 + Math.floor(Math.random() * Math.min(3, eligible.length));
  return shuffle(eligible).slice(0, count).map((s, i) => {
    const age = getAge(s.player.id, currentYear);
    const base = offerPrice(s.player.displayRating, false, age, s.player.potential);
    return {
      playerId:    s.player.id,
      playerName:  s.player.name,
      slotType:    s.type,
      ovr:         s.player.displayRating,
      age:         age,
      amount:      Math.max(1, base + Math.floor(Math.random() * 5)),
      buyingClub:  shuffledClubs[i % shuffledClubs.length],
    };
  });
}

export function generateCareerDraftPool(players, formation, count = 30, division = '2bl') {
  const DRAFT_TARGET = division === '3l' ? 58 : 65;
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
        chosen.push(assignPotential(e, getAge(e.id, seasonToYear(e.spunSeason))));
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
      chosen.push(assignPotential(e, getAge(e.id, seasonToYear(e.spunSeason))));
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

  const withPot = p => assignPotential(p, getAge(p.id, currentYear));

  if (!teamAvg || !eligible.length) {
    return eligible.slice(0, count).map(p => {
      const age = getAge(p.id, currentYear);
      const offer = assignPotential(attachSeason(p), age);
      const displayAge = getAge(offer.id, seasonToYear(offer.spunSeason));
      return { ...offer, age: displayAge, slotType, price: offerPrice(offer.seasonRating, false, age, offer.potential) };
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
    const displayAge = getAge(p.id, seasonToYear(p.spunSeason));
    const gap = p.potential - p.seasonRating;
    const isYoungGem = age !== null && age <= 19 && gap >= 13;
    const isGem = !!(p.isGem || isYoungGem);
    const potential = isYoungGem
      ? Math.max(p.potential, 85 + Math.floor(Math.random() * 9))
      : p.potential;
    return { ...p, age: displayAge, isGem, potential, slotType, price: offerPrice(p.seasonRating, isGem, age, potential) };
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
