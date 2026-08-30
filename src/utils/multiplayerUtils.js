const PB_URL = import.meta.env.VITE_PB_URL ?? 'https://api.34-0.app';
const SESSION_KEY = 'mp_session_v1';
const CLIENT_KEY = 'mp_client_id';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS_DEFAULT = 18; // one full league table

export class MpError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'MpError';
    this.code = code;
    this.data = data;
  }
}

export function generateCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

// Stable per-browser id so a manager can be recognised across reloads.
export function getClientId() {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function getMpSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function setMpSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearMpSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── PocketBase REST helpers ──────────────────────────────────────────────────
// Filters only ever interpolate room codes ([A-Z2-9]) and integers, so the
// whole filter string is safely encodeURIComponent'd — no injection surface.

async function pbList(collection, filter) {
  const qs = `perPage=200${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`;
  let res;
  try {
    res = await fetch(`${PB_URL}/api/collections/${collection}/records?${qs}`);
  } catch (e) {
    throw new MpError('OFFLINE', 'Keine Verbindung zum Server', e);
  }
  if (!res.ok) throw new MpError('SERVER', `Serverfehler (${res.status})`);
  const { items } = await res.json();
  return items ?? [];
}

async function pbSend(method, path, body) {
  let res;
  try {
    res = await fetch(`${PB_URL}/api/collections/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new MpError('OFFLINE', 'Keine Verbindung zum Server', e);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const code = res.status === 400 ? 'VALIDATION' : 'SERVER';
    throw new MpError(code, data?.message || `Serverfehler (${res.status})`, data);
  }
  return res.json();
}

const pbCreate = (collection, body) => pbSend('POST', `${collection}/records`, body);
const pbUpdate = (collection, id, body) => pbSend('PATCH', `${collection}/records/${id}`, body);
const pbDelete = (collection, id) =>
  fetch(`${PB_URL}/api/collections/${collection}/records/${id}`, { method: 'DELETE' }).catch(() => {});

// ── Rooms & members ─────────────────────────────────────────────────────────

export async function getRoom(code) {
  const items = await pbList('mp_rooms', `code="${code}"`);
  return items[0] ?? null;
}

export async function getMembers(code) {
  const items = await pbList('mp_members', `room_code="${code}"`);
  return items.sort((a, b) => (a.created < b.created ? -1 : 1));
}

export async function createRoom(hostName, league = '2bl') {
  const clientId = getClientId();
  const code = generateCode();
  await pbCreate('mp_rooms', {
    code, host_name: hostName, league, status: 'open',
    current_season: 1, max_players: MAX_PLAYERS_DEFAULT,
  });
  await pbCreate('mp_members', { room_code: code, player_name: hostName, client_id: clientId });
  return { code, playerName: hostName, clientId, isHost: true, league };
}

export async function joinRoom(code, playerName) {
  const clientId = getClientId();
  const room = await getRoom(code);
  if (!room) throw new MpError('ROOM_NOT_FOUND', 'Raum nicht gefunden');

  const members = await getMembers(code);
  const mine = members.find(m => m.player_name === playerName && m.client_id === clientId);
  if (mine) {
    return { code, playerName, clientId, isHost: room.host_name === playerName, league: room.league, room };
  }
  if (room.status !== 'open') throw new MpError('ROOM_STARTED', 'Das Spiel läuft bereits');
  if (members.some(m => m.player_name === playerName)) {
    throw new MpError('NAME_TAKEN', 'Name in diesem Raum schon vergeben');
  }
  if (members.length >= (room.max_players ?? MAX_PLAYERS_DEFAULT)) {
    throw new MpError('ROOM_FULL', 'Raum ist voll');
  }
  await pbCreate('mp_members', { room_code: code, player_name: playerName, client_id: clientId });
  return { code, playerName, clientId, isHost: false, league: room.league, room };
}

// Bump the member row's `updated` so other clients can tell who is still around.
export async function touchMember(code, playerName) {
  const clientId = getClientId();
  const members = await getMembers(code).catch(() => []);
  const mine = members.find(m => m.player_name === playerName && m.client_id === clientId);
  if (mine) await pbUpdate('mp_members', mine.id, { client_id: clientId }).catch(() => {});
}

export async function startRoom(code) {
  const room = await getRoom(code);
  if (!room) throw new MpError('ROOM_NOT_FOUND', 'Raum nicht gefunden');
  await pbUpdate('mp_rooms', room.id, { status: 'active' });
}

export async function leaveRoom(code, playerName) {
  const clientId = getClientId();
  const members = await getMembers(code).catch(() => []);
  const mine = members.find(m => m.player_name === playerName && m.client_id === clientId);
  if (mine) await pbDelete('mp_members', mine.id);
}

export async function removeMember(memberId) {
  await pbDelete('mp_members', memberId);
}

// ── Per-season squads ──────────────────────────────────────────────────────

// All squads submitted for a room+season, across every division/tier.
export async function getSquads(code, season) {
  return pbList('mp_squads', `room_code="${code}" && season_number=${season}`);
}

// Upsert this manager's squad snapshot for the given season + division/tier.
export async function submitSquad({ code, playerName, season, division, att, def, ovr, formation, scorers }) {
  const clientId = getClientId();
  const body = {
    room_code: code, player_name: playerName, client_id: clientId, season_number: season,
    division, team_att: att, team_def: def, team_ovr: ovr ?? 0,
    formation: formation ?? '', scorers: scorers ?? [],
  };
  const rows = await getSquads(code, season);
  const existing = rows.find(r => r.player_name === playerName);
  if (existing) return pbUpdate('mp_squads', existing.id, body);
  try {
    return await pbCreate('mp_squads', body);
  } catch (e) {
    if (e.code !== 'VALIDATION') throw e;
    // lost a create race against ourselves on another tab — patch the winner
    const again = (await getSquads(code, season)).find(r => r.player_name === playerName);
    if (again) return pbUpdate('mp_squads', again.id, body);
    throw e;
  }
}

// ── Season resolution (one sub-league per division) ────────────────────────

function makeSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSeason(code, season, division) {
  const items = await pbList('mp_seasons', `room_code="${code}" && season_number=${season} && division="${division}"`);
  return items[0] ?? null;
}

// Freeze a division's sub-league once EVERY rostered manager has submitted a
// season-N squad (in whatever tier), or the host forces it. Each division gets
// its own seed row; the unique (room, season, division) index makes concurrent
// seed writes collapse to one winner.
export async function ensureSeasonSeed(code, season, division, { force = false } = {}) {
  let row = await getSeason(code, season, division);
  if (row?.seed) return { ready: true, seed: row.seed, row, waitingOn: [] };

  const [members, squads] = await Promise.all([getMembers(code), getSquads(code, season)]);
  const submitted = new Set(squads.map(s => s.player_name));
  const waitingOn = members.map(m => m.player_name).filter(n => !submitted.has(n));

  const mineThisTier = squads.filter(s => s.division === division);
  if (mineThisTier.length < 1) return { ready: false, seed: null, row: null, waitingOn };
  if (waitingOn.length > 0 && !force) return { ready: false, seed: null, row: null, waitingOn };

  try {
    row = await pbCreate('mp_seasons', {
      room_code: code, season_number: season, division, seed: makeSeed(), table: [], resolved: false,
    });
  } catch (e) {
    if (e.code !== 'VALIDATION') throw e;
    row = await getSeason(code, season, division);
    if (!row) throw e;
  }
  return { ready: true, seed: row.seed, row, waitingOn: [] };
}

// Cache one division's authoritative standings + advance the room's season pointer.
export async function writeSeasonTable(code, season, division, table) {
  const row = await getSeason(code, season, division);
  if (!row || row.resolved) return;
  await pbUpdate('mp_seasons', row.id, { table, resolved: true }).catch(() => {});
  const room = await getRoom(code).catch(() => null);
  if (room && (room.current_season ?? 1) <= season) {
    await pbUpdate('mp_rooms', room.id, { current_season: season + 1 }).catch(() => {});
  }
}

export async function getSeasonTable(code, season, division) {
  const row = await getSeason(code, season, division).catch(() => null);
  if (!row) return { table: [], resolved: false };
  return { table: row.table ?? [], resolved: !!row.resolved };
}

// Every division's resolved table for a season — for the cross-tier standings view.
export async function getSeasonSummary(code, season) {
  const rows = await pbList('mp_seasons', `room_code="${code}" && season_number=${season}`).catch(() => []);
  return rows.map(r => ({ division: r.division, resolved: !!r.resolved, table: r.table ?? [] }));
}
