import { getOopPenalty } from './positionUtils';

const GK_TYPES   = ['GK'];
const DEF_TYPES  = ['RB', 'CB', 'LB'];
const MID_TYPES  = ['DM', 'CM', 'AM', 'LM', 'RM'];
const ATT_TYPES  = ['RW', 'LW', 'SS', 'ST'];

function avg(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function ratingForSlot(slot) {
  const base = slot.player?.displayRating ?? null;
  if (base === null) return null;
  return Math.max(1, base - getOopPenalty(slot.player?.positions, slot.type));
}

export function calcSquadRatings(slots) {
  const gkRatings  = slots.filter(s => GK_TYPES.includes(s.type)).map(ratingForSlot).filter(r => r !== null);
  const defRatings = slots.filter(s => DEF_TYPES.includes(s.type)).map(ratingForSlot).filter(r => r !== null);
  const midRatings = slots.filter(s => MID_TYPES.includes(s.type)).map(ratingForSlot).filter(r => r !== null);
  const attRatings = slots.filter(s => ATT_TYPES.includes(s.type)).map(ratingForSlot).filter(r => r !== null);

  const gk  = avg(gkRatings);
  const def = avg(defRatings);
  const mid = avg(midRatings);
  const att = avg(attRatings);

  // Weighted overall
  const components = [];
  if (gk  !== null) components.push({ v: gk,  w: 0.12 });
  if (def !== null) components.push({ v: def, w: 0.32 });
  if (mid !== null) components.push({ v: mid, w: 0.31 });
  if (att !== null) components.push({ v: att, w: 0.25 });

  const totalWeight = components.reduce((a, c) => a + c.w, 0);
  const overall = totalWeight > 0
    ? Math.round(components.reduce((a, c) => a + c.v * c.w, 0) / totalWeight)
    : null;

  return { overall, gk, def, mid, att };
}
