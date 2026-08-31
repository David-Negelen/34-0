// End-of-career overview for a multiplayer room: fold every resolved sub-league
// table and every cup champion into a per-manager honours board plus a
// season-by-season roll of champions. Pure — fed by getRoomHistory().

const DIV_ORDER = { bl: 0, '2bl': 1, '3l': 2 }; // higher tier = lower number

/**
 * @param {{ seasons: {season:number, division:string, resolved:boolean, table:{name:string,isReal:boolean,pos:number,pts:number}[]}[],
 *           cups: {season:number, competition:'pokal'|'ucl'|'uel', champion:string|null}[] }} history
 * @param {string} myName  the leaving manager's room name (always listed, even at 0 honours)
 */
export function buildMpOverview(history, myName) {
  const seasons = (history?.seasons ?? []).filter(s => s.resolved && s.table?.length);
  const cups = history?.cups ?? [];

  const mgr = {};
  const touch = name => (mgr[name] ??= {
    name, seasons: 0, points: 0, titles: 0, promotions: 0,
    pokal: 0, ucl: 0, uel: 0, best: null,
  });
  if (myName) touch(myName);

  for (const s of seasons) {
    for (const row of s.table) {
      if (!row.isReal && row.name !== myName) continue;
      const m = touch(row.name);
      m.seasons += 1;
      m.points += row.pts ?? 0;
      if (s.division === 'bl' && row.pos === 1) m.titles += 1;
      if ((s.division === '2bl' || s.division === '3l') && row.pos <= 2) m.promotions += 1;
      // Best finish = best league position; a tie goes to the higher tier.
      const rank = (row.pos ?? 99) * 10 + (DIV_ORDER[s.division] ?? 9);
      if (m.best == null || rank < m.best.rank) m.best = { rank, pos: row.pos, division: s.division };
    }
  }

  // Only real managers get a row; a cup won by a CPU club counts toward nobody
  // here (it still shows in the roll of honour below).
  for (const c of cups) {
    const m = c.champion && mgr[c.champion];
    if (!m) continue;
    if (c.competition === 'pokal') m.pokal += 1;
    else if (c.competition === 'ucl') m.ucl += 1;
    else if (c.competition === 'uel') m.uel += 1;
  }

  const managers = Object.values(mgr).sort((a, b) =>
    b.titles - a.titles ||
    b.promotions - a.promotions ||
    (b.pokal + b.ucl + b.uel) - (a.pokal + a.ucl + a.uel) ||
    (a.best?.rank ?? 9999) - (b.best?.rank ?? 9999) ||
    b.points - a.points ||
    a.name.localeCompare(b.name),
  );

  // Roll of honour — one entry per completed season, newest first. The league
  // champion is the pos-1 manager in the highest tier that resolved that season.
  const bySeason = {};
  const entry = n => (bySeason[n] ??= { season: n, league: null, pokal: null, ucl: null, uel: null });
  for (const s of seasons) {
    const champ = s.table.find(r => r.pos === 1);
    if (!champ) continue;
    const e = entry(s.season);
    if (!e.league || (DIV_ORDER[s.division] ?? 9) < (DIV_ORDER[e.league.division] ?? 9)) {
      e.league = { name: champ.name, division: s.division };
    }
  }
  for (const c of cups) {
    if (c.champion) entry(c.season)[c.competition] = c.champion;
  }
  const roll = Object.values(bySeason)
    .filter(e => e.league || e.pokal || e.ucl || e.uel)
    .sort((a, b) => b.season - a.season);

  return { managers, roll };
}
