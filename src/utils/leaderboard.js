const PB_URL = import.meta.env.VITE_PB_URL ?? 'https://api.34-0.app';
const SCORE_KEY = import.meta.env.VITE_SCORE_KEY ?? '';

// HMAC-SHA256 stream cipher: each 32-byte keystream block = HMAC(key, iv+":"+blockIndex).
// Both client (Web Crypto) and server ($security.hs256) produce identical output for the same key.
async function encryptScore(fields) {
  if (!SCORE_KEY) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(fields));
  const ivBytes = crypto.getRandomValues(new Uint8Array(16));
  const iv = Array.from(ivBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const hmacKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SCORE_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const cipher = new Uint8Array(bytes.length);
  for (let i = 0; i * 32 < bytes.length; i++) {
    const ks = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(iv + ':' + i)));
    for (let j = 0; j < 32 && i * 32 + j < bytes.length; j++) {
      cipher[i * 32 + j] = bytes[i * 32 + j] ^ ks[j];
    }
  }
  return iv + btoa(String.fromCharCode(...cipher));
}

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
  const fields = { name, ovr, formation, pts, pos, w, d, l, mode };
  const data = await encryptScore(fields); // null if SCORE_KEY not set
  const res = await fetch(`${PB_URL}/api/collections/scores/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, ...(data ? { data } : {}) }),
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
