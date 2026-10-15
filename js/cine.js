// 進場動畫「傳奇序章」（6.5 秒）與離場動畫「榮耀永存」（6.0 秒）
// 以 2D 畫布模擬 3D：透視鏡頭、球場地板平面、Q 版籃球、籃框與籃網、觀眾席燈光、懸浮卡牌、立體金屬 LOGO
import { cardSVG } from './card.js';

let cv, ctx, W, H, F, DPR, ECO = false, P = [];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t, seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const ease = { out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, io: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), back: t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };

// ---------- 鏡頭與投影 ----------
let cam = { x: 0, y: 1.3, z: 6, pitch: -.12 };
function proj(x, y, z) {
  const rx = x - cam.x, ry = y - cam.y, rz = z - cam.z;
  const cz0 = -rz, cy0 = ry, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cy = cy0 * cp - cz0 * sp, cz = cy0 * sp + cz0 * cp;
  if (cz < .05) return null;
  return [W / 2 + rx * F / cz, H / 2 - cy * F / cz, F / cz];
}
function poly(pts, close) { let started = false; ctx.beginPath(); for (const p of pts) { const q = proj(...p); if (!q) { started = false; continue; } if (!started) { ctx.moveTo(q[0], q[1]); started = true; } else ctx.lineTo(q[0], q[1]); } if (close) ctx.closePath(); }
function circlePts(cx, y, cz, r, n = 48, a0 = 0, a1 = Math.PI * 2) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); } return out; }

// ---------- 粒子 ----------
const sprites = {};
function sprite(col) { if (sprites[col]) return sprites[col]; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(.2, col); gr.addColorStop(.5, col.replace('rgb', 'rgba').replace(')', ',.3)')); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return sprites[col] = c; }
function emit(o) { if (ECO && Math.random() < .5) return; P.push(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 1, life: 1, age: 0, size: .04, col: 'rgb(255,210,110)', shape: null, att: null }, o)); }
function stepP(dt) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of P) {
    p.age += dt; if (p.att) { p.vx += (p.att[0] - p.x) * p.att[3] * dt; p.vy += (p.att[1] - p.y) * p.att[3] * dt; p.vz += (p.att[2] - p.z) * p.att[3] * dt; }
    p.vy -= p.g * dt; const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; p.vz *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const a = clamp(1 - p.age / p.life, 0, 1); const q = proj(p.x, p.y, p.z); if (!q || a <= 0) continue;
    const s = Math.max(1, p.size * q[2]);
    if (p.shape === 'card') { ctx.save(); ctx.globalAlpha = a; ctx.translate(q[0], q[1]); ctx.rotate(p.age * 3 + p.x); ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(1, s * .12); ctx.shadowColor = p.col; ctx.shadowBlur = 8; ctx.strokeRect(-s * .5, -s * .7, s, s * 1.4); ctx.restore(); continue; }
    ctx.globalAlpha = a; ctx.drawImage(sprite(p.col), q[0] - s, q[1] - s, s * 2, s * 2);
  }
  ctx.restore(); P = P.filter(p => p.age < p.life);
}

