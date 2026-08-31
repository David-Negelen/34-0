// Seeded RNG shared by the deterministic multiplayer simulations
// (`sharedLeague.js`, `sharedCups.js`). Every client that feeds the same seed
// produces byte-identical results, so no server-side compute is needed.

// xmur3 string hash → mulberry32 PRNG.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seedStr) {
  const seed = xmur3(String(seedStr));
  return mulberry32(seed());
}

export function rngPoisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let p = 1, k = 0;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

export function rngGauss(rng, sigma) {
  const u = 1 - rng();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function rngShuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
