import { PLAYERS as BL }  from '../data/players';
import { PLAYERS as BL2 } from '../data/players2bl';
import { FORMATIONS }      from '../data/formations';

const ALL  = [...BL, ...BL2];
const BY_ID   = new Map(ALL.map((p, i) => [p.id,   i]));
const BY_NAME = new Map(ALL.map((p, i) => [p.name, i]));

const FM_KEYS   = Object.keys(FORMATIONS);
const PHASES    = ['setup', 'draft', 'transfer', 'result', 'end'];
const DIVS      = ['bl', '2bl'];
const SLOT_TYPES = ['GK','CB','LB','RB','LWB','RWB','DM','CM','AM','LM','RM','LW','RW','ST'];
const ST_IDX     = new Map(SLOT_TYPES.map((t, i) => [t, i]));

// ── Binary writer / reader ────────────────────────────────────────────────────

class W {
  constructor() { this._b = []; }
  u8(v)  { this._b.push(v & 0xFF); }
  u16(v) { this._b.push(v & 0xFF, (v >> 8) & 0xFF); }
  bytes() { return new Uint8Array(this._b); }
}

class R {
  constructor(u8) { this._d = new DataView(u8.buffer, u8.byteOffset); this._p = 0; }
  u8()  { return this._d.getUint8(this._p++); }
  u16() { const v = this._d.getUint16(this._p, true); this._p += 2; return v; }
}

// ── Deflate / inflate ─────────────────────────────────────────────────────────

async function deflate(u8) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(u8); w.close();
  const chunks = []; const r = cs.readable.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

