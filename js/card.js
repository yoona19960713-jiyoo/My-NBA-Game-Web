// 新版卡面：多層疊加（背景、放射光、看台、地板、等級特效、光暈、全息、人物、反光），依強化 +5／+10 有進化與極致型態
import { shortName, ENH_TOTAL } from './rules.js';

const TIER_CLASS = { '銅': 'bronze', '銀': 'silver', '金': 'gold', '紅': 'red', '紫': 'purple', '黑': 'black', '綠': 'green', '白金': 'plat' };
const TEAM = {
  ATL: ['#E03A3E', '#FFFFFF'], BOS: ['#007A33', '#FFFFFF'], BKN: ['#000000', '#FFFFFF'], CHA: ['#1D1160', '#00788C'],
  CHI: ['#CE1141', '#000000'], CLE: ['#860038', '#FDBB30'], DAL: ['#00538C', '#FFFFFF'], DEN: ['#0E2240', '#FEC524'],
  DET: ['#C8102E', '#1D42BA'], GS: ['#1D428A', '#FFC72C'], HOU: ['#CE1141', '#FFFFFF'], IND: ['#002D62', '#FDBB30'],
  LAC: ['#C8102E', '#1D428A'], LAL: ['#552583', '#FDB927'], MEM: ['#5D76A9', '#12173F'], MIA: ['#98002E', '#F9A01B'],
  MIL: ['#00471B', '#EEE1C6'], MIN: ['#0C2340', '#78BE20'], NO: ['#0C2340', '#C8102E'], NY: ['#006BB6', '#F58426'],
  OKC: ['#007AC1', '#EF3B24'], ORL: ['#0077C0', '#C4CED4'], PHI: ['#006BB6', '#ED174C'], PHX: ['#1D1160', '#E56020'],
  POR: ['#E03A3E', '#000000'], SAC: ['#5A2D81', '#FFFFFF'], SA: ['#C4CED4', '#000000'], TOR: ['#CE1141', '#000000'],
  UTAH: ['#002B5C', '#F9A01B'], WSH: ['#002B5C', '#E31837'],
};
export const TEAM_COLORS = TEAM;
const COLOR = { '銅': '#A8612A', '銀': '#8A96A4', '金': '#D19A12', '紅': '#D42A3A', '紫': '#8A4AD8', '黑': '#F0C850', '綠': '#20A060' };

