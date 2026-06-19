import { canPlayerFillSlot } from './playerUtils';
import { assignPotential } from './growthUtils';
import { getAge, seasonToYear } from './ageUtils';

function playerPrime(player) {
  if (!player.seasons?.length) return player.seasonRating ?? player.displayRating ?? 60;
  return Math.max(...player.seasons.map(s => s.rating));
}

// Duplicate of ageGapScale from growthUtils — avoids circular import.
function ageGapScaleLocal(age) {
  if (age <= 21) return 1.0;
  if (age <= 23) return 0.80;
  if (age <= 26) return 0.55;
  if (age <= 29) return 0.25;
  if (age <= 32) return 0.08;
  return 0.0;
}

// Potential ceiling ≈ player's career prime, scaled down for age.
// Replaces assignPotential in transfer market context.
function assignPotentialFromPrime(player, age = null) {
  const prime = playerPrime(player);
  const displayRating = player.displayRating ?? player.seasonRating ?? 60;
  const ceiling = prime + (Math.floor(Math.random() * 3) - 1); // prime-1 to prime+1
  const rawGap = Math.max(0, ceiling - displayRating);
  const scale = age !== null ? ageGapScaleLocal(age) : 1.0;
  return { ...player, potential: displayRating + Math.round(rawGap * scale) };
}

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

// Position market value multiplier — GKs and CBs worth less than attackers/wingers.
function positionFactor(slotType) {
  if (slotType === 'GK') return 0.50;
  if (slotType === 'CB') return 0.80;
  if (['LB', 'RB'].includes(slotType)) return 0.90;
  if (slotType === 'DM') return 0.85;
  if (slotType === 'CM') return 1.00;
  if (['LW', 'RW'].includes(slotType)) return 1.10;
  if (slotType === 'ST') return 1.15;
  return 1.00;
}