// ---------- 場景元件（Q 版風格：粗輪廓、飽和色） ----------
const HOOP = { x: 0, y: 3.05, z: -11.2 };
function drawFloor(reveal, cx = 0, cz = 0, warm = 1) {
  // 木地板
  const zn = Math.min(14.5, cam.z - .35); const corners = [[-8, 0, -14.5], [8, 0, -14.5], [8, 0, zn], [-8, 0, zn]];
  ctx.save(); poly(corners, true); const g = ctx.createLinearGradient(0, H * .35, 0, H); g.addColorStop(0, `rgba(120,70,30,${.9 * reveal})`); g.addColorStop(1, `rgba(200,130,60,${reveal})`); ctx.fillStyle = g; ctx.fill(); ctx.clip();
  ctx.strokeStyle = `rgba(90,50,20,${.35 * reveal})`; ctx.lineWidth = 1;
  for (let x = -8; x <= 8; x += .5) { poly([[x, 0, -14.5], [x, 0, zn]]); ctx.stroke(); }
  ctx.restore();
}
function courtLines(radius, ox, oz, alpha) {
  // 只畫在能量波紋半徑內的線條
  ctx.save(); ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(255,248,230,${alpha})`; ctx.shadowColor = 'rgba(255,220,140,.8)'; ctx.shadowBlur = 6;
  const draw = (pts) => { let run = []; for (const p of pts) { if (Math.hypot(p[0] - ox, p[2] - oz) <= radius) run.push(p); else { if (run.length > 1) { poly(run); ctx.stroke(); } run = []; } } if (run.length > 1) { poly(run); ctx.stroke(); } };
  const line = (a, b, n = 40) => { const out = []; for (let i = 0; i <= n; i++) out.push([lerp(a[0], b[0], i / n), 0, lerp(a[2], b[2], i / n)]); return out; };
  draw(line([-7.5, 0, -14], [7.5, 0, -14])); draw(line([-7.5, 0, 14], [7.5, 0, 14])); draw(line([-7.5, 0, -14], [-7.5, 0, 14], 80)); draw(line([7.5, 0, -14], [7.5, 0, 14], 80));
  draw(line([-7.5, 0, 0], [7.5, 0, 0])); draw(circlePts(0, 0, 0, 1.8, 60));
  for (const s of [-1, 1]) { const bz = s * 12.6; draw(circlePts(0, 0, bz, 6.75, 80, s < 0 ? 0 : Math.PI, s < 0 ? Math.PI : Math.PI * 2)); draw(line([-2.45, 0, s * 14], [-2.45, 0, s * 8.2], 20)); draw(line([2.45, 0, s * 14], [2.45, 0, s * 8.2], 20)); draw(line([-2.45, 0, s * 8.2], [2.45, 0, s * 8.2], 20)); draw(circlePts(0, 0, s * 8.2, 1.8, 40)); }
  ctx.restore();
  // 中央標誌：金色籃球圖案
  if (radius > 1.5) { const q = proj(0, 0, 0); if (q) { ctx.save(); ctx.globalAlpha = alpha; ctx.translate(q[0], q[1]); ctx.scale(1, .32); ctx.strokeStyle = '#FFD54A'; ctx.lineWidth = 4; ctx.shadowColor = '#FFB020'; ctx.shadowBlur = 12; const r = 1.0 * q[2]; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); ctx.restore(); } }
}
// 觀眾席燈光（依序亮起或熄滅）：lit(i) 回傳 0～1
const LIGHTS = []; for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2; LIGHTS.push({ x: Math.cos(a) * (14 + ring * 3), y: 2.5 + ring * 2.8, z: Math.sin(a) * (20 + ring * 3), k: (a / (Math.PI * 2) + ring * .12) % 1, ring }); }
function drawStands(lit) {
  // 看台剪影
  ctx.save(); for (let ring = 0; ring < 3; ring++) { const pts = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; pts.push([Math.cos(a) * (13.5 + ring * 3), 1.5 + ring * 2.8, Math.sin(a) * (19.5 + ring * 3)]); } poly(pts); ctx.strokeStyle = `rgba(60,80,130,${.25 * Math.max(...[0, ...LIGHTS.slice(0, 1).map(() => 1)])})`; ctx.lineWidth = 10; ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter';
  for (const L of LIGHTS) { const v = lit(L); if (v <= 0) continue; const q = proj(L.x, L.y, L.z); if (!q) continue; const s = Math.max(2, .35 * q[2]); ctx.globalAlpha = v; ctx.drawImage(sprite(L.ring === 1 ? 'rgb(255,230,170)' : 'rgb(170,200,255)'), q[0] - s * 2, q[1] - s * 2, s * 4, s * 4); }
  ctx.restore();
}
function spotlight(x, z, top, rBottom, alpha, col = '255,226,160') {
  const a = proj(x, top, z), b1 = proj(x - rBottom, 0, z), b2 = proj(x + rBottom, 0, z), c = proj(x, 0, z); if (!a || !b1 || !b2 || !c) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(a[0], a[1], c[0], c[1]); g.addColorStop(0, `rgba(${col},${.5 * alpha})`); g.addColorStop(1, `rgba(${col},${.06 * alpha})`); ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(a[0] - 4, a[1]); ctx.lineTo(a[0] + 4, a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath(); ctx.fill();
  ctx.translate(c[0], c[1]); ctx.scale(1, .3); const r = Math.abs(b2[0] - b1[0]) / 2; const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g2.addColorStop(0, `rgba(${col},${.75 * alpha})`); g2.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill(); ctx.restore();
}
// Q 版籃球：粗輪廓、橘色漸層、旋轉的球縫
function ball(x, y, z, spin, glowA = 0, shadow = true) {
  const q = proj(x, y, z); if (!q) return; const r = .2 * q[2];
  if (shadow) { const s = proj(x, 0, z); if (s) { ctx.save(); ctx.translate(s[0], s[1]); ctx.scale(1, .28); const k = clamp(1 - y / 2.5, .2, 1); ctx.fillStyle = `rgba(0,0,0,${.45 * k})`; ctx.beginPath(); ctx.arc(0, 0, r * 1.1 * k, 0, 6.28); ctx.fill(); ctx.restore(); } }
  if (glowA > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = glowA; ctx.drawImage(sprite('rgb(255,170,60)'), q[0] - r * 3, q[1] - r * 3, r * 6, r * 6); ctx.restore(); }
  ctx.save(); ctx.translate(q[0], q[1]);
  const g = ctx.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r); g.addColorStop(0, '#FFB060'); g.addColorStop(.55, '#F07A1E'); g.addColorStop(1, '#B8480C');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.clip(); ctx.rotate(spin);
  ctx.strokeStyle = '#3A1A08'; ctx.lineWidth = Math.max(1.2, r * .09); const k = Math.cos(spin * 1.7);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) * r * .25 + 1, r, 0, 0, 6.28); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-r * .95, 0, r * .55, r * 1.05, 0, -1.2, 1.2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(r * .95, 0, r * .55, r * 1.05, 0, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-r * .35, -r * .45, r * .28, r * .16, -.6, 0, 6.28); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#3A1A08'; ctx.lineWidth = Math.max(1.5, r * .12); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.stroke(); ctx.restore();
}
// 籃框、籃板、籃網（whip：刷網的甩動量）
function hoop(whip, glowA) {
  const { x, y, z } = HOOP;
  // 籃板（Q 版白框）
  const bb = [[x - .9, y + .9, z - .4], [x + .9, y + .9, z - .4], [x + .9, y - .15, z - .4], [x - .9, y - .15, z - .4]];
  ctx.save(); poly(bb, true); ctx.fillStyle = 'rgba(200,230,255,.18)'; ctx.fill(); ctx.strokeStyle = '#F4F8FF'; ctx.lineWidth = 4; ctx.stroke();
  poly([[x - .3, y + .45, z - .39], [x + .3, y + .45, z - .39], [x + .3, y + .05, z - .39], [x - .3, y + .05, z - .39]], true); ctx.strokeStyle = '#FF5A3A'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  if (glowA > 0) { const q = proj(x, y + .3, z - .4); if (q) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const R = 3 * q[2]; const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R); g.addColorStop(0, `rgba(255,250,220,${glowA})`); g.addColorStop(.3, `rgba(255,200,90,${.7 * glowA})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(q[0] - R, q[1] - R, R * 2, R * 2); ctx.restore(); } }
  // 籃網：12 條網線，往下收窄，刷網時往下甩
  const n = 12, rimR = .23, low = .45 + whip * .25, botR = .13 - whip * .03;
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6;
  for (let i = 0; i < n; i++) { const a = i / n * 6.28, a2 = (i + .5) / n * 6.28; poly([[x + Math.cos(a) * rimR, y, z + Math.sin(a) * rimR], [x + Math.cos(a2) * (rimR + botR) / 2, y - low * .5, z + Math.sin(a2) * (rimR + botR) / 2], [x + Math.cos(a) * botR, y - low, z + Math.sin(a) * botR]]); ctx.stroke(); }
  for (const k of [.5, 1]) { poly(circlePts(x, y - low * k, z, lerp(rimR, botR, k), 24)); ctx.stroke(); }
  // 籃框（橘紅粗框）
  poly(circlePts(x, y, z, rimR, 32)); ctx.strokeStyle = '#E8401A'; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = '#3A0A00'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

