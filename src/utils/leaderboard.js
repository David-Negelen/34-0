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

export async function fetchLeaderboard({ mode = 'easy_prime' } = {}) {
  // Old entries have no mode set — treat them as easy_prime
  const modeFilter = mode === 'easy_prime' ? `(mode='easy_prime'||mode='')` : `mode='${mode}'`;
  const res = await fetch(
    `${PB_URL}/api/collections/scores/records?sort=-pts&perPage=100&filter=(${modeFilter})`
  );
  if (!res.ok) throw new Error('Fetch failed');
  const data = await res.json();
  return data.items;
}

export async function submitPokalWin(winner) {
  const res = await fetch(`${PB_URL}/api/collections/pokal_stats/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner }),
  });
  if (!res.ok) throw new Error('Submit failed');
  return res.json();
}

export async function fetchPokalStats() {
  // Fetch all records (up to 500) and aggregate client-side by winner.
  const res = await fetch(`${PB_URL}/api/collections/pokal_stats/records?perPage=500`);
  if (!res.ok) throw new Error('Fetch failed');
  const data = await res.json();
  const counts = {};
  for (const r of data.items) {
    counts[r.winner] = (counts[r.winner] ?? 0) + 1;
  }
  const total = data.items.length;
  return Object.entries(counts)
    .map(([winner, wins]) => ({ winner, wins, pct: total ? (wins / total) * 100 : 0 }))
    .sort((a, b) => b.wins - a.wins);
}