let ART = {}, TPL = [], ECO = false;
export function setEco(v) { ECO = !!v; }
export function setArt(manifest, templates) { OTHER.clear(); ART = {}; for (const [k, ids] of Object.entries(manifest || {})) ART[k] = new Set(ids); TPL = templates || []; }
export let artUrl = (season, id) => `art/${season}/${id}.webp`;
export function setArtUrl(fn) { artUrl = fn; }
const hasArt = (c) => !!c.art || (ART[c.season] && ART[c.season].has(c.id)) || !!otherSeasonArt(c);
// 這一季沒有人物圖時，改用同一位球員最接近那一季的圖（例如 2018-19 LeBron 沿用 2017-18）
const OTHER = new Map();
function otherSeasonArt(c) {
  if (c.kind || (c.season !== 'green' && !/^\d{4}-\d{2}$/.test(c.season))) return null;
  if (OTHER.has(c.key)) return OTHER.get(c.key);
  const y = c.season === 'green' ? 9999 : +c.season.slice(0, 4);   // 綠卡、新秀的年度卡：任何一季（或綠卡）的圖都能共用
  const seasons = Object.keys(ART).filter(s => (/^\d{4}-\d{2}$/.test(s) || s === 'green') && s !== c.season && ART[s].has(c.id)).sort((a, b) => { const ya = a === 'green' ? 9999 : +a.slice(0, 4), yb = b === 'green' ? 9999 : +b.slice(0, 4); return Math.abs(ya - y) - Math.abs(yb - y) || (ya < y ? -1 : 1); });
  const s = seasons[0] || null; OTHER.set(c.key, s); return s;
}
const artPath = (c) => (ART[c.season] && ART[c.season].has(c.id)) ? artUrl(c.season, c.id) : otherSeasonArt(c) ? artUrl(otherSeasonArt(c), c.id) : artUrl(c.season, c.id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// 依卡片產生固定的亂數，讓粒子位置每次一樣
function rng(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }

function particles(t, R) {
  const r = (a, b) => (a + R() * (b - a));
  let h = '';
  const rise = { bronze: 8, gold: 6, black: 8, red: 10 }[t] || 0;
  for (let i = 0; i < rise; i++) h += `<i class="p-rise" style="left:${r(5, 95).toFixed(0)}%;animation-delay:-${r(0, 4).toFixed(1)}s;animation-duration:${r(3, 5.5).toFixed(1)}s"></i>`;
  if (['gold', 'silver', 'black'].includes(t)) for (let i = 0; i < 5; i++) h += `<i class="p-twk" style="left:${r(5, 85).toFixed(0)}%;top:${r(5, 60).toFixed(0)}%;animation-delay:-${r(0, 2.4).toFixed(1)}s"></i>`;
  if (t === 'silver') h += '<i class="p-streak" style="top:0"></i><i class="p-streak" style="top:0;animation-delay:-2.2s"></i>';
  if (t === 'red' || t === 'black') for (let k = 0; k < 5; k++) h += `<i class="p-flame" style="left:${-10 + k * 24}%;animation-delay:-${r(0, 1.4).toFixed(1)}s"></i>`;
  if (t === 'red') h += '<i class="p-ring"></i><i class="p-ring" style="animation-delay:-1.5s"></i>';
  if (t === 'purple') {
    h += '<i class="p-blob" style="background:#ff3ad0;left:-20%;top:-10%"></i><i class="p-blob" style="background:#3ac8ff;left:30%;top:30%;animation-delay:-3s"></i><i class="p-blob" style="background:#8a3aff;left:0;top:50%;animation-delay:-6s"></i>';
    for (let i = 0; i < 14; i++) h += `<i class="p-star" style="left:${r(3, 97).toFixed(0)}%;top:${r(3, 70).toFixed(0)}%;animation-delay:-${r(0, 2).toFixed(1)}s"></i>`;
  }
  if (t === 'black') h += '<svg class="p-bolt" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M70 0 L58 30 L68 32 L50 62 L60 64 L44 100" fill="none" stroke="#FFF3B0" stroke-width="1.6"/><path d="M22 0 L30 22 L24 24 L34 46" fill="none" stroke="#FFE07A" stroke-width="1.1"/></svg>';
  if (t === 'green') for (let i = 0; i < 7; i++) h += `<i class="p-leaf" style="left:${r(0, 90).toFixed(0)}%;animation-delay:-${r(0, 5).toFixed(1)}s;animation-duration:${r(4, 6.5).toFixed(1)}s"></i>`;
  return h;
}

// 沒有專屬人物圖：從模板中挑球衣顏色最接近球隊主色的幾張，再依球員固定選一張
const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// ===== 卡面背景：依等級選款式，依球隊主色＋等級色即時換色（結果快取） =====
const BG_STYLE = { '銅': 'graffiti', '銀': 'neon', '金': 'arena', '紅': 'gold', '紫': 'cosmic', '黑': 'champion', '綠': 'arena' };
const TIER_ACC = { '銅': [25, .75, 1], '銀': [210, .12, 1.15], '金': [45, .85, 1], '紅': [355, .8, 1], '紫': [285, .7, 1.05], '黑': [45, .85, .95], '綠': [140, .7, 1] };
const BG_CACHE = new Map(), BG_PENDING = new Set(), BG_IMG = new Map();
function rgb2hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m]; }
function buildBg(key, style, team, tier) {
  if (BG_PENDING.has(key) || typeof document === 'undefined' || typeof Image === 'undefined') return;
  BG_PENDING.add(key);
  const run = (img) => {
    try {
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cv.width, cv.height), p = data.data;
      const [tr, tg, tb] = hexRgb((TEAM[team] || ['#555555'])[0]).map(x => x / 255), [th, ts, tv] = rgb2hsv(tr, tg, tb);
      const [ah, as, av] = TIER_ACC[tier] || TIER_ACC['金'];
      for (let i = 0; i < p.length; i += 4) {
        let [h, s, v] = rgb2hsv(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255);
        const green = h > 70 && h < 200 && s > .15, gold = h >= 22 && h <= 70 && s > .22;
        if (green) { h = th; s = Math.min(1, s * (.35 + ts)); v = Math.min(1, v * (.75 + .5 * tv)); }
        else if (gold) { h = ah; s = Math.min(1, s * as / .85); v = Math.min(1, v * av); }
        if (tier === '黑' && !gold) v *= .8;
        let [r, g, b] = hsv2rgb(h, s, v);
        if (style === 'gold') { const k = .3 * Math.pow(1 - v, 1.5); r += tr * k; g += tg * k; b += tb * k; }   // 金色風暴本身沒有綠色：暗部加一層球隊色
        p[i] = Math.min(255, r * 255); p[i + 1] = Math.min(255, g * 255); p[i + 2] = Math.min(255, b * 255);
      }
      ctx.putImageData(data, 0, 0);
      const url = cv.toDataURL('image/webp', .82);
      BG_CACHE.set(key, url);
      document.querySelectorAll(`[data-bgk="${key}"]`).forEach(el => { el.style.backgroundImage = `url(${url})`; });
    } catch (e) { /* 換色失敗就維持原色 */ }
  };
  let img = BG_IMG.get(style);
  if (img && img.complete) return run(img);
  if (!img) { img = new Image(); img.src = `img/bg/${style}.webp`; BG_IMG.set(style, img); }
  img.addEventListener('load', () => run(img), { once: true });
}
export function bgFor(card) {
  const style = BG_STYLE[card.tier]; if (!style) return null;
  const key = `${card.team}|${card.tier}`;
  if (!BG_CACHE.has(key)) buildBg(key, style, card.team, card.tier);
  return { key, url: BG_CACHE.get(key) || `img/bg/${style}.webp` };
}
function templateFor(card) {
  if (!TPL.length) return null;
  const [r, g, b] = hexRgb((TEAM[card.team] || ['#808080'])[0]);
  const all = TPL.map(t => ({ t, d: (t.jersey[0] - r) ** 2 + (t.jersey[1] - g) ** 2 + (t.jersey[2] - b) ** 2 })).sort((x, y) => x.d - y.d);
  const near = all.slice(0, Math.min(5, Math.max(3, all.filter(x => x.d <= all[0].d * 2 + 1500).length)));
  const pick = near[Math.floor(rng(card.name || card.key || '')() * near.length)];
  return `art/_tpl/${pick.t.f}`;
}

