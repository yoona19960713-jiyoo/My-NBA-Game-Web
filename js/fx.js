// 動畫特效：得分過場、強化結果、稀有卡登場
import { cardSVG, artSrc, cardBack, cardBackImg, teamEmblem } from './card.js';
import { shortName } from './rules.js';

const TIER_FX = { '銅': '#FFC27A', '銀': '#D8F0FF', '金': '#FFE07A', '紅': '#FF6A4A', '紫': '#C89BFF', '黑': '#FFD84A', '綠': '#9AF0B8' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function overlay(cls, html, ms) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = `fx-ov ${cls}`;
    el.innerHTML = html;
    document.body.appendChild(el);
    let done = false;
    const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 260); };
    el.addEventListener('click', close);
    setTimeout(close, ms);
  });
}

// 得分過場：出手球員從側邊衝入、速度線、大字、得分說明。點畫面可跳過
export function cutin({ card, plus = 0, big, line, score }) {
  const color = TIER_FX[card?.tier] || '#FFE07A';
  const src = card ? artSrc(card) : null;
  const html = `<div class="ci-bg" style="--c:${color}"></div><div class="ci-lines"></div><div class="ci-flash"></div>
    ${src ? `<img class="ci-art" src="${src}" alt="">` : ''}
    <div class="ci-card">${card ? cardSVG(card, { plus, animate: true, fx: true }) : ''}</div>
    <div class="ci-text" style="--c:${color}">${esc(big)}</div>
    <div class="ci-line">${esc(line)}</div>${score ? `<div class="ci-score">${esc(score)}</div>` : ''}
    <div class="ci-skip">點畫面跳過</div>`;
  return overlay('cutin', html, 5200);
}

// 強化結果：卡片像心跳一樣閃爍約 3 秒（越跳越快），再揭曉結果。點畫面可直接看結果，結果出來後再點一下關閉
export function enhanceFx(card, fromPlus, toPlus, ok) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fx-ov enh';
    el.innerHTML = `<div class="en-glow"></div><div class="en-card beat">${cardSVG(card, { plus: fromPlus, animate: true, fx: true })}</div>
      <div class="en-text wait">強化中…</div><div class="ci-skip">點畫面直接看結果</div>`;
    document.body.appendChild(el);
    let stage = 0;
    const reveal = () => {
      if (stage) return; stage = 1;
      el.classList.add(ok ? 'ok' : 'fail');
      const box = el.querySelector('.en-card');
      box.className = `en-card ${ok ? 'ok' : 'fail'}`;
      box.innerHTML = cardSVG(card, { plus: toPlus, animate: true, fx: true });
      if (ok) el.insertAdjacentHTML('afterbegin', '<i class="en-rays"></i><i class="en-ring"></i><i class="en-ring" style="animation-delay:.25s"></i><div class="en-burst"></div>');
      const t = el.querySelector('.en-text');
      t.className = `en-text ${ok ? 'ok' : 'fail'}`;
      t.textContent = ok ? `強化成功！ +${toPlus}` : '強化失敗…';
      el.querySelector('.ci-skip').textContent = '點畫面繼續';
      setTimeout(close, ok ? 2600 : 2000);
    };
    const close = () => { if (stage === 2) return; stage = 2; el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 260); };
    el.addEventListener('click', () => (stage === 0 ? reveal() : close()));
    setTimeout(reveal, 3000);
  });
}

// 紫卡、黑卡、紅卡開出時的登場演出
export function showcase(card, isNew) {
  const title = card.tier === '黑' ? '傳奇降臨！' : card.tier === '紫' ? '紫卡登場！' : '紅卡！';
  const html = `<div class="sc-bg t-${card.tier}"></div><i class="sc-rays"></i>${card.tier === '黑' ? '<i class="sc-bolt"></i>' : ''}
    <div class="sc-card">${cardSVG(card, { animate: true, fx: true })}</div>
    <div class="sc-title">${title}</div><div class="sc-name">${esc(card.tier === '黑' ? '' : card.season)} ${esc(shortName(card.name))}${isNew ? ' · NEW' : ''}</div><div class="ci-skip">點畫面繼續</div>`;
  return overlay(`showcase s-${card.tier}`, html, card.tier === '紅' ? 1600 : 2400);
}

export function shake(ms = 450) {
  document.body.classList.remove('shake'); void document.body.offsetWidth;
  document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), ms);
}

export function flash(color = '#fff') {
  const el = document.createElement('div'); el.className = 'fx-flash'; el.style.background = color;
  document.body.appendChild(el); setTimeout(() => el.remove(), 500);
}

