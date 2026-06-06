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
  const W = 540, H = 740;
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
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, W, H);

  // ── Header
  ctx.fillStyle = '#e3000b';
  ctx.fillRect(0, 0, W, 52);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle    = '#fff';
  ctx.font         = 'bold 18px system-ui, sans-serif';
  ctx.fillText('BUNDESLIGA DREAM XI', W / 2, 29);
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.font      = '11px system-ui, sans-serif';
  ctx.fillText(formation, W / 2, 45);

  // ── Pitch
  const px = 16, py = 60, pw = W - 32, ph = 288;

  // Striped grass
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1e5421' : '#1b4e1e';
    ctx.fillRect(px + i * (pw / 8), py, pw / 8, ph);
  }

  // Lines
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  ctx.beginPath(); ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 32, 0, Math.PI * 2); ctx.stroke();
  const bw = 160, bh = 50;
  ctx.strokeRect(px + (pw - bw) / 2, py + 1,          bw, bh);
  ctx.strokeRect(px + (pw - bw) / 2, py + ph - bh - 1, bw, bh);

  // ── Player tokens
  const TR = 16;
  slots.forEach(slot => {
    const tx = px + (slot.x / 100) * pw;
    const ty = py + (slot.y / 100) * ph;

    if (slot.player) {
      ctx.shadowColor   = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur    = 8;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, TR, 0, Math.PI * 2);
      ctx.fillStyle = '#e3000b';
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 8px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shortName(slot.player.name).slice(0, 9), tx, ty);

      // Rating badge
      const rating = slot.player.seasonRating ?? slot.player.primeRating;
      if (rating) {
        const bx = tx - 11, by = ty + TR - 2;
        roundRect(ctx, bx, by, 22, 12, 3);
        ctx.fillStyle = '#0c0c0c';
        ctx.fill();
        ctx.fillStyle    = rating >= 85 ? '#f5c518' : rating >= 78 ? '#7cfc9f' : '#bbb';
        ctx.font         = 'bold 8px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(rating, tx, by + 6);
      }
    } else {
      ctx.beginPath();
      ctx.arc(tx, ty, TR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.fillStyle    = 'rgba(255,255,255,0.28)';
      ctx.font         = '8px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.label, tx, ty);
    }
  });

  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // ── Stats card
  let cy = py + ph + 12; // ~360

  roundRect(ctx, 16, cy, W - 32, 64, 8);
  ctx.fillStyle = '#141414';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  const cols  = [wins, draws, losses, pts];
  const clbls = ['S', 'U', 'N', 'PTS'];
  const ccols = ['#4ade80', '#888888', '#f87171', '#e3000b'];
  const csecW = (W - 32) / 4;

  cols.forEach((v, i) => {
    const sx = 16 + i * csecW + csecW / 2;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = ccols[i];
    ctx.font         = 'bold 26px system-ui, sans-serif';
    ctx.fillText(v, sx, cy + 38);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font      = '9px system-ui, sans-serif';
    ctx.fillText(clbls[i], sx, cy + 54);
    if (i < 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth   = 1;
      const lx = 16 + (i + 1) * csecW;
      ctx.beginPath(); ctx.moveTo(lx, cy + 10); ctx.lineTo(lx, cy + 54); ctx.stroke();
    }
  });

  cy += 76;
  ctx.fillStyle    = 'rgba(255,255,255,0.22)';
  ctx.font         = '11px system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${gf}:${ga} Tore   ·   ${pos}. Platz`, W / 2, cy);
  cy += 14;

  // ── Primary achievement
  if (topAch) {
    cy += 10;
    roundRect(ctx, 16, cy, W - 32, 60, 8);
    ctx.fillStyle = '#161208';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,197,24,0.4)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.fillStyle    = '#f5c518';
    ctx.font         = 'bold 14px system-ui, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`★  ${topAch.label}`, 26, cy + 26);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font      = '11px system-ui, sans-serif';
    ctx.fillText(topAch.desc, 26, cy + 44);
    cy += 68;
  }

  // ── Extra achievement chips
  if (restAch.length > 0) {
    cy += 4;
    let chipX = 16;

    restAch.forEach(a => {
      ctx.font = 'bold 10px system-ui, sans-serif';
      const text = `★ ${a.label}`;
      const cw   = ctx.measureText(text).width + 18;

      if (chipX + cw > W - 16) {
        chipX = 16;
        cy   += 28;
      }

      roundRect(ctx, chipX, cy, cw, 22, 5);
      ctx.fillStyle   = '#181818';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = 1;
      ctx.stroke();

      ctx.fillStyle    = 'rgba(255,255,255,0.55)';
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'left';
      ctx.fillText(text, chipX + 9, cy + 11);

      chipX += cw + 8;
    });
    cy += 30;
  }

  // ── Footer
  ctx.fillStyle    = 'rgba(255,255,255,0.18)';
  ctx.font         = '10px system-ui, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('#BundesligaDraftXI', W / 2, H - 12);

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
