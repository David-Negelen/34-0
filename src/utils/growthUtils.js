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
  if (gap >= 6) return 'high';
  if (gap >= 3) return 'mid';
  if (gap >= 1) return 'low';
  return null;
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

// Applies one season of growth to all squad slots.
// Returns { updatedSlots, growthLog } — does NOT mutate state.
export function applyGrowth(slots, playerStats) {
  const statsMap = Object.fromEntries((playerStats ?? []).map(p => [p.name, p]));
  const growthLog = [];

  const updatedSlots = slots.map(slot => {
    if (!slot.player) return slot;
    const p = slot.player;
    if (!p.potential || p.displayRating >= p.potential) return slot;

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
    }
    return gain > 0
      ? { ...slot, player: { ...p, displayRating: p.displayRating + gain } }
      : slot;
  });

  return { updatedSlots, growthLog };
}