// 紅／紫／黑卡的入場：卡片飛入翻正 → 人物從卡框衝出、以有厚度的立牌在空中旋轉（背面是球隊徽章）→ 衝回卡片爆光
const ENT = { red: { dur: 3400, hit: .78 }, purple: { dur: 4400, hit: .61 }, black: { dur: 5000, hit: .82 } };
export function entrance(card, isNew, packKind = 'special', opts = {}) {
  const t = card.tier === '黑' ? 'black' : card.tier === '紫' ? 'purple' : 'red';
  const { dur, hit } = ENT[t], hitS = dur * hit / 1000;
  const title = { red: '紅卡！', purple: '紫卡登場！', black: '傳奇降臨！' }[t];
  const src = artSrc(card);
  let fxh = '';
  if (t === 'red') for (let i = 0; i < 26; i++) fxh += `<i class="e-ember" style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(Math.random() * 1.6).toFixed(2)}s;--s:${(0.6 + Math.random()).toFixed(2)}"></i>`;
  if (t === 'purple') for (let i = 0; i < 40; i++) fxh += `<i class="e-streak" style="--a:${(i * 9 + Math.random() * 9).toFixed(0)}deg;--d:${(Math.random() * 1.2).toFixed(2)}s"></i>`;
  if (t === 'black') fxh += '<i class="e-bolt b1"></i><i class="e-bolt b2"></i><i class="e-bolt b3"></i><i class="e-crack"></i>' + Array.from({ length: 18 }, () => `<i class="e-ember gold" style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(1.4 + Math.random() * 1.6).toFixed(2)}s;--s:${(0.6 + Math.random()).toFixed(2)}"></i>`).join('');
  const sparks = Array.from({ length: 18 }, () => `<i style="--dx:${(Math.random() * 60 - 30).toFixed(0)}vh;--dy:${(Math.random() * 50 - 35).toFixed(0)}vh;animation-delay:${(Math.random() * .3).toFixed(2)}s"></i>`).join('');
  const edges = src ? Array.from({ length: 10 }, (_, k) => `<img class="pe-edge" src="${src}" style="transform:translateZ(-${((k + 1) * .14).toFixed(2)}em)" alt="">`).join('') : '';
  const html = `<div class="e-bg e-${t}"></div><div class="e-fx">${fxh}</div>
    <div class="pe-rig r-${t}" style="--dur:${dur}ms">
      <div class="pe-face">${cardSVG(card, { animate: true, fx: true }).replace('class="nc ', 'class="nc art-hide ')}</div>
      <div class="pe-face pe-back">${cardBackImg(packKind, 'tint-' + t)}</div>
      ${src ? `<div class="pe-stand s-${t}">${edges}<div class="pe-rear2 rr-${t}" style="-webkit-mask-image:url(${src});mask-image:url(${src})"><i></i></div><img class="pe-front" src="${src}" alt=""><div class="pe-sparks">${sparks}</div></div>` : ''}
    </div>
    <div class="e-shock e-${t}" style="animation-delay:${hitS}s"></div><div class="pe-hitflash" style="animation-delay:${hitS}s"></div>
    <div class="sc-title e-title" style="animation-delay:${hitS + .1}s">${title}</div>
    <div class="sc-name e-title" style="animation-delay:${hitS + .3}s">${esc(card.tier === '黑' ? '' : card.season)} ${esc(shortName(card.name))}${isNew ? ' · NEW' : ''}</div>
    <div class="ci-skip">點畫面繼續</div>`;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = `fx-ov entrance s-${t}${opts.skipIntro ? ' skip-intro' : ''}${opts.fused ? ' fused' : ''}`;
    el.innerHTML = html;
    document.body.appendChild(el);
    // 接在新的揭曉動畫之後：跳過「卡片飛入、翻正」，直接從人物破框開始
    const START = { red: .24, purple: .13, black: .34 }[t], skip = opts.skipIntro ? dur * START : 0;
    if (skip && el.getAnimations) el.getAnimations({ subtree: true }).forEach(a => { try { a.currentTime = (a.currentTime || 0) + skip; } catch (e) { /* 略過 */ } });
    if (t === 'black' && !skip) { setTimeout(() => shake(500), dur * .26); }
    setTimeout(() => shake(t === 'black' ? 700 : 450), dur * hit - skip);
    let closed = false;
    const close = () => { if (closed) return; closed = true; el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 260); };
    const ready = Date.now() + dur * hit + 300 - skip;
    el.addEventListener('click', () => { if (Date.now() >= ready) close(); });
    setTimeout(close, dur + 2000 - skip);
  });
}
