import { getAge } from './ageUtils';

// Potential ceiling ranges: [minGap, maxGap] above current seasonRating.
const POT_RANGES = [
  [88, [1, 3]],
  [83, [2, 5]],
  [78, [3, 7]],
  [73, [5, 10]],
  [68, [6, 12]],
  [0,  [8, 16]],
];

// How much of the raw gap an older player can still realize.
function ageGapScale(age) {
  if (age <= 21) return 1.0;
  if (age <= 23) return 0.80;
  if (age <= 26) return 0.55;
  if (age <= 29) return 0.25;
  if (age <= 32) return 0.08;
  return 0.0;
}

export function assignPotential(player, age = null) {
  const ovr = player.seasonRating;
  const [min, max] = POT_RANGES.find(([threshold]) => ovr >= threshold)[1];
  const rawGap = min + Math.floor(Math.random() * (max - min + 1));
  const gap = age !== null ? Math.round(rawGap * ageGapScale(age)) : rawGap;
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

// Probability of retirement per season based on age.
// Falls back to seasonsInSquad-based chance when age is unknown.
function retirementChance(age, seasons) {
  if (age !== null) {
    if (age < 34) return 0;
    if (age < 36) return 0.06;
    if (age < 38) return 0.18;
    if (age < 40) return 0.35;
    return 0.55;
  }
  // Fallback: no birth date data
  if (seasons < 12) return 0;
  return 1 / 7;
}

const ICON_MIN_SEASONS = 7;

// Applies one season of growth/decline to all squad slots.
// Returns { updatedSlots, growthLog, retirements } — does NOT mutate state.
// retirements entries: { name, slotType, seasons, isIcon, oldRating, newRating, stats }
// Non-Icon retirements have the slot cleared (player: null).
export function applyGrowth(slots, playerStats, careerStats = {}, currentYear = null) {
  const statsMap = Object.fromEntries((playerStats ?? []).map(p => [p.id ?? p.name, p]));
  const growthLog  = [];
  const retirements = [];

  const updatedSlots = slots.map(slot => {
    if (!slot.player) return slot;
    let p = slot.player;

    const newSeasons = (p.seasonsInSquad ?? 0) + 1;
    p = { ...p, seasonsInSquad: newSeasons };

    const age = getAge(p.id, currentYear);

    // ── Retirement check ──────────────────────────────────────────────────────
    const chance = retirementChance(age, newSeasons);
    if (!p.isIcon && chance > 0 && newSeasons >= 2 && Math.random() < chance) {
      const oldRating = p.displayRating;
      if (newSeasons >= ICON_MIN_SEASONS) {
        // Earned an Icon card — stays in squad
        const base = Math.max(p.primeRating ?? 0, p.displayRating);
        const newRating = base - 2;
        const iconPot = base + 5 + Math.floor(Math.random() * 3); // base+5 to base+7
        p = { ...p, isIcon: true, displayRating: newRating, potential: iconPot };
        retirements.push({ name: p.name, slotType: slot.type, seasons: newSeasons, isIcon: true, oldRating, newRating, stats: careerStats[p.id] ?? null });
        return { ...slot, player: p };
      } else {
        // Not enough seasons → leaves without an Icon card, slot clears
        retirements.push({ name: p.name, slotType: slot.type, seasons: newSeasons, isIcon: false, oldRating, newRating: oldRating, stats: careerStats[p.id] ?? null });
        return { ...slot, player: null };
      }
    }

    // ── Decline phase ─────────────────────────────────────────────────────────
    // Age-based (32+); falls back to seasonsInSquad proxy (15+) without birth data
    const inDecline = !p.isIcon && (age !== null ? age >= 32 : newSeasons >= 15);
    if (inDecline) {
      const rate  = (age !== null ? age >= 36 : newSeasons >= 20) ? 2 : 1;
      const floor = Math.max(60, (p.primeRating ?? p.seasonRating ?? 65) - 10);
      if (p.displayRating > floor) {
        const loss = Math.min(rate, p.displayRating - floor);
        growthLog.push({ name: p.name, slotType: slot.type, oldRating: p.displayRating, newRating: p.displayRating - loss, gain: -loss });
        p = { ...p, displayRating: p.displayRating - loss };
      }
      // Keep potential in sync with OVR for declining players — no false growth arrow
      p = { ...p, potential: Math.min(p.potential ?? p.displayRating, p.displayRating) };
      return { ...slot, player: p };
    }

    // ── Normal growth ─────────────────────────────────────────────────────────
    if (!p.potential || p.displayRating >= p.potential) return { ...slot, player: p };

    const gap     = p.potential - p.displayRating;
    const score   = perfScore(statsMap[p.id ?? p.name], slot.type);
    const rawGain = score * gap * 0.35 + Math.random() * 0.4;
    const gainCap = gap >= 20 ? 5 : gap >= 12 ? 4 : 3;
    const gain    = clamp(Math.round(rawGain), 0, Math.min(gap, gainCap));

    if (gain > 0) {
      growthLog.push({ name: p.name, slotType: slot.type, oldRating: p.displayRating, newRating: p.displayRating + gain, gain });
      p = { ...p, displayRating: p.displayRating + gain };
    }

    return { ...slot, player: p };
  });

  return { updatedSlots, growthLog, retirements };
}

// Classic-mode growth: identical to main branch behaviour.
// Returns { updatedSlots, growthLog, iconLog } — no retirement, icon promotion only.
export function applyGrowthClassic(slots, playerStats) {
  const statsMap = Object.fromEntries((playerStats ?? []).map(p => [p.id ?? p.name, p]));
  const growthLog = [];
  const iconLog   = [];

  const updatedSlots = slots.map(slot => {
    if (!slot.player) return slot;
    let p = slot.player;

    const newSeasons = (p.seasonsInSquad ?? 0) + 1;
    p = { ...p, seasonsInSquad: newSeasons };

    // Icon promotion: one-time +5 boost after ICON_MIN_SEASONS seasons.
    if (!p.isIcon && newSeasons >= ICON_MIN_SEASONS && Math.random() < 0.15) {
      const newRating = p.displayRating + 5;
      const iconPot   = Math.max(newRating, 90 + Math.floor(Math.random() * 8));
      p = { ...p, isIcon: true, displayRating: newRating, potential: iconPot };
      iconLog.push({ name: p.name, slotType: slot.type, oldRating: newRating - 5, newRating, seasons: newSeasons });
      return { ...slot, player: p };
    }

    // Normal growth
    if (!p.potential || p.displayRating >= p.potential) return { ...slot, player: p };

    const gap     = p.potential - p.displayRating;
    const score   = perfScore(statsMap[p.id ?? p.name], slot.type);
    const rawGain = score * gap * 0.35 + Math.random() * 0.4;
    const gainCap = gap >= 20 ? 5 : gap >= 12 ? 4 : 3;
    const gain    = clamp(Math.round(rawGain), 0, Math.min(gap, gainCap));

    if (gain > 0) {
      growthLog.push({ name: p.name, slotType: slot.type, oldRating: p.displayRating, newRating: p.displayRating + gain, gain });
      p = { ...p, displayRating: p.displayRating + gain };
    }

    return { ...slot, player: p };
  });

  return { updatedSlots, growthLog, iconLog };
}
