// Validates score submissions by decrypting the opaque `data` field.
// Requires SCORE_KEY env var on the server (same value as VITE_SCORE_KEY in the client).
//
// Encryption scheme: HMAC-SHA256 stream cipher.
//   format: iv(32 hex) + base64(ciphertext)
//   keystream block i = HMAC-SHA256(key, iv+":"+i)  [32 bytes per block]

function b64Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const idx = {};
  for (let i = 0; i < 64; i++) idx[chars[i]] = i;
  const s = str.replace(/=+$/, '');
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = idx[s[i]] ?? 0, b = idx[s[i+1]] ?? 0;
    const c = idx[s[i+2]] ?? 0, d = idx[s[i+3]] ?? 0;
    out.push((a << 2) | (b >> 4));
    if (i + 2 < s.length) out.push(((b & 0xf) << 4) | (c >> 2));
    if (i + 3 < s.length) out.push(((c & 0x3) << 6) | d);
  }
  return out;
}

function decryptScore(data, secret) {
  const iv = data.slice(0, 32);
  const ct = b64Decode(data.slice(32));
  const plain = new Array(ct.length);
  for (let i = 0; i * 32 < ct.length; i++) {
    const ksHex = $security.hs256(iv + ':' + i, secret);
    for (let j = 0; j < 32 && i * 32 + j < ct.length; j++) {
      plain[i * 32 + j] = ct[i * 32 + j] ^ parseInt(ksHex.slice(j * 2, j * 2 + 2), 16);
    }
  }
  return JSON.parse(plain.map(b => String.fromCharCode(b)).join(''));
}

onRecordCreateRequest((e) => {
  const secret = $os.getenv('SCORE_KEY');
  if (!secret) throw new BadRequestError('server misconfigured');

  let f;
  try {
    f = decryptScore(String(e.record.get('data') ?? ''), secret);
  } catch (_) {
    throw new BadRequestError('invalid payload');
  }

  const { name, ovr, formation, pts, pos, w, d, l, mode } = f;

  if (typeof ovr !== 'number' || ovr < 40 || ovr > 94) throw new BadRequestError('invalid ovr');
  if (typeof w   !== 'number' || w < 0   || w > 34)   throw new BadRequestError('invalid w');
  if (typeof d   !== 'number' || d < 0   || d > 34)   throw new BadRequestError('invalid d');
  if (typeof l   !== 'number' || l < 0   || l > 34)   throw new BadRequestError('invalid l');
  if (w + d + l !== 34)                                throw new BadRequestError('invalid record');
  if (pts !== w * 3 + d)                               throw new BadRequestError('invalid pts');

  // Overwrite with validated values — client-supplied plaintext fields are ignored
  e.record.set('name',      String(name).toUpperCase().slice(0, 30));
  e.record.set('ovr',       ovr);
  e.record.set('formation', String(formation));
  e.record.set('pts',       pts);
  e.record.set('pos',       typeof pos === 'number' ? pos : 18);
  e.record.set('w',         w);
  e.record.set('d',         d);
  e.record.set('l',         l);
  e.record.set('mode',      String(mode));

  e.next();
}, 'scores');
