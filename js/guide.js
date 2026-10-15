// 新手教學（啦啦隊導覽）：在真實遊戲畫面上用聚光框依序說明重點
// ・每一步可切換到指定畫面（go），再圈出畫面上的元素（sel，可多個；同一個選擇器符合多個元素時合併成一個框）
// ・也可以改為顯示一張示意圖（img＋box 百分比）或自訂內容（html）
// ・會自動播放；點畫面前往下一步；左上角可略過
const DUR = 4300;          // 每一步的時間（毫秒）；14 步約 60 秒
const SETTLE = 380;        // 切換畫面後等畫面進場動畫結束再量位置
let G = null;              // 播放中的教學

export const guideOn = () => !!G;
export function guideStop() { if (G) finish(true); }

export function runGuide({ steps, avatar, go, onEnd, endText }) {
  if (G) return;
  const root = document.createElement('div');
  root.className = 'tg';
  root.innerHTML = `<svg class="tg-dim" width="100%" height="100%"><defs><mask id="tg-mask"><rect width="100%" height="100%" fill="#fff"/><g class="tg-holes"></g></mask></defs>
      <rect width="100%" height="100%" fill="rgba(3,8,20,.66)" mask="url(#tg-mask)"/></svg>
    <div class="tg-stage"></div><div class="tg-rings"></div>
    <div class="tg-bars">${steps.map(() => '<i><u></u></i>').join('')}</div>
    <button class="tg-skip" type="button">略過教學</button>
    <div class="tg-bubble"><div class="tg-av"><img src="${avatar}" alt=""></div><div class="tg-say"><b></b><span></span></div></div>`;
  document.body.appendChild(root);
  G = { root, steps, go, onEnd, endText, cur: -1, t0: 0, ready: 0, raf: 0, lastTap: 0, done: false,
    holes: root.querySelector('.tg-holes'), rings: root.querySelector('.tg-rings'), stage: root.querySelector('.tg-stage'),
    say: root.querySelector('.tg-say'), bubble: root.querySelector('.tg-bubble'), bars: [...root.querySelectorAll('.tg-bars u')] };
  root.querySelector('.tg-skip').addEventListener('click', (e) => { e.stopPropagation(); finish(true); });
  root.addEventListener('click', () => {
    const now = performance.now(); if (now - G.lastTap < 250) return; G.lastTap = now;
    if (G.done) return close();
    show(G.cur + 1);
  });
  requestAnimationFrame(() => root.classList.add('in'));
  show(0);
  G.raf = requestAnimationFrame(loop);
}

function show(i) {
  if (!G) return;
  if (i >= G.steps.length) return finish(false);
  G.cur = i; const s = G.steps[i];
  G.bars.forEach((u, k) => { u.style.width = k < i ? '100%' : '0'; });
  let wait = 0;
  if (s.go) { const changed = G.go(s.go); if (changed !== false) wait = SETTLE; }
  // 示意圖或自訂內容
  G.stage.className = 'tg-stage' + (s.img || s.html ? ' on' : '');
  G.stage.innerHTML = s.img ? `<img src="${s.img}" alt="">` : (s.html ? (typeof s.html === 'function' ? s.html() : s.html) : '');
  G.rings.innerHTML = ''; G.holes.innerHTML = '';
  G.say.innerHTML = `<b>${s.title}</b><span>${s.text}</span>`;
  G.say.style.animation = 'none'; void G.say.offsetWidth; G.say.style.animation = '';
  G.ready = performance.now() + wait; G.t0 = G.ready;
}

// 取得要圈起來的矩形（螢幕座標）
function rects(s) {
  if (s.img && s.box) {
    const im = G.stage.querySelector('img'); if (!im) return [];
    const r = im.getBoundingClientRect(), [x, y, w, h] = s.box;
    return [{ left: r.left + r.width * x / 100, top: r.top + r.height * y / 100, width: r.width * w / 100, height: r.height * h / 100 }];
  }
  const out = [];
  for (const sel of [].concat(s.sel || [])) {
    const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
    if (!els.length) continue;
    const rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width > 2 && r.height > 2);
    if (!rs.length) continue;
    const left = Math.min(...rs.map(r => r.left)), top = Math.min(...rs.map(r => r.top));
    out.push({ left, top, width: Math.max(...rs.map(r => r.right)) - left, height: Math.max(...rs.map(r => r.bottom)) - top });
    if (s.first) break;   // 只取第一個找得到的（用於不同狀態的畫面）
  }
  return out;
}

function place() {
  const s = G.steps[G.cur]; if (!s) return;
  const vw = innerWidth, vh = innerHeight, pad = Math.max(4, vh * 0.012);
  const rs = rects(s).map(r => ({ left: Math.max(2, r.left - pad), top: Math.max(2, r.top - pad), width: Math.min(vw - 4, r.width + pad * 2), height: Math.min(vh - 4, r.height + pad * 2) }));
  const key = rs.map(r => [r.left, r.top, r.width, r.height].map(Math.round).join(',')).join('|');
  if (key !== G.key) {
    G.key = key;
    G.holes.innerHTML = rs.map(r => `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="10" fill="#000"/>`).join('');
    G.rings.innerHTML = rs.map(r => `<i style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></i>`).join('');
    // 對話框放在不會擋住重點的地方：重點在畫面下半部就移到上方
    // at：top／bottom／top-right／bottom-right（right 版較窄，放在畫面右側）
    const low = rs.some(r => r.top + r.height > vh * 0.74 && r.left < vw * 0.68);
    const at = s.at || (low ? 'top' : 'bottom');
    G.bubble.classList.toggle('top', at.startsWith('top'));
    G.bubble.classList.toggle('right', at.endsWith('right'));
  }
}

function loop(now) {
  if (!G) return;
  if (!G.done && G.cur >= 0 && now >= G.ready) {
    place();
    const k = Math.min(1, (now - G.t0) / DUR);
    G.bars[G.cur].style.width = (k * 100) + '%';
    if (k >= 1) show(G.cur + 1);
  }
  G.raf = requestAnimationFrame(loop);
}

function finish(skipped) {
  if (!G || G.done) return;
  G.done = true; G.key = '';
  G.bars.forEach(u => { u.style.width = '100%'; });
  G.holes.innerHTML = ''; G.rings.innerHTML = ''; G.stage.className = 'tg-stage'; G.stage.innerHTML = '';
  G.bubble.classList.remove('top', 'right');
  G.root.classList.add('end');
  G.say.innerHTML = `<b>${skipped ? '已略過教學' : '教學完成！'}</b><span>${G.endText || ''}</span>`;
  G.say.style.animation = 'none'; void G.say.offsetWidth; G.say.style.animation = '';
  clearTimeout(G.endT); G.endT = setTimeout(close, skipped ? 2200 : 3200);
}

function close() {
  if (!G) return;
  const g = G; G = null;
  cancelAnimationFrame(g.raf); clearTimeout(g.endT);
  g.root.classList.remove('in');
  setTimeout(() => g.root.remove(), 300);
  try { g.onEnd && g.onEnd(); } catch (e) { /* 略過 */ }
}
