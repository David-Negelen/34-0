const PB_URL = import.meta.env.VITE_PB_URL ?? 'https://api.34-0.app';
const SESSION_KEY = 'mp_session_v1';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

export function getMpSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function setMpSession(code, playerName) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerName }));
}

export function clearMpSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function findExisting(code, playerName, seasonNumber) {
  const filter = `(room_code='${code}'%26%26player_name='${encodeURIComponent(playerName)}'%26%26season_number=${seasonNumber})`;
  const res = await fetch(`${PB_URL}/api/collections/mp_squads/records?filter=${filter}&perPage=1`);
  if (!res.ok) return null;
  const { items } = await res.json();
  return items?.[0] ?? null;
}

// Upload squad strength so others can see it as an opponent.
export async function uploadSquad({ code, playerName, seasonNumber, att, def, ovr }) {
  const existing = await findExisting(code, playerName, seasonNumber);
  const body = { room_code: code, player_name: playerName, season_number: seasonNumber, team_att: att, team_def: def, team_ovr: ovr };
  if (existing) {
    await fetch(`${PB_URL}/api/collections/mp_squads/records/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_att: att, team_def: def, team_ovr: ovr }),
    });
  } else {
    await fetch(`${PB_URL}/api/collections/mp_squads/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}

// Write final season result.
export async function submitResult({ code, playerName, seasonNumber, pts, pos, gf, ga }) {
  const existing = await findExisting(code, playerName, seasonNumber);
  const resultFields = { result_pts: pts, result_pos: pos, result_gf: gf, result_ga: ga };
  if (existing) {
    await fetch(`${PB_URL}/api/collections/mp_squads/records/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultFields),
    });
  } else {
    await fetch(`${PB_URL}/api/collections/mp_squads/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_code: code, player_name: playerName, season_number: seasonNumber, ...resultFields }),
    });
  }
}

// Fetch all records for a room+season (squad data + results).
export async function getRoomSeason(code, seasonNumber) {
  const filter = `(room_code='${code}'%26%26season_number=${seasonNumber})`;
  const res = await fetch(`${PB_URL}/api/collections/mp_squads/records?filter=${filter}&perPage=50`);
  if (!res.ok) return [];
  const { items } = await res.json();
  return items ?? [];
}