async function inflate(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  const chunks = []; const r = ds.readable.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

function toB64(u8) {
  return btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function fromB64(s) {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

// ── Player encode (7 bytes) ───────────────────────────────────────────────────
// [u16 pi+1] [u8 si] [u8 dr] [u8 pot] [u8 sis] [u8 flags]
// pi=0 → empty slot

function wPlayer(w, p) {
  if (!p) { w.u16(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); return; }
  const pi = BY_ID.get(p.id);
  if (pi == null) { w.u16(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0); return; }
  const si = Math.max(0, ALL[pi].seasons.findIndex(s => s.club === p.spunClub && s.season === p.spunSeason));
  const fl = (p.isIcon ? 1 : 0) | (p.isPrime ? 2 : 0) | (p.isGem ? 4 : 0);
  w.u16(pi + 1);
  w.u8(si);
  w.u8(p.displayRating ?? p.seasonRating ?? 0);
  w.u8(p.potential ?? 0);
  w.u8(Math.min(p.seasonsInSquad ?? 0, 255));
  w.u8(fl);
}

function rPlayer(r) {
  const pi1 = r.u16(); const si = r.u8(); const dr = r.u8(); const pot = r.u8(); const sis = r.u8(); const fl = r.u8();
  if (!pi1) return null;
  const base = ALL[pi1 - 1];
  if (!base) return null;
  const season = base.seasons[si] ?? base.seasons[0];
  return {
    ...base,
    seasonRating:   season?.rating ?? dr,
    spunClub:       season?.club,
    spunSeason:     season?.season,
    displayRating:  dr,
    potential:      pot || undefined,
    seasonsInSquad: sis,
    isIcon:  !!(fl & 1),
    isPrime: !!(fl & 2),
    isGem:   !!(fl & 4),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function encodeCareerState(state) {
  const { phase, formation, division, seasonNumber,
          slots, draftPool, transferOffers,
          seasonHistory, careerStats, allPlayers = [] } = state;

  const isTransfer = phase === 'transfer';
  const offers     = isTransfer ? (transferOffers ?? []) : (draftPool ?? []);
  const stats      = Object.values(careerStats ?? {});
  const apMap      = new Map(allPlayers.map(p => [p.id, p]));

  const w = new W();

  // Header (12 bytes)
  w.u8(0x34);  // magic
  w.u8(1);     // version
  w.u8(PHASES.indexOf(phase));
  w.u8(FM_KEYS.indexOf(formation));
  w.u8(Math.max(0, DIVS.indexOf(division)));
  w.u16(seasonNumber);
  w.u8(slots.length);
  w.u8(Math.min(offers.length, 255));
  w.u8(Math.min(seasonHistory.length, 255));
  w.u16(Math.min(stats.length, 65535));

  // Slots (7 bytes each)
  for (const s of slots) wPlayer(w, s.player);

  // Offers / draft pool (7 bytes + 1 for transfer flags)
  for (const o of offers) {
    wPlayer(w, o);
    if (isTransfer) w.u8((o.used ? 1 : 0) | (o.skipped ? 2 : 0));
  }

  // Season history (5 bytes each)
  for (const h of seasonHistory) {
    w.u8(Math.min(h.season ?? 0, 255));
    w.u8(((h.division === '2bl' ? 1 : 0) << 7) | Math.min(h.pos ?? 1, 127));
    w.u8(Math.min(h.pts ?? 0, 255));
    w.u8(Math.min(h.GF ?? 0, 255));
    w.u8(Math.min(h.GA ?? 0, 255));
  }

  // Career stats merged with allPlayers (16 bytes each)
  for (const cs of stats) {
    const pi = BY_NAME.get(cs.name);
    if (pi == null) continue;
    const ap  = apMap.get(ALL[pi].id);
    const si  = ap ? Math.max(0, ALL[pi].seasons.findIndex(s => s.club === ap.spunClub && s.season === ap.spunSeason)) : 0;
    const fl  = ap ? ((ap.isIcon ? 1 : 0) | (ap.isPrime ? 2 : 0) | (ap.isGem ? 4 : 0)) : 0;
    w.u16(pi);
    w.u8(si);
    w.u8(ap?.displayRating ?? 0);
    w.u8(ap?.potential ?? 0);
    w.u8(Math.min(ap?.seasonsInSquad ?? 0, 255));
    w.u8(fl);
    w.u8(ST_IDX.get(cs.slotType ?? '') ?? 0);
    w.u16(Math.min(cs.games       ?? 0, 65535));
    w.u16(Math.min(cs.goals       ?? 0, 65535));
    w.u16(Math.min(cs.assists     ?? 0, 65535));
    w.u16(Math.min(cs.cleanSheets ?? 0, 65535));
  }

  return toB64(await deflate(w.bytes()));
}

export async function decodeCareerState(code) {
  const r = new R(await inflate(fromB64(code.trim())));

  if (r.u8() !== 0x34 || r.u8() !== 1) throw new Error('Ungültiger Code');

  const phase      = PHASES[r.u8()] ?? 'transfer';
  const formation  = FM_KEYS[r.u8()] ?? '4-3-3';
  const division   = DIVS[r.u8()]    ?? 'bl';
  const seasonNum  = r.u16();
  const numSlots   = r.u8();
  const numOffers  = r.u8();
  const numHistory = r.u8();
  const numStats   = r.u16();

  const isTransfer = phase === 'transfer';
  const fmSlots    = FORMATIONS[formation]?.slots ?? [];

  // Slots
  const slots = [];
  for (let i = 0; i < numSlots; i++)
    slots.push({ ...(fmSlots[i] ?? { id: i }), player: rPlayer(r) });

  // Offers / pool
  const rawOffers = [];
  for (let i = 0; i < numOffers; i++) {
    const p = rPlayer(r);
    const extra = isTransfer ? r.u8() : 0;
    if (p) rawOffers.push({ ...p, used: !!(extra & 1), skipped: !!(extra & 2) });
  }

  // Season history
  const seasonHistory = [];
  for (let i = 0; i < numHistory; i++) {
    const sn  = r.u8();
    const dp  = r.u8();
    const pts = r.u8();
    const GF  = r.u8();
    const GA  = r.u8();
    seasonHistory.push({ season: sn, division: (dp >> 7) ? '2bl' : 'bl', pos: dp & 0x7F, pts, GF, GA });
  }

  // Career stats + allPlayers
  const careerStats = {};
  const allPlayers  = [];
  for (let i = 0; i < numStats; i++) {
    const pi         = r.u16();
    const si         = r.u8();
    const dr         = r.u8();
    const pot        = r.u8();
    const sis        = r.u8();
    const fl         = r.u8();
    const sti        = r.u8();
    const games      = r.u16();
    const goals      = r.u16();
    const assists    = r.u16();
    const cleanSheets = r.u16();

    const base = ALL[pi];
    if (!base) continue;
    const season = base.seasons[si] ?? base.seasons[0];
    const slotType = SLOT_TYPES[sti] ?? 'CM';

    allPlayers.push({
      ...base,
      seasonRating:   season?.rating ?? dr,
      spunClub:       season?.club,
      spunSeason:     season?.season,
      displayRating:  dr,
      potential:      pot || undefined,
      seasonsInSquad: sis,
      isIcon:  !!(fl & 1),
      isPrime: !!(fl & 2),
      isGem:   !!(fl & 4),
    });
    careerStats[base.name] = { name: base.name, games, goals, assists, cleanSheets, slotLabel: slotType, slotType };
  }

  return {
    phase, formation, division,
    seasonNumber:  seasonNum,
    slots,
    transferOffers: isTransfer ? rawOffers : [],
    draftPool:      isTransfer ? [] : rawOffers,
    seasonHistory, careerStats, allPlayers,
    result: null, swapHistory: [],
  };
}
