const PB_URL = import.meta.env.VITE_PB_URL ?? 'https://api.34-0.app';

const PREFIXES = ['Bundes', 'Kaiser', 'Tor', 'Traum', 'Liga', 'Adler', 'Stern', 'Elf'];

export function getSavedName() {
  return localStorage.getItem('lb_name') ?? null;
}

export function saveName(name) {
  localStorage.setItem('lb_name', name.trim());
}

export function randomGuestName() {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  return prefix + (Math.floor(Math.random() * 900) + 100);
}

export async function submitScore({ name, ovr, formation, pts, pos }) {
  const res = await fetch(`${PB_URL}/api/collections/scores/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ovr, formation, pts, pos }),
  });
  if (!res.ok) throw new Error('Submit failed');
  return res.json();
}

export async function fetchLeaderboard({ week = false } = {}) {
  let filter = '';
  if (week) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    filter = `&filter=(created>='${since}')`;
  }
  const res = await fetch(
    `${PB_URL}/api/collections/scores/records?sort=-ovr&perPage=100${filter}`
  );
  if (!res.ok) throw new Error('Fetch failed');
  const data = await res.json();
  return data.items;
}