export function artSrc(card) { return hasArt(card) ? artPath(card) : card.kind ? null : templateFor(card); }

const SQUAD = { '樂天女孩': ['#8A1538', '#F5C6D0'], 'Passion': ['#F2B300', '#1A1A1A'], 'Fubon': ['#0A3D91', '#9FD3FF'], '小龍女': ['#C8102E', '#FFD6DC'], 'Wing': ['#1F2A44', '#7FD3FF'], 'Uni-Girls': ['#F26522', '#FFE3D0'] };
function placeholder(card) {
  const [c1, c2] = card.kind === 'cheer' ? (SQUAD[card.team] || ['#B88A2E', '#FFF']) : TEAM[card.team] || ['#333', '#fff'];
  const ini = card.kind === 'cheer' ? (card.name || '?').slice(0, 4) : (card.name || '?').split(' ').map(w => w[0]).join('').slice(0, 3);
  return `<div class="nc-ph" style="--c1:${c1};--c2:${c2}"><b>${esc(ini)}</b><span>${esc(card.team)}</span></div>`;
}


// 啦啦隊卡：橫式卡面（背景＋人物＋卡框三層），名字寫在右下的名牌
const SKILL_ICON = { coin: '💰', gift: '🎁', luck: '🍀', discount: '🏷️', enh: '✨', decomp: '♻️', games: '📅', hist: '📜', tower: '🗼', legend: '👑', quick: '⏩', cap: '📚' };
const SKILL_NAME = { coin: '招財應援', gift: '每日禮物', luck: '幸運開包', discount: '精打細算', enh: '強化祝福', decomp: '分解達人', exp: '經驗應援', gauge: '集氣應援', stam: '體力應援', toRec: '暫停應援', games: '加場應援', hist: '挑戰應援', tower: '不屈應援', legend: '傳奇應援', quick: '快速應援', cap: '收藏應援' };
function cheerCard(card, plus) {
  const src = hasArt(card) ? artUrl(card.season, card.id) : null, lv = (plus || 0) + 1;
  return `<div class="ncw" role="img" aria-label="${esc(card.name)} 白金啦啦隊卡 Lv${lv}"><div class="lcp${lv >= 5 ? ' bgdyn' : ''}">
    <img class="lc-bg" src="img/cheer_bg_p.webp" alt="">${lv >= 5 ? '<i class="lc-confetti"></i><i class="nc-bgshine"></i>' : ''}${src ? `<img class="lc-art" src="${src}" alt="" loading="lazy">` : ''}<img class="lc-frame" src="img/cheer_frame_p.webp" alt="">
    <span class="lc-skill" title="${SKILL_NAME[card.skill] || ''}">${SKILL_ICON[card.skill] || ''}</span>
    <span class="lc-stars">${'<i>★</i>'.repeat(lv)}</span>
    <div class="lc-name"><b>${esc(card.name)}</b></div></div></div>`;
}

