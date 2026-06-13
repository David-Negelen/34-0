// Potential ceiling ranges: [minGap, maxGap] above current seasonRating.
// Lower-rated players have higher variance — could be a gem or a dead end.
const POT_RANGES = [
  [88, [0, 1]],
  [83, [1, 3]],
  [78, [2, 5]],
  [73, [4, 8]],
  [68, [5, 10]],
  [0,  [7, 14]],
];

export function assignPotential(player) {
  const ovr = player.seasonRating;
  const [min, max] = POT_RANGES.find(([threshold]) => ovr >= threshold)[1];
  const gap = min + Math.floor(Math.random() * (max - min + 1));
  return { ...player, potential: ovr + gap };
}

export function potentialTier(player) {
  if (!player?.potential) return null;
  const gap = player.potential - (player.displayRating ?? player.seasonRating);
  if (gap >= 1) return 'show';
  return null;
}

export function ovrColorClass(ovr) {
  if (ovr >= 90) return 'ovr-blue';
  if (ovr >= 80) return 'ovr-green';
  if (ovr >= 70) return 'ovr-yellow';
  if (ovr >= 60) return 'ovr-orange';
  return 'ovr-red';
}

function posGroup(slotType) {
  if (slotType === 'GK') return 'gk';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(slotType)) return 'def';
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(slotType)) return 'mid';
  return 'att';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function perfScore(stats, slotType) {
  if (!stats) return 0.25;
  const games = Math.max(1, stats.games ?? 34);
  const g = posGroup(slotType);
  if (g === 'gk')  return clamp(stats.cleanSheets / 12, 0, 1);
  if (g === 'def') return clamp((stats.cleanSheets * 0.5 + 1) / 8, 0, 1);
  if (g === 'mid') return clamp((stats.goals * 1.5 + stats.assists) / games / 0.4, 0, 1);
  return clamp((stats.goals * 1.5 + stats.assists * 0.8) / games / 0.6, 0, 1);
}

// Marks a transfer offer as "prime" if the player is being offered at their
// career peak season. 15% chance when seasonRating >= primeRating - 1 and the
// player is already high quality (>=82). Boosts seasonRating, displayRating,
// and potential each by +2.
export function markPrime(player) {
  if (!player.primeRating) return player;
  const atPeak      = player.seasonRating >= player.primeRating - 1;
  const highQuality = player.seasonRating >= 82;
  if (!atPeak || !highQuality || Math.random() >= 0.15) return player;
  return {
    ...player,
    isPrime:      true,
    seasonRating: player.seasonRating + 3,
    displayRating: (player.displayRating ?? player.seasonRating) + 3,
    potential:    (player.potential    ?? player.seasonRating) + 3,
  };
}

const ICON_MIN_SEASONS = 10;
const ICON_CHANCE = 1 / 6; // (1-p)/p = 5 → expected promotion at season ~15

// Applies one season of growth to all squad slots.
// Also increments seasonsInSquad and promotes players who reach ICON_SEASONS.
// Returns { updatedSlots, growthLog, iconLog } — does NOT mutate state.
export function applyGrowth(slots, playerStats) {
  const statsMap = Object.fromEntries((playerStats ?? []).map(p => [p.name, p]));
  const growthLog = [];
  const iconLog = [];

  const updatedSlots = slots.map(slot => {
    if (!slot.player) return slot;
    let p = slot.player;

    // Track time in squad
    const newSeasons = (p.seasonsInSquad ?? 0) + 1;
    p = { ...p, seasonsInSquad: newSeasons };

    // Icon promotion: one-time +5 boost, skip normal growth this season
    if (!p.isIcon && newSeasons >= ICON_MIN_SEASONS && Math.random() < ICON_CHANCE) {
      const newRating = p.displayRating + 5;
      p = { ...p, isIcon: true, displayRating: newRating, potential: Math.max(p.potential ?? 0, newRating) };
      iconLog.push({ name: p.name, slotType: slot.type, oldRating: newRating - 5, newRating, seasons: newSeasons });
      return { ...slot, player: p };
    }

    // Normal growth
    if (!p.potential || p.displayRating >= p.potential) return { ...slot, player: p };

    const gap = p.potential - p.displayRating;
    const score = perfScore(statsMap[p.name], slot.type);
    const rawGain = score * gap * 0.35 + Math.random() * 0.4;
    const gain = clamp(Math.round(rawGain), 0, Math.min(gap, 3));

    if (gain > 0) {
      growthLog.push({
        name: p.name,
        slotType: slot.type,
        oldRating: p.displayRating,
        newRating: p.displayRating + gain,
        gain,
      });
      p = { ...p, displayRating: p.displayRating + gain };
    }

    return { ...slot, player: p };
  });

  return { updatedSlots, growthLog, iconLog };
}
