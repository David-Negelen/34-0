import { shortName } from './playerUtils';
import { getAchievements } from './simulation';

// Cross-browser rounded rect (ctx.roundRect not available in all browsers)
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

// Generate a canvas image of the completed XI + result
// achievements: pre-computed array from result state (includes squad-based ones)
export function generateResultCanvas(slots, result, formation, achievements) {
  const W = 540, H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const { W: wins, D: draws, L: losses, GF: gf, GA: ga, pts } = result;
  const achs = achievements ?? getAchievements(result);

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#e3000b';
  ctx.fillRect(0, 0, W, 60);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('BUNDESLIGA DREAM XI', W / 2, 38);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(formation, W / 2, 54);

  // ── Pitch ─────────────────────────────────────────────────────────────────
  const px = 18, py = 72, pw = W - 36, ph = 330;

  ctx.fillStyle = '#1a4a1a';
  roundRect(ctx, px, py, pw, ph, 6);
  ctx.fill();

  // pitch lines
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;

  ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
  ctx.beginPath(); ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, 30, 0, Math.PI * 2); ctx.stroke();

  const boxW = 180, boxH = 50;
  ctx.strokeRect(px + (pw - boxW) / 2, py + 2,           boxW, boxH);
  ctx.strokeRect(px + (pw - boxW) / 2, py + ph - boxH - 2, boxW, boxH);

  // ── Player tokens ─────────────────────────────────────────────────────────
  slots.forEach(slot => {
    const tx = px + (slot.x / 100) * pw;
    const ty = py + (slot.y / 100) * ph;

    ctx.beginPath();
    ctx.arc(tx, ty, 16, 0, Math.PI * 2);
    ctx.fillStyle = slot.player ? '#e3000b' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = slot.player ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = slot.player ? '#fff' : 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = slot.player ? shortName(slot.player.name).slice(0, 8) : slot.label;
    ctx.fillText(label, tx, ty);
  });

  // ── Stats section ─────────────────────────────────────────────────────────
  let y = py + ph + 22;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f0f0f0';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('Season Result', 20, y);
  y += 22;

  ctx.fillStyle = '#e3000b';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(`${pts} pts`, 20, y);
  y += 8;

  ctx.fillStyle = '#aaa';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`${wins}W  ${draws}D  ${losses}L   GD ${gf - ga > 0 ? '+' : ''}${gf - ga}   ${gf}:${ga}`, 20, y + 18);
  y += 42;

  // ── Achievements ──────────────────────────────────────────────────────────
  if (achs.length) {
    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('Achievements', 20, y);
    y += 18;
    achs.forEach(a => {
      ctx.fillStyle = '#f5c518';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(`★ ${a.label}`, 20, y);
      ctx.fillStyle = '#888';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(a.desc, 30, y + 14);
      y += 32;
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#333';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('#BundesligaDraftXI', W / 2, H - 10);

  return canvas;
}

// Download canvas as PNG
export async function downloadResult(canvas) {
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bundesliga-dream-xi.png';
  a.click();
  URL.revokeObjectURL(url);
}

// Share via Web Share API or fall back to download
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