// opt: { plus, animate }；沿用舊名稱 cardSVG，回傳的是 HTML
export function cardSVG(card, opt = {}) {
  if (card.kind === 'cheer') return cheerCard(card, opt.plus);
  const t = TIER_CLASS[card.tier] || 'bronze';
  const plus = opt.plus || 0, live = !!opt.animate && (!ECO || !!opt.fx) && plus >= 5;   // +5 起背景才會動
  const bg = bgFor(card), dyn = plus >= 5 ? ' bgdyn' : '';
  const stage = plus >= 10 ? ' e10 fx10' : '';   // +5～+9 不再換外框，改由背景動態表現
  const season = card.kind === 'coach' ? '教練' : card.kind === 'cheer' ? '應援' : card.tier === '黑' ? '傳奇' : card.tier === '綠' ? `本週${card.lv || ''}` : String(card.season).slice(2);
  const fx = live ? particles(t, rng(card.key || card.name)) + (plus >= 10 ? '<i class="p-pillar" style="left:8%"></i><i class="p-pillar" style="left:40%;animation-delay:-1.1s"></i><i class="p-pillar" style="left:72%;animation-delay:-2s"></i><i class="p-burst"></i>' : '') : '';
  const src = artSrc(card), isTpl = !hasArt(card) && !card.kind;
  const art = src ? `<img class="nc-art${isTpl ? ' tpl' : ''}" src="${src}" alt="" loading="lazy" decoding="async">` : placeholder(card);
  const pos = card.kind === 'coach' ? 'HC' : card.kind === 'cheer' ? '♥' : (card.pos || card.group || '').split('-')[0].slice(0, 2);
  return `<div class="ncw" role="img" aria-label="${esc(card.season)} ${esc(card.name)} ${card.tier}卡${plus ? ' +' + plus : ''}"><div class="nc t-${t}${stage}${live ? '' : ' still'}${bg ? ' hasbg' : ''}${dyn}">
  <div class="nc-ring"></div><div class="nc-frame"></div><div class="nc-trim"></div>
  <div class="nc-win"><div class="nc-bg"></div>${bg ? `<div class="nc-bgimg" data-bgk="${bg.key}" style="background-image:url(${bg.url})"></div><i class="nc-bgshine"></i>` : ''}<div class="nc-rays"></div><div class="nc-rays r2"></div><div class="nc-stands"></div><div class="nc-floor"></div>
  <div class="nc-fx">${fx}</div><div class="nc-aura"></div><div class="nc-holo"></div>${art}<div class="nc-glare"></div></div>
  ${card.kind ? '' : (() => { const up = .65 * (ENH_TOTAL[plus] || 0), v = card.ovr + up, cls = plus >= 10 ? ' en10' : plus >= 5 ? ' en5' : plus >= 1 ? ' en1' : '';   // 顯示強化後總評（數字顏色代表強化程度）；等級與薪資仍依基礎總評
    return `<div class="nc-ovr${cls}"><b${v >= 99.5 ? ' style="font-size:1.5em"' : ''}>${Math.round(v)}</b></div>`; })()}${plus ? `<div class="nc-plus"><b>+${plus}</b></div>` : ''}<div class="nc-pos"><b>${esc(pos)}</b></div>
  <div class="nc-name"><b>${season}</b><span${shortName(card.name).length > 12 ? ' class="long"' : ''}>${esc(shortName(card.name))}</span></div>
  ${plus >= 10 ? `<img class="nc-fimg" src="img/frames/f10_${t}.webp" alt="">` : ''}
</div></div>`;
}

