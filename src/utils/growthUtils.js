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


const ICON_MIN_SEASONS = 10;
const ICON_CHANCE = 1 / 6; // expected promotion around season 15

// Decline kicks in after this many seasons (proxy until birth dates are wired in)
const DECLINE_START = 15;

// Applies one season of growth/decline to all squad slots.
// Returns { updatedSlots, growthLog, retirements } — does NOT mutate state.
export function applyGrowth(slots, playerStats, careerStats = {}) {
  const statsMap = Object.fromEntries((playerStats ?? []).map(p => [p.id ?? p.name, p]));
  const growthLog = [];
  const retirements = [];

  const updatedSlots = slots.map(slot => {
    if (!slot.player) return slot;
    let p = slot.player;

    const newSeasons = (p.seasonsInSquad ?? 0) + 1;
    p = { ...p, seasonsInSquad: newSeasons };

    // Career end → Icon card. OVR = primeRating + 2–5 based on this season's performance.
    if (!p.isIcon && newSeasons >= ICON_MIN_SEASONS && Math.random() < ICON_CHANCE) {
      const oldRating = p.displayRating;
      const score = perfScore(statsMap[p.id ?? p.name], slot.type);
      const perfBonus = 2 + Math.round(score * 3); // 2–5
      const base = p.primeRating ?? p.displayRating;
      const newRating = base + perfBonus;
      const iconPot = Math.max(newRating, 90 + Math.floor(Math.random() * 8));
      p = { ...p, isIcon: true, displayRating: newRating, potential: iconPot };
      retirements.push({
        name: p.name,
        slotType: slot.type,
        seasons: newSeasons,
        isIcon: true,
        oldRating,
        newRating,
        stats: careerStats[p.id] ?? null,
      });
      return { ...slot, player: p };
    }

    // Decline phase (replaced by age-based logic once birth dates are available)
    if (!p.isIcon && newSeasons >= DECLINE_START) {
      const rate = newSeasons >= 20 ? 2 : 1;
      const floor = Math.max(60, (p.primeRating ?? p.seasonRating ?? 65) - 10);
      if (p.displayRating > floor) {
        const loss = Math.min(rate, p.displayRating - floor);
        growthLog.push({ name: p.name, slotType: slot.type, oldRating: p.displayRating, newRating: p.displayRating - loss, gain: -loss });
        p = { ...p, displayRating: p.displayRating - loss };
      }
      return { ...slot, player: p };
    }

    // Normal growth
    if (!p.potential || p.displayRating >= p.potential) return { ...slot, player: p };

    const gap = p.potential - p.displayRating;
    const score = perfScore(statsMap[p.id ?? p.name], slot.type);
    const rawGain = score * gap * 0.35 + Math.random() * 0.4;
    const gainCap = gap >= 20 ? 5 : gap >= 12 ? 4 : 3;
    const gain = clamp(Math.round(rawGain), 0, Math.min(gap, gainCap));

    if (gain > 0) {
      growthLog.push({ name: p.name, slotType: slot.type, oldRating: p.displayRating, newRating: p.displayRating + gain, gain });
      p = { ...p, displayRating: p.displayRating + gain };
    }

    return { ...slot, player: p };
  });

  return { updatedSlots, growthLog, retirements };
}
