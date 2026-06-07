const PB_URL = import.meta.env.VITE_PB_URL ?? 'https://api.34-0.app';

const PREFIXES = ['Bundes', 'Kaiser', 'Tor', 'Traum', 'Liga', 'Adler', 'Stern', 'Elf'];

export function getSavedName() {
  return localStorage.getItem('lb_name') ?? null;
}

export function saveName(name) {
  localStorage.setItem('lb_name', name.trim().toUpperCase());
}

export function randomGuestName() {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  return prefix + (Math.floor(Math.random() * 900) + 100);
}

export async function submitScore({ name, ovr, formation, pts, pos, w, d, l, mode }) {
  const res = await fetch(`${PB_URL}/api/collections/scores/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ovr, formation, pts, pos, w, d, l, mode }),
  });
  if (!res.ok) throw new Error('Submit failed');
  return res.json();
}

export async function fetchLeaderboard({ week = false, mode = 'easy_prime' } = {}) {
  // Old entries have no mode set — treat them as easy_prime
  const modeFilter = mode === 'easy_prime' ? `(mode='easy_prime'||mode='')` : `mode='${mode}'`;
  const filters = [modeFilter];
  if (week) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    filters.push(`created>='${since}'`);
  }
  const filter = `&filter=(${filters.join('&&')})`;
  const res = await fetch(
    `${PB_URL}/api/collections/scores/records?sort=-pts&perPage=100${filter}`
  );
  if (!res.ok) throw new Error('Fetch failed');
  const data = await res.json();
  return data.items;
}