export const tierColor = (tier) => COLOR[tier] || COLOR['銅'];
export { ENH_TOTAL };

// 卡背（A 款：冠軍金）。tint 用在紅／紫／黑卡入場時的外圈光
const EMBLEM = '<svg class="cba-emblem" viewBox="0 0 100 100"><path d="M50 6 L58 20 L74 16 L70 32 L86 38 L74 50 L86 62 L70 68 L74 84 L58 80 L50 94 L42 80 L26 84 L30 68 L14 62 L26 50 L14 38 L30 32 L26 16 L42 20 Z" fill="#E8B321" stroke="#17120F" stroke-width="2"/><path d="M50 14 L56 24 L68 21 L65 33 L77 38 L68 47" fill="none" stroke="#FFF1A8" stroke-width="2" opacity=".8"/><circle cx="50" cy="50" r="24" fill="#E8742C" stroke="#17120F" stroke-width="2.5"/><path d="M26 50 Q50 56 74 50 M50 26 C38 36 38 64 50 74 M50 26 C62 36 62 64 50 74" fill="none" stroke="#17120F" stroke-width="2"/></svg>';
// 卡背圖（使用者設計）：一般／特殊／教練／啦啦隊
export function cardBackImg(kind, extra = '') {
  const k = { special: 'special', coach: 'coach', cheer: 'cheer' }[kind] || 'normal';
  return `<div class="ibk k-${k} ${extra}"><img src="img/backs/${k}.webp" alt=""><span>MY NBA GAME</span><i class="ibk-glare"></i></div>`;
}
export function cardBack(extra = '') {
  return `<div class="cbw"><div class="cba ${extra}"><div class="cba-fr"></div><div class="cba-fr2"></div><i class="cba-c c1"></i><i class="cba-c c2"></i><i class="cba-c c3"></i><i class="cba-c c4"></i>${EMBLEM}<div class="cba-word">MY NBA GAME</div><div class="cba-glare"></div></div></div>`;
}

// 原創球隊徽章（不使用官方隊徽）：球隊主色底、副色外圈、縮寫
export function teamEmblem(team) {
  const [c1, c2] = TEAM[team] || ['#333333', '#FFFFFF'];
  return `<div class="tmw"><div class="tmb" style="--c1:${c1};--c2:${c2}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#000" stroke-width="5"/><path d="M4 50 Q50 60 96 50 M50 4 C30 25 30 75 50 96 M50 4 C70 25 70 75 50 96" fill="none" stroke="#000" stroke-width="5"/></svg><b>${esc(team || '')}</b></div></div>`;
}
