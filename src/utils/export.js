import { shortName } from './playerUtils';
import { getAchievements } from './simulation';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

export function generateResultCanvas(slots, result, formation, achievements) {
  const W = 540, H = 800;
  const canvas = document.createElement('canvas');
  canvas.width  = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const { W: wins, D: draws, L: losses, GF: gf, GA: ga, pts, pos = 18 } = result;
  const achs    = achievements ?? getAchievements(result);
  const topAch  = achs[0];
  const restAch = achs.slice(1);

  // ── Background
  const bgGrad = ctx.createRadialGradient(W / 2, 0, 0, W / 2, H * 0.6, H);
  bgGrad.addColorStop(0,   '#1c0404');
  bgGrad.addColorStop(0.2, '#0f0f0f');
  bgGrad.addColorStop(1,   '#080808');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Header
  const headerH = 72;
  const hGrad = ctx.createLinearGradient(0, 0, W, 0);
  hGrad.addColorStop(0,   '#b80007');
  hGrad.addColorStop(0.5, '#e3000b');
  hGrad.addColorStop(1,   '#b80007');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, W, headerH);

  // Stripe texture on header
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < W; i += 3) {
    ctx.fillRect(i, 0, 1.5, headerH);
  }

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle    = '#fff';
  ctx.font         = 'bold 19px system-ui, sans-serif';
  ctx.fillText('BUNDESLIGA DREAM XI', W / 2, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.font      = '12px system-ui, sans-serif';
  ctx.fillText(formation, W / 2, 56);

  // ── Pitch
  const px = 16, py = headerH + 14, pw = W - 32, ph = 272;

  ctx.save();
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.clip();

  // Striped grass
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1d5820' : '#1a521d';
    ctx.fillRect(px + i * (pw / 9), py, pw / 9, ph);
  }

  // Field markings
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth   = 1;

  // Outer border
  ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

  // Center line
  ctx.beginPath(); ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2); ctx.stroke();

  // Center circle
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 34, 0, Math.PI * 2); ctx.stroke();

  // Center spot
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();

  // Penalty boxes
  const bw = 158, bh = 52;
  ctx.strokeRect(px + (pw - bw) / 2, py + 2, bw, bh);
  ctx.strokeRect(px + (pw - bw) / 2, py + ph - bh - 2, bw, bh);

  // Small boxes
  const sbw = 78, sbh = 24;
  ctx.strokeRect(px + (pw - sbw) / 2, py + 2, sbw, sbh);
  ctx.strokeRect(px + (pw - sbw) / 2, py + ph - sbh - 2, sbw, sbh);

  // Penalty spots
  const spotX = px + pw / 2;
  const spotOff = 46;
  [[spotX, py + spotOff], [spotX, py + ph - spotOff]].forEach(([sx, sy]) => {
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  });

  // Corner arcs
  const ca = 10;
  [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]].forEach(([cx, cy], i) => {
    const aStart = [0, Math.PI, -Math.PI / 2, Math.PI / 2][i];
    ctx.beginPath();
    ctx.arc(cx, cy, ca, aStart, aStart + Math.PI / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
  });

  ctx.restore();

  // Pitch outline
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 1;
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.stroke();

  // ── Player tokens
  const TR = 17;
  slots.forEach(slot => {
    const tx = px + (slot.x / 100) * pw;
    const ty = py + (slot.y / 100) * ph;

    if (slot.player) {
      ctx.shadowColor   = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur    = 10;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.arc(tx, ty, TR, 0, Math.PI * 2);
      ctx.fillStyle = '#e3000b';
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 7.5px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shortName(slot.player.name).slice(0, 10), tx, ty);

      const rating = slot.player.seasonRating ?? slot.player.primeRating;
      if (rating) {
        const bx = tx - 12, by = ty + TR - 3;
        roundRect(ctx, bx, by, 24, 13, 3);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.fillStyle    = rating >= 85 ? '#f5c518' : rating >= 78 ? '#7cfc9f' : '#aaa';
        ctx.font         = 'bold 8px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(rating, tx, by + 6.5);
      }
    } else {
      ctx.beginPath();
      ctx.arc(tx, ty, TR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.fillStyle    = 'rgba(255,255,255,0.22)';
      ctx.font         = '7px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.label, tx, ty);
    }
  });

  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // ── Stats card
  let cy = py + ph + 16;

  roundRect(ctx, 16, cy, W - 32, 80, 10);
  ctx.fillStyle = '#111111';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  const statVals  = [wins, draws, losses, pts];
  const statLbls  = ['S', 'U', 'N', 'PTS'];
  const statColors = ['#4ade80', '#888', '#f87171', '#e3000b'];
  const secW      = (W - 32) / 4;

  statVals.forEach((v, i) => {
    const sx = 16 + i * secW + secW / 2;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = statColors[i];
    ctx.font         = 'bold 32px system-ui, sans-serif';
    ctx.fillText(v, sx, cy + 48);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font      = '9px system-ui, sans-serif';
    ctx.fillText(statLbls[i], sx, cy + 64);
    if (i < 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth   = 1;
      const lx = 16 + (i + 1) * secW;
      ctx.beginPath(); ctx.moveTo(lx, cy + 14); ctx.lineTo(lx, cy + 66); ctx.stroke();
    }
  });

  cy += 92;

  ctx.fillStyle    = 'rgba(255,255,255,0.22)';
  ctx.font         = '11px system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${gf}:${ga} Tore   ·   ${pos}. Platz`, W / 2, cy);
  cy += 16;

  // ── Primary achievement
  if (topAch) {
    cy += 12;
    roundRect(ctx, 16, cy, W - 32, 64, 10);
    ctx.fillStyle = '#130f02';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,197,24,0.32)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.fillStyle    = '#f5c518';
    ctx.font         = 'bold 14px system-ui, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`★  ${topAch.label}`, 28, cy + 28);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font      = '11px system-ui, sans-serif';
    ctx.fillText(topAch.desc, 28, cy + 46);
    cy += 74;
  }

  // ── Extra achievement chips
  if (restAch.length > 0) {
    cy += 6;
    let chipX = 16;
    restAch.forEach(a => {
      ctx.font      = '10px system-ui, sans-serif';
      const text    = `★ ${a.label}`;
      const cw      = ctx.measureText(text).width + 20;
      if (chipX + cw > W - 16) { chipX = 16; cy += 28; }
      roundRect(ctx, chipX, cy, cw, 22, 5);
      ctx.fillStyle = '#191919';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.fillStyle    = 'rgba(255,255,255,0.5)';
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillText(text, chipX + 10, cy + 11);
      chipX += cw + 8;
    });
    cy += 28;
  }

  // ── Footer
  ctx.fillStyle    = 'rgba(255,255,255,0.16)';
  ctx.font         = '10px system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('34-0.app  ·  #BundesligaDraftXI', W / 2, H - 14);

  return canvas;
}

export async function downloadResult(canvas) {
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'bundesliga-dream-xi.png';
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareResult(canvas, text) {
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], 'bundesliga-dream-xi.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Bundesliga Dream XI', text });
  } else if (navigator.share) {
    await navigator.share({ title: 'Bundesliga Dream XI', text });
  } else {
    await downloadResult(canvas);
  }
}
