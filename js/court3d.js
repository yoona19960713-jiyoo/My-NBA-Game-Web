// 最後 5 分鐘對決的 3D 演出：選完戰術後，在 2.5D 球場上演出這一回合（約 3.5 秒，點畫面跳過）
// 球員是「站在場上的 Q 版立牌」（用卡片人物圖），鏡頭跟著球移動；結果完全依照比賽引擎算好的結果演出
let cv, ctx, W, H, F, DPR, imgs = {};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t, seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sm = (t) => t * t * (3 - 2 * t);
const HOOP = { x: 0, y: 3.05, z: -11.2 };
let cam = { x: 0, y: 7, z: 4.5, pitch: -.5 };
function proj(x, y, z) {
  const rx = x - cam.x, ry = y - cam.y, rz = z - cam.z, cz0 = -rz, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cy = ry * cp - cz0 * sp, cz = ry * sp + cz0 * cp; if (cz < .1) return null;
  return [W / 2 + rx * F / cz, H / 2 - cy * F / cz, F / cz];
}
function line3(pts, col, w) { ctx.beginPath(); let s = false; for (const p of pts) { const q = proj(...p); if (!q) { s = false; continue; } s ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); s = true; } ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
const arc = (cx, cz, r, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]; });

// ---------- 場景 ----------
function court() {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0B1222'); g.addColorStop(.45, '#16213A'); g.addColorStop(1, '#0B1222'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 觀眾席燈光
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let r = 0; r < 3; r++) for (let i = 0; i < 40; i++) { const x = -16 + i * .82, q = proj(x, 3 + r * 2.4, -17 - r * 2.5); if (!q) continue; ctx.fillStyle = `rgba(${r === 1 ? '255,225,170' : '160,190,255'},${.25 + .2 * Math.sin(i * 1.7 + r)})`; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, .12 * q[2]), 0, 6.28); ctx.fill(); }
  ctx.restore();
  // 木地板（半場）
  const c = [[-8, 0, -14], [8, 0, -14], [8, 0, Math.min(2.5, cam.z - .4)], [-8, 0, Math.min(2.5, cam.z - .4)]].map(p => proj(...p));
  if (c.every(Boolean)) { ctx.beginPath(); c.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
    const fg = ctx.createLinearGradient(0, c[0][1], 0, c[2][1]); fg.addColorStop(0, '#7A4A22'); fg.addColorStop(1, '#C88A4A'); ctx.fillStyle = fg; ctx.fill();
    ctx.save(); ctx.clip(); for (let x = -8; x <= 8; x += .6) line3([[x, 0, -14], [x, 0, 2.5]], 'rgba(90,50,20,.35)', 1); ctx.restore(); }
  // 禁區塗色
  const pk = [[-2.45, 0, -14], [2.45, 0, -14], [2.45, 0, -8.2], [-2.45, 0, -8.2]].map(p => proj(...p));
  if (pk.every(Boolean)) { ctx.beginPath(); pk.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fillStyle = 'rgba(30,70,150,.55)'; ctx.fill(); }
  const L = 'rgba(255,250,235,.9)';
  line3([[-7.5, 0, -14], [7.5, 0, -14]], L, 2); line3([[-7.5, 0, -14], [-7.5, 0, 2]], L, 2); line3([[7.5, 0, -14], [7.5, 0, 2]], L, 2); line3([[-7.5, 0, 0], [7.5, 0, 0]], L, 2);
  line3(arc(0, 0, 1.8, Math.PI, Math.PI * 2), L, 2);
  line3([[-2.45, 0, -14], [-2.45, 0, -8.2], [2.45, 0, -8.2], [2.45, 0, -14]], L, 2); line3(arc(0, -8.2, 1.8, 0, Math.PI * 2, 48), L, 2);
  line3([[-6.6, 0, -14], [-6.6, 0, -12.6]], L, 2); line3([[6.6, 0, -14], [6.6, 0, -12.6]], L, 2); line3(arc(0, -12.6, 6.75, Math.PI + .21, Math.PI * 2 - .21, 60), L, 2);
}
function hoop(whip) {
  const { x, y, z } = HOOP;
  line3([[x - .9, y + .9, z - .4], [x + .9, y + .9, z - .4], [x + .9, y - .15, z - .4], [x - .9, y - .15, z - .4], [x - .9, y + .9, z - .4]], '#F4F8FF', 3);
  line3([[x - .3, y + .45, z - .39], [x + .3, y + .45, z - .39], [x + .3, y + .05, z - .39], [x - .3, y + .05, z - .39], [x - .3, y + .45, z - .39]], '#FF5A3A', 2);
  line3([[x, y + .9, z - .5], [x, 0, z - 1.6]], 'rgba(120,130,150,.8)', 4);
  const low = .45 + whip * .3, br = .13;
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; line3([[x + Math.cos(a) * .23, y, z + Math.sin(a) * .23], [x + Math.cos(a) * br, y - low, z + Math.sin(a) * br]], 'rgba(255,255,255,.85)', 1.3); }
  line3(Array.from({ length: 25 }, (_, i) => { const a = i / 24 * 6.28; return [x + Math.cos(a) * .23, y, z + Math.sin(a) * .23]; }), '#E8401A', 4);
}
function ball(x, y, z, spin) {
  const q = proj(x, y, z); if (!q) return; const r = Math.max(3, .14 * q[2]);
  const s = proj(x, 0, z); if (s) { ctx.save(); ctx.translate(s[0], s[1]); ctx.scale(1, .3); ctx.fillStyle = `rgba(0,0,0,${clamp(.5 - y * .1, .1, .5)})`; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.translate(q[0], q[1]); const g = ctx.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r); g.addColorStop(0, '#FFB060'); g.addColorStop(.6, '#F07A1E'); g.addColorStop(1, '#B8480C');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill(); ctx.rotate(spin); ctx.strokeStyle = '#3A1A08'; ctx.lineWidth = Math.max(1, r * .12);
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, r * .3, r, 0, 0, 6.28); ctx.stroke(); ctx.rotate(-spin);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.lineWidth = Math.max(1.2, r * .14); ctx.stroke(); ctx.restore();
}
// Q 版立牌：腳下陰影＋隊色光圈＋人物圖（沒有圖時用隊色圓牌與縮寫）
function standee(a, hl) {
  const base = proj(a.x, 0, a.z); if (!base) return; const sc = base[2];
  ctx.save(); ctx.translate(base[0], base[1]); ctx.scale(1, .32);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(0, 0, .55 * sc, 0, 6.28); ctx.fill();
  ctx.strokeStyle = a.col; ctx.lineWidth = Math.max(2, .08 * sc); ctx.shadowColor = a.col; ctx.shadowBlur = hl ? 18 : 6; ctx.beginPath(); ctx.arc(0, 0, .5 * sc, 0, 6.28); ctx.stroke(); ctx.restore();
  const h = 1.4 * sc, w = h, bob = Math.sin((a.phase || 0)) * .03 * sc;
  const im = imgs[a.img];
  ctx.save(); if (a.flash) ctx.filter = 'brightness(1.8)';
  if (im && im.complete && im.naturalWidth) { ctx.drawImage(im, base[0] - w / 2, base[1] - h + bob, w, h); }
  else { ctx.fillStyle = a.col; ctx.beginPath(); ctx.arc(base[0], base[1] - h * .55, h * .3, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `900 ${h * .18}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(a.label || '', base[0], base[1] - h * .5); }
  ctx.restore();
  if (hl) { ctx.save(); ctx.fillStyle = '#FFE08A'; ctx.font = `900 ${Math.max(10, .28 * sc)}px sans-serif`; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(a.name || '', base[0], base[1] - h - 4); ctx.restore(); }
}

// ---------- 戰術劇本：回傳各球員的路徑與出手點 ----------
// 進攻方基本站位（朝向籃框 z=-11.2）
const SPOT = [[0, -4.6], [5.2, -7.6], [-5.2, -7.6], [2.6, -9.6], [-2.2, -10.1]];
function shotSpot(stype, side) { const s = side || 1; return stype === 'thr' ? [s * 5.6, -6.9] : stype === 'mid' ? [s * 2.8, -7.4] : [s * .5, -10.1]; }
function plan(play, stype, si) {
  // si：出手者在 5 人中的索引；回傳 { paths: [[ [t,x,z], ... ] x5], passes: [[t0,t1,from,to]], shotT, shotFrom }
  const paths = SPOT.map(([x, z]) => [[0, x, z]]), passes = [];
  const side = SPOT[si][0] >= 0 ? 1 : -1;
  const go = (i, t, x, z) => paths[i].push([t, x, z]);
  const [sx, sz] = shotSpot(stype, side);
  let holder = 0;
  if (play === 'fast') {   // 快攻：從後場推進
    paths.forEach((p, i) => { p[0] = [0, SPOT[i][0] * .6, 4 + i * .8]; });
    go(si, 1.7, sx, sz); paths.forEach((p, i) => { if (i !== si) go(i, 1.8, SPOT[i][0] * .9, SPOT[i][1] + 2); });
    if (si !== 0) passes.push([.5, .9, 0, si]);
  } else if (play === 'pnr') {   // 擋拆：中鋒上來掩護，持球者借掩護切入或拔起
    go(4, .6, .9, -5.4); go(4, 1.5, .9, -5.4);
    if (si === 4) { go(0, .9, 1.8, -5.6); go(4, 1.6, .4, -9.6); passes.push([1.1, 1.5, 0, 4]); }
    else { if (si !== 0) passes.push([.1, .5, 0, si]); go(si, .9, side * .6, -4.8); go(si, 1.7, sx, sz); }
  } else if (play === 'post') {   // 低位單打：餵球到低位，背框推進後轉身
    if (si !== 1) passes.push([.3, .8, 0, 1]);
    go(si, .7, side * 2.4, -9.8); passes.push([.9, 1.3, si === 1 ? 0 : 1, si]); go(si, 1.5, side * 1.6, -10.2); go(si, 1.8, sx * .6, Math.min(sz, -9.6));
  } else if (play === 'three' || play === 'kick') {   // 外線：傳導球找到空檔射手
    passes.push([.1, .5, 0, 1]); passes.push([.6, 1.0, 1, si === 1 ? 0 : si]); if (si === 1) passes.push([1.05, 1.4, 0, 1]);
    go(si, 1.2, side * 6.4, -12.4); go(si, 1.6, side * 6.4, -12.4);
  } else if (play === 'drive') {   // 切入：從側翼沿底線衝籃
    if (si !== 0) passes.push([.2, .6, 0, si]);
    go(si, .8, side * 4.4, -8.6); go(si, 1.7, side * .6, -10.4);
  } else if (play === 'iso') {   // 單打：拉開空間，連續運球晃動
    paths.forEach((p, i) => { if (i !== si) p.push([.8, SPOT[i][0] * 1.25, SPOT[i][1] - .6]); });
    if (si !== 0) passes.push([.1, .5, 0, si]);
    go(si, .6, -.5, -5.2); go(si, .9, .7, -5.6); go(si, 1.2, -.4, -6.0); go(si, 1.7, sx, sz);
  } else {   // 關鍵戰術：無球繞掩護接球出手
    go(3, .5, -1.2, -9.4); go(si, .6, side * -1.5, -10.4); go(si, 1.3, side * 4.6, -7.4); passes.push([1.2, 1.55, 0, si]); go(si, 1.7, sx, sz);
  }
  return { paths, passes, shotT: 1.9, holderStart: holder };
}
function at(path, t) { if (t <= path[0][0]) return [path[0][1], path[0][2]]; for (let i = 1; i < path.length; i++) { if (t <= path[i][0]) { const [t0, x0, z0] = path[i - 1], [t1, x1, z1] = path[i]; const k = sm((t - t0) / (t1 - t0 || 1)); return [lerp(x0, x1, k), lerp(z0, z1, k)]; } } const l = path[path.length - 1]; return [l[1], l[2]]; }

// ---------- 播放 ----------
// opts: { offense:[{img,name,label}], defense:[...], offCol, defCol, play, stype, shooter(0-4), result:{pts, tov, foul, blk}, mine:true/false }
export function playPossession(opts) {
  if (typeof document === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const ov = document.createElement('div'); ov.className = 'c3d'; cv = document.createElement('canvas'); ov.appendChild(cv);
    const cap = document.createElement('div'); cap.className = 'c3d-cap'; ov.appendChild(cap);
    const hint = document.createElement('div'); hint.className = 'c3d-skip'; hint.textContent = '點畫面跳過'; ov.appendChild(hint);
    (opts.parent || document.body).appendChild(ov); if (opts.parent) ov.classList.add('in-parent');
    const r = ov.getBoundingClientRect(); W = r.width; H = r.height; DPR = Math.min(2, devicePixelRatio || 1); F = H * 1.15;
    cv.width = W * DPR; cv.height = H * DPR; try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; } if (!ctx) { ov.remove(); return resolve(); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    [...opts.offense, ...opts.defense].forEach(p => { if (p.img && !imgs[p.img]) { const im = new Image(); im.src = p.img; imgs[p.img] = im; } });
    const res = opts.result || {}, si = clamp(opts.shooter | 0, 0, 4), P = plan(opts.play || 'iso', opts.stype || 'mid', si);
    const made = res.pts > 0 && !res.tov, three = opts.stype === 'thr';
    const T = 3.6; let t0 = performance.now(), done = false, whipT = -1, stealer = 1 + (si % 4);
    const end = () => { if (done) return; done = true; ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 220); };
    ov.addEventListener('click', end);
    cap.textContent = opts.title || '';
    const frame = (now) => {
      if (done) return; const t = Math.min(T, (now - t0) / 1000);
      // 球員位置
      const off = P.paths.map((p, i) => { const [x, z] = at(p, Math.min(t, 1.9)); return { x, z, img: opts.offense[i] && opts.offense[i].img, name: opts.offense[i] && opts.offense[i].name, label: opts.offense[i] && opts.offense[i].label, col: opts.offCol, phase: t * 9 + i }; });
      const def = off.map((o, i) => { const k = .32; const dx = HOOP.x - o.x, dz = HOOP.z - o.z, d = Math.hypot(dx, dz) || 1; const lag = i === si && t > 1.3 && t < 1.9 && !res.tov ? .5 : 0;
        return { x: o.x + dx / d * (1.1 + lag) + (i === si ? Math.sin(t * 6) * .2 : 0), z: o.z + dz / d * (1.1 + lag), img: opts.defense[i] && opts.defense[i].img, name: opts.defense[i] && opts.defense[i].name, label: opts.defense[i] && opts.defense[i].label, col: opts.defCol, phase: t * 7 + i }; });
      // 球的位置：持球者、傳球飛行、出手拋物線
      let holder = P.holderStart, bx, by, bz, flying = null;
      for (const [a, b, from, to] of P.passes) { if (t >= b) holder = to; else if (t >= a) flying = [a, b, from, to]; }
      if (res.tov && t >= 1.25) { // 失誤：傳球被抄或抄截
        const k = seg(t, 1.25, 1.6); const s = def[stealer]; const h = off[holder]; bx = lerp(h.x, s.x, k); bz = lerp(h.z, s.z, k); by = 1 + Math.sin(k * Math.PI) * .4;
        if (t > 1.6) { s.x += (t - 1.6) * 3; s.z += (t - 1.6) * 6; bx = s.x; bz = s.z; by = .9 + Math.abs(Math.sin(t * 12)) * .3; }
      } else if (flying && t < P.shotT) { const [a, b, from, to] = flying; const k = seg(t, a, b); const A = off[from], B = off[to]; bx = lerp(A.x, B.x, k); bz = lerp(A.z, B.z, k); by = 1.2 + Math.sin(k * Math.PI) * .5; }
      else if (t < P.shotT) { const h = off[holder]; bx = h.x + .35; bz = h.z + .1; by = .25 + Math.abs(Math.sin(t * 11)) * .7; }
      else { // 出手
        const s = off[si], k = seg(t, P.shotT, P.shotT + (three ? .85 : .7)); const peak = three ? 5.2 : opts.stype === 'mid' ? 4.6 : 3.9;
        const ex = made ? HOOP.x : HOOP.x + .25, ez = made ? HOOP.z : HOOP.z + .1;
        if (k < 1) { bx = lerp(s.x, ex, k); bz = lerp(s.z, ez, k); by = lerp(2.2, HOOP.y + .15, k) + Math.sin(k * Math.PI) * (peak - 2.6); }
        else if (made) { const k2 = seg(t, P.shotT + (three ? .85 : .7), T); bx = HOOP.x; bz = HOOP.z; by = HOOP.y - k2 * 3; if (whipT < 0) whipT = t; }
        else { const k2 = seg(t, P.shotT + (three ? .85 : .7), T); bx = ex + k2 * 2.5; bz = ez + k2 * 3; by = HOOP.y + .2 + Math.sin(k2 * Math.PI) * 1.2 - k2 * 2; }
      }
      // 鏡頭：持球時在中場後方，出手時推近並抬高跟著球
      const shoot = seg(t, P.shotT - .2, P.shotT + .6);
      // 轉播視角：從中場後上方俯瞰半場，出手時往籃框推近
      const tx = lerp(bx * .25, bx * .15, shoot), tz = lerp(Math.max(bz + 7, 1), HOOP.z + 8, sm(shoot));
      if (t < .05) { cam.x = tx; cam.z = tz; cam.y = 6.2; cam.pitch = -.36; } cam.x = lerp(cam.x, tx, .07); cam.z = lerp(cam.z, tz, .07); cam.y = lerp(cam.y, lerp(6.2, 5.2, shoot), .07); cam.pitch = lerp(cam.pitch, lerp(-.36, -.28, shoot), .07);
      // 繪製
      court(); const whip = whipT >= 0 ? Math.max(0, 1 - (t - whipT) * 2.5) : 0; hoop(whip);
      const all = [...off.map((a, i) => ({ a, hl: i === si || i === holder })), ...def.map((a, i) => ({ a, hl: res.tov && i === stealer && t > 1.3 }))].sort((p, q) => p.a.z - q.a.z);
      for (const { a, hl } of all) { if (res.foul && hl && t > P.shotT - .05 && t < P.shotT + .15) a.flash = true; standee(a, hl); }
      ball(bx, by, bz, t * 14);
      // 結果文字
      if (t > (res.tov ? 1.45 : P.shotT + (three ? .85 : .7))) {
        const txt = res.tov ? '抄截！' : made ? (res.foul ? `AND-ONE +${res.pts}` : `+${res.pts}`) : res.foul ? `犯規  罰球 ${res.pts || 0} 分` : res.blk ? '火鍋！' : '沒進！';
        const good = opts.mine ? made : !made;
        ctx.save(); ctx.textAlign = 'center'; ctx.font = `900 ${H * .14}px Oswald, sans-serif`; ctx.fillStyle = good ? '#FFD54A' : '#FF6A5A'; ctx.shadowColor = good ? 'rgba(255,190,60,.9)' : 'rgba(255,60,40,.9)'; ctx.shadowBlur = 24;
        const k = seg(t, P.shotT + .7, P.shotT + 1); ctx.translate(W / 2, H * .3); ctx.scale(1.6 - .6 * k, 1.6 - .6 * k); ctx.fillText(txt, 0, 0); ctx.restore();
      }
      if (t >= T) return end();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