// Transfer fee in millions. Adjusted by age, potential, and position.
function offerPrice(rating, _isGem = false, age = null, potential = null, slotType = null) {
  let base;
  if (rating >= 92)      base = 70 + Math.floor(Math.random() * 40);
  else if (rating >= 87) base = 35 + Math.floor(Math.random() * 30);
  else if (rating >= 82) base = 15 + Math.floor(Math.random() * 18);
  else if (rating >= 77) base = 6  + Math.floor(Math.random() * 10);
  else if (rating >= 72) base = 2  + Math.floor(Math.random() * 5);
  else                   base = 1  + Math.floor(Math.random() * 2);
  return Math.max(1, Math.round(base * ageFactor(age) * potentialMultiplier(potential) * positionFactor(slotType)));
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

// Use the age stored on the player (set at purchase/draft, incremented each season).
// Falls back to historical-season derivation for players without a stored age (old saves).
function playerEffectiveAge(player, currentYear) {
  if (player.age != null) return player.age;
  if (player.spunSeason) {
    const historicalAge = getAge(player.id, seasonToYear(player.spunSeason));
    if (historicalAge !== null) return historicalAge;
  }
  return getAge(player.id, currentYear);
}

// Rival clubs want to buy 1–3 non-Icon formation players under 34.
export function generateIncomingBids(slots, currentYear = null, division = '2bl') {
  const eligible = slots.filter(s => {
    if (!s.player || s.player.isIcon || s.type === 'BENCH') return false;
    const age = playerEffectiveAge(s.player, currentYear);
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
    const age = playerEffectiveAge(s.player, currentYear);
    const base = offerPrice(s.player.displayRating, false, age, s.player.potential, s.type);
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
        const draftAge = getAge(e.id, seasonToYear(e.spunSeason));
        chosen.push({ ...assignPotential(e, draftAge), age: draftAge });
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
      const draftAge = getAge(e.id, seasonToYear(e.spunSeason));
      chosen.push({ ...assignPotential(e, draftAge), age: draftAge });
      usedIds.add(e.id);
    }
  }

  return shuffle(chosen).slice(0, count);
}

// Generate up to `count` offers for a single slot type.
// Each offer is tagged with { slotType }.
function generateOffersForSlotType(players, excludeIds, slotType, count, teamAvg, currentYear, division = 'bl') {
  const eligible = shuffle(
    players
      .filter(p => !excludeIds.has(p.id) && p.seasons?.length)
      .filter(p => canPlayerFillSlot(p, slotType))
  );

  // Use prime-based potential for market offers — ceiling = career peak, scaled by age.
  const withPot = p => {
    const age = getAge(p.id, seasonToYear(p.spunSeason));
    return assignPotentialFromPrime(p, age);
  };

  if (!teamAvg || !eligible.length) {
    return eligible.slice(0, count).map(p => {
      const offer = attachSeason(p);
      const age = getAge(offer.id, seasonToYear(offer.spunSeason));
      const offerWithPot = assignPotentialFromPrime(offer, age);
      return { ...offerWithPot, age, slotType, price: offerPrice(offerWithPot.seasonRating, false, age, offerWithPot.potential, slotType) };
    });
  }

  const result = [];
  const usedIds = new Set();

  // Match by career prime, not any individual season — creates diverse career-year displays.
  function pickNear(target, poolSize = 6) {
    const candidates = eligible
      .filter(p => !usedIds.has(p.id))
      .map(p => ({ p, diff: Math.abs(playerPrime(p) - target) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, poolSize);
    if (!candidates.length) return null;
    const weights = candidates.map((_, i) => Math.max(0.08, 1 - i * 0.16));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i].p;
    }
    return candidates[candidates.length - 1].p;
  }

  // Show a random career year for variety; potential is still based on prime.
  function addTier(offset) {
    const p = pickNear(teamAvg + offset);
    if (p) { result.push(withPot(attachSeason(p))); usedIds.add(p.id); }
  }

  // Core: two lateral offers (slightly below current avg — harder to find direct upgrades)
  addTier(-6);
  addTier(-2);

  // Small upgrade (+2–5): frequent but modest
  if (Math.random() < 0.65) addTier(2 + Math.floor(Math.random() * 4));

  // Medium upgrade: capped lower to slow progression
  const maxMedium = teamAvg >= 90 ? 4 : teamAvg >= 84 ? 7 : teamAvg >= 78 ? 10 : 13;
  if (Math.random() < 0.40) addTier(Math.round(maxMedium * (0.55 + Math.random() * 0.45)));

  // Big upgrade: rare, lower ceiling than before
  const maxBig = division === 'bl' ? (teamAvg >= 84 ? 0 : teamAvg >= 78 ? 8 : 12)
               : division === '2bl' ? (teamAvg >= 78 ? 6 : 10)
               : 8;
  if (maxBig > 0 && Math.random() < 0.15) addTier(maxBig);

  // Youth talent: random pick from young players (any young season, not necessarily peak)
  const youthPool = eligible.filter(p => !usedIds.has(p.id) && p.seasons.some(s => {
    const a = getAge(p.id, seasonToYear(s.season));
    return a !== null && a <= 24;
  }));
  if (youthPool.length && result.length < count) {
    const topYouth = youthPool
      .map(p => ({ p, peak: playerPrime(p) }))
      .sort((a, b) => b.peak - a.peak)
      .slice(0, 8);
    const picked = topYouth[Math.floor(Math.random() * topYouth.length)].p;
    const youngSeasons = picked.seasons.filter(s => {
      const a = getAge(picked.id, seasonToYear(s.season));
      return a !== null && a <= 24;
    });
    const youngSeason = youngSeasons[Math.floor(Math.random() * youngSeasons.length)];
    result.push(withPot({ ...picked, seasonRating: youngSeason.rating, spunClub: youngSeason.club, spunSeason: youngSeason.season, displayRating: youngSeason.rating }));
    usedIds.add(picked.id);
  }

  // Fill remaining slots with random players
  for (const p of eligible.filter(p => !usedIds.has(p.id))) {
    if (result.length >= count) break;
    result.push(withPot(attachSeason(p)));
    usedIds.add(p.id);
  }

  const final = shuffle(result).slice(0, count);

  return final.map(p => {
    const age = getAge(p.id, seasonToYear(p.spunSeason));
    const prime = playerPrime(p);
    // Gem: young player with significant gap to a strong prime — no artificial inflation
    const isYoungGem = age !== null && age <= 21 && prime >= 78 && (prime - (p.displayRating ?? p.seasonRating)) >= 12;
    const isGem = !!(p.isGem || isYoungGem);
    return { ...p, age, isGem, slotType, price: offerPrice(p.seasonRating, isGem, age, p.potential, slotType) };
  });
}

// Build a full transfer market: 6 offers per unique slot type in the formation.
// Accumulated exclusions prevent the same player appearing under multiple slot types.
export function generateTransferMarket(players, excludeIds, formation, teamAvg = null, currentYear = null, division = 'bl') {
  const slotTypes = [...new Set(formation.slots.map(s => s.type))];
  const accumulated = new Set(excludeIds);
  const all = [];
  for (const slotType of slotTypes) {
    const offers = generateOffersForSlotType(players, accumulated, slotType, 6, teamAvg, currentYear, division);
    offers.forEach(o => accumulated.add(o.id));
    all.push(...offers);
  }

  // Cap at 1 gem per market; appears roughly every 3 seasons
  const gemIndices = all.reduce((acc, o, i) => (o.isGem ? [...acc, i] : acc), []);
  if (gemIndices.length > 0) {
    const keepIdx = Math.random() < 0.33
      ? gemIndices[Math.floor(Math.random() * gemIndices.length)]
      : -1;
    return all.map((o, i) => o.isGem && i !== keepIdx ? { ...o, isGem: false } : o);
  }
  return all;
}

// Fresh offers for one slot type — call after selling a player to replenish that position.
export function generateOffersForType(players, excludeIds, slotType, teamAvg = null, currentYear = null, division = 'bl') {
  return generateOffersForSlotType(players, excludeIds, slotType, 5, teamAvg, currentYear, division);
}
