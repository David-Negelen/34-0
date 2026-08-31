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
// Filters only ever interpolate room codes ([A-Z2-9]), fixed keywords and
// integers, so the whole filter string is safely encodeURIComponent'd.

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

// Open, discoverable rooms for the lobby browse list.
export async function listPublicRooms() {
  const rooms = await pbList('mp_rooms', `visibility="public" && status="open"`).catch(() => []);
  const out = await Promise.all(rooms.map(async r => {
    const members = await getMembers(r.code).catch(() => []);
    const max = r.max_players ?? MAX_PLAYERS_DEFAULT;
    return { code: r.code, hostName: r.host_name, league: r.league, players: members.length, maxPlayers: max, full: members.length >= max };
  }));
  return out.sort((a, b) => b.players - a.players);
}

export async function createRoom(hostName, league = '2bl', visibility = 'private') {
  const clientId = getClientId();
  const code = generateCode();
  await pbCreate('mp_rooms', {
    code, host_name: hostName, league, visibility, status: 'open',
    current_season: 1, max_players: MAX_PLAYERS_DEFAULT,
  });
  await pbCreate('mp_members', { room_code: code, player_name: hostName, client_id: clientId });
  return { code, playerName: hostName, clientId, isHost: true, league, visibility };
}

export async function joinRoom(code, playerName) {
  const clientId = getClientId();
  const room = await getRoom(code);
  if (!room) throw new MpError('ROOM_NOT_FOUND', 'Raum nicht gefunden');

  const members = await getMembers(code);
  const seat = members.find(m => m.player_name === playerName);

  // Reconnect: same browser always; a name-match while the game is running is
  // treated as the player coming back (claims this device for the seat).
  if (seat && (seat.client_id === clientId || room.status === 'active')) {
    if (seat.client_id !== clientId) await pbUpdate('mp_members', seat.id, { client_id: clientId }).catch(() => {});
    return { code, playerName, clientId, isHost: room.host_name === playerName, league: room.league, visibility: room.visibility, room, reconnected: seat.client_id !== clientId };
  }
  if (seat) throw new MpError('NAME_TAKEN', 'Name in diesem Raum schon vergeben');
  if (room.status !== 'open') throw new MpError('ROOM_STARTED', 'Das Spiel läuft bereits');
  if (members.length >= (room.max_players ?? MAX_PLAYERS_DEFAULT)) throw new MpError('ROOM_FULL', 'Raum ist voll');

  await pbCreate('mp_members', { room_code: code, player_name: playerName, client_id: clientId });
  return { code, playerName, clientId, isHost: false, league: room.league, visibility: room.visibility, room };
}

// Bump the member row's `updated` so others can see who is still connected.
export async function touchMember(code, playerName) {
  const clientId = getClientId();
  const members = await getMembers(code).catch(() => []);
  const mine = members.find(m => m.player_name === playerName && m.client_id === clientId)
            ?? members.find(m => m.player_name === playerName);
  if (mine) await pbUpdate('mp_members', mine.id, { client_id: clientId }).catch(() => {});
}

// A member counts as "gone" once its heartbeat is older than this. Clients
// heartbeat every ~15–20s (lobby + career), so ~2 missed beats. Also drives the
// waiting screen's per-manager "aktiv / weg" presence readout.
export const HOST_STALE_MS = 45000;

// If the host's tab just vanished (row gone, or heartbeat stale) the room would
// be stuck — only the host can start or kick. The earliest-joined member that is
// still alive quietly takes over. Safe to call on every poll: it's a no-op
// unless the host is really gone AND the caller is the rightful heir.
export async function claimHostIfStale(code, myName, prefetched) {
  const [room, members] = prefetched
    ? [prefetched.room, prefetched.members]
    : await Promise.all([getRoom(code).catch(() => null), getMembers(code).catch(() => [])]);
  if (!room || room.status === 'finished' || room.host_name === myName) return false;

  const now = Date.now();
  const fresh = m => now - new Date(m.updated).getTime() < HOST_STALE_MS;
  const hostRow = members.find(m => m.player_name === room.host_name);
  if (hostRow && fresh(hostRow)) return false; // host still alive

  const alive = members.filter(fresh);
  const heir = (alive.length ? alive : members)[0]; // getMembers() sorts by created
  if (!heir || heir.player_name !== myName) return false;

  await pbUpdate('mp_rooms', room.id, { host_name: myName }).catch(() => {});
  return true;
}

export async function startRoom(code) {
  const room = await getRoom(code);
  if (!room) throw new MpError('ROOM_NOT_FOUND', 'Raum nicht gefunden');
  await pbUpdate('mp_rooms', room.id, { status: 'active' });
}

// Hand the host role to the next remaining member; delete the room if empty.
async function reassignHost(code, goneName) {
  const [room, members] = await Promise.all([getRoom(code).catch(() => null), getMembers(code).catch(() => [])]);
  if (!room) return;
  const remaining = members.filter(m => m.player_name !== goneName);
  if (remaining.length === 0) { await pbDelete('mp_rooms', room.id); return; }
  if (room.host_name === goneName) await pbUpdate('mp_rooms', room.id, { host_name: remaining[0].player_name }).catch(() => {});
}

// A manager voluntarily quits — frees the room to resolve without them.
export async function leaveRoom(code, playerName) {
  const clientId = getClientId();
  const members = await getMembers(code).catch(() => []);
  const mine = members.find(m => m.player_name === playerName && m.client_id === clientId)
            ?? members.find(m => m.player_name === playerName);
  if (mine) await pbDelete('mp_members', mine.id);
  await reassignHost(code, playerName).catch(() => {});
}

