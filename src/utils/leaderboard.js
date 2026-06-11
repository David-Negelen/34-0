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

export async function fetchWorstRuns(league) {
  const filter = league === '2bl'
    ? `(mode='2bl_easy_prime'||mode='2bl_easy_career'||mode='2bl_normal_prime'||mode='2bl_normal_career'||mode='2bl_hard_prime'||mode='2bl_hard_career')`
    : `(mode=''||mode='easy_prime'||mode='easy_career'||mode='normal_prime'||mode='normal_career'||mode='hard_prime'||mode='hard_career')`;
  const res = await fetch(
    `${PB_URL}/api/collections/scores/records?sort=pts&perPage=50&filter=${filter}`
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

let _pokalCache = null;
let _pokalCacheTs = 0;
const POKAL_CACHE_TTL = 5 * 60 * 1000;

export async function fetchPokalStats() {
  if (_pokalCache && Date.now() - _pokalCacheTs < POKAL_CACHE_TTL) return _pokalCache;

  const fetchPage = p =>
    fetch(`${PB_URL}/api/collections/pokal_stats/records?perPage=500&page=${p}`)
      .then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

  const first = await fetchPage(1);
  const rest = first.totalPages > 1
    ? await Promise.all(Array.from({ length: first.totalPages - 1 }, (_, i) => fetchPage(i + 2)))
    : [];

  const items = [first, ...rest].flatMap(d => d.items);
  const counts = {};
  for (const r of items) counts[r.winner] = (counts[r.winner] ?? 0) + 1;
  const total = items.length;

  _pokalCache = Object.entries(counts)
    .map(([winner, wins]) => ({ winner, wins, pct: total ? (wins / total) * 100 : 0 }))
    .sort((a, b) => b.wins - a.wins);
  _pokalCacheTs = Date.now();

  return _pokalCache;
}