// ---------- DOM 層：卡牌、LOGO、字幕 ----------
function domLayer(html) { const d = document.createElement('div'); d.className = 'cine-dom'; d.innerHTML = html; return d; }
const LOGO = `<div class="cine-logo"><b data-t="MY NBA GAME">MY NBA GAME</b><i class="cl-sheen"></i></div>`;

function setup(className) {
  const ov = document.createElement('div'); ov.className = 'cine ' + className;
  cv = document.createElement('canvas'); ov.appendChild(cv); document.body.appendChild(ov);
  try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; } P = [];
  // 依實際螢幕大小設定畫布；手機進入全螢幕、轉向或工具列收合時畫面尺寸會變，要跟著重算，否則畫面會被拉長變形
  const fit = () => { const r = ov.getBoundingClientRect(); if (!r.width || !r.height) return; W = r.width; H = r.height; DPR = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    F = Math.min(H * 1.05, W * .62);   // 比較方的螢幕（平板、折疊機）縮小視角，避免左右被切掉
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); if (ctx) ctx.setTransform(DPR, 0, 0, DPR, 0, 0); };
  fit(); ov._fit = fit; addEventListener('resize', fit); if (window.visualViewport) visualViewport.addEventListener('resize', fit);
  return ov;
}
function runLoop(T, frame, ov, onSkip) {
  return new Promise((resolve) => {
    let t0 = performance.now(), last = t0, done = false, skipped = false;
    const end = () => { if (done) return; done = true; if (ov._fit) { removeEventListener('resize', ov._fit); if (window.visualViewport) visualViewport.removeEventListener('resize', ov._fit); } resolve(); };
    ov.addEventListener('click', () => { if (onSkip && !skipped) { skipped = true; onSkip(); end(); } });
    const loop = (now) => { if (done) return; { const r = ov.getBoundingClientRect(); if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) ov._fit(); } const dt = Math.min(.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); frame(Math.min(t, T), dt); if (t >= T) return end(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}

// ======================= 進場動畫：傳奇序章 =======================
export function intro({ eco = false, cards = [] } = {}) {
  if (typeof document === 'undefined') return Promise.resolve();
  ECO = eco; const ov = setup('cine-in');
  if (!ctx) { ov.remove(); return Promise.resolve(); }
  const sample = cards.slice(0, 3);   // [紅, 紫, 黑]
  const dom = domLayer(`<div class="cc-row">${sample.map((c, i) => `<div class="cc c${i}"><div class="cc-in"><div class="cc-face cc-back"><img src="img/backs/special.webp" alt=""></div><div class="cc-face cc-front">${c ? cardSVG(c, { animate: false }) : ''}</div></div></div>`).join('')}</div>
    ${LOGO}<div class="cine-sub">傳奇，由你開啟。</div><div class="cine-gold"></div><div class="cine-skip">點畫面跳過</div>`);
  ov.appendChild(dom);
  const ccs = [...dom.querySelectorAll('.cc')], logo = dom.querySelector('.cine-logo'), sub = dom.querySelector('.cine-sub'), gold = dom.querySelector('.cine-gold');
  let bounced = false, swished = false, burstCards = false;
  const frame = (t, dt) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // ---- 鏡頭 ----
    const up = ease.io(seg(t, 1.7, 2.4)), under = t >= 2.4 && t < 3.6;
    if (t < 1.7) cam = { x: 0, y: lerp(.75, 1.0, ease.io(seg(t, .8, 1.7))), z: lerp(2.6, 2.0, ease.out(seg(t, 0, .8))) + lerp(0, 2.2, ease.io(seg(t, .9, 1.7))), pitch: lerp(-.3, -.16, seg(t, .8, 1.7)) };
    else if (!under) cam = { x: 0, y: lerp(1.0, 2.7, up), z: lerp(4.2, -6.5, up), pitch: lerp(-.16, .08, up) };
    else cam = { x: .05, y: lerp(1.35, 1.25, seg(t, 2.4, 3.6)), z: HOOP.z + 1.3, pitch: .72 };
    // ---- 籃球軌跡 ----
    let bx = 0, by = .12, bz = 0, spin = 0;
    if (t >= .8 && t < 1.7) { const k = seg(t, .8, 1.7); const h = Math.abs(Math.sin(k * Math.PI * 2)) * lerp(.6, .25, k); by = .12 + h; spin = 0; if (t >= 1.05 && !bounced) bounced = 1.05; }
    if (t >= 1.7) { const k = seg(t, 1.7, 2.75); bx = 0; bz = lerp(0, HOOP.z, ease.io(k)); by = lerp(.12, HOOP.y + .1, k) + Math.sin(k * Math.PI) * 2.6 - (t > 2.62 ? (t - 2.62) * 6 : 0); spin = t * 22; }
    if (t > 2.75) by = HOOP.y - (t - 2.62) * 3.2;
    // ---- 觀眾席燈光 ----
    const lightsOn = (L) => { if (t < 1.0) return 0; const on = seg(t, 1.0 + L.k * .6, 1.15 + L.k * .6); const off = seg(t, 3.1, 3.4); return on * (1 - off) * .9; };
    drawStands(lightsOn);
    // 光軌：高速飛行時燈光拉出金色線條
    if (t > 1.8 && t < 2.45) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const L of LIGHTS) { if (L.ring !== 1 || lightsOn(L) <= 0) continue; const q = proj(L.x, L.y, L.z); if (!q) continue; ctx.strokeStyle = 'rgba(255,215,130,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] + 60 * up + 20); ctx.stroke(); } ctx.restore(); }
    // ---- 地板與線條（能量波紋擴散） ----
    const wave = bounced ? (t - bounced) * 14 : 0, floorA = t < .8 ? 0 : seg(t, 1.0, 1.7) * (1 - seg(t, 3.15, 3.5) * .85);
    if (t < 3.6) {
      // 黑暗中只有聚光燈照亮的一小片地板
      const sp0 = proj(0, 0, 0); if (sp0 && t < 1.7) { ctx.save(); ctx.translate(sp0[0], sp0[1]); ctx.scale(1, .32); const R = 1.6 * sp0[2]; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, 'rgba(210,140,70,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.28); ctx.fill(); ctx.restore(); }
      if (floorA > 0) drawFloor(floorA);
      if (bounced) { courtLines(wave, 0, 0, floorA); const wk = seg(t, bounced, bounced + .7); if (wk < 1) { ctx.save(); poly(circlePts(0, .01, 0, wave, 64)); ctx.strokeStyle = `rgba(255,215,110,${1 - wk})`; ctx.lineWidth = 8 * (1 - wk) + 1; ctx.shadowColor = '#FFC040'; ctx.shadowBlur = 20; ctx.stroke(); ctx.restore(); } }
      spotlight(0, 0, 9, 1.2, (1 - seg(t, 1.6, 2.0)) * seg(t, 0, .5));
      hoop(swished ? Math.max(0, 1 - (t - swished) * 2.5) * Math.sin((t - swished) * 30) * .8 + Math.max(0, 1 - (t - swished) * 2.5) : 0, swished ? Math.max(0, 1 - (t - swished) * 1.2) : 0);
      if (t < 2.95) ball(bx, by, bz, spin, t > 1.7 ? .5 : (t < .8 ? .25 : 0), t < 1.75);
    }
    // ---- 空心入網：網子甩動、金光爆發、光粒化為卡牌輪廓 ----
    if (t >= 2.7 && !swished) { swished = t; shakeEl(ov, 260); for (let i = 0; i < 140; i++) { const a = Math.random() * 6.28, sp = 1 + Math.random() * 4; emit({ x: HOOP.x, y: HOOP.y + .2, z: HOOP.z - .2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .8 + 1, vz: (Math.random() - .5) * 2, drag: .95, life: 1.4, size: .05 + Math.random() * .05, col: i % 2 ? 'rgb(255,215,120)' : 'rgb(255,245,210)', shape: i % 5 === 0 ? 'card' : null }); } }
    // 卡牌輪廓聚集：第五幕前粒子朝中央匯聚
    if (t > 3.3 && !burstCards) { burstCards = true; for (const p of P) { p.att = [HOOP.x, HOOP.y + .2, HOOP.z - .2, 6]; p.life = Math.max(p.life, p.age + .5); } }
    stepP(dt);
    if (t > 3.2 && t < 4.8) { const k = seg(t, 3.2, 3.6) * (1 - seg(t, 4.4, 4.8)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(W / 2, H * .5, 0, W / 2, H * .5, H * .6); g.addColorStop(0, `rgba(255,220,140,${.45 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    // ---- 第五幕：三張卡牌（DOM，3D 轉動） ----
    ccs.forEach((el, i) => {
      const order = [1, 0, 2][i];   // 依序：紅（左）→ 紫（右）→ 黑（中）
      const appear = ease.out(seg(t, 3.6 + i * .08, 3.95 + i * .08)), flip = ease.io(seg(t, 3.95 + order * .18, 4.25 + order * .18)), toLight = ease.in(seg(t, 4.45, 4.75));
      el.style.opacity = appear * (1 - toLight);
      el.style.transform = `translate(${lerp(0, -([-1, 0, 1][i]) * 100, toLight)}%, ${lerp(30, 0, appear) + Math.sin(t * 2 + i) * 4}px) translateZ(${lerp(-300, 0, appear)}px) rotateY(${180 * flip}deg) scale(${lerp(.6, 1, appear) * lerp(1, .2, toLight)})`;
      el.style.filter = toLight > 0 ? `brightness(${1 + toLight * 4}) blur(${toLight * 6}px)` : '';
    });
    if (t > 3.9 && t < 4.75) { const k = seg(t, 3.9, 4.2); // 紅卡赤金、紫卡星環、黑卡日冕
      const pos = [[W * .27, H * .5, 'rgb(255,110,40)'], [W * .73, H * .5, 'rgb(190,120,255)'], [W * .5, H * .5, 'rgb(255,210,110)']];
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; pos.forEach(([x, y, c], i) => { const g = ctx.createRadialGradient(x, y, 0, x, y, H * .32); g.addColorStop(0, c.replace('rgb', 'rgba').replace(')', `,${.5 * k})`)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - H * .32, y - H * .32, H * .64, H * .64);
        if (i === 1) { ctx.strokeStyle = `rgba(220,180,255,${.7 * k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, H * .2, H * .07, t, 0, 6.28); ctx.stroke(); }
        if (i === 2) { for (let j = 0; j < 36; j++) { const a = j / 36 * 6.28 + t * .3; ctx.strokeStyle = `rgba(255,210,120,${.5 * k})`; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * H * .2, y + Math.sin(a) * H * .26); ctx.lineTo(x + Math.cos(a) * H * .3, y + Math.sin(a) * H * .36); ctx.stroke(); } } });
      ctx.restore(); }
    // 粉白金光絲掠過（暗示啦啦隊卡）
    const thread = seg(t, 4.3, 4.7); if (thread > 0 && thread < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const x = lerp(-W * .1, W * 1.1, ease.io(thread)); const g = ctx.createLinearGradient(x - W * .25, 0, x, 0); g.addColorStop(0, 'rgba(255,190,220,0)'); g.addColorStop(1, 'rgba(255,240,230,.95)'); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - W * .25, H * .62 + 20); ctx.quadraticCurveTo(x - W * .12, H * .55, x, H * .6); ctx.stroke(); ctx.restore(); }
    // 三道光線匯聚 → 白金閃光
    const conv = seg(t, 4.6, 4.8); if (conv > 0 && conv < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; [[W * .27, 'rgb(255,110,40)'], [W * .73, 'rgb(190,120,255)'], [W * .5, 'rgb(255,210,110)']].forEach(([x0, c]) => { ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.shadowColor = c; ctx.shadowBlur = 20; ctx.beginPath(); ctx.moveTo(x0, H * (x0 === W * .5 ? .2 : .5)); ctx.lineTo(lerp(x0, W / 2, ease.in(conv)), lerp(H * (x0 === W * .5 ? .2 : .5), H * .45, ease.in(conv))); ctx.stroke(); }); ctx.restore(); }
    const flash = seg(t, 4.75, 4.85) * (1 - seg(t, 4.85, 5.3)); if (flash > 0) { ctx.fillStyle = `rgba(255,250,235,${flash})`; ctx.fillRect(0, 0, W, H); }
    // ---- 第六幕：LOGO、旋轉籃球輪廓、金色粒子、字幕 ----
    const lg = seg(t, 4.8, 5.2), lgOut = ease.in(seg(t, 5.7, 6.15));
    if (lg > 0) {
      const R = H * .3 * (1 + lgOut * 2); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 * lg * (1 - lgOut); ctx.translate(W / 2, H * .44); ctx.rotate(t * .5); ctx.strokeStyle = '#FFD27A'; ctx.lineWidth = 2; ctx.shadowColor = '#FFB020'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, R * .35 * Math.abs(Math.cos(t)), R, 0, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-R * .95, 0, R * .55, R * 1.05, 0, -1.2, 1.2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(R * .95, 0, R * .55, R * 1.05, 0, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke(); ctx.restore();
      if (t < 5.7 && Math.random() < .8) { const lr = logo.getBoundingClientRect(), orr = ov.getBoundingClientRect(); const x = lr.left - orr.left + Math.random() * lr.width, y = lr.top - orr.top + (Math.random() < .5 ? lr.height * .15 : lr.height * .85); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sprite('rgb(255,215,120)'), x - 6, y - 6, 12, 12); ctx.restore(); }
    }
    logo.style.opacity = ease.out(lg) * (1 - lgOut); logo.style.transform = `translate(-50%,-50%) scale(${lerp(1.3, 1, ease.back(lg)) * (1 + lgOut * 2.5)})`; logo.style.filter = lgOut ? `blur(${lgOut * 8}px) brightness(${1 + lgOut * 2})` : '';
    sub.style.opacity = seg(t, 5.15, 5.45) * (1 - seg(t, 5.7, 5.9));
    // ---- 第七幕：金色全畫面轉場 → 主選單 ----
    gold.style.opacity = seg(t, 5.75, 6.05) * (1 - seg(t, 6.15, 6.5));
    ov.style.background = t > 6.1 ? 'transparent' : '#000'; cv.style.opacity = t > 6.1 ? 0 : 1;
  };
  const finish = () => { ov.classList.add('out'); document.getElementById('app')?.classList.add('menu-rise'); setTimeout(() => { ov.remove(); document.getElementById('app')?.classList.remove('menu-rise'); }, 700); };
  return runLoop(6.5, frame, ov, null).then(finish).catch(finish).then(() => {}), new Promise(res => {
    // 點畫面跳過：直接進入最後的金色轉場
    ov.addEventListener('click', () => { if (ov.dataset.skip) return; ov.dataset.skip = 1; gold.style.transition = 'opacity .25s'; gold.style.opacity = 1; setTimeout(() => { finish(); res(); }, 300); });
    const iv = setInterval(() => { if (!document.body.contains(ov) || ov.classList.contains('out')) { clearInterval(iv); res(); } }, 100);
  });
}
function shakeEl(el, ms) { el.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(5px,-4px)' }, { transform: 'translate(-3px,-2px)' }, { transform: 'translate(0,0)' }], { duration: ms }); }

// ======================= 離場動畫：榮耀永存 =======================
export function outro({ eco = false } = {}) {
  if (typeof document === 'undefined') return Promise.resolve();
  ECO = eco; const ov = setup('cine-out');
  if (!ctx) { ov.remove(); return Promise.resolve(); }
  const dom = domLayer(`${LOGO}<div class="cine-sub o1">傳奇，未完待續。</div><div class="cine-sub o2">期待下一次與你相遇。</div>`);
  ov.appendChild(dom);
  const logo = dom.querySelector('.cine-logo'), s1 = dom.querySelector('.o1'), s2 = dom.querySelector('.o2');
  const cards = [[-1.3, '255,90,40'], [-.45, '180,110,255'], [.45, '255,210,110'], [1.3, '255,170,210']];
  let dissolved = false;
  const frame = (t, dt) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // 鏡頭：低角度跟隨滾動的球 → 向後拉遠看見整座球館
    const pull = ease.io(seg(t, 2.8, 3.8));
    cam = { x: 0, y: lerp(.55, 4.5, pull), z: lerp(3.2, 12, pull), pitch: lerp(-.1, -.32, pull) };
    const sceneA = 1 - seg(t, 3.8, 4.4);
    // 燈光依序熄滅：第一幕熄一部分，第四幕全部熄滅
    const lit = (L) => (1 - seg(t, .1 + L.k * .6, .25 + L.k * .6) * .55) * (1 - seg(t, 2.85 + L.k * .7, 3.0 + L.k * .7)) * .85;
    if (sceneA > 0) {
      ctx.globalAlpha = sceneA; drawStands(lit); drawFloor(.85 * (1 - seg(t, 3.0, 3.8) * .7)); courtLines(40, 0, 0, .55 * (1 - seg(t, 3.0, 3.8) * .6)); hoop(0, 0);
      // 地板倒映的微弱金光
      const q = proj(0, 0, 0); if (q) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(q[0], q[1]); ctx.scale(1, .3); const R = 2.6 * q[2]; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, 'rgba(255,200,110,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.28); ctx.fill(); ctx.restore(); }
      spotlight(0, 0, 9, 1.3, 1 - seg(t, 3.9, 4.4));
      // 最後一顆籃球從右側滾入，停在中央圓圈
      const roll = ease.out(seg(t, .8, 1.7)); const bx = lerp(4.5, 0, roll); ball(bx, .12, 0, -roll * 9, .2, true);
      ctx.globalAlpha = 1;
    }
    // 第三幕：半透明球員卡剪影，紅紫黑粉金邊光，升起後化為星塵
    if (t > 1.7 && t < 3.2) { cards.forEach(([x, col], i) => { const a = seg(t, 1.7 + i * .08, 2.0 + i * .08), rise = ease.in(seg(t, 2.3, 2.9)), fade = seg(t, 2.6, 2.9); const y = .9 + rise * 1.6 + Math.sin(t * 2 + i) * .05; const tl = proj(x - .32, y + .43, -.6), br = proj(x + .32, y - .43, -.6); if (!tl || !br) return;
      ctx.save(); ctx.globalAlpha = a * (1 - fade) * sceneA; const w = br[0] - tl[0], h = br[1] - tl[1]; ctx.fillStyle = `rgba(${col},.12)`; ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 2.5; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 16; roundRect(tl[0], tl[1], w, h, w * .1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,.12)`; ctx.beginPath(); ctx.arc(tl[0] + w / 2, tl[1] + h * .42, w * .22, 0, 6.28); ctx.fill(); ctx.fillRect(tl[0] + w * .25, tl[1] + h * .62, w * .5, h * .22); ctx.restore();
      if (fade > 0 && Math.random() < .5) emit({ x: x + (Math.random() - .5) * .6, y: y + (Math.random() - .5) * .8, z: -.6, vy: .8 + Math.random() * .6, vx: (Math.random() - .5) * .2, drag: .99, life: 1.6, size: .035, col: 'rgb(255,215,130)' }); }); }
    stepP(dt);
    // 第五幕：LOGO、金屬光澤由左至右、字幕
    const lg = seg(t, 4.2, 4.6), diss = seg(t, 4.9, 5.4);
    logo.style.opacity = ease.out(lg) * (1 - diss); logo.style.transform = `translate(-50%,-50%) scale(${lerp(.92, 1, ease.out(lg))})`; logo.classList.toggle('sweep', t > 4.3);
    s1.style.opacity = seg(t, 4.45, 4.75) * (1 - seg(t, 5.2, 5.6)); s2.style.opacity = seg(t, 4.7, 5.0) * (1 - seg(t, 5.2, 5.6));
    // 第六幕：LOGO 化為金色粒子，光點緩緩熄滅
    if (t > 4.9 && !dissolved) { dissolved = true; cam = { x: 0, y: 0, z: 5, pitch: 0 }; for (let i = 0; i < 160; i++) emit({ x: (Math.random() - .5) * 2.6, y: (Math.random() - .5) * .4 + .25, z: 0, vx: (Math.random() - .5) * .5, vy: .2 + Math.random() * .5, drag: .985, life: 1.1 + Math.random() * .6, size: .03, col: i % 3 ? 'rgb(255,215,120)' : 'rgb(255,245,220)' }); }
    if (t > 4.9) cam = { x: 0, y: 0, z: 5, pitch: 0 };
    ov.style.background = '#000';
  };
  return runLoop(6.0, frame, ov, null).then(() => { /* 保留黑畫面直到 App 關閉 */ });
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