// Host removes a player who isn't coming back.
export async function kickMember(code, member) {
  await pbDelete('mp_members', member.id);
  await reassignHost(code, member.player_name).catch(() => {});
}

// ── Per-season squads ──────────────────────────────────────────────────────

// All squads submitted for a room+season, across every division/tier.
export async function getSquads(code, season) {
  return pbList('mp_squads', `room_code="${code}" && season_number=${season}`);
}

// Upsert this manager's squad snapshot for the given season + division/tier.
// Sealed once the tier's seed is frozen — never mutate an input another client
// may already have simulated from (desync guard).
export async function submitSquad({ code, playerName, season, division, att, def, ovr, formation, scorers }) {
  const clientId = getClientId();
  const sealed = await getSeason(code, season, division).catch(() => null);
  if (sealed?.seed) return { locked: true };

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

// Who has / hasn't submitted a season-N squad (in any tier). Shared by the
// league and cup seed gates: a season resolves only once everyone is in.
export async function seasonReadiness(code, season) {
  const [members, squads] = await Promise.all([getMembers(code), getSquads(code, season)]);
  const roster = members.map(m => m.player_name);
  const done = new Set(squads.map(s => s.player_name));
  const submitted = roster.filter(n => done.has(n));
  const waitingOn = roster.filter(n => !done.has(n));
  return { squads, submitted, waitingOn, total: roster.length, allIn: roster.length > 0 && waitingOn.length === 0 };
}

// Freeze a division's sub-league once EVERY seated manager has submitted a
// season-N squad (in whatever tier). No skipping — a missing player must
// reconnect and submit, or the host must kick them. Each division gets its own
// seed row; the unique (room, season, division) index collapses concurrent
// seed writes to one winner.
export async function ensureSeasonSeed(code, season, division) {
  let row = await getSeason(code, season, division);
  if (row?.seed) return { ready: true, seed: row.seed, row, waitingOn: [], submitted: [], total: 0 };

  const rd = await seasonReadiness(code, season);
  const progress = { waitingOn: rd.waitingOn, submitted: rd.submitted, total: rd.total };

  if (rd.squads.some(s => s.division === division) === false) return { ready: false, seed: null, row: null, ...progress };
  if (!rd.allIn) return { ready: false, seed: null, row: null, ...progress };

  try {
    row = await pbCreate('mp_seasons', {
      room_code: code, season_number: season, division, seed: makeSeed(), table: [], resolved: false,
    });
  } catch (e) {
    if (e.code !== 'VALIDATION') throw e;
    row = await getSeason(code, season, division);
    if (!row) throw e;
  }
  return { ready: true, seed: row.seed, row, waitingOn: [], submitted: rd.submitted, total: rd.total };
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

// Every division's resolved table for a season — for the cross-tier standings view.
export async function getSeasonSummary(code, season) {
  const rows = await pbList('mp_seasons', `room_code="${code}" && season_number=${season}`).catch(() => []);
  return rows.map(r => ({ division: r.division, resolved: !!r.resolved, table: r.table ?? [] }));
}

// ── Shared cups (one bracket per room per season per competition) ──────────

export async function getCup(code, season, competition) {
  const items = await pbList('mp_cups', `room_code="${code}" && season_number=${season} && competition="${competition}"`);
  return items[0] ?? null;
}

// Freeze a competition's bracket. Same "everyone submitted" gate as the
// league, so once runSeason's league step is past this returns immediately.
// The unique (room, season, competition) index collapses concurrent writes.
// Cups are a secondary feature: any backend trouble here returns "not ready"
// so the shared league season still completes.
export async function ensureCupSeed(code, season, competition) {
  try {
    let row = await getCup(code, season, competition);
    if (row?.seed) return { ready: true, seed: row.seed, row };

    const rd = await seasonReadiness(code, season);
    if (!rd.allIn) return { ready: false, seed: null, row: null, waitingOn: rd.waitingOn };

    try {
      row = await pbCreate('mp_cups', {
        room_code: code, season_number: season, competition,
        seed: makeSeed(), champion: '', summary: {}, resolved: false,
      });
    } catch (e) {
      if (e.code !== 'VALIDATION') throw e;
      row = await getCup(code, season, competition);
      if (!row) throw e;
    }
    return { ready: true, seed: row.seed, row };
  } catch {
    return { ready: false, seed: null, row: null };
  }
}

// Cache a competition's champion + per-manager exit rounds (idempotent).
export async function writeCupResult(code, season, competition, { champion, summary }) {
  const row = await getCup(code, season, competition);
  if (!row || row.resolved) return;
  await pbUpdate('mp_cups', row.id, {
    champion: champion ?? '', summary: summary ?? {}, resolved: true,
  }).catch(() => {});
}

// All three competitions' cached results for a season — powers the standings
// view and next season's European qualification.
export async function getCupSummary(code, season) {
  const rows = await pbList('mp_cups', `room_code="${code}" && season_number=${season}`).catch(() => []);
  return rows.map(r => ({
    competition: r.competition,
    resolved: !!r.resolved,
    champion: r.champion || null,
    summary: r.summary ?? {},
  }));
}

// Every sub-league table and every cup champion for the whole room, across all
// seasons — powers the end-of-career "who won what" overview.
export async function getRoomHistory(code) {
  const [seasons, cups] = await Promise.all([
    pbList('mp_seasons', `room_code="${code}"`).catch(() => []),
    pbList('mp_cups', `room_code="${code}"`).catch(() => []),
  ]);
  return {
    seasons: seasons.map(r => ({
      season: r.season_number, division: r.division,
      resolved: !!r.resolved, table: r.table ?? [],
    })),
    cups: cups.map(r => ({
      season: r.season_number, competition: r.competition, champion: r.champion || null,
    })),
  };
}
