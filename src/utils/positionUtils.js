// Out-of-position penalty in OVR points.
// Row = player's natural position, column = slot they're playing in.
// Examples: AM in DM slot → -2, LW in CB slot → -15.
const PENALTY = {
  GK: { GK: 0,  CB: 15, RB: 15, LB: 15, DM: 15, CM: 15, AM: 15, LW: 15, RW: 15, ST: 15 },
  CB: { GK: 15, CB: 0,  RB: 3,  LB: 3,  DM: 7,  CM: 10, AM: 13, LW: 15, RW: 15, ST: 15 },
  RB: { GK: 15, CB: 3,  RB: 0,  LB: 8,  DM: 6,  CM: 10, AM: 13, LW: 15, RW: 7,  ST: 15 },
  LB: { GK: 15, CB: 3,  RB: 8,  LB: 0,  DM: 6,  CM: 10, AM: 13, LW: 7,  RW: 15, ST: 15 },
  DM: { GK: 15, CB: 7,  RB: 7,  LB: 7,  DM: 0,  CM: 2,  AM: 5,  LW: 11, RW: 11, ST: 13 },
  CM: { GK: 15, CB: 9,  RB: 9,  LB: 9,  DM: 2,  CM: 0,  AM: 2,  LW: 8,  RW: 8,  ST: 10 },
  AM: { GK: 15, CB: 13, RB: 13, LB: 13, DM: 2,  CM: 2,  AM: 0,  LW: 4,  RW: 4,  ST: 4  },
  LW: { GK: 15, CB: 15, RB: 13, LB: 8,  DM: 10, CM: 8,  AM: 4,  LW: 0,  RW: 5,  ST: 3  },
  RW: { GK: 15, CB: 15, RB: 8,  LB: 13, DM: 10, CM: 8,  AM: 4,  LW: 5,  RW: 0,  ST: 3  },
  ST: { GK: 15, CB: 15, RB: 15, LB: 15, DM: 12, CM: 10, AM: 4,  LW: 3,  RW: 3,  ST: 0  },
};

// Returns penalty as a positive number (0 = in position, 15 = max).
// Multi-position players get the best (lowest) penalty across their natural positions.
export function getOopPenalty(playerPositions, slotType) {
  if (!playerPositions?.length || !slotType || slotType === 'BENCH') return 0;
  if (playerPositions.includes(slotType)) return 0;
  return Math.min(...playerPositions.map(pos => PENALTY[pos]?.[slotType] ?? 15));
}
