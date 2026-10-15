import { loadDB, loadSave, writeSave, clearSave, newUid } from './data.js';
import { cardSVG, setArt, setArtUrl, cardBack, cardBackImg, setEco, teamEmblem, artSrc, TEAM_COLORS } from './card.js';
import { cutin, enhanceFx, entrance, shake, flash as fxFlash } from './fx.js';
import { reveal } from './reveal.js';
import { intro, outro } from './cine.js';
import * as cloud from './cloud.js';
import * as net from './net.js';
import { CLUTCH, CLUTCH_CH, CLUTCH_STAR, clutchStars } from './clutch.js';
import { DAILY_POOL, WEEKLY_POOL, DAILY_N, WEEKLY_N, ATTEND_DAYS, pickQuests, questDef, weekKey } from './quests.js';
import { runGuide, guideOn, guideStop } from './guide.js';
import { PRICE, DECOMPOSE, EXCHANGE, CAP, ECON, decompPts, STAFF_PRICE, openStaff, openNormal, openSpecial, purplePrice, tryEnhance } from './economy.js';
import { STYLES, SKILLS, AB_ZH, COACH_MAX, CHEER_MAX, staffEffects, coachValue, cheerValue, STAFF_NEED, staffUpCost } from './staff.js';
import { Game } from './sim.js';
import { CHAMPIONS, INF_RUNS, INF_SWAPS, INF_WIN, HIST_DAILY, HIST_REPEAT, INF_MILESTONES, teamSeasons, sideFor, infOpponent, SEASON_DIFF, LEGEND_STARS, STAR_BOOST, TOWER_BACK, TOWER_LOSSES, floorReward, legendTeams, LEGEND_DAILY, LEGEND_REPEAT, infState, histState, histReward, applyFatigue, legendSide } from './modes.js';
import { TRAITS, UNLOCK, unlockedTraits } from './traits.js';
import { setBackupKey, cloudReady, lastBackup, upload, maybeBackup, history, fetchVersion, exportSave, readImport } from './backup.js';
import { CONF, TEAM_ZH, TEAMS, confOf, buildSchedule, realRoster, buildSide, standings, userGames, simulateOthers,
  STAGE_ZH, postInit, userSeries, nextPostGame, addPostResult, postAdvance } from './season.js';
import {
  ABIL, SLOTS, SLOT_GROUP, who, ENH_TOTAL, ENH_NEED, ENH_RATE, LIMITS, penalty, shortName, bonds, effective,
  teamPower, limitCheck, starterCards, purpleChoices, autoLineup,
  salaryOf, fmtSal, capOf, xpNeed, XP, MGR_MAX, coachBond, extraBonus, isRival, RIVALS, enhCost, enhNeed, isEnhMat, lineupSalary,
} from './rules.js';

const app = document.getElementById('app');
const S = { db: null, save: null, screen: 'lineup', detail: null, from: 'collection', pick: null, sel: null, onboardPick: null,
  filter: { tier: '全部', pos: '全部', q: '', sort: 'ovr' }, toast: '',
  shop: { tab: 'packs', mode: 'season', season: null, team: 'DEN', q: '', tier: '金' }, pack: null, batch: null, confirm: null };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');
// ===== 開發者功能（測試模式、重置遊戲）：只有輸入開發者密碼的裝置才看得到 =====
// 密碼不在程式裡：打包時由 GitHub Secret「DEV_PASSWORD」算出雜湊值寫進 config.js，裝置上只比對雜湊
const DEV_KEY = 'mynba.dev';
const devHash = () => (window.GAME_CONFIG || {}).devHash || '';
const devOn = () => !!devHash() && localStorage.getItem(DEV_KEY) === devHash();
let TEST_FEATURES = false;   // 由 devOn() 在啟動與解鎖時更新
async function sha256(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const TEST_KEY = 'mynba.testmode';
const testOn = () => devOn() && localStorage.getItem(TEST_KEY) === '1';
function applyTest() {
  if (!S.save) return;
  if (testOn()) { S.save.coins = 9999999; S.save.points = 999999;
    // 經理等級直接拉滿（最高薪資上限）；原本的等級先存起來，關掉測試模式時還原
    if (!S.save.mgrReal) S.save.mgrReal = { ...(S.save.mgr || { lv: 1, xp: 0 }) };
    S.save.mgr = { lv: MGR_MAX, xp: 0 };
  } else if (S.save.mgrReal) { S.save.mgr = S.save.mgrReal; delete S.save.mgrReal; }
}
const save = () => { applyTest(); if (S.save) { ensureTeams(); S.save.savedAt = Date.now(); } writeSave(S.save); maybeBackup(S.save); cloud.pushSoon(S.save); schedProfile(); };
let profT = 0, profTimer = 0;
function profileOf() {
  const L = S.save.teams && S.save.teams[0] ? S.save.teams[0] : S.save.lineup, ti = S.save.ti;
  S.save.lineup = L; const D = lineupData(); if (S.save.teams) S.save.lineup = S.save.teams[ti];
  return { nick: S.save.nick || '', mgr: (S.save.mgr || {}).lv || 1, power: Math.round(D.power.total * 10) / 10, cards: S.save.cards.length, test: !!S.save.testAccount,
    starters: D.starters.map(x => (x ? { k: x.c.key, n: x.c.name, s: x.c.season, t: x.c.tier, o: x.c.ovr, p: x.o.plus || 0 } : null)) };
}
function schedProfile(now) {
  if (!cloud.cloudOn() || !cloud.myCode() || !S.save || !S.db) return;
  clearTimeout(profTimer);
  const go = () => { profT = Date.now(); try { cloud.pushProfile(profileOf()).catch(() => {}); } catch (e) { /* 陣容未完成 */ } };
  if (now || Date.now() - profT > 60000) go(); else profTimer = setTimeout(go, 60000 - (Date.now() - profT));
}
// 會影響隨機結果的操作（開卡包、強化）：必須連得上雲端才能進行，結果立刻上傳，避免離線重刷
async function onlineGuard(what) { if (!cloud.cloudOn() || !cloud.myCode()) return true; const ok = await cloud.pushNow(S.save); if (!ok) flash(`需要網路連線才能${what}`); return ok; }
const cardOf = (uid) => { const o = S.save.cards.find(x => x.uid === uid); return o ? { o, c: S.db.cards[o.key] } : null; };

// ---------- 共用元件 ----------
function topbar(title, sub = '') {
  const sec = sectionOf(S.screen); if (sec && sec.subs) title = sec.t;
  const back = S.screen === 'lineup' ? '' : `<button class="back" data-act="back">◀ 返回</button>`;
  return `<header class="topbar">${back}<h1>${title}</h1>${subtabs()}${testOn() ? '<span class="testbadge">測試模式</span>' : ''}<span class="grow"></span><span class="sub">${sub}</span>
    <span class="res"><i class="coin"></i>${fmt(S.save.coins)}</span><span class="res"><i class="gem"></i>${fmt(S.save.points || 0)}</span>
    ${S.screen === 'settings' ? '' : '<button class="gear" data-act="go" data-to="settings" aria-label="設定">⚙</button>'}</header>`;
}
// 左側 5 個主分頁，部分分頁在標題列有子分頁
const SECTIONS = [
  { k: 'lineup', t: '陣容', subs: [['lineup', '球員陣容'], ['staff', '教練團']] },
  { k: 'season', t: '比賽', subs: [['season', '賽季'], ['challenge', '挑戰'], ['clutch', '關鍵時刻']] },
  { k: 'collection', t: '卡片', subs: [['collection', '卡冊'], ['enhance', '球員強化'], ['enhcoach', '教練強化'], ['enhcheer', '啦啦隊強化']] },
  { k: 'shop', t: '商店', subs: [['shop', '卡包'], ['exchange', '兌換']] },
  { k: 'quests', t: '任務' },
  { k: 'friends', t: '好友' },
];
const sectionOf = (scr) => SECTIONS.find(s => s.k === scr || (s.subs || []).some(x => x[0] === scr));
function tabs(active) {
  const cur = sectionOf(active);
  const qn = questClaimable();
  return `<nav class="tabs">${SECTIONS.filter(s => s.k !== 'friends' || cloud.cloudOn()).map(s => `<button class="${s === cur ? 'on' : ''}" data-act="go" data-to="${s.k}">${s.t}${s.k === 'quests' && qn ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>`;
}
function subtabs() {
  const sec = sectionOf(S.screen);
  if (!sec || !sec.subs) return '';
  return `<div class="subtabs">${sec.subs.map(([k, t]) => `<button class="${k === S.screen ? 'on' : ''}" data-act="go" data-to="${k}">${t}</button>`).join('')}</div>`;
}
// 提示訊息：獨立的元素，不會為了顯示或消失而重畫整個畫面（避免卡片閃爍）
function toast() { return ''; }
function flash(msg) {
  render();
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.remove('hide');
  clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.add('hide'), 2200);
}


// ---------- 三支隊伍、經理等級 ----------
const TEAM_N = 3;
const emptyTeam = () => ({ starters: [null, null, null, null, null], bench: Array(7).fill(null), head: null, asst: null });
const teamUids = (t) => [...t.starters, ...t.bench].filter(Boolean);
// 存檔整理：舊存檔只有一支隊伍時建立三支隊伍；舊程式直接換掉 lineup 物件時同步回 teams
function ensureTeams() {
  const sv = S.save; if (!sv) return;
  if (!Array.isArray(sv.teams)) {
    const t0 = sv.lineup || emptyTeam(), st = sv.staff || {};
    t0.head = st.head || null; t0.asst = st.asst || null;
    sv.teams = [t0, emptyTeam(), emptyTeam()]; sv.ti = 0;
  }
  sv.ti = Math.max(0, Math.min(TEAM_N - 1, sv.ti || 0));
  if (sv.lineup && sv.lineup !== sv.teams[sv.ti]) {
    const old = sv.teams[sv.ti];
    if (sv.lineup.head === undefined) sv.lineup.head = old.head ?? null;
    if (sv.lineup.asst === undefined) sv.lineup.asst = old.asst ?? null;
    sv.teams[sv.ti] = sv.lineup;
  }
  sv.lineup = sv.teams[sv.ti];
  sv.teams.forEach(t => { if (t.head === undefined) t.head = null; if (t.asst === undefined) t.asst = null; });
  if (!sv.mgr) {   // 舊存檔：依目前陣容薪資給起始經理等級，原本的陣容不會因為上限而無法使用
    let sal = 0; for (const t of sv.teams) sal = Math.max(sal, lineupSalary(teamUids(t).map(u => { const o = sv.cards.find(x => x.uid === u); return o && S.db.cards[o.key]; })));
    let lv = 1; while (lv < MGR_MAX && capOf(lv) < sal) lv++;
    sv.mgr = { lv, xp: 0, date: '', n: 0 };
  }
}
const capNow = () => capOf(S.save.mgr ? S.save.mgr.lv : 1);
function switchTeam(i) { S.save.ti = i; S.save.lineup = S.save.teams[i]; S.lsel = null; S.sel = null; S.pick = null; refreshFx(); save(); render(); }
const otherTeamUids = () => new Set(S.save.teams.filter((t, i) => i !== S.save.ti).flatMap(teamUids));
const teamOfUid = (uid) => S.save.teams.findIndex(t => teamUids(t).includes(uid));
// 卡片受保護（任何一隊的陣容中）：不會被當成強化素材或分解
const inLineupSet = () => new Set(S.save.teams ? S.save.teams.flatMap(teamUids) : teamUids(S.save.lineup));
// 目前隊伍的總教練羈絆
function teamCoach(t = S.save.lineup) { const o = t && t.head && S.save.cards.find(x => x.uid === t.head); const c = o && S.db.cards[o.key]; return c ? coachBond(c, o.plus) : null; }
// 經理經驗：每天前 5 場另有加成；回傳是否升級
function gainXp(won, f = 1, base = XP) {
  const M = S.save.mgr; if (!M) return;
  if (M.date !== today()) { M.date = today(); M.n = 0; }
  let x = (won ? base.win : base.loss) * f;
  if (base === XP) { if (M.n < XP.bonusGames) x += XP.bonus; M.n++; }
  x *= 1 + (FX().exp || 0);   // 經驗應援
  M.xp += Math.round(x); let up = 0;
  while (M.lv < MGR_MAX && M.xp >= xpNeed(M.lv)) { M.xp -= xpNeed(M.lv); M.lv++; up++; }
  if (up) setTimeout(() => flash(`經理等級提升到 Lv.${M.lv}！薪資上限 ${fmtSal(capOf(M.lv))}`), 700);
}
// 每天鎖定隊伍（無限、歷史、傳奇）：第一場比賽時記下隊伍與名單，當天最多換進 3 位新球員
const LOCK_NAME = { inf: '無限模式', hist: '歷史挑戰', leg: '傳奇挑戰' }, LOCK_SWAPS = 3;
function modeLock(key) { const L = S.save.locks || {}; return L[key] && L[key].date === today() ? L[key] : null; }
function lockOn(key) { const L = S.save.locks = S.save.locks || {}; if (!modeLock(key)) L[key] = { date: today(), ti: S.save.ti, base: teamUids(S.save.lineup) }; }
const lockAdded = (key) => { const lk = modeLock(key); return lk ? teamUids(S.save.lineup).filter(u => !lk.base.includes(u)).length : 0; };
function lockError(key) {
  const lk = modeLock(key); if (!lk || testOn()) return null;
  if (lk.ti !== S.save.ti) return `今天的${LOCK_NAME[key]}已鎖定隊伍 ${lk.ti + 1}，請切換回隊伍 ${lk.ti + 1}`;
  const added = lockAdded(key);
  return added > LOCK_SWAPS ? `今天的${LOCK_NAME[key]}最多換進 ${LOCK_SWAPS} 位新球員（目前 ${added} 位），請把陣容改回來` : null;
}
const lockLine = (key) => { const lk = modeLock(key); return lk ? `今天鎖定隊伍 ${lk.ti + 1} · 已換進 ${lockAdded(key)} / ${LOCK_SWAPS} 位新球員` : `今天第一場比賽時鎖定出戰隊伍（目前隊伍 ${S.save.ti + 1}），之後最多換進 ${LOCK_SWAPS} 位新球員`; };
const purpleThreshold = () => Math.min(...(S.db.byTier['紫'] || [{ ovr: 84 }]).map(c => c.ovr));
function addCards(keys, sp = false) {   // sp：特殊卡包開出的卡（可當同球員任何賽季的強化素材）
  const owned = new Set(S.save.cards.map(o => o.key));
  const added = keys.map(key => (sp ? { uid: newUid(), key, plus: 0, sp: 1 } : { uid: newUid(), key, plus: 0 }));
  S.save.cards.push(...added);
  const out = added.map(o => ({ key: o.key, isNew: !owned.has(o.key) }));
  questEvent('newCard', new Set(out.filter(x => x.isNew).map(x => x.key)).size);
  return out;
}
function spend(cost, count) {
  if (S.save.coins < cost) { flash('遊戲幣不足'); return false; }
  if (S.save.cards.length + count > capMax()) { flash(`卡冊已達上限 ${capMax()} 張，請先分解`); return false; }
  S.save.coins -= cost; return true;
}

// ---------- 陣容 ----------
function lineupData() {
  const L = S.save.lineup;
  const starters = L.starters.map((uid, i) => uid && cardOf(uid) ? { ...cardOf(uid), slot: SLOTS[i] } : null);
  const bench = L.bench.map(uid => uid && cardOf(uid) ? { ...cardOf(uid), slot: null } : null);
  const all = [...starters, ...bench].filter(Boolean);
  const b = bonds([...starters, ...bench].map(x => (x ? x.c : null)));
  const coach = teamCoach(L), coachN = all.filter(x => coach && coach.teams.includes(x.c.team)).length;
  const eff = (x) => effective(x.c, x.o.plus, (b.bonus.get(x.c.key) || 0) + extraBonus(x.c, coach, null), x.slot);
  const salary = lineupSalary(all.map(x => x.c));
  const power = teamPower(starters.filter(Boolean).map(x => eff(x).pw), bench.filter(Boolean).map(x => eff(x).pw));
  return { starters, bench, all, b, eff, power, coach, coachN, salary, cap: capNow(), limits: limitCheck(all.map(x => x.c)) };
}

function slotCard(x, size, eff, extra = '') {
  if (!x) return `<div class="empty-slot" style="--w:${size}rem">＋</div>`;
  const e = eff(x);
  const warn = e.factor < 1 ? `<span class="warn">錯置 ×${e.factor}</span>` : '';
  return `<div class="slot-card" style="--w:${size}rem">${cardSVG(x.c, { plus: x.o.plus, animate: size > 7 })}${warn}${extra}</div>`;
}

// 陣容中點選的球員：顯示實際上場數值（含強化、羈絆、錯置）
function lineupInfo(D) {
  if (!S.lsel) return '';
  const { kind, i } = S.lsel, uid = S.save.lineup[kind][i]; if (!uid) { S.lsel = null; return ''; }
  const x = (kind === 'starters' ? D.starters : D.bench)[i]; if (!x) return '';
  const e = D.eff(x), c = x.c, bond = D.b.bonus.get(c.key) || 0;
  const rows = ABIL.map(k => `<div class="li-ab"><span>${k}</span><b>${e.abil[k]}</b><i style="width:${Math.max(4, Math.min(100, (e.abil[k] - 40) / 80 * 100))}%"></i></div>`).join('');
  const tr = (c.traits || []).length ? `<div class="li-tr">${c.traits.map((t, k) => { const on = unlockedTraits(c, x.o.plus).includes(t); return `<span class="${on ? 'on' : ''}">${on ? TRAITS[t].icon : '🔒'} ${TRAITS[t].name}</span>`; }).join('')}</div>` : '';
  return `<div class="li-head"><b>${esc(c.name)}</b><small>${c.tier === '黑' ? '傳奇' : c.season} · ${c.team} · ${esc(c.pos)} · ${c.tier}卡${x.o.plus ? ' +' + x.o.plus : ''}</small>
      <small>${kind === 'starters' ? `先發 ${SLOTS[i]}` : `板凳 ${i + 6}`}　上場總評 <b class="hi">${e.ovr}</b>${e.factor < 1 ? `　<span class="bad">錯置 ×${e.factor}</span>` : ''}${bond ? `　<span class="ok">羈絆 +${bond}</span>` : ''}${D.coach && D.coach.teams.includes(c.team) ? `　<span class="ok">教練 +${D.coach.v}</span>` : ''}　薪資 <b>${fmtSal(salaryOf(c))}</b></small></div>
    <div class="li-abs">${rows}</div>${tr}
    <div class="btns"><button class="btn gold" data-act="lswap">更換</button><button class="btn" data-act="lremove">移出</button></div>
    <div class="btns"><button class="btn sm" data-act="detail" data-key="${esc(c.key)}">完整資料</button><button class="btn sm" data-act="lclose">返回總覽</button></div>`;
}

function renderLineup() {
  const D = lineupData();
  const selCard = S.sel ? cardOf(S.sel) : null;
  const isSel = (k, i) => S.lsel && S.lsel.kind === k && S.lsel.i === i ? ' lsel' : '';
  const st = SLOTS.map((slot, i) => `<button class="starter${isSel('starters', i)}" data-act="slot" data-kind="starters" data-i="${i}">
      <span class="pos-tag">${slot}</span>${slotCard(D.starters[i], 7.6, D.eff)}</button>`).join('');
  const bn = D.bench.map((x, i) => `<button class="bench${isSel('bench', i)}" data-act="slot" data-kind="bench" data-i="${i}">
      <span class="num">${i + 6}</span>${slotCard(x, 5.8, D.eff)}</button>`).join('');
  const inLineup = inLineupSet();
  const strip = S.save.cards.filter(o => !inLineup.has(o.uid) && S.db.cards[o.key] && !S.db.cards[o.key].kind).map(o => ({ o, c: S.db.cards[o.key] }))
    .sort((a, b) => b.c.ovr - a.c.ovr).slice(0, 40)
    .map(x => `<button class="strip-card ${S.sel === x.o.uid ? 'sel' : ''}" data-act="select" data-uid="${x.o.uid}">${cardSVG(x.c, { plus: x.o.plus })}<span class="sal-tag">${fmtSal(salaryOf(x.c))}</span></button>`).join('');
  const bondsHtml = D.b.list.length ? D.b.list.map(b => `<div class="bond on"><div><b>${esc(b.label)}</b><small>${esc(b.who.map(c => c.name.split(' ').slice(-1)[0]).join(', '))}</small></div><em>+${b.bonus}</em></div>`).join('')
    : `<div class="bond"><div><b>尚無羈絆</b><small>同隊 3 人、同季隊友 2 人起成立</small></div><em>—</em></div>`;
  const lim = D.limits.filter(l => ['黑', '紫', '紅'].includes(l.tier) || l.n).map(l => `<span class="lim ${l.over ? 'over' : ''}" data-t="${l.tier}">${l.tier} ${l.n}/${l.max}</span>`).join('');
  const M = S.save.mgr, overCap = D.salary > D.cap + 1e-9;
  const teamTabs = `<div class="team-tabs">${S.save.teams.map((t, k) => `<button class="${k === S.save.ti ? 'on' : ''}" data-act="team" data-i="${k}">隊伍 ${k + 1}<small>${teamUids(t).length}/12</small></button>`).join('')}</div>`;
  const salBar = `<div class="sal ${overCap ? 'over' : ''}"><div class="sal-h"><span>薪資</span><b>${fmtSal(D.salary)} / ${fmtSal(D.cap)}</b></div><i style="width:${Math.min(100, D.salary / D.cap * 100)}%"></i>
      <small>經理 Lv.${M.lv}${M.lv < MGR_MAX ? ` · 經驗 ${M.xp}/${xpNeed(M.lv)}` : ' · 已達最高等級'}</small></div>`;
  const coachHtml = D.coach ? `<div class="bond ${D.coachN ? 'on' : ''}"><div><b>教練羈絆 · ${esc(D.coach.name)}</b><small>${esc(D.coach.teams.join('／'))} 的球員 ${D.coachN} 人</small></div><em>${D.coachN ? '+' + D.coach.v : '—'}</em></div>` : '';
  const hint = selCard ? `<div class="hint">已選 ${esc(shortName(selCard.c.name))}（${selCard.c.season}），點陣容中的位置放入</div>` : '';
  app.innerHTML = `${topbar('陣容編排', `隊伍 ${S.save.ti + 1}${S.save.season ? ` · ${S.save.season.year} 接管 ${S.save.season.team} ${TEAM_ZH[S.save.season.team]}` : ''}`)}
  <main class="body">${tabs('lineup')}
    <section class="panel main">
      <div class="row"><span class="vlabel">先發</span><div class="cards">${st}</div></div>
      <div class="divider"></div>
      <div class="row"><span class="vlabel">板凳</span><div class="cards">${bn}</div></div>
      ${hint}
      <div class="strip"><div class="strip-label"><b>持有</b><small>${S.save.cards.length}/3000</small></div><div class="strip-cards">${strip || '<small class="muted">所有卡片都已在陣容中</small>'}</div></div>
    </section>
    <aside class="panel side">${lineupInfo(D) || `
      ${teamTabs}${salBar}
      <div class="power"><div><small>全隊戰力</small><strong>${D.power.total.toFixed(1)}</strong></div>
        <div class="pw"><span>先發 <b>${D.power.starters.toFixed(1)}</b></span><span>板凳 <b>${D.power.bench.toFixed(1)}</b></span></div></div>
      <small class="label">羈絆</small><div class="bonds">${coachHtml}${bondsHtml}</div>
      <div class="lims">${lim}</div>
      <div class="btns"><button class="btn blue" data-act="auto">自動編排</button><button class="btn gold" data-act="go" data-to="season">開始比賽</button></div>`}
    </aside>
  </main>${S.pick ? renderPicker(D) : ''}${toast()}`;
}

// 位置選擇面板
function renderPicker(D) {
  const { kind, i } = S.pick;
  const slot = kind === 'starters' ? SLOTS[i] : null;
  const current = S.save.lineup[kind][i];
  const where = new Map();
  ['starters', 'bench'].forEach(k => S.save.lineup[k].forEach((u, j) => u && where.set(u, k === 'starters' ? SLOTS[j] : `板凳 ${j + 6}`)));
  const lineupIds = (exclude) => new Set(D.all.filter(x => x.o.uid !== current && x.o.uid !== exclude).map(x => who(x.c)));
  const others = otherTeamUids();
  const opts = S.save.cards.filter(o => !others.has(o.uid)).map(o => ({ o, c: S.db.cards[o.key] })).filter(x => x.c && !x.c.kind)
    .filter(x => x.o.uid !== current && !lineupIds(x.o.uid).has(who(x.c)))
    .map(x => ({ ...x, f: penalty(slot, x.c.group), at: where.get(x.o.uid) }))
    .sort((a, b) => (b.f - a.f) || (b.c.ovr - a.c.ovr)).slice(0, 60);
  const list = opts.map(x => `<button class="pick" data-act="place" data-uid="${x.o.uid}">${cardSVG(x.c, { plus: x.o.plus })}
      ${x.f < 1 ? `<span class="warn">×${x.f}</span>` : ''}${x.at ? `<span class="at">${x.at}</span>` : ''}<span class="sal-tag">${fmtSal(salaryOf(x.c))}</span></button>`).join('');
  return `<div class="overlay" data-act="closepick"><div class="sheet" data-stop="1">
    <div class="sheet-head"><b>${slot ? `選擇 ${slot} 先發` : `選擇板凳第 ${i + 6} 位`}</b><small class="muted">　薪資 ${fmtSal(D.salary)} / ${fmtSal(D.cap)}</small><span class="grow"></span>
      ${current ? `<button class="btn red sm" data-act="remove">移出陣容</button>` : ''}<button class="btn sm" data-act="closepick">關閉</button></div>
    <div class="pick-grid">${list || '<p class="muted">沒有可放入的卡片</p>'}</div></div></div>`;
}

function placeCard(uid) {
  const { kind, i } = S.pick || S.target;
  const L = S.save.lineup;
  const c = cardOf(uid).c;
  // 同一位球員只能一張
  const inLineupAlready = [...L.starters, ...L.bench].includes(uid);
  const others = [...L.starters, ...L.bench].filter(u => u && u !== L[kind][i] && u !== uid);
  if (others.some(u => cardOf(u) && who(cardOf(u).c) === who(c))) return flash(`${shortName(c.name)} 已經在陣容中`);
  const ot = teamOfUid(uid); if (ot >= 0 && ot !== S.save.ti) return flash(`這張卡在隊伍 ${ot + 1}，同一張卡不能同時在兩隊`);
  // 名單限制
  const lim = LIMITS[c.tier];
  if (lim && !inLineupAlready && others.filter(u => cardOf(u)?.c.tier === c.tier).length >= lim) return flash(`${c.tier}卡最多 ${lim} 張`);
  // 若這張卡原本在陣容的別的位置，兩者交換
  let from = null;
  for (const k of ['starters', 'bench']) L[k].forEach((u, j) => { if (u === uid) from = [k, j]; });
  const prev = L[kind][i];
  if (from) L[from[0]][from[1]] = prev || null;
  L[kind][i] = uid;
  S.pick = null; S.sel = null; save(); render();
}

// ---------- 卡冊 ----------
// 球隊篩選下拉選單：卡冊、球員強化、教練強化共用
function teamSelect(cur, teams, where) {
  return `<select class="team-sel" data-act="teamf" data-w="${where}"><option value="">全部球隊</option>${teams.map(t => `<option value="${t}" ${cur === t ? 'selected' : ''}>${t} ${TEAM_ZH[t] || ''}</option>`).join('')}</select>`;
}
const coachTeams = (c) => String(c.teams || c.team || '').split(/[／/、,]/).map(x => x.trim()).filter(Boolean);
function renderCollection() {
  const F = S.filter;
  const inLineup = new Set([...S.save.lineup.starters, ...S.save.lineup.bench].filter(Boolean));
  const groups = new Map();
  for (const o of S.save.cards) {
    if (S.db.cards[o.key]?.kind) continue;   // 教練、啦啦隊在教練團頁管理
    const g = groups.get(o.key) || { key: o.key, c: S.db.cards[o.key], items: [] };
    g.items.push(o); groups.set(o.key, g);
  }
  let list = [...groups.values()];
  if (F.tier !== '全部') list = list.filter(g => g.c.tier === F.tier);
  if (F.pos !== '全部') list = list.filter(g => g.c.group === SLOT_GROUP[F.pos]);
  if (F.q) list = list.filter(g => g.c.name.toLowerCase().includes(F.q.toLowerCase()));
  if (F.team) list = list.filter(g => g.c.team === F.team);
  list.forEach(g => { g.eff = g.c.ovr + .65 * ENH_TOTAL[Math.max(...g.items.map(o => o.plus || 0))]; });   // 強化後總評（取這張卡練最高的那一份）
  list.sort(F.sort === 'season' ? (a, b) => b.c.season.localeCompare(a.c.season) || b.eff - a.eff
    : F.sort === 'name' ? (a, b) => a.c.name.localeCompare(b.c.name) : (a, b) => b.eff - a.eff);
  const chip = (field, v, label = v) => `<button class="chip ${F[field] === v ? 'on' : ''}" data-act="filter" data-f="${field}" data-v="${v}">${label}</button>`;
  const cells = list.map(g => {
    const maxPlus = Math.max(...g.items.map(o => o.plus || 0));
    const used = g.items.some(o => inLineup.has(o.uid));
    return `<button class="coll-card" data-act="detail" data-key="${esc(g.key)}">${cardSVG(g.c, { plus: maxPlus })}
      ${g.items.length > 1 ? `<span class="dup">×${g.items.length}</span>` : ''}${used ? '<span class="inuse">使用中</span>' : ''}${isLocked(g.key) ? '<span class="lockb">🔒</span>' : ''}</button>`;
  }).join('');
  app.innerHTML = `${topbar('卡冊', `${S.save.cards.length} / 3000 張`)}
  <main class="body">${tabs('collection')}
    <section class="panel main">
      <div class="filters"><b>等級</b>${['全部', '銅', '銀', '金', '紅', '紫', '黑', '綠'].map(t => chip('tier', t)).join('')}
        <i class="sep"></i><b>位置</b>${['全部', 'PG', 'SG', 'SF', 'PF', 'C'].map(p => chip('pos', p)).join('')}</div>
      <div class="filters"><input class="search" placeholder="搜尋球員英文名" value="${esc(F.q)}" data-act="search">${teamSelect(F.team, [...new Set(S.save.cards.map(o => S.db.cards[o.key]).filter(c => c && !c.kind).map(c => c.team))].sort(), 'coll')}
        ${chip('sort', 'ovr', '總評 高→低')}${chip('sort', 'season', '賽季 新→舊')}${chip('sort', 'name', '名字 A→Z')}</div>
      <div class="coll-grid">${cells || '<p class="muted">沒有符合條件的卡片</p>'}</div>
      <div class="coll-foot"><small class="muted">點卡片看詳細資料、強化或分解</small><span class="grow"></span><button class="btn red sm" data-act="batch">批次分解重複卡</button></div>
    </section>
  </main>${S.batch ? renderBatch() : ''}${toast()}`;
}

// 強化素材：同一位球員、同等級的卡（任何賽季都可以）
const sameMat = (o, c) => isEnhMat(o, S.db.cards[o.key], c);
// 批次分解：保留每張卡強化最高的一張，其餘（不在陣容中、未強化）分解
const isLocked = (key) => !!(S.save.locks || {})[key];   // 鎖定的卡：不會被分解（單張、批次）或拿去兌換黑卡；仍可當自己的強化素材
function batchPlan() {
  const inL = inLineupSet();
  const byKey = new Map();
  for (const o of S.save.cards) { const c = S.db.cards[o.key]; if (!c) continue; const g = c.kind ? o.key : who(c) + '|' + c.tier; (byKey.get(g) || byKey.set(g, []).get(g)).push(o); }
  const out = [];
  for (const [, items] of byKey) {
    const c = S.db.cards[items[0].key];
    if (!c || c.kind) continue;
    if (!S.batch.tiers[c.tier]) continue;
    const keep = items.slice().sort((a, b) => (inL.has(b.uid) - inL.has(a.uid)) || ((b.plus || 0) - (a.plus || 0)))[0];
    for (const o of items) if (o !== keep && !inL.has(o.uid) && !(o.plus > 0) && !isLocked(o.key)) out.push({ o, c: S.db.cards[o.key] });
  }
  return out;
}
function renderBatch() {
  const plan = batchPlan();
  const pts = plan.reduce((a, x) => a + decompPts(x.c.tier), 0);
  const tg = (t) => `<button class="chip ${S.batch.tiers[t] ? 'on' : ''}" data-act="batchtier" data-t="${t}">${t}卡</button>`;
  return `<div class="overlay"><div class="sheet small">
    <div class="sheet-head"><b>批次分解重複卡</b></div>
    <p class="muted">每張卡保留 1 張（優先保留陣容中與強化最高的），其餘重複卡分解成點數。陣容中、已強化、🔒 鎖定的卡不會被分解；紫卡不能分解。</p>
    <div class="filters">${['銅', '銀', '金', '紅'].map(tg).join('')}</div>
    <div class="kv"><span>將分解</span><b>${plan.length} 張</b></div><div class="kv"><span>獲得分解點數</span><b>+${fmt(pts)}</b></div>
    <div class="btns"><button class="btn" data-act="batchclose">取消</button><button class="btn red" data-act="batchgo" ${plan.length ? '' : 'disabled'}>分解 ${plan.length} 張</button></div>
  </div></div>`;
}

// ---------- 商店 ----------
function renderShop(exchangePage = false) {
  const T = S.shop;
  if (exchangePage && T.tab === 'packs') T.tab = 'purple';
  if (!exchangePage) T.tab = 'packs';
  if (!T.season) T.season = S.db.seasons[S.db.seasons.length - 1];
  const teams = [...new Set(S.db.list.map(c => c.team))].sort();
  const head = exchangePage ? `<div class="shop-tabs">${[['purple', '紫卡指名購買'], ['black', '黑卡兌換'], ['exchange', '分解點數兌換']].map(([k, t]) => `<button class="chip ${T.tab === k ? 'on' : ''}" data-act="shoptab" data-t="${k}">${t}</button>`).join('')}</div>` : '';
  let body = '';
  if (T.tab === 'packs') {
    const sel = T.mode === 'season'
      ? `<select data-act="shopsel" data-f="season">${S.db.seasons.slice().reverse().map(x => `<option ${x === T.season ? 'selected' : ''}>${x}</option>`).join('')}</select>`
      : `<select data-act="shopsel" data-f="team">${teams.map(x => `<option ${x === T.team ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    const prod = (img, name, desc, ctl, kind, price, color, disabled) => `<div class="product" style="--c:${color}">
      <b class="pname">${name}</b>${img ? `<img src="img/${img}.webp" alt="${name}" class="pack-img">` : cssPack(kind)}
      <small>${desc}</small><div class="pctl">${ctl}</div>
      ${!disabled && (S.save.vouchers || {})[kind] ? `<button class="btn red sm" data-act="voucher" data-k="${kind}">使用兌換券（剩 ${S.save.vouchers[kind]} 張）</button>` : ''}
      <div class="pbtns">${disabled ? `<button class="btn" disabled>${disabled}</button>` : `<button class="btn blue" data-act="buy" data-k="${kind}" data-n="1">買 1 包<span class="pp"><i class="coin"></i>${fmt(price)}</span></button>
        <button class="btn gold" data-act="buy" data-k="${kind}" data-n="10">買 10 包<span class="pp"><i class="coin"></i>${fmt(price * 10)}</span></button>`}</div></div>`;
    body = `<div class="products">
      ${prod('pack_blue', '一般卡包', '5 張・保底銀卡以上', `<button class="chip ${T.mode === 'season' ? 'on' : ''}" data-act="shopmode" data-m="season">指定年份</button><button class="chip ${T.mode === 'team' ? 'on' : ''}" data-act="shopmode" data-m="team">指定球隊</button>${sel}`, 'normal', PRICE.normal, '#7AB8FF')}
      ${prod('pack_green', '新秀卡包', `5 張綠卡・數值每週浮動${greenReady() ? `・下次結算 ${greenNext()}` : ''}`, greenReady() && T.mode === 'team' && rookiePool(T.team).length ? `<span class="chip on">只出 ${T.team} 的新秀</span>` : '<span class="chip on">全聯盟新秀</span>', 'rookie', PRICE.rookie, '#5FE39A', greenReady() ? '' : '新賽季第一次週結算後開放')}
      ${prod('pack_gold', '特殊卡包', '5 張・最低金卡・保底紅卡・可能開出黑卡', '<span class="chip on">全聯盟</span>', 'special', PRICE.special, '#F0C850')}
      ${prod('pack_coach', '教練卡包', '3 張教練・金 70%／紅 25%／紫 5%', '', 'coach', PRICE.coach, '#E8E4D8')}
      ${prod('pack_cheer', '啦啦隊卡包', '3 張白金啦啦隊卡', '', 'cheer', PRICE.cheer, '#FF8AC4')}
    </div>`;
  } else {
    const isPurple = T.tab === 'purple', isBlack = T.tab === 'black';
    let list = isBlack ? (S.db.byTier['黑'] || []).slice() : isPurple ? (S.db.byTier['紫'] || []).slice() : S.db.list.filter(c => c.tier === T.tier);
    if (T.q) list = list.filter(c => c.name.toLowerCase().includes(T.q.toLowerCase()));
    if (T.fSeason && !isBlack) list = list.filter(c => c.season === T.fSeason);
    if (T.fTeam) list = list.filter(c => c.team === T.fTeam);
    if (T.fPos) list = list.filter(c => c.group === SLOT_GROUP[T.fPos]);
    list.sort((a, b) => b.ovr - a.ovr);
    const th = purpleThreshold();
    const ownedN = {}; S.save.cards.forEach(o => { ownedN[o.key] = (ownedN[o.key] || 0) + 1; });
    const per = 30, pages = Math.max(1, Math.ceil(list.length / per)); T.page = Math.min(T.page || 0, pages - 1);
    const rows = list.slice(T.page * per, T.page * per + per).map(c => {
      const cost = isBlack ? '紫卡 ×3' : isPurple ? `<i class="coin"></i>${fmt(purplePrice(c, th))}` : `<i class="gem"></i>${EXCHANGE[c.tier]}`;
      const btn = isBlack || isPurple ? `<button class="btn sm ${isBlack ? 'gold' : 'gold'}" data-act="detail" data-key="${esc(c.key)}">${isBlack ? '兌換' : '購買'}</button>`
        : `<button class="btn sm blue" data-act="xbuy" data-key="${esc(c.key)}" ${(S.save.points || 0) >= EXCHANGE[c.tier] ? '' : 'disabled'}>兌換</button>`;
      return `<div class="xrow"><button class="xthumb" data-act="detail" data-key="${esc(c.key)}">${cardSVG(c)}</button>
        <button class="xinfo" data-act="detail" data-key="${esc(c.key)}"><b>${esc(c.name)}</b><small>${isBlack ? '傳奇' : c.season} · ${c.team} ${TEAM_ZH[c.team] || ''} · ${esc(c.pos)}</small></button>
        <span class="xovr"><small>總評</small><b>${c.ovr}</b></span>${ownedN[c.key] ? `<span class="xown">已持有 ×${ownedN[c.key]}</span>` : '<span class="xown none"></span>'}
        <span class="xcost">${cost}</span>${btn}</div>`;
    }).join('');
    const teams = [...new Set(S.db.list.map(c => c.team))].filter(Boolean).sort();
    const sel = (f, opts, label) => `<select data-act="shopf" data-f="${f}"><option value="">${label}</option>${opts.map(o => `<option value="${o}" ${T[f] === o ? 'selected' : ''}>${o}${f === 'fTeam' ? ' ' + (TEAM_ZH[o] || '') : ''}</option>`).join('')}</select>`;
    body = `<div class="filters">${isBlack || isPurple ? '' : ['銅', '銀', '金', '紅'].map(t => `<button class="chip ${T.tier === t ? 'on' : ''}" data-act="shoptier" data-t="${t}">${t}卡 · ${EXCHANGE[t]} 點</button>`).join('')}
        ${isBlack ? '' : sel('fSeason', S.db.seasons.slice().reverse(), '全部賽季')}${sel('fTeam', teams, '全部球隊')}
        ${['PG', 'SF', 'C'].map(p => `<button class="chip ${T.fPos === p ? 'on' : ''}" data-act="shoppos" data-p="${p}">${{ PG: '後衛', SF: '前鋒', C: '中鋒' }[p]}</button>`).join('')}</div>
      <div class="filters"><input class="search" placeholder="搜尋球員英文名" value="${esc(T.q)}" data-act="shopq">
        <small class="muted">${isBlack ? '用 3 位不同球員的紫卡兌換' : isPurple ? `價格依總評而定` : `持有分解點數 ${fmt(S.save.points || 0)}`} · 共 ${list.length} 張</small></div>
      <div class="xlist">${rows || '<p class="muted">沒有符合條件的卡片</p>'}</div>
      ${pages > 1 ? `<div class="pager"><button class="chip" data-act="shoppage" data-d="-1" ${T.page ? '' : 'disabled'}>◀ 上一頁</button><span>${T.page + 1} / ${pages}</span><button class="chip" data-act="shoppage" data-d="1" ${T.page < pages - 1 ? '' : 'disabled'}>下一頁 ▶</button></div>` : ''}`;
  }
  app.innerHTML = `${topbar(exchangePage ? '兌換交易' : '商店')}<main class="body">${tabs(exchangePage ? 'exchange' : 'shop')}<section class="panel main">${head}${body}</section></main>${toast()}`;
}

// ---------- 綠卡（新秀）：每週一結算，數值依上週真實表現 ----------
const greenReady = () => !!(S.db.green && (S.db.byTier['綠'] || []).some(c => c.played));
const greenNext = () => { const n = S.db.green && S.db.green.next; return n ? `${+n.slice(5, 7)}/${+n.slice(8, 10)}` : ''; };
const rookiePool = (team) => (S.db.byTier['綠'] || []).filter(c => !team || c.team === team);
function openRookie(team) {   // 只出綠卡、不分等級機率，抽到誰就是誰；指定球隊時只出該隊新秀
  let pool = rookiePool(team); if (!pool.length) pool = rookiePool(null);
  return Array.from({ length: 5 }, () => pool[Math.floor(Math.random() * pool.length)]);
}
async function buy(kind, n, voucher) {
  if (!(await onlineGuard('開卡包'))) return;
  if (kind === 'rookie' && !greenReady()) return flash('新秀卡包在新賽季第一次週結算後開放');
  const price = PRICE[kind] * n;
  if (voucher) {
    const V = S.save.vouchers || {};
    if (!V[kind]) return flash('沒有兌換券');
    if (S.save.cards.length + 5 > capMax()) return flash(`卡冊已達上限 ${capMax()} 張，請先分解`);
    V[kind]--;
  } else if (!spend(price, (kind === 'coach' || kind === 'cheer' ? 3 : 5) * n)) return;
  questEvent('pack', n);
  const T = S.shop;
  let keys = [];
  for (let i = 0; i < n; i++) {
    const cards = kind === 'coach' || kind === 'cheer' ? openStaff(S.db, kind) : kind === 'special' ? openSpecial(S.db) : kind === 'rookie' ? openRookie(T.mode === 'team' ? T.team : null) : openNormal(S.db, T.mode === 'season' ? { season: T.season } : { team: T.team });
    keys.push(...cards.map(c => c.key));
  }
  const res = addCards(keys, kind === 'special');
  save(); cloud.pushNow(S.save);
  S.pack = { kind, n, cards: res, open: res.map(() => n > 1), phase: 'bag', label: kind === 'coach' ? '教練卡包' : kind === 'cheer' ? '啦啦隊卡包' : kind === 'special' ? '特殊卡包' : kind === 'rookie' ? '新秀卡包' : `一般卡包 · ${T.mode === 'season' ? T.season : T.team}` };
  S.screen = 'pack'; render();
}

const PACK_ORDER = ['黑', '紫', '白金', '紅', '金', '銀', '銅', '綠'];
const HINT = { '金': 'h-gold', '紅': 'h-red', '紫': 'h-purple', '黑': 'h-black' };
function packButtons(P) {
  return `${P.open.every(Boolean) ? '' : '<button class="btn blue" data-act="flipall">全部翻開</button>'}
      <button class="btn gold" data-act="buy" data-k="${P.kind}" data-n="${P.n}">再開 ${P.n} 包 · ${fmt(PRICE[P.kind] * P.n)}</button>
      <button class="btn" data-act="go" data-to="shop">回到商店</button>`;
}
function renderPack() {
  const P = S.pack;
  if (P.phase === 'bag') {
    const img = P.kind === 'special' ? 'pack_gold' : P.kind === 'rookie' ? 'pack_green' : P.kind === 'coach' ? 'pack_coach' : P.kind === 'cheer' ? 'pack_cheer' : 'pack_blue';
    const css = false;
    const best = Math.min(...P.cards.map(x => PACK_ORDER.indexOf(S.db.cards[x.key].tier)));
    const aura = best <= 1 ? 'a-epic' : best === 2 ? 'a-red' : '';
    app.innerHTML = `${topbar('開卡包', P.label)}
    <main class="body col pack-body"><button class="bag ${aura}" data-act="tear">${css ? cssPack(P.kind, true) : `<img src="img/${img}.webp" alt="卡包">`}</button>
      <span class="bag-hint">點擊卡包撕開${P.n > 1 ? `（共 ${P.n} 包）` : ''}</span></main>${toast()}`;
    return;
  }
  const items = P.cards.map((x, i) => ({ ...x, i, c: S.db.cards[x.key] }));
  if (P.n > 1) {
    items.sort((a, b) => PACK_ORDER.indexOf(a.c.tier) - PACK_ORDER.indexOf(b.c.tier));
    const summary = `<div class="pk-sum">${PACK_ORDER.map(t => { const k = items.filter(x => x.c.tier === t).length; return k ? `<span class="lim" data-t="${t}">${t} ×${k}</span>` : ''; }).join('')}</div>`;
    const cells = items.map((x, k) => `<div class="pk-card pop t-${x.c.tier}" style="--d:${(k * 0.035).toFixed(2)}s">${cardSVG(x.c)}${x.isNew ? '<span class="new">NEW</span>' : ''}</div>`).join('');
    app.innerHTML = `${topbar('開卡包', P.label)}
    <main class="body col pack-body">${summary}<div class="pk-row many">${cells}</div><div class="btns center">${packButtons(P)}</div></main>${toast()}`;
    return;
  }
  const cell = (x) => `<button class="flipc ${HINT[x.c.tier] || ''} ${P.open[x.i] ? 'flipped instant' : ''}" data-act="flip" data-i="${x.i}" style="--d:${(x.i * 0.09).toFixed(2)}s">
      <div class="flip-in"><div class="face back">${cardBackImg(P.kind)}</div>
      <div class="face front pk-card t-${x.c.tier}">${cardSVG(x.c, { animate: true, fx: true })}${x.isNew ? '<span class="new">NEW</span>' : ''}</div></div></button>`;
  app.innerHTML = `${topbar('開卡包', P.label)}
  <main class="body col pack-body"><div class="pk-row">${items.map(cell).join('')}</div><div class="btns center">${packButtons(P)}</div></main>${toast()}`;
}

async function flipOne(i) {
  const P = S.pack;
  if (!P || P.open[i]) return;
  const x = P.cards[i], c = S.db.cards[x.key];
  const el = app.querySelector(`.flipc[data-i="${i}"]`);
  if (['紅', '紫', '黑'].includes(c.tier) || c.kind === 'cheer') {   // 紅紫黑卡、教練、啦啦隊：揭曉動畫（球員再接人物破框）
    P.open[i] = true;
    if (el) el.classList.add('flipped', 'instant');
    await playReveal(c, x.isNew, P.kind);
  } else {
    P.open[i] = true;
    if (el) el.classList.add('flipped');
    await new Promise(r => setTimeout(r, 420));
    if (c.tier === '金') fxFlash('rgba(255,220,120,.35)');
  }
  const b = app.querySelector('.pack-body .btns');
  if (b) b.innerHTML = packButtons(P);
}
async function flipAll() {
  const P = S.pack;
  for (let i = 0; i < P.cards.length; i++) { if (S.pack !== P) return; if (!P.open[i]) { await flipOne(i); await new Promise(r => setTimeout(r, 160)); } }
}


function traitBlock(c, plus) {
  if (!c.traits || !c.traits.length) return '';
  const un = unlockedTraits(c, plus);
  return `<div class="traits"><small class="label">球員特質（最後 5 分鐘生效）</small>${c.traits.map((k, i) => { const t = TRAITS[k], on = un.includes(k);
    return `<div class="trait ${on ? 'on' : ''}"><span class="ti">${on ? t.icon : '🔒'}</span><b>${t.name}</b><small>${on ? t.desc : `強化到 +${UNLOCK[c.tier][i]} 開啟`}</small></div>`; }).join('')}</div>`;
}


// 用 CSS 畫的卡包（教練、啦啦隊）：不需要圖檔，也不會印上錯誤的等級文字
function cssPack(kind, big = false) {
  const t = kind === 'coach' ? { title: '教練卡包', sub: '金 · 紅 · 紫', icon: '📋' } : { title: '啦啦隊卡包', sub: '白金', icon: '📣' };
  return `<div class="csspack k-${kind}${big ? ' big' : ''}"><i class="cp-shine"></i><span class="cp-icon">${t.icon}</span><b>${t.title}</b><small>${t.sub}</small></div>`;
}

// 揭曉動畫：紅紫黑（教練沿用紅紫）、啦啦隊；球員卡接著播人物破框的後半段
async function playReveal(c, isNew, packKind) {
  const kind = c.kind === 'cheer' ? 'cheer' : c.tier === '黑' ? 'black' : c.tier === '紫' ? 'purple' : 'red';
  if ((S.save.settings || {}).revealFx === false) { if (!c.kind) await entrance(c, isNew, packKind); return; }
  if (c.kind) return reveal(c, kind, { packKind, eco: ecoOn() });
  // 球員卡：揭曉完成的瞬間，人物直接從同一張卡衝出（同一個場景、不中斷）
  const h = await reveal(c, kind, { packKind, eco: ecoOn(), keep: true });
  const ent = entrance(c, isNew, packKind, { skipIntro: true, fused: true });
  requestAnimationFrame(() => h && h.hideCard());
  await ent; h && h.close();
}

// ---------- 教練團與應援團 ----------
const STAFF_SLOTS = [['head', '總教練', 'coach'], ['asst', '助理教練', 'coach'], ['c0', '應援 1', 'cheer'], ['c1', '應援 2', 'cheer'], ['c2', '應援 3', 'cheer']];
// 總教練、助理教練屬於各支隊伍；應援團三隊共用
const staffGet = (k) => { const st = S.save.staff || {}; return k[0] === 'c' && k.length === 2 ? (st.cheer || [])[+k[1]] : (S.save.lineup || {})[k] || null; };
function staffSet(k, uid) {
  const st = S.save.staff = S.save.staff || { cheer: [null, null, null] }; st.cheer = st.cheer || [null, null, null];
  for (const [s] of STAFF_SLOTS) if (uid && staffGet(s) === uid) { if (s[0] === 'c' && s.length === 2) st.cheer[+s[1]] = null; else S.save.lineup[s] = null; }
  if (uid) S.save.teams.forEach(t => { if (t.head === uid) t.head = null; if (t.asst === uid) t.asst = null; });   // 同一位教練只能帶一隊
  if (k[0] === 'c' && k.length === 2) st.cheer[+k[1]] = uid; else S.save.lineup[k] = uid;
}
const staffUids = () => new Set([...((S.save.staff || {}).cheer || []), ...(S.save.teams || []).flatMap(t => [t.head, t.asst])].filter(Boolean));
// 自動上陣：總教練取效果最強，助理取不同風格中最強；應援團試遍所有三人組合，取綜合價值最高（考慮同團加成、同類不疊加）
const CHEER_W = { coin: [.06, 1], gift: [500, .8], luck: [.15, 1], discount: [.06, .5], enh: [.05, .8], decomp: [.2, .6], exp: [.12, 1], gauge: [.3, .8], stam: [.12, .8], toRec: [.06, .6], quick: [.1, .7], cap: [500, .3] };
function staffAuto() {
  const busy = new Set(S.save.teams.filter((t, i) => i !== S.save.ti).flatMap(t => [t.head, t.asst]).filter(Boolean));   // 其他隊伍的教練
  const best = (kind) => { const m = new Map(); for (const o of S.save.cards) { const c = S.db.cards[o.key]; if (!c || c.kind !== kind || busy.has(o.uid)) continue; const b = m.get(o.key); if (!b || (o.plus || 0) > (b.o.plus || 0)) m.set(o.key, { o, c }); } return [...m.values()]; };
  const coaches = best('coach').sort((x, y) => coachValue(y.c, y.o.plus) - coachValue(x.c, x.o.plus));
  const head = coaches[0] || null, asst = coaches.slice(1).find(x => x.c.style !== head.c.style) || coaches[1] || null;
  const cheers = best('cheer');
  const score = (set) => { const n = {}; set.forEach(x => { n[x.c.squad] = (n[x.c.squad] || 0) + 1; }); const top = {};
    for (const x of set) { const syn = [0, 0, .2, .4][n[x.c.squad]] || 0; let v = cheerValue(x.c, x.o.plus, syn); if (x.c.skill === 'quick') v -= .5; top[x.c.skill] = Math.max(top[x.c.skill] || 0, v); }
    return Object.entries(top).reduce((s, [k, v]) => s + (CHEER_W[k] ? v / CHEER_W[k][0] * CHEER_W[k][1] : 0), 0); };
  let pick = [], bestS = -1; const N = cheers.length;
  if (N <= 3) pick = cheers;
  else for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) for (let k = j + 1; k < N; k++) { const s = score([cheers[i], cheers[j], cheers[k]]); if (s > bestS) { bestS = s; pick = [cheers[i], cheers[j], cheers[k]]; } }
  S.save.lineup.head = head ? head.o.uid : null; S.save.lineup.asst = asst ? asst.o.uid : null;
  const st = S.save.staff = { ...(S.save.staff || {}), cheer: [0, 1, 2].map(i => (pick[i] ? pick[i].o.uid : null)) };
  return st;
}
function staffLevelText(c, plus) { return c.kind === 'coach' ? (plus ? `+${plus}` : '') : `Lv${(plus || 0) + 1}`; }

// ---------- 教練強化、啦啦隊強化（獨立頁面，任何持有的卡都能升級） ----------
function renderStaffEnh(kind) {
  const scr = kind === 'coach' ? 'enhcoach' : 'enhcheer', title = kind === 'coach' ? '教練強化' : '啦啦隊強化';
  const used = staffUids(), groups = new Map();
  for (const o of S.save.cards) { const c = S.db.cards[o.key]; if (!c || c.kind !== kind) continue; (groups.get(o.key) || groups.set(o.key, []).get(o.key)).push(o); }
  const max = kind === 'coach' ? COACH_MAX : CHEER_MAX - 1;
  const rows = [...groups.entries()].map(([k, os]) => { const c = S.db.cards[k], best = os.slice().sort((a, b) => (b.plus || 0) - (a.plus || 0) || used.has(b.uid) - used.has(a.uid))[0], lvl = best.plus || 0;
      const dups = os.filter(x => x.uid !== best.uid && !used.has(x.uid)).length, can = lvl < max && dups >= (STAFF_NEED[lvl] || 99);
      return { c, best, n: os.length, dups, lvl, can, inUse: os.some(o => used.has(o.uid)) }; })
    .sort((a, b) => (b.inUse - a.inUse) || ((b.c.ovr || 0) + b.lvl) - ((a.c.ovr || 0) + a.lvl) || (TIER_RANK[b.c.tier] || 0) - (TIER_RANK[a.c.tier] || 0) || (b.dups - a.dups) || a.c.name.localeCompare(b.c.name));   // 使用中 → 評分（教練依等級與強化、啦啦隊依等級）→ 卡片層級 → 素材多
  const ft = kind === 'coach' ? (S.seT || '') : '', rowsT = ft ? rows.filter(r => coachTeams(r.c).includes(ft)) : rows;   // 教練可以依執教過的球隊篩選
  S.se = S.se || {}; let selUid = S.se[scr]; if (!rowsT.some(r => r.best.uid === selUid)) selUid = S.se[scr] = rowsT[0] ? rowsT[0].best.uid : null;
  const list = rows.map(r => `<button class="coll-card ${r.best.uid === selUid ? 'sel' : ''}" data-act="sepick" data-uid="${r.best.uid}">${cardSVG(r.c, { plus: r.best.plus })}
      ${r.n > 1 ? `<span class="dup">×${r.n}</span>` : ''}${r.inUse ? '<span class="inuse">使用中</span>' : ''}${r.can ? '<span class="canup">可升級</span>' : ''}
      <span class="price">${r.lvl >= max ? 'MAX' : `${r.dups}/${STAFF_NEED[r.lvl]}`}</span></button>`).join('');
  const R = rows.find(r => r.best.uid === selUid);
  let mid = `<p class="muted">還沒有${kind === 'coach' ? '教練' : '啦啦隊'}卡，可以在商店的卡包抽到。</p>`, side = '';
  if (R) {
    const c = R.c, lvl = R.lvl, need = STAFF_NEED[lvl] || 0, cost = lvl < max ? staffUpCost(lvl + 1) : 0;
    const eff = kind === 'coach' ? STYLES[c.style] : SKILLS[c.skill];
    const val = (lv) => kind === 'coach' ? coachValue(c, lv) : cheerValue(c, lv, 0), vNow = val(lvl), vNext = lvl < max ? val(lvl + 1) : null;
    const effNow = kind === 'coach' ? (vNow != null ? eff.desc(vNow) : '') : (vNow != null ? eff.fmt(vNow) : '');
    const effNext = vNext == null ? '' : kind === 'coach' ? eff.desc(vNext) : eff.fmt(vNext);
    mid = `<div class="enh-main"><div class="enh-card">${cardSVG(c, { plus: R.best.plus, animate: true })}</div>
      <div class="enh-info"><h2>${esc(c.name)}</h2><small>${kind === 'coach' ? `${esc(c.teams)}・${esc(c.ach)}` : esc(c.squad)} · ${c.tier}卡</small>
        <div class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <div class="kv"><span>${kind === 'coach' ? '執教風格' : '技能'}</span><b>${kind === 'coach' ? `${eff.icon} ${eff.name}` : eff.name}</b></div>
        ${effNow ? `<div class="kv"><span>目前效果</span><b>${effNow}</b></div>` : ''}${effNext ? `<div class="kv"><span>下一級</span><b class="ok">${effNext}</b></div>` : ''}</div></div>`;
    side = lvl >= max ? `<b class="h">已達最高等級</b><p class="muted">${kind === 'coach' ? '教練最高 +5' : '啦啦隊最高 Lv5'}</p>`
      : `<b class="h">升級到 ${staffLevelText(c, lvl + 1) || '+' + (lvl + 1)}</b>
        <div class="kv"><span>目前等級</span><b>${staffLevelText(c, lvl) || '+0'}</b></div>
        <div class="kv"><span>可用的重複卡</span><b class="${R.dups >= need ? '' : 'bad'}">${R.dups} / ${need}</b></div>
        <div class="kv"><span>升級費用</span><b>${fmt(cost)}</b></div>
        <button class="btn gold" data-act="stup" data-uid="${R.best.uid}" ${R.can && S.save.coins >= cost ? '' : 'disabled'}>用 ${need} 張重複卡升級</button>
        <small class="muted">${kind === 'coach' ? '教練每升一級效果 +10%' : '啦啦隊每升一級技能效果提高'}。正在教練團／應援團裡使用的卡不會被當作材料。</small>`;
  }
  const fl = (S.seF = S.seF || {})[scr] || 'all';
  const shown = fl === 'can' ? rowsT.filter(r => r.can) : rowsT;
  const list2 = shown.map(r => `<button class="coll-card ${r.best.uid === selUid ? 'sel' : ''}" data-act="sepick" data-uid="${r.best.uid}">${cardSVG(r.c, { plus: r.best.plus })}
      <span class="price">${r.lvl >= max ? 'MAX' : `${r.dups}/${STAFF_NEED[r.lvl]}`}</span>${r.can ? '<span class="canup">可升級</span>' : ''}${r.inUse ? '<span class="inuse">使用中</span>' : ''}</button>`).join('');
  app.innerHTML = `${topbar(title)}
  <main class="body">${tabs(scr)}
    <section class="panel enh-list"><div class="filters">${[['can', '可升級'], ['all', '全部']].map(([k, t]) => `<button class="chip ${fl === k ? 'on' : ''}" data-act="sefilter" data-f="${k}">${t}</button>`).join('')}${kind === 'coach' ? teamSelect(ft, [...new Set(rows.flatMap(r => coachTeams(r.c)))].sort(), 'coach') : ''}</div>
      <div class="coll-grid">${list2 || `<p class="muted">${rows.length ? '沒有可升級的卡' : `還沒有${kind === 'coach' ? '教練' : '啦啦隊'}卡，可以在商店的卡包抽到。`}</p>`}</div></section>
    <section class="panel s-mid">${R ? mid : '<p class="muted">選一張卡查看</p>'}</section>
    <aside class="panel side enh-side">${side}</aside>
  </main>${toast()}`;
}

function renderStaff() {
  const F = S.stf || (S.stf = { slot: 'head' });
  const fx = FX(), used = staffUids();
  const slotKind = STAFF_SLOTS.find(s => s[0] === F.slot)[2];
  const slotCard = (k, label) => {
    const uid = staffGet(k), o = uid && S.save.cards.find(x => x.uid === uid), c = o && S.db.cards[o.key];
    return `<button class="st-slot ${F.slot === k ? 'sel' : ''} " data-act="stslot" data-s="${k}"><small>${label}</small>${c ? cardSVG(c, { plus: o.plus }) : '<div class="empty">＋</div>'}</button>`;   // 強化等級卡面右上角已經有，不再重複標示
  };
  const groups = new Map();
  for (const o of S.save.cards) { const c = S.db.cards[o.key]; if (!c || c.kind !== slotKind) continue; (groups.get(o.key) || groups.set(o.key, []).get(o.key)).push(o); }
  const rows = [...groups.entries()].map(([k, os]) => { const c = S.db.cards[k]; const best = os.slice().sort((a, b) => (b.plus || 0) - (a.plus || 0))[0];
      return { c, best, n: os.length, inUse: os.some(o => used.has(o.uid)) }; })
    .sort((a, b) => (b.c.tier === '紫') - (a.c.tier === '紫') || (b.c.tier === '紅') - (a.c.tier === '紅') || a.c.name.localeCompare(b.c.name));
  const list = rows.map(r => `<button class="coll-card" data-act="stpick" data-uid="${r.best.uid}">${cardSVG(r.c, { plus: r.best.plus })}
      ${r.n > 1 ? `<span class="dup">×${r.n}</span>` : ''}${r.inUse ? '<span class="inuse">使用中</span>' : ''}<span class="cap">${r.c.kind === 'coach' ? STYLES[r.c.style].icon + ' ' + STYLES[r.c.style].name : SKILLS[r.c.skill].name}</span></button>`).join('');
  // 右側：效果總覽＋選取卡片的升級
  const lines = [];
  if (fx.head) { const S0 = STYLES[fx.head.c.style]; lines.push(`<div class="fxl"><b>總教練 ${esc(fx.head.c.name)}</b><small>${S0.icon} ${S0.name}：${S0.desc(fx.head.v)}</small><small>全場：全隊${AB_ZH[S0.ab]} +${(Math.round(fx.abil[S0.ab] * 10) / 10)}${fx.timeouts ? '，暫停 +1' : ''}</small></div>`); }
  if (fx.asst) { const S1 = STYLES[fx.asst.c.style]; lines.push(`<div class="fxl"><b>助理教練 ${esc(fx.asst.c.name)}</b><small>${S1.icon} ${S1.name}：${S1.desc(fx.asst.v)}${fx.head && fx.head.c.style === fx.asst.c.style ? '（與總教練同風格，不疊加）' : ''}</small></div>`); }
  for (const x of fx.cheers) { const sk = SKILLS[x.c.skill]; const best = x.c.skill === 'quick' ? fx.quick : fx[x.c.skill];
    lines.push(`<div class="fxl"><b>${esc(x.c.name)} · ${sk.name}</b><small>${sk.fmt(x.v)}${x.syn ? `（同團 +${x.syn * 100}%）` : ''}${best > x.v + 1e-9 ? '・同類技能只取最高，這位沒有生效' : ''}</small></div>`); }
  const selUid = staffGet(F.slot), selO = selUid && S.save.cards.find(x => x.uid === selUid), selC = selO && S.db.cards[selO.key];
  let up = '';
  if (selC) {
    const dups = S.save.cards.filter(x => x.key === selC.key && x.uid !== selUid && !used.has(x.uid)).length;
    const max = selC.kind === 'coach' ? COACH_MAX : CHEER_MAX - 1, lvl = selO.plus || 0;
    up = `<div class="divider"></div><b class="h">${esc(selC.name)}</b><small class="muted">${selC.kind === 'coach' ? `${esc(selC.teams)}・${esc(selC.ach)}` : esc(selC.squad)}</small>
      <div class="kv"><span>目前等級</span><b>${staffLevelText(selC, lvl) || '+0'}</b></div><div class="kv"><span>可用的重複卡</span><b class="${dups >= STAFF_NEED[lvl] ? '' : 'bad'}">${dups} / ${STAFF_NEED[lvl] || '-'}</b></div>
      ${lvl < max ? `<div class="kv"><span>升級費用</span><b>${fmt(staffUpCost(lvl + 1))}</b></div>` : ''}
      <button class="btn gold" data-act="stup" ${dups >= STAFF_NEED[lvl] && lvl < max && S.save.coins >= staffUpCost(lvl + 1) ? '' : 'disabled'}>${lvl >= max ? '已達最高等級' : `用 ${STAFF_NEED[lvl]} 張重複卡升級`}</button>
      <small class="muted">${selC.kind === 'coach' ? '教練每升一級效果 +10%，最高 +5' : '啦啦隊最高 Lv5'}</small>
      <button class="btn sm" data-act="stclear">移出這個位置</button>`;
  }
  app.innerHTML = `${topbar('教練團')}
  <main class="body">${tabs('staff')}
    <section class="panel st-slots"><div class="sm-head"><small class="label">教練團</small><button class="btn sm blue" data-act="stauto">自動上陣</button></div><div class="st-row">${slotCard('head', '總教練')}${slotCard('asst', '助理教練')}</div>
      <small class="label">應援團</small><div class="st-row">${slotCard('c0', '應援 1')}${slotCard('c1', '應援 2')}${slotCard('c2', '應援 3')}</div></section>
    <section class="panel s-mid"><small class="label">${slotKind === 'coach' ? '持有的教練（點選放入選取的位置）' : '持有的啦啦隊（點選放入選取的位置）'}</small>
      <div class="coll-grid">${list || `<p class="muted">還沒有${slotKind === 'coach' ? '教練' : '啦啦隊'}卡，可以到商店開「教練・啦啦隊卡包」</p>`}</div></section>
    <aside class="panel side st-side"><b class="h">目前效果</b>${lines.join('') || '<small class="muted">尚未安排教練與啦啦隊</small>'}${up}</aside>
  </main>${toast()}`;
}

// ---------- 強化頁 ----------
// 強化頁排序用的卡片層級（高到低）
const TIER_RANK = { '黑': 7, '紫': 6, '紅': 5, '白金': 5, '金': 4, '綠': 3, '銀': 2, '銅': 1 };
function renderEnhance() {
  const F = S.enh || (S.enh = { key: null, filter: 'can', q: '' });
  const keys = [...new Set(S.save.cards.filter(o => S.db.cards[o.key] && !S.db.cards[o.key].kind).map(o => o.key))];
  let rows = keys.map(k => ({ k, c: S.db.cards[k], E: enhInfo(k) })).filter(x => x.c);
  if (F.filter === 'can') rows = rows.filter(x => x.E.can);
  if (F.filter === 'dup') rows = rows.filter(x => x.E.mats.length > 0 && x.E.plus < 10);
  if (F.q) rows = rows.filter(x => x.c.name.toLowerCase().includes(F.q.toLowerCase()));
  if (F.team) rows = rows.filter(x => x.c.team === F.team);
  const inLU = inLineupSet();
  rows.forEach(x => { x.use = S.save.cards.some(o => o.key === x.k && inLU.has(o.uid)); x.score = x.c.ovr + .65 * ENH_TOTAL[x.E.plus]; });
  rows.sort((a, b) => (b.use - a.use) || (b.score - a.score) || (TIER_RANK[b.c.tier] || 0) - (TIER_RANK[a.c.tier] || 0) || (b.E.mats.length - a.E.mats.length));   // 使用中 → 評分 → 卡片層級 → 素材多
  if (!F.key || !S.db.cards[F.key] || !S.save.cards.some(o => o.key === F.key) || ((F.team || F.q) && !rows.some(x => x.k === F.key))) F.key = rows[0] ? rows[0].k : null;   // 篩選後選到的卡不在清單裡，就改選第一張
  const list = rows.slice(0, 80).map(x => `<button class="coll-card ${F.key === x.k ? 'sel' : ''}" data-act="enhpick" data-key="${esc(x.k)}">${cardSVG(x.c, { plus: x.E.plus })}
      <span class="price">${x.E.plus >= 10 ? 'MAX' : `${x.E.mats.length}/${x.E.need}`}</span>${x.E.can ? '<span class="canup">可強化</span>' : ''}</button>`).join('');
  let mid = '<p class="muted">沒有符合條件的卡片</p>', side = '';
  if (F.key) {
    const c = S.db.cards[F.key], E = enhInfo(F.key), now = ENH_TOTAL[E.plus], nx = E.plus < 10 ? ENH_TOTAL[E.next] : now;
    const abil = ABIL.map(a => `<div class="abil"><span>${a}</span><b>${c.abil[a] + now}</b><i class="arrow">${E.plus < 10 ? '→' : ''}</i><b class="hi">${E.plus < 10 ? c.abil[a] + nx : ''}</b></div>`).join('');
    mid = `<div class="enh-main"><div class="enh-card">${cardSVG(c, { plus: E.plus, animate: true })}</div>
      <div class="enh-info"><h2>${esc(c.name)}</h2><small>${c.tier === '黑' ? '傳奇' : c.season} · ${c.team} · ${c.tier}卡</small>
        <div class="pips">${Array.from({ length: 10 }, (_, k) => `<i class="${k < E.plus ? 'on' : ''} ${k === 4 || k === 9 ? 'milestone' : ''}"></i>`).join('')}</div>
        <div class="kv"><span>總評</span><b>${(c.ovr + .65 * now).toFixed(1)}${E.plus < 10 ? ` → <span class="ok">${(c.ovr + .65 * nx).toFixed(1)}</span>` : ''}</b></div>
        <div class="abils compact">${abil}</div>${traitBlock(c, E.plus)}</div></div>`;
    const inL = inLineupSet();
    const lockedCopies = E.owned.filter(o => o !== E.target && (inL.has(o.uid) || o.plus > 0)).length;
    side = E.plus >= 10 ? '<b class="h">已強化到最高 +10</b><p class="muted">這張卡已經是極致型態。</p>' : `<b class="h">強化到 +${E.next}</b>
      <div class="kv"><span>單次加成</span><b>全能力 +${nx - now}</b></div>
      <div class="kv"><span>可用素材</span><b class="${E.matOk ? '' : 'bad'}">${E.mats.length} / ${E.need}</b></div>
      <div class="kv"><span>強化費用</span><b class="${S.save.coins >= E.cost ? '' : 'bad'}">${fmt(E.cost)}</b></div>
      <div class="kv"><span>成功率</span><b>${ENH_RATE[E.next]}%</b></div>
      ${lockedCopies ? `<small class="muted">另有 ${lockedCopies} 張在陣容中或已強化，不會被當成素材</small>` : ''}
      <button class="btn gold" data-act="enhgo" ${E.can ? '' : 'disabled'}>強化一次</button>
      <button class="btn" data-act="enhauto" data-goal="${E.plus < 5 ? 5 : 10}" ${E.can ? '' : 'disabled'}>連續強化到 +${E.plus < 5 ? 5 : 10}</button>
      <small class="muted">連續強化會一直嘗試到目標等級、素材或遊戲幣用完。失敗時等級不變，素材與費用不退還。</small>
      <small class="muted">${enhMatRule(c)}</small>
      <div class="divider"></div><b class="h">取得素材</b>
      ${c.tier === '紫' ? `<button class="btn gold sm" data-act="detail" data-key="${esc(F.key)}">紫卡指名購買</button>` : EXCHANGE[c.tier] ? `<small class="muted">分解點數兌換 1 張需要 ${EXCHANGE[c.tier]} 點，持有 ${fmt(S.save.points || 0)} 點</small><button class="btn blue sm" data-act="enhbuy">兌換 1 張同名卡</button>` : '<small class="muted">這張卡只能從卡包取得</small>'}`;
  }
  app.innerHTML = `${topbar('強化')}
  <main class="body">${tabs('enhance')}
    <section class="panel enh-list"><div class="filters">${[['can', '可強化'], ['dup', '有素材'], ['all', '全部']].map(([k, t]) => `<button class="chip ${F.filter === k ? 'on' : ''}" data-act="enhfilter" data-f="${k}">${t}</button>`).join('')}</div>
      <div class="enh-search"><input class="search" placeholder="搜尋英文名" value="${esc(F.q)}" data-act="enhq">${teamSelect(F.team, [...new Set(keys.map(k => S.db.cards[k] && S.db.cards[k].team).filter(Boolean))].sort(), 'enh')}</div><div class="coll-grid">${list || '<p class="muted">沒有符合條件的卡片</p>'}</div></section>
    <section class="panel s-mid">${mid}</section>
    <aside class="panel side enh-side">${side}</aside>
  </main>${toast()}`;
}

// ---------- 卡片詳細 ----------
function renderDetail() {
  const c = S.db.cards[S.detail];
  const owned = S.save.cards.filter(o => o.key === S.detail);
  const inL = inLineupSet();
  const target = owned.slice().sort((a, b) => (b.plus || 0) - (a.plus || 0))[0];
  const plus = target ? target.plus || 0 : 0;
  const enh = ENH_TOTAL[plus];
  const used = owned.some(o => inL.has(o.uid));
  const materials = S.save.cards.filter(o => o !== target && sameMat(o, c) && !inL.has(o.uid) && !(o.plus > 0));
  const rows = ABIL.map(a => {
    const b = c.abil[a], t = b + enh;
    return `<div class="abil"><span>${a}</span><div class="bar"><i style="width:${(b - 40) / 80 * 100}%"></i><u style="width:${enh / 80 * 100}%"></u></div><b class="${t > 100 ? 'hi' : ''}">${t}</b></div>`;
  }).join('');
  const box = c.box ? (c.tier === '綠' ? [['本週出賽', c.box.gp], ['分鐘', c.box.min || 0], ['得分', c.box.pts ?? '—'], ['籃板', c.box.reb ?? '—'], ['助攻', c.box.ast ?? '—'], ['等級水準', `${c.lv}卡`], ['下次結算', greenNext()]] : [['出賽', c.box.gp], ['得分', c.box.pts], ['籃板', c.box.reb], ['助攻', c.box.ast], ['抄截', c.box.stl], ['阻攻', c.box.blk], ['命中率', (c.box.fg * 100).toFixed(1) + '%']])
    .map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join('') : '';
  const next = plus + 1;
  const purpleCount = c.tier === '紫' ? S.db.list.filter(x => x.id === c.id && x.tier === '紫').length : 0;
  const th = purpleThreshold();
  const purpleOwned = new Set(S.save.cards.filter(o => S.db.cards[o.key]?.tier === '紫' && !S.db.cards[o.key]?.kind && !inL.has(o.uid) && !isLocked(o.key)).map(o => who(S.db.cards[o.key]))).size;
  const acquire = c.tier === '黑'
    ? `<b class="h">紫卡兌換</b><div class="kv"><span>需要 3 位不同球員的紫卡</span><b>${purpleOwned} 位可用</b></div>
       <button class="btn gold" data-act="blackx" ${purpleOwned >= 3 ? '' : 'disabled'}>用 3 張紫卡兌換</button><small class="muted">陣容中、鎖定的紫卡不能使用；強化過的紫卡可以用，但強化不會返還。</small>`
    : c.tier === '紫'
    ? `<b class="h">紫卡指名購買</b><div class="kv"><span>價格</span><b>${fmt(purplePrice(c, th))}</b></div>
       <button class="btn gold" data-act="buypurple">${owned.length ? '再買一張（強化素材）' : '購買這張紫卡'}</button>`
    : EXCHANGE[c.tier] ? `<b class="h">分解點數兌換</b><div class="kv"><span>需要 / 持有點數</span><b>${EXCHANGE[c.tier]} / ${fmt(S.save.points || 0)}</b></div>
       <button class="btn blue" data-act="exchange">${owned.length ? '再兌換一張（強化素材）' : '兌換這張卡'}</button>` : '';
  let side;
  if (!owned.length) {
    side = (acquire || '<p class="muted">這張卡無法直接取得。</p>') + `<p class="muted">你目前沒有這張卡。</p>`;
  } else {
    const can = plus < 10 && materials.length >= enhNeed(c, next);
    const decVal = decompPts(c.tier);
    const decTarget = materials[0] || (!inL.has(target.uid) && !(target.plus > 0) && owned.length === 1 ? target : null);
    const confirmDec = S.confirm === 'decompose';
    side = `<b class="h">強化</b>
      <div class="pips">${Array.from({ length: 10 }, (_, k) => `<i class="${k < plus ? 'on' : ''}"></i>`).join('')}</div>
      ${plus < 10 ? `<div class="kv"><span>下一級</span><b>+${plus} → +${next}</b></div><div class="kv"><span>單次加成</span><b>全能力 +${ENH_TOTAL[next] - enh}</b></div>
        <div class="kv"><span>可用素材</span><b class="${can ? '' : 'bad'}">${materials.length} / ${enhNeed(c, next)}</b></div>
        <div class="kv"><span>強化費用</span><b>${fmt(enhCost(c.tier, next))}</b></div>
        <div class="kv"><span>成功率</span><b>${ENH_RATE[next]}%</b></div>
        <button class="btn gold" data-act="goenh">前往強化頁</button>` : '<div class="kv"><span>已強化到最高 +10</span></div>'}
      <div class="divider"></div>
      <button class="btn ${isLocked(c.key) ? 'gold' : 'blue'} lock-btn" data-act="lock">${isLocked(c.key) ? '🔒 已鎖定（點擊解除）' : '🔓 鎖定這張卡'}</button>
      <small class="muted">鎖定後不會被分解（單張、批次）或拿去兌換黑卡，仍可用來強化自己。</small>
      ${isLocked(c.key) ? '' : decVal ? (decTarget ? `<button class="btn red" data-act="decompose">${confirmDec ? `確定分解 1 張（+${decVal} 點）` : `分解 1 張 · +${decVal} 點`}</button>`
        : '<small class="muted">陣容中或已強化的卡不能分解。</small>')
        : `<small class="muted">${c.tier === '紫' ? '紫卡無法分解，可用於兌換黑卡（3 張不同球員的紫卡換 1 張指定黑卡）。' : '這張卡無法分解。'}</small>`}
      ${acquire ? `<div class="divider"></div>${acquire}` : ''}`;
  }
  app.innerHTML = `${topbar('卡片詳細')}
  <main class="body">
    <section class="panel big-card"><div class="big">${cardSVG(c, { plus, animate: true })}</div>
      <div class="chips"><span class="chip on">${c.tier}卡</span><span class="chip">${c.tier === '黑' ? '傳奇卡' : '年度卡'}</span><span class="chip">持有 ×${owned.length}</span>${used ? '<span class="chip on blue">使用中</span>' : ''}</div></section>
    <section class="panel info">
      <div class="info-head"><div><h2>${esc(c.name)}</h2><small>${c.tier === '黑' ? '傳奇' : c.season} · ${c.team} · ${esc(c.pos)} · ${c.tier}卡${purpleCount ? `（該球員共 ${purpleCount} 張紫卡）` : ''}</small></div>
        <div class="ovrs"><div><small>薪資</small><b>${fmtSal(salaryOf(c))}</b></div><div><small>基礎總評</small><b>${c.ovr}</b></div><div><small>強化後</small><strong>${(c.ovr + 0.65 * enh).toFixed(1)}</strong></div></div></div>
      <div class="abils">${rows}</div>
      <small class="legend"><i class="lb"></i>基礎 <i class="lg"></i>強化　羈絆加成在陣容中另外計算・卡片等級與薪資依基礎總評</small>
      ${box ? `<small class="label">${c.season} 真實數據（場均）</small><div class="stats">${box}</div>` : ''}
      ${traitBlock(c, plus)}
    </section>
    <aside class="panel side enh-side">${side}</aside>
  </main>${S.blackx ? renderBlackX() : ''}${toast()}`;
}

function renderBlackX() {
  const inL = inLineupSet(), sel = S.blackx.sel;
  const groups = new Map();
  for (const o of S.save.cards) {
    const c = S.db.cards[o.key];
    if (!c || c.kind || c.tier !== '紫' || inL.has(o.uid) || isLocked(o.key)) continue;
    if (!groups.has(who(c))) groups.set(who(c), []);
    groups.get(who(c)).push({ o, c });
  }
  const opts = [...groups.values()].flat().sort((a, b) => a.c.ovr - b.c.ovr);
  const chosenWho = new Set(sel.map(u => who(cardOf(u).c)));
  const cells = opts.map(x => `<button class="pick ${sel.includes(x.o.uid) ? 'chosen' : ''}" data-act="bxpick" data-uid="${x.o.uid}" ${!sel.includes(x.o.uid) && chosenWho.has(who(x.c)) ? 'disabled' : ''}>${cardSVG(x.c, { plus: x.o.plus })}</button>`).join('');
  return `<div class="overlay"><div class="sheet"><div class="sheet-head"><b>選擇 3 位不同球員的紫卡（已選 ${sel.length} / 3）</b><span class="grow"></span>
    <button class="btn sm" data-act="bxclose">取消</button><button class="btn sm gold" data-act="bxgo" ${sel.length === 3 ? '' : 'disabled'}>確定兌換</button></div>
    <div class="pick-grid">${cells}</div></div></div>`;
}

function enhMatRule(c) {
  if (c.tier === '銅') return '素材：同一位球員任何賽季的銅卡（需要的張數減半）';
  if (c.tier === '銀') return '素材：同一位球員任何賽季的銀卡';
  if (c.tier === '紫') return '素材：同一張紫卡、特殊卡包開出的同球員紫卡，或同一位球員的紅卡';
  return `素材：同一張卡，或特殊卡包開出的同一位球員${c.tier}卡（任何賽季）`;
}
function enhInfo(key) {
  const owned = S.save.cards.filter(o => o.key === key), card = S.db.cards[key];
  const inL = inLineupSet();
  const target = owned.slice().sort((a, b) => (b.plus || 0) - (a.plus || 0))[0];
  const mats = S.save.cards.filter(o => o !== target && card && sameMat(o, card) && !inL.has(o.uid) && !(o.plus > 0))
    .sort((x, y) => (x.key === key) - (y.key === key));   // 先用其他賽季的（特殊卡包、銅銀卡、紫卡的紅卡），同一張卡留到最後
  const plus = target ? target.plus || 0 : 0, next = plus + 1;
  const need = plus < 10 && card ? enhNeed(card, next) : 0, cost = plus < 10 && card ? enhCost(card.tier, next) : 0;
  const matOk = !!target && plus < 10 && mats.length >= need;
  return { owned, target, mats, plus, next, need, cost, matOk, can: matOk && S.save.coins >= cost };
}
function enhanceOnce(key) {
  const E = enhInfo(key);
  if (!E.can) return null;
  const r = tryEnhance(E.plus);
  S.save.coins -= E.cost;
  const used = new Set(E.mats.slice(0, E.need).map(o => o.uid));
  S.save.cards = S.save.cards.filter(o => !used.has(o.uid));
  E.target.plus = r.newPlus;
  return { ok: r.ok, plus: E.target.plus };
}
async function doEnhance(key = S.detail) {
  if (!(await onlineGuard('強化'))) return;
  const from = enhInfo(key).plus;
  const E0 = enhInfo(key); if (!E0.matOk) return flash('素材不足'); if (!E0.can) return flash('遊戲幣不足');
  const r = enhanceOnce(key);
  if (!r) return flash('素材不足');
  questEvent('enh', 1);
  save(); cloud.pushNow(S.save);
  enhanceFx(S.db.cards[key], from, r.plus, r.ok).then(() => { render(); if (!r.ok) flash(`強化失敗，維持 +${r.plus}，素材已消失`); });
}
// 連續強化：一直嘗試到素材不足或達到目標等級
async function doEnhanceAuto(key, goal) {
  if (!(await onlineGuard('強化'))) return;
  const from = enhInfo(key).plus;
  let tries = 0, ok = 0, last = null;
  while (enhInfo(key).can && enhInfo(key).plus < goal) { last = enhanceOnce(key); tries++; if (last.ok) ok++; }
  if (!tries) return flash(enhInfo(key).matOk ? '遊戲幣不足' : '素材不足');
  questEvent('enh', tries);
  save(); cloud.pushNow(S.save);
  const plus = enhInfo(key).plus;
  enhanceFx(S.db.cards[key], from, plus, ok > 0).then(() => { render(); flash(`連續強化 ${tries} 次：成功 ${ok} 次、失敗 ${tries - ok} 次，目前 +${plus}`); });
}

function doDecompose() {
  if (S.confirm !== 'decompose') { S.confirm = 'decompose'; render(); return; }
  S.confirm = null;
  const c = S.db.cards[S.detail];
  const inL = inLineupSet();
  if (isLocked(S.detail)) return flash('這張卡已鎖定，請先解除鎖定再分解');
  const owned = S.save.cards.filter(o => o.key === S.detail && !inL.has(o.uid) && !(o.plus > 0));
  const victim = owned.length > 1 ? owned[owned.length - 1] : owned[0];
  if (!victim) return flash('沒有可分解的卡');
  S.save.cards = S.save.cards.filter(o => o !== victim);
  S.save.points = (S.save.points || 0) + decompPts(c.tier); save();
  if (!S.save.cards.some(o => o.key === S.detail)) { S.screen = S.from; }
  flash(`分解完成，獲得 ${decompPts(c.tier)} 點`);
}


// ---------- 賽季模式 ----------
const YEAR = (() => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 9 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; })();   // 依現在日期決定賽季名稱
const WIN_REWARD = 1000, LOSS_REWARD = 350, DAILY_BASE = 11;   // 次數型啦啦隊技能拿掉後，基本次數各 +1（模擬確認進度與原本相當）
const today = () => new Date().toISOString().slice(0, 10);
const dailyCount = () => (testOn() ? 0 : S.save.daily && S.save.daily.date === today() ? S.save.daily.n : 0);
const DEFAULT_TACTIC = { pace: '中', focus: '均衡', defense: '人盯人' };

function myEntries() {
  const L = S.save.lineup;
  return [...L.starters, ...L.bench].map(uid => (uid ? cardOf(uid) : null)).filter(Boolean).map(x => ({ c: x.c, plus: x.o.plus }));
}
function mySide(tactic, opp) {   // opp：對手球隊代號（世仇加成）
  const L = S.save.lineup, coach = teamCoach(L);
  const ents = [...L.starters, ...L.bench].map(uid => (uid ? cardOf(uid) : null));
  const list = ents.filter(Boolean).map(x => ({ c: x.c, plus: x.o.plus }));
  const side = buildSide(S.save.season ? S.save.season.team : 'YOU', list, tactic || DEFAULT_TACTIC, (c) => extraBonus(c, coach, opp));
  side.rivals = opp ? list.filter(x => isRival(x.c.team, opp)).length : 0;
  const ab = FX().abil;   // 總教練的全場能力加成
  for (const [k, v] of Object.entries(ab)) for (const p of side.team.players) p.ab[k] += v;
  return side;
}
const oppSide = (abbr, tactic) => buildSide(abbr, realRoster(S.db, abbr), tactic || DEFAULT_TACTIC);

function renderSeasonStart() {
  const cache = S.powerCache || (S.powerCache = Object.fromEntries(TEAMS.map(t => [t, oppSide(t).power])));
  const pick = S.teamPick;
  const col = (cf) => `<div class="conf"><b class="label">${cf}</b>${Object.entries(CONF[cf]).map(([dv, ts]) => `<small class="muted">${dv}</small>
    <div class="team-row">${ts.map(t => `<button class="team-btn ${pick === t ? 'sel' : ''}" data-act="teampick" data-t="${t}"><b>${t}</b><span>${TEAM_ZH[t]}</span><small>戰力 ${cache[t].toFixed(1)}</small></button>`).join('')}</div>`).join('')}</div>`;
  app.innerHTML = `${topbar(`${YEAR} 賽季 · 選擇接管的球隊`)}
  <main class="body col"><p class="lead">接管的球隊只決定分區與賽程，它的真實陣容會由你的卡片陣容取代。你的目前戰力：${mySide().power.toFixed(1)}</p>
    <div class="filters diff-row"><b class="label">難度</b>${SEASON_DIFF.map((d, i) => `<button class="chip ${(S.seasonDiff || 0) === i ? 'on' : ''}" data-act="seasondiff" data-i="${i}">${d.name}<small>對手約 ${(79 + d.boost).toFixed(0)}・勝場 ×${d.mul}</small></button>`).join('')}</div>
    <div class="confs">${col('東區')}${col('西區')}</div>
    <div class="ob-bar">${pick ? `<span>接管 <b>${pick} ${TEAM_ZH[pick]}</b>（${confOf(pick)}），整季不能更換</span>` : '<span class="muted">點選一支球隊</span>'}
      <button class="btn gold" data-act="seasonstart" ${pick ? '' : 'disabled'}>開始 ${YEAR} 賽季</button></div></main>${toast()}`;
}

function startSeason() {
  const team = S.teamPick;
  const power = {};
  TEAMS.forEach(t => { if (t !== team) power[t] = (S.powerCache && S.powerCache[t]) || oppSide(t).power; });
  const diff = S.seasonDiff || 0, boost = SEASON_DIFF[diff].boost;
  for (const t of Object.keys(power)) power[t] += boost;
  S.save.season = { year: YEAR, team, days: buildSchedule(), results: {}, power, idx: 0, phase: 'regular', earned: 0, diff };
  save(); S.screen = 'season'; render();
}

function nextGame() {
  const se = S.save.season;
  const list = userGames(se);
  if (se.phase !== 'post') {
    const c = list[se.idx];
    return { list, cur: c ? { ...c, label: `第 ${se.idx + 1} 場`, post: false } : null };
  }
  const s = userSeries(se);
  if (!s) return { list, cur: null };
  const g = nextPostGame(s), n = s.games.length + 1;
  const label = s.need === 1 ? STAGE_ZH[s.stage] : `${STAGE_ZH[s.stage]} 第 ${n} 戰（系列賽 ${s.hi === se.team ? s.wins[0] : s.wins[1]}-${s.hi === se.team ? s.wins[1] : s.wins[0]}）`;
  return { list, cur: { g, id: `${s.id}-g${n}`, label, post: true, series: s } };
}

// 例行賽打完：建立附加賽與季後賽
function toPostseason() {
  const se = S.save.season;
  simulateOthers(se, se.days.length - 1);
  const st = standings(se), cf = confOf(se.team);
  const seed = st.conf[cf].findIndex(r => r.t === se.team) + 1;
  se.phase = 'post'; se.seed = seed;
  postInit(se);
  if (seed <= 10 && seed >= 7) award(5000, '打進附加賽');
  if (seed <= 6) award(12000, '打進季後賽');
  postAdvance(se);
  save();
}
function award(n, why) {
  const se = S.save.season;
  n = n * SEASON_DIFF[se.diff || 0].mul;
  n = Math.round(n * rf()); if (S.rewardFactor < 1) why += '（快速模擬 5 成）';
  S.save.coins += n; se.earned = (se.earned || 0) + n;
  (se.awards = se.awards || []).push(`${why} +${fmt(n)}`);
}

function gapInfo(oppAbbr) {
  const mine = mySide().power, opp = S.save.season.power[oppAbbr];
  const gap = (mine - opp) / opp * 100;
  return { mine, opp, gap, canSkip: Math.abs(gap) >= 5 };
}

function renderSeason() {
  const se = S.save.season;
  const { list, cur } = nextGame();
  const st = standings(se);
  const me = st.rec[se.team];
  const cf = confOf(se.team);
  const rank = st.conf[cf].findIndex(r => r.t === se.team) + 1;
  const streak = (() => { const l = me.last; if (!l.length) return ''; const x = l[l.length - 1]; let k = 0; for (let i = l.length - 1; i >= 0 && l[i] === x; i--) k++; return `${x === 'W' ? '連勝' : '連敗'} ${k}`; })();
  let nextCard = '';
  if (cur) {
    const home = cur.g[0] === se.team, opp = home ? cur.g[1] : cur.g[0];
    const gi = gapInfo(opp);
    const full = dailyCount() >= dailyMax();
    nextCard = `<div class="next-card"><small>下一場 · ${cur.label}（${home ? '主場' : '客場'}）</small>
      <div class="vs vs2"><span class="em">${teamEmblem(se.team)}</span><b>${se.team}</b><i class="vsx">VS</i><b>${opp}</b><span class="em">${teamEmblem(opp)}</span></div>
      <small class="muted">戰力 ${gi.mine.toFixed(1)} : ${gi.opp.toFixed(1)}</small>
      <small class="${gi.canSkip ? 'ok' : 'bad'}">${gi.canSkip ? '可以跳過（全額獎勵）' : '可手動比賽或快速模擬（獎勵 5 成）'}</small>
      ${full ? '<small class="bad">今天已打滿 10 場，明天再繼續</small>' : ''}
      <div class="btns"><button class="btn gold" data-act="manual" ${full ? 'disabled' : ''}>手動比賽</button>${gi.canSkip ? `<button class="btn" data-act="skip" ${full ? 'disabled' : ''}>跳過</button>` : `<button class="btn" data-act="quick" ${full ? 'disabled' : ''}>快速模擬<br><small>獎勵 5 成</small></button>`}</div></div>`;
  } else {
    const P = se.post, champ = P && P.champion;
    const status = !P ? '' : champ === se.team ? '你奪得了總冠軍！' : champ ? `總冠軍：${champ} ${TEAM_ZH[champ]}` : '季後賽進行中';
    nextCard = `<div class="next-card"><b>${champ === se.team ? '🏆 總冠軍' : '賽季結束'}</b><small>例行賽 ${me.w}-${me.l}，${cf}第 ${se.seed || rank} 名</small><small>${status}</small>
      ${(se.awards || []).map(x => `<small class="ok">${x}</small>`).join('')}<small>本季共賺 ${fmt(se.earned || 0)} 遊戲幣</small>
      <div class="btns"><button class="btn gold" data-act="newseason">開始新賽季</button></div></div>`;
  }
  const recent = list.filter(x => se.results[x.id]).slice(-5).reverse().map(x => {
    const r = se.results[x.id], home = x.g[0] === se.team, my = home ? r[0] : r[1], op = home ? r[1] : r[0], opp = home ? x.g[1] : x.g[0];
    return `<div class="rec"><span class="wl ${my > op ? 'w' : 'l'}">${my > op ? 'W' : 'L'}</span><span>${se.team} ${my} – ${op} ${opp}</span></div>`;
  }).join('') || '<small class="muted">尚未開打</small>';
  const upcoming = list.slice(se.idx, se.idx + 6).map((x, k) => {
    const home = x.g[0] === se.team, opp = home ? x.g[1] : x.g[0], gi = gapInfo(opp);
    return `<div class="up ${k === 0 ? 'now' : ''}"><span class="n shield">${se.idx + k + 1}</span><span class="em">${teamEmblem(opp)}</span><span>${home ? 'vs' : '@'}</span><b>${opp}</b>
      <small>戰力 <b>${gi.opp.toFixed(1)}</b></small>
      <span class="tag ${gi.canSkip ? 'skip' : 'man'}">${gi.canSkip ? '可跳過' : '需手動'}</span></div>`;
  }).join('');
  const showCf = S.standCf || cf;
  const rows = st.conf[showCf].map((r, i) => {
    const gb = ((st.conf[showCf][0].w - r.w) + (r.l - st.conf[showCf][0].l)) / 2;
    const l10 = r.last.slice(-10), w10 = l10.filter(x => x === 'W').length;
    return `<div class="srow ${r.t === se.team ? 'me' : ''}"><span class="z ${i < 6 ? 'po' : i < 10 ? 'pi' : ''}"></span><span class="rk ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span><b>${r.t}</b><span>${r.w}-${r.l}</span><span>${i ? gb : '—'}</span><span>${w10}-${l10.length - w10}</span></div>`;
  }).join('');
  app.innerHTML = `${topbar('賽季模式', `${se.year} · 接管 ${se.team} ${TEAM_ZH[se.team]} · 難度 ${SEASON_DIFF[se.diff || 0].name}`)}
  <main class="body">${tabs('season')}
    <section class="panel s-left"><div class="rec-head"><div><small>${cf}第 ${rank} 名 ${streak ? '· ' + streak : ''}</small><strong>${me.w}-${me.l}</strong></div>
      <div><small>勝率</small><b>${me.w + me.l ? (me.w / (me.w + me.l)).toFixed(3).replace(/^0/, '') : '.000'}</b></div></div>
      <div class="prog"><div><small>${se.phase === 'post' ? '例行賽已結束' : `賽季進度 ${Math.min(se.idx, 82)} / 82`}</small><small>今日 ${dailyCount()} / ${dailyMax()} 場</small></div><i><u style="width:${se.idx / 82 * 100}%"></u></i></div>
      ${nextCard}<small class="label">最近 5 場</small>${recent}</section>
    <section class="panel s-mid">${se.phase === 'post' ? bracketHtml(se) : `<div class="sm-head"><small class="label">接下來的賽程</small></div>${upcoming || '<small class="muted">例行賽已全部打完</small>'}`}
      <small class="muted note">實力差距夠大的比賽可以跳過，以預設戰術直接出結果。勝場 +${fmt(WIN_REWARD)}、敗場 +${LOSS_REWARD} 遊戲幣。本季已賺 ${fmt(se.earned || 0)}。</small></section>
    <aside class="panel s-right"><div class="sm-head"><small class="label">${showCf}排名</small><button class="chip" data-act="standcf">${showCf === '東區' ? '西區' : '東區'} ▸</button></div>
      <div class="srow head"><span></span><span></span><span>球隊</span><span>戰績</span><span>勝差</span><span>近10</span></div>${rows}
      <small class="legend"><i class="lb2"></i>季後賽 <i class="lo2"></i>附加賽</small></aside>
  </main>${toast()}`;
}

function bracketHtml(se) {
  const P = se.post;
  const rows = P.series.map(s => {
    const mine = s.hi === se.team || s.lo === se.team, fin = Math.max(...s.wins) >= s.need;
    return `<div class="up ${mine ? 'now' : ''}"><small>${s.conf}</small><b>${s.hi}</b><span>${s.wins[0]} - ${s.wins[1]}</span><b>${s.lo}</b><span class="tag ${fin ? 'skip' : 'man'}">${fin ? '結束' : '進行中'}</span></div>`;
  }).join('');
  return `<div class="sm-head"><small class="label">${P.champion ? '季後賽結束' : STAGE_ZH[P.stage]}</small><small class="muted">${P.champion ? `總冠軍 ${P.champion}` : '高種子在左'}</small></div>${rows}`;
}

function recordResult(cur, homeScore, awayScore) {
  const se = S.save.season;
  const home = cur.g[0] === se.team, won = home ? homeScore > awayScore : awayScore > homeScore;
  const reward = Math.round((won ? WIN_REWARD * SEASON_DIFF[se.diff || 0].mul : LOSS_REWARD) * rf());   // 難度倍率只加在贏球
  S.save.coins += reward; se.earned = (se.earned || 0) + reward;
  gainXp(won); questEvent('season'); if (won) { questEvent('seasonWin'); giftState().wins++; }
  if (cur.post) {
    const s = cur.series, before = Math.max(...s.wins);
    addPostResult(se, s, cur.g[0], [homeScore, awayScore]);
    if (Math.max(...s.wins) >= s.need && before < s.need) {
      const iWon = se.post.done[`${s.conf}-${s.tag}-winner`] === se.team;
      if (iWon && (s.tag === '7v8' || s.tag === '8th')) award(12000, '從附加賽晉級季後賽');
      if (iWon && ['R1', 'R2', 'CF', 'Finals'].includes(s.stage)) award(12000, `${STAGE_ZH[s.stage]}晉級`);
      if (iWon && s.tag === 'finals') award(25000, '奪得總冠軍');
    }
    postAdvance(se);
  } else {
    se.results[cur.id] = [homeScore, awayScore];
    se.idx++;
    const nx = userGames(se)[se.idx];
    simulateOthers(se, nx ? nx.d - 1 : se.days.length - 1);
    if (!nx) toPostseason();
  }
  S.save.daily = { date: today(), n: dailyCount() + 1 };
  save();
  return { won, reward };
}

function newGame(tacticMine) {
  const P = S.pending;
  if (P && P.mode !== 'season') {
    const them = P.side(), mine = mySide(tacticMine, them.team.abbr);
    if (P.mode === 'exh') P.bonus = Math.round((mine.power - them.power) * 10) / 10;   // 一般模式：對手調到跟你一樣強
    if (P.bonus) them.team.players.forEach(p => Object.keys(p.ab).forEach(k => { p.ab[k] += P.bonus; }));
    if (mine.rivals) setTimeout(() => flash(`世仇對決！${mine.rivals} 位球員全能力 +2`), 500);
    const g = new Game(mine.team, them.team);
    if (P.mode === 'infinite') for (const p of g.t[0].players) if (p.key) g.energy[0][p.id] = 1 - ((S.save.inf.fatigue || {})[p.key] || 0);
    return { g, cur: { mode: P.mode, label: P.label, g: [mine.team.abbr, them.team.abbr] }, me: 0, opp: them.team.abbr, powers: [mine.power, them.power + (P.bonus || 0)] };
  }
  const se = S.save.season, { cur } = nextGame();
  if (!cur.post) simulateOthers(se, cur.d - 1);
  const home = cur.g[0] === se.team, opp = home ? cur.g[1] : cur.g[0];
  const mine = mySide(tacticMine, opp), them = oppSide(opp);
  if (mine.rivals) setTimeout(() => flash(`世仇對決！${mine.rivals} 位球員全能力 +2`), 500);
  const boost = SEASON_DIFF[se.diff || 0].boost;   // 賽季難度：對手全隊加成
  if (boost) { them.team.players.forEach(p => Object.keys(p.ab).forEach(k => { p.ab[k] += boost; })); them.power += boost; }
  const g = home ? new Game(mine.team, them.team) : new Game(them.team, mine.team);
  return { g, cur: { ...cur, mode: 'season' }, me: home ? 0 : 1, opp, powers: [mine.power, them.power] };
}

// 依模式記錄結果
function finishMatch(G) {
  const g = G.g, sc = g.score;
  if (!G.cur.mode || G.cur.mode === 'season') return recordResult(G.cur, sc[0], sc[1]);
  const won = sc[G.me] > sc[1 - G.me];
  return G.cur.mode === 'infinite' ? infResult(G, won) : G.cur.mode === 'exh' ? exhResult(G, won) : histResult(G, won);
}

// 跳過（戰力差 5% 以上，全額獎勵）與快速模擬（任何比賽，獎勵 5 成）
const QUICK_FACTOR = .5;
function skipGame(quick = false) {
  if (limitError()) return flash(limitError());
  if (dailyCount() >= dailyMax()) return flash('今天已打滿 10 場');
  S.pending = { mode: 'season' };
  S.rewardFactor = quick ? quickF() : 1;
  const G = newGame(DEFAULT_TACTIC);
  G.g.finish();
  const res = finishMatch(G);
  S.rewardFactor = 1;
  S.game = { ...G, stage: 'final', res, skipped: true, quick };
  S.screen = 'game'; render();
}

function limitError() {
  const L = S.save.lineup, cs = [...L.starters, ...L.bench].filter(Boolean).map(u => cardOf(u)?.c).filter(Boolean);
  const over = limitCheck(cs).find(l => l.over);
  if (over) return `陣容的${over.tier}卡超過上限 ${over.max} 張，請先調整陣容`;
  const sal = lineupSalary(cs);
  if (sal > capNow() + 1e-9) return `隊伍 ${S.save.ti + 1} 的薪資 ${fmtSal(sal)} 超過上限 ${fmtSal(capNow())}，請先調整陣容`;
  if (cs.length < 5) return '先發至少要 5 人';
  return null;
}
function startManual() {
  if (limitError()) return flash(limitError());
  if (dailyCount() >= dailyMax()) return flash('今天已打滿 10 場');
  S.pending = { mode: 'season' };
  S.game = { stage: 'pre', tactic: { ...DEFAULT_TACTIC } };
  S.screen = 'game'; render();
}

const segBtns = (field, opts, cur) => `<div class="seg"><span>${{ pace: '比賽節奏', focus: '進攻重心', defense: '防守體系' }[field]}</span><div>${opts.map(o => `<button class="${cur === o ? 'on' : ''}" data-act="tac" data-f="${field}" data-v="${o}">${o}</button>`).join('')}</div></div>`;
const tacticControls = (t) => segBtns('pace', ['快', '中', '慢'], t.pace) + segBtns('focus', ['內線', '均衡', '外線'], t.focus) + segBtns('defense', ['人盯人', '區域聯防'], t.defense);

function preCard(me, opp, oppName, mine, oppPow, back) {
  const G = S.game;
  return `<div class="pre pre2"><div class="pre-ban"><small>PRE-GAME SETTINGS</small><b>比賽前設定</b></div>
    <div class="pre-head"><div class="pre-vs"><span class="em big">${teamEmblem(me)}</span><b>${esc(me)}</b><i class="vsx bolt">VS</i><b class="opp">${oppName}</b>${opp ? `<span class="em big">${teamEmblem(opp)}</span>` : ''}</div>
    <div class="pre-pow">戰力 <b class="mine">${mine.toFixed(1)}</b> : <b class="theirs">${oppPow.toFixed(1)}</b></div></div>
    <div class="pre-tac">${tacticControls(G.tactic)}</div>
    <div class="btns"><button class="btn blue" data-act="go" data-to="${back}">返回</button><button class="btn gold fire" data-act="tipoff">開賽</button></div></div>`;
}

function scoreboard(G, qLabel) {
  const g = G.g, [h, a] = g.t;
  const clock = G.stage === 'final' ? '0:00' : `${Math.floor(g.clock / 60)}:${String(Math.floor(g.clock % 60)).padStart(2, '0')}`;
  const em = (t) => (TEAM_ZH[t] ? `<span class="em sb">${teamEmblem(t)}</span>` : '');
  return `<header class="scoreboard">${em(h.abbr)}<span class="tm">${h.abbr}</span><b>${g.score[0]}</b><div class="clk"><small>${qLabel}</small><b>${clock}</b></div><b>${g.score[1]}</b><span class="tm t2">${a.abbr}</span>${em(a.abbr)}</header>`;
}

function energyList(g, s) {
  return g.on[s].map((p, i) => { const e = Math.round(g.energy[s][p.id] * 100); return `<div class="en"><span class="psh">${['PG', 'SG', 'SF', 'PF', 'C'][i]}</span><b>${esc(p.short)}</b><i><u class="${e > 60 ? 'g' : e > 35 ? 'y' : 'r'}" style="width:${e}%"></u></i></div>`; }).join('');
}

function renderGame() {
  const G = S.game;
  if (G.stage === 'pre') {
    const P = S.pending || { mode: 'season' };
    if (P.mode !== 'season') {
      const mine = mySide().power;
      const oppAbbr = (P.ts && P.ts.team) || '';
      app.innerHTML = `${topbar('比賽前設定', P.label)}
      <main class="body col center pre-bg">${preCard(S.save.season ? S.save.season.team : 'YOU', oppAbbr, esc(P.title), mine, P.power, 'challenge')}</main>${toast()}`;
      return;
    }
    const se = S.save.season, { cur } = nextGame(); const home = cur.g[0] === se.team, opp = home ? cur.g[1] : cur.g[0], gi = gapInfo(opp);
    app.innerHTML = `${topbar('比賽前設定', `${cur.label} · ${home ? '主場' : '客場'}`)}
    <main class="body col center pre-bg">${preCard(se.team, opp, TEAM_ZH[opp] || opp, gi.mine, gi.opp, 'season')}</main>${toast()}`;
    return;
  }
  const g = G.g, me = G.me;
  if (G.stage === 'final') {
    const won = G.res.won, myScore = g.score[me], opScore = g.score[1 - me];
    const tops = (s) => Object.entries(g.box[s]).map(([id, b]) => ({ p: g.t[s].players.find(x => x.id === id), b })).filter(x => x.b.min > 0)
      .sort((x, y) => y.b.pts - x.b.pts).slice(0, 5).map(x => `<div class="bx"><b>${esc(x.p.short)}</b><span>${x.b.pts}</span><span>${x.b.reb}</span><span>${x.b.ast}</span><span>${Math.round(x.b.min)}</span></div>`).join('');
    const qrow = (s) => `<div class="qrow"><b>${g.t[s].abbr}</b>${g.qScore[s].map(v => `<span>${v}</span>`).join('')}<strong>${g.score[s]}</strong></div>`;
    app.innerHTML = `${scoreboard(G, '終場')}
    <main class="body"><section class="panel s-left center-col">${won ? '<div class="confetti">' + Array.from({ length: 18 }, (_, k) => `<i style="left:${(k * 5.6 + 2).toFixed(0)}%;animation-delay:${(k % 6) * .12}s;background:${['#FFD54A', '#7AB8FF', '#FF6A8A', '#7CE08A'][k % 4]}"></i>`).join('') + '</div>' : ''}<strong class="${won ? 'ok' : 'bad'} big-result pop">${won ? '勝利' : '落敗'}</strong>
      <span>${myScore} – ${opScore}${G.quick ? '（快速模擬，獎勵 5 成）' : G.skipped ? '（跳過，以預設戰術模擬）' : ''}</span><span class="reward"><i class="coin"></i>+${G.res.reward}</span>
      ${qrow(0)}${qrow(1)}${G.res.note ? `<span class="ok">${esc(G.res.note)}</span>` : ''}<div class="btns"><button class="btn gold" data-act="go" data-to="${G.cur.mode && G.cur.mode !== 'season' ? 'challenge' : 'season'}">${G.cur.mode && G.cur.mode !== 'season' ? '返回挑戰' : '返回賽季'}</button></div></section>
      <section class="panel s-mid"><small class="label">${g.t[me].abbr} 數據</small><div class="bx head"><b>球員</b><span>分</span><span>板</span><span>助</span><span>分鐘</span></div>${tops(me)}
        <small class="label">${g.t[1 - me].abbr} 數據</small><div class="bx head"><b>球員</b><span>分</span><span>板</span><span>助</span><span>分鐘</span></div>${tops(1 - me)}</section></main>${toast()}`;
    return;
  }
  if (G.stage === 'live') return;   // 即時對戰進行中（畫面在上層）
  if (G.stage === 'break') {
    const plan = g.plan[me], team = g.t[me];
    const total = team.players.reduce((a, p) => a + (plan[p.id] || 0), 0);
    const rows = team.players.map(p => { const e = Math.round(g.energy[me][p.id] * 100); return `<div class="mrow"><b>${esc(p.short)}</b><small>${p.group}</small>
      <i><u class="${e > 60 ? 'g' : e > 35 ? 'y' : 'r'}" style="width:${e}%"></u></i><button class="pm" data-act="min" data-id="${p.id}" data-d="-1">−</button><span>${plan[p.id] || 0}</span><button class="pm" data-act="min" data-id="${p.id}" data-d="1">＋</button></div>`; }).join('');
    const nextQ = g.q + 1;
    app.innerHTML = `${scoreboard(G, `第 ${g.q} 節結束`)}
    <main class="body"><section class="panel s-left"><b class="h">節間調整 · 進入第 ${nextQ} 節前</b>${tacticControls(g.t[me].tactic)}
      <small class="muted">${nextQ === 4 ? '第 4 節前 7 分鐘照常進行，最後 5 分鐘的互動對決將於下一版加入，本版由系統以你的戰術打完。' : '戰術與上場時間只能在節間調整。'}</small></section>
      <section class="panel s-mid"><div class="sm-head"><small class="label">第 ${nextQ} 節上場分鐘</small><small class="${total === 60 ? 'ok' : 'bad'}">合計 ${total} / 60</small></div><div class="mlist">${rows}</div>
        <div class="btns"><button class="btn gold" data-act="nextq" ${total === 60 ? '' : 'disabled'}>確定 · 開始第 ${nextQ} 節</button></div></section></main>${toast()}`;
    return;
  }
  // 文字直播
  const shown = g.events.slice(0, G.shown).slice().reverse();
  const feed = shown.map(e => `<div class="ev ${e.big ? 'big' : ''} s${e.side === me ? 'me' : 'op'}"><small>Q${e.q} ${e.clock}</small><span>${esc(e.text)}</span><b>${e.score[0]}-${e.score[1]}</b></div>`).join('');
  const qLabel = `第 ${Math.min(g.q + (G.qDone ? 0 : 1), 4)} 節`;
  const myBox = Object.entries(g.box[me]).map(([id, b]) => ({ p: g.t[me].players.find(x => x.id === id), b })).sort((x, y) => y.b.pts - x.b.pts).slice(0, 4)
    .map(x => `<div class="bx"><b>${esc(x.p.short)}</b><span>${x.b.pts}</span><span>${x.b.reb}</span><span>${x.b.ast}</span></div>`).join('');
  app.innerHTML = `${scoreboard(G, qLabel)}
  <main class="body"><section class="panel s-left live-l"><small class="label me">${g.t[me].abbr} 場上（體力）</small><div class="ens me">${energyList(g, me)}</div><small class="label op">${g.t[1 - me].abbr} 場上</small><div class="ens op">${energyList(g, 1 - me)}</div></section>
    <section class="panel s-mid"><div class="sm-head"><small class="label">文字直播 · 只播重要事件</small><button class="btn sm blue" data-act="skipq">⏭ 直接跳到節末</button></div><div class="feed">${feed}</div></section>
    <aside class="panel s-right"><small class="label">各節比分</small>${[0, 1].map(s => `<div class="qrow"><b>${g.t[s].abbr}</b>${g.qScore[s].map(v => `<span>${v}</span>`).join('')}</div>`).join('')}
      <small class="label">${g.t[me].abbr} 主力</small><div class="bx head"><b></b><span>分</span><span>板</span><span>助</span></div>${myBox}
      <small class="label">目前戰術</small><div class="chips">${['pace', 'focus', 'defense'].map(k => `<span class="chip on">${g.t[me].tactic[k]}</span>`).join('')}</div></aside>
  </main>${toast()}`;
}

function endGame() {
  const G = S.game, g = G.g;
  G.res = finishMatch(G);
  // 手動比賽的表現獎勵
  const D = G.duel, me = G.me;
  if (D && G.res.won) {
    const bonus = [];
    if (D.startDiff < 0) bonus.push(['最後 5 分鐘逆轉勝', 800]);
    if (D.goAhead !== null && D.goAhead <= 24) bonus.push(['關鍵球超前', 1000]);
    if (D.myTov === 0) bonus.push(['關鍵時刻零失誤', 300]);
    const sum = bonus.reduce((x, b) => x + b[1], 0);
    if (sum) { S.save.coins += sum; G.res.reward += sum; G.res.note = [G.res.note, ...bonus.map(([t, v]) => `${t} +${v}`)].filter(Boolean).join('　'); save(); }
  }
  G.stage = 'final'; render();
}

// ---------- 最後 5 分鐘：即時對戰（live.html，在上層開啟） ----------
// 即時對戰的 AI 強度：賽季依難度（一般→普通、困難～傳奇→強、地獄以上→地獄），一般模式普通，其他挑戰強
function liveLevel(G) {
  const m = G.cur && G.cur.mode;
  if (!m || m === 'season') { const d = ((S.save.season || {}).diff) || 0; return d >= 4 ? 2 : d >= 1 ? 1 : 0; }   // 地獄、煉獄才用地獄 AI
  return m === 'exh' ? 0 : 1;
}
// 對手的特質（AI 沒有強化，依強度給）：普通＝不給；強＝紫卡、黑卡各 1；地獄＝紫卡 1、黑卡 2（傳奇隊伍全是黑卡，給太多會太難，模擬後調整）
function oppTraits(c, lv) { if (!c.traits || !c.traits.length) return []; const n = ({ 0: {}, 1: { '紫': 1, '黑': 1 }, 2: { '紫': 1, '黑': 2 } })[lv] || {}; return c.traits.slice(0, n[c.tier] || 0); }
// 我的陣容裡這張卡的強化等級（決定解鎖幾個特質）
function plusOfKey(key) { const L = S.save.lineup; let best = 0; for (const uid of [...L.starters, ...L.bench]) { const x = uid && cardOf(uid); if (x && x.c.key === key) best = Math.max(best, x.o.plus || 0); } return best; }
function startLive(G, opt = {}) {
  const g = G.g, me = G.me, opp = 1 - me;
  const ZH = { sc: '得分', ins: '內線', thr: '外線', ft: '罰球', pm: '組織', reb: '籃板', de: '防守', sta: '耐力' };
  const toD = (p) => { const c = p.key && S.db.cards[p.key];
    const a = Object.fromEntries(Object.entries(ZH).map(([k, zh]) => [zh, Math.round(p.ab[k] != null ? p.ab[k] : 72)]));   // 用比賽中的能力值（含難度、世仇、教練加成）
    const mine = g.t[me].players.includes(p);
    return { n: p.short || p.name, full: p.name, pos: (c && c.pos) || 'F', a, ovr: c ? (mine ? c.ovr + .65 * ENH_TOTAL[plusOfKey(p.key)] : c.ovr) : 70, tier: c ? c.tier : '銀', img: (c && artSrc(c)) || '', st: g.energy[g.t[0].players.includes(p) ? 0 : 1][p.id], tr: c ? (mine ? unlockedTraits(c, plusOfKey(p.key)) : oppTraits(c, liveLevel(G))) : [] }; };
  const col = (abbr, ring) => { const tc = (TEAM_COLORS || {})[abbr] || []; return { ring, shorts: tc[0] || (ring === '#3FA0FF' ? '#1D428A' : '#860038'), trim: tc[1] || '#FDB927', sleeve: tc[0] || '#333' }; };
  const fx = (typeof FX === 'function' ? FX() : {}) || {};
  window.__LIVE = {
    data: { me: g.on[me].map(toD), op: g.on[opp].map(toD) },
    bench: { me: g.t[me].players.filter(p => !g.on[me].includes(p)).map(toD), op: g.t[opp].players.filter(p => !g.on[opp].includes(p)).map(toD) },
    names: { me: g.t[me].abbr, op: g.t[opp].abbr }, col: { me: col(g.t[me].abbr, '#3FA0FF'), op: col(g.t[opp].abbr, '#FF5A4A') },
    score: [g.score[me], g.score[opp]], lv: liveLevel(G), timeouts: 2 + (fx.timeouts > 0 ? 1 : 0), fx: { style: fx.style || {}, gauge: fx.gauge || 0, stam: fx.stam || 0, toRec: fx.toRec || 0 }, clock: opt.clock || 300, period: opt.period || '第 4 節',
    energy: { me: g.on[me].map(p => g.energy[me][p.id]), op: g.on[opp].map(p => g.energy[opp][p.id]) },
    done: (res) => liveFinish(G, res),
  };
  G.stage = 'live'; G.live = G.live || { startDiff: g.score[me] - g.score[opp] };
  const w = document.createElement('div'); w.id = 'liveWrap';
  w.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#071022';
  w.innerHTML = '<iframe src="live.html" title="最後 5 分鐘" style="border:0;width:100%;height:100%;display:block"></iframe>';
  document.body.appendChild(w);
}
function liveFinish(G, res) {
  const w = document.getElementById('liveWrap'); if (w) w.remove(); liveQuestEvents(res.stats);
  const g = G.g, me = G.me, opp = 1 - me, side = (t) => (t === 'me' ? me : opp);
  g.score[me] = res.score[0]; g.score[opp] = res.score[1];
  const byName = (s, nm) => g.t[s].players.find(q => q.name === nm);
  (res.per || []).forEach(x => { const s = side(x.t), p = byName(s, x.full); if (!p) return; const b = g.box[s][p.id]; if (b) b.pts += x.pts; g.energy[s][p.id] = x.st; });
  if (res.on) for (const t of ['me', 'op']) { const s = side(t), on = res.on[t].map(nm => byName(s, nm)).filter(Boolean); if (on.length === 5) g.on[s] = on; }   // 暫停換人後的場上名單
  if (res.handoff) {   // 交給教練：從目前狀況模擬到結束（含延長賽）
    g.clock = res.clock; g.advance(0); while (g.score[0] === g.score[1]) g.advance(0);
    G.stage = 'q'; return endGame();
  }
  g.clock = 0; g.advance(0);
  if (g.score[0] === g.score[1]) {   // 平手 → 延長賽：前 2 分鐘模擬，最後 3 分鐘手動
    g.advance(180);
    if (Math.abs(g.score[0] - g.score[1]) <= 15) { g.rotate(0, true); g.rotate(1, true); return startLive(G, { clock: 180, period: '延長賽' }); }
    g.advance(0); while (g.score[0] === g.score[1]) g.advance(0);
  }
  G.stage = 'q';
  endGame();
}

// ---------- 最後 5 分鐘互動對決（讀局・決策・應變）----------
const PLAYS = {
  pnr: { icon: '🔁', title: '擋拆', stype: 'mid', adj: .06, to: -.02, desc: '借掩護後急停跳投，失誤較少' },
  post: { icon: '💪', title: '低位單打', stype: 'ins', adj: -.02, desc: '背框要位，轉身強攻' },
  three: { icon: '🎯', title: '外線', stype: 'thr', adj: -.03, desc: '跑位繞出，接球出手' },
  drive: { icon: '⚡', title: '切入', stype: 'ins', adj: -.03, desc: '持球突破，攻擊籃框' },
  iso: { icon: '🏀', title: '單打', stype: 'mid', adj: .04, desc: '拉開空間一對一' },
  fast: { icon: '🏃', title: '快攻', stype: 'ins', adj: 0, desc: '趁對手還沒退防（只在抄截或搶下籃板後）' },
  clutch: { icon: '⭐', title: '關鍵戰術', stype: null, desc: '消耗全部氣勢：最擅長的人用最拿手的方式出手' },
};
const TEMPO = { quick: { t: '快速出手', secs: 7, adj: -.02 }, normal: { t: '正常進攻', secs: 14, adj: 0 }, milk: { t: '打到最後', secs: 22, adj: -.01 } };
const KEYAB = { ins: 'ins', mid: 'sc', thr: 'thr' };
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));


const hasT = (D, p, k) => !!(p && D.tr && (D.tr[p.id] || []).includes(k));
const trIcons = (D, p) => (D.tr && D.tr[p.id] || []).map(k => TRAITS[k].icon).join('');
// 球探報告：依對手場上球員的出手傾向估算

const hotAdj = (D, p) => (D.hot[p.id] >= 2 ? .04 : D.hot[p.id] <= -2 ? -.03 : 0);
const hotTag = (D, p) => (D.hot[p.id] >= 2 ? '🔥' : D.hot[p.id] <= -2 ? '🧊' : '');





const DEF_ZH = { double: '包夾', switch: '換防', zone: '區域聯防', man: '一對一' };









// 對決 3D 演出：依比賽引擎算好的結果，在 2.5D 球場上演出這一回合
let CANVAS_OK = null;
const canvasOk = () => { if (CANVAS_OK === null) { try { CANVAS_OK = !!document.createElement('canvas').getContext('2d'); } catch (e) { CANVAS_OK = false; } } return CANVAS_OK; };
// 不能演出時（關閉、或沒有畫布）直接同步往下，維持原本的流程






const PLAYS_ZH = { ins: '切入', mid: '中距離', thr: '外線' };





// 依序播放事件
function playQuarter() {
  const G = S.game, g = G.g;
  const start = g.events.length;
  if (g.q === 3) { G.q4 = true; g.advance(300); } else g.advance(0);
  G.qDone = false;
  G.shown = start;
  clearInterval(G.timer);
  G.timer = setInterval(() => {
    if (S.screen !== 'game' || S.game !== G) return clearInterval(G.timer);
    if (G.shown < g.events.length) { G.shown++; render(); return; }
    clearInterval(G.timer); quarterDone();
  }, 1500);
  render();
}

function quarterDone() {
  const G = S.game, g = G.g;
  G.shown = g.events.length; G.qDone = true;
  if (g.q < 3 || (g.q === 3 && !G.q4)) { G.stage = 'break'; render(); return; }
  if (g.q === 3 && g.clock > 0) {        // 第 4 節剩 5 分鐘 → 互動對決（分差超過 15 分則自動打完）
    if (Math.abs(g.score[0] - g.score[1]) > 15) { g.advance(0); while (g.score[0] === g.score[1]) g.advance(0); return endGame(); }
    g.rotate(0, true); g.rotate(1, true);
    return startLive(G);   // 最後 5 分鐘：即時對戰
  }
}


// ---------- 設定與存檔備份 ----------
function fmtTime(t) { return t ? new Date(t).toLocaleString('zh-TW', { hour12: false }) : '尚未備份'; }
function agoText(t) { if (!t) return '—'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`; }
function friendsCard() {
  const list = (S.friends || []).filter(f => f.code !== cloud.myCode()).sort((x, y) => y.updatedAt - x.updatedAt);
  const rows = list.map(f => `<button class="friend ${S.friendOpen === f.code ? 'open' : ''}" data-act="friend" data-code="${esc(f.code)}">
      <span class="fn"><b>${esc(f.nick || '（未取 ID）')}</b>${f.test ? '<em>測試</em>' : ''}<small>經理 Lv.${f.mgr} · 戰力 ${f.power.toFixed(1)} · ${f.cards} 張卡 · ${agoText(f.updatedAt)}</small></span>
      ${S.friendOpen === f.code ? `<span class="fl">${(f.starters || []).map((s, i) => s ? `<i>${SLOTS[i]} <b>${esc(shortName(s.n))}</b> ${s.s} ${s.t}${s.p ? ` +${s.p}` : ''}</i>` : `<i>${SLOTS[i]} —</i>`).join('')}</span>` : ''}</button>`).join('');
  return `<div class="set-card"><b class="h">好友</b>
    ${S.friends ? (rows || '<small class="muted">還沒有其他玩家的資料（朋友打開遊戲後就會出現）</small>') : ''}
    <div class="set-btns"><button class="btn blue" data-act="friends">${S.friends ? '重新整理' : '查看好友'}</button></div>
    <small class="muted">顯示每位玩家隊伍 1 的先發、經理等級與戰力。點一下可展開陣容。</small></div>`;
}
// ---------- 好友 ----------
async function loadFriends() {
  if (S.friendsBusy) return; S.friendsBusy = true; S.friendsErr = '';
  net.presenceAll().then(m => { S.online = m.on; S.seen = m.all; if (S.screen === 'friends' || S.screen === 'devplayers') render(); }).catch(() => { S.online = {}; S.seen = {}; });
  try { S.friends = await cloud.listProfiles(); S.friendsAt = Date.now(); }
  catch (e) { S.friendsErr = e.message === '沒有權限' ? '好友功能尚未開放（雲端規則未設定）' : '無法連線到雲端，請稍後再試'; }
  S.friendsBusy = false; if (S.screen === 'friends') render();
}
const nickKey = (s) => String(s || '').trim().toLowerCase();
async function setNick(v, afterOk) {
  v = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 12);
  if (!v) return flash('請輸入遊戲 ID');
  if (/[<>"'`]/.test(v)) return flash('ID 不能包含 < > " \' ` 符號');
  try {
    const all = await cloud.listProfiles(); S.friends = all; S.friendsAt = Date.now();
    if (all.some(p => p.code !== cloud.myCode() && nickKey(p.nick) === nickKey(v))) return flash('這個 ID 已經有人使用，請換一個');
  } catch (e) { /* 離線：先存本機，名片之後再上傳 */ }
  S.save.nick = v; save(); schedProfile(true); S.nickEdit = false; net.startPresence(v); frStartListening(); flash('已儲存遊戲 ID'); if (afterOk) afterOk(); render();
}
function friendRow(f, mine) {
  const open = S.friendOpen === f.code;
  const cards = (f.starters || []).map((s, i) => { const c = s && S.db.cards[s.k];
    return `<div class="fr-card"><small>${SLOTS[i]}</small>${c ? cardSVG(c, { plus: s.p || 0 }) : `<div class="fr-empty">${s ? esc(shortName(s.n)) : '—'}</div>`}</div>`; }).join('');
  return `<div class="fr ${open ? 'open' : ''}">
    <button class="fr-head" data-act="friend" data-code="${esc(f.code)}"><b>${esc(f.nick || '（未取 ID）')}</b>${f.test ? '<em>測試</em>' : ''}${presTag(f.code)}
      <span>經理 Lv.${f.mgr}</span>${S.save.frRec && S.save.frRec[f.code] ? `<span class="rec">友誼賽 ${S.save.frRec[f.code].w} 勝 ${S.save.frRec[f.code].l} 敗</span>` : ''}<span>戰力 <b class="pw">${f.power.toFixed(1)}</b></span><span>${f.cards} 張卡</span><small>${agoText(f.updatedAt)}</small><i>${open ? '▲' : '▼'}</i></button>
    ${open ? `<div class="fr-body"><div class="fr-cards">${cards}</div>${mine && (S.online || {})[f.code] && (S.online[f.code].ver || 'dev') === net.appVer() ? `<button class="btn sm gold" data-act="frinvite" data-code="${esc(f.code)}">邀請友誼賽</button>` : ''}${mine && (S.online || {})[f.code] && (S.online[f.code].ver || 'dev') !== net.appVer() ? '<small class="muted">雙方遊戲版本不同，請兩人都更新到最新版才能打友誼賽</small>' : ''}${mine ? `<button class="btn sm" data-act="unfriend" data-code="${esc(f.code)}">${S.confirm === 'unf' + f.code ? '再按一次：移除好友' : '移除好友'}</button>` : ''}</div>` : ''}</div>`;
}
// 上線狀態：上線中（綠點）／版本不同／幾分鐘前上線
function presTag(code) {
  const on = (S.online || {})[code], seen = (S.seen || {})[code];
  if (on) return (on.ver || 'dev') === net.appVer() ? '<em class="on">● 上線中</em>' : '<em class="old">● 上線中・版本不同</em>';
  return seen ? `<em class="off">${agoText(seen.at)}上線</em>` : '';
}
const presRank = (code) => (S.online || {})[code] ? 2e13 : ((S.seen || {})[code] || {}).at || 0;
function renderFriends() {
  if (!S.presT) S.presT = setInterval(() => { if (S.screen !== 'friends') { clearInterval(S.presT); S.presT = null; return; }
    net.presenceAll().then(m => { S.online = m.on; S.seen = m.all; if (S.screen === 'friends' && !document.querySelector('input:focus')) render(); }).catch(() => {}); }, 30000);   // 好友頁開著時每 30 秒更新一次
  if (!S.friends && !S.friendsBusy && !S.friendsErr) loadFriends();
  else if (S.friendsAt && Date.now() - S.friendsAt > 60000 && !S.friendsBusy) loadFriends();
  const head = topbar('好友', S.save.nick ? `我的 ID：${esc(S.save.nick)}` : '');
  // 一進來還沒取 ID：先強制取 ID
  if (!S.save.nick || S.nickEdit) {
    app.innerHTML = `${head}<main class="body">${tabs('friends')}<section class="panel main nick-gate">
      <div class="ng-box"><b class="h">${S.save.nick ? '修改遊戲 ID' : '先取一個遊戲 ID'}</b>
        <p>好友會用這個 ID 找到你、看到你的陣容和進度。最多 12 個字，不能和別人重複。</p>
        <input class="search" id="nick-in2" maxlength="12" placeholder="例如：林襄最愛的經理" value="${esc(S.save.nick || '')}">
        <div class="set-btns"><button class="btn gold" data-act="setnick2">確定</button>${S.save.nick ? '<button class="btn" data-act="nickcancel">取消</button>' : ''}</div></div></section></main>${toast()}`;
    return;
  }
  const all = (S.friends || []).filter(p => p.code !== cloud.myCode());
  const mine = new Set(S.save.friends || []);
  const friends = all.filter(p => mine.has(p.code)).sort((x, y) => presRank(y.code) - presRank(x.code) || y.updatedAt - x.updatedAt);   // 上線中的排最前面
  const others = all.filter(p => !mine.has(p.code) && p.nick).sort((x, y) => presRank(y.code) - presRank(x.code) || y.updatedAt - x.updatedAt);
  const onN = friends.filter(f => (S.online || {})[f.code]).length;
  const status = S.friendsErr ? `<small class="bad">${esc(S.friendsErr)}</small>` : (!S.friends ? '<small class="muted">讀取中…</small>' : '');
  app.innerHTML = `${head}<main class="body">${tabs('friends')}
    <section class="panel main fr-main"><div class="sm-head"><small class="label">我的好友 ${friends.length}${onN ? `・<span class="on-n">${onN} 位上線中</span>` : ''}</small><button class="chip" data-act="friendsreload">${S.friendsBusy ? '讀取中…' : '重新整理'}</button></div>
      ${status}<div class="fr-list">${friends.map(f => friendRow(f, true)).join('') || (S.friends ? '<small class="muted">還沒有好友。右邊輸入對方的遊戲 ID，或從「其他玩家」直接加入。</small>' : '')}</div></section>
    <aside class="panel side fr-side">
      <div class="set-row"><span>我的遊戲 ID</span><b>${esc(S.save.nick)}</b></div><button class="btn sm" data-act="nickedit">修改 ID</button>
      <small class="label">加好友</small><input class="search" id="add-in" maxlength="12" placeholder="輸入對方的遊戲 ID"><button class="btn blue" data-act="addfriend">加入好友</button>
      <small class="label">其他玩家</small><div class="fr-others">${others.map(p => `<div class="fo"><span><b>${esc(p.nick)}</b>${presTag(p.code)}<small>Lv.${p.mgr} · 戰力 ${p.power.toFixed(1)}</small></span><button class="btn sm gold" data-act="addfriend" data-code="${esc(p.code)}">加好友</button></div>`).join('') || '<small class="muted">沒有其他玩家</small>'}</div>
    </aside></main>${toast()}`;
}

// ---------- 好友連線友誼賽（6 分鐘、同分開打、雙方真人操作） ----------
let frInvL = null, frWait = null;
function frRoster() {   // 我的隊伍 1：能力值含教練加成；體力全滿
  const side = mySide(), ZH = { sc: '得分', ins: '內線', thr: '外線', ft: '罰球', pm: '組織', reb: '籃板', de: '防守', sta: '耐力' }, fx = FX();
  const toD = (p) => { const c = p.key && S.db.cards[p.key]; return { n: p.short || p.name, full: p.name, pos: (c && c.pos) || 'F', a: Object.fromEntries(Object.entries(ZH).map(([k, zh]) => [zh, Math.round(p.ab[k])])), ovr: c ? c.ovr + .65 * ENH_TOTAL[plusOfKey(p.key)] : 70, tier: c ? c.tier : '銀', img: (c && artSrc(c)) || '', st: 1, tr: c ? unlockedTraits(c, plusOfKey(p.key)) : [] }; };
  const ps = side.team.players.map(toD);
  return { nick: S.save.nick || '我', me: ps.slice(0, 5), bench: ps.slice(5), fx: { style: fx.style || {}, gauge: fx.gauge || 0, stam: fx.stam || 0, toRec: fx.toRec || 0 }, to: 2 + (fx.timeouts > 0 ? 1 : 0) };
}
function frStartListening() {   // 開著遊戲時，隨時可以收到好友的邀請
  if (frInvL || !cloud.cloudOn() || !cloud.myCode() || !S.save || !S.save.nick) return;
  net.startPresence(S.save.nick);
  frInvL = net.listenInvites((from, v) => { if (!v || !v.room || Date.now() - (v.at || 0) > 60000 && v.at > 1e12) return; frShowInvite(from, v); });
}
function frShowInvite(from, v) {
  if ((v.ver || 'dev') !== net.appVer()) { net.clearInvite(from); net.answerInvite(v.room, false, null, 'version').catch(() => {}); return flash(`${v.nick || '好友'} 邀請你打友誼賽，但雙方遊戲版本不同，請先更新到最新版`); }
  if (document.getElementById('liveWrap') || document.querySelector('.fr-inv')) return net.clearInvite(from);
  const el = document.createElement('div'); el.className = 'exit-ask fr-inv';
  el.innerHTML = `<div class="ea-box"><b>${esc(v.nick || '好友')} 邀請你打友誼賽</b><small>6 分鐘、同分開打，雙方用各自的隊伍 1 即時對戰。<br>不給遊戲幣，只記錄你們之間的勝負。</small>
    <div class="btns"><button class="btn blue" data-x="no">拒絕</button><button class="btn gold" data-x="ok">接受</button></div></div>`;
  document.body.appendChild(el);
  const t = setTimeout(() => { el.remove(); }, 30000);
  el.addEventListener('click', async (e) => { const x = e.target.closest('[data-x]'); if (!x) return; clearTimeout(t); el.remove(); net.clearInvite(from);
    if (x.dataset.x === 'no') return net.answerInvite(v.room, false).catch(() => {});
    try { const mine = frRoster(); await net.answerInvite(v.room, true, mine); const room = await net.rget(`rooms/${v.room}`);
      if (!room || !room.lineup_h) return flash('對方已取消邀請'); frLaunch('guest', v.room, mine, room.lineup_h, from, 0);
    } catch (err) { flash(err.message); } });
}
async function frInvite(code) {
  if (frWait) return;
  const mine = frRoster(), roomId = cloud.myCode() + '-' + Date.now().toString(36);
  try { await net.sendInvite(code, roomId, mine); } catch (e) { return flash(e.message); }
  const el = document.createElement('div'); el.className = 'exit-ask fr-inv';
  const nick = ((S.friends || []).find(f => f.code === code) || {}).nick || '好友';
  el.innerHTML = `<div class="ea-box"><b>已邀請 ${esc(nick)}</b><small>等待對方接受…（30 秒內沒回應會自動取消）</small><div class="btns"><button class="btn blue" data-x="cancel">取消邀請</button></div></div>`;
  document.body.appendChild(el);
  const stop = (msg) => { if (!frWait) return; clearTimeout(frWait.t); frWait.es.then(es => es && es.close()); frWait = null; el.remove(); if (msg) flash(msg); };
  frWait = { t: setTimeout(() => { stop('對方沒有回應，已取消邀請'); net.cancelInvite(code, roomId); }, 30000),
    es: net.rstream(`rooms/${roomId}/answer`, async (p, ans) => { if (ans === 'reject' || ans === 'version') { stop(ans === 'version' ? '雙方遊戲版本不同，請兩人都更新到最新版' : '對方拒絕了邀請'); net.cancelInvite(code, roomId); }
      else if (ans === 'accept') { stop(); const room = await net.rget(`rooms/${roomId}`).catch(() => null); if (!room || !room.lineup_g) return flash('連線失敗');
        const rtt = await net.measureRtt().catch(() => 150); frLaunch('host', roomId, mine, room.lineup_g, code, rtt); } }) };
  el.addEventListener('click', (e) => { if (e.target.closest('[data-x="cancel"]')) { stop(); net.cancelInvite(code, roomId); } });
}
function frLaunch(role, roomId, mine, theirs, theirCode, rtt) {
  const tr = net.transport(roomId, role, Math.round(Math.min(400, rtt || 0)));   // 房主自己的操作延遲＝量到的往返延遲，跟對方送過來的延遲相當
  window.__LIVE = {
    data: { me: mine.me, op: theirs.me }, bench: { me: mine.bench, op: theirs.bench },
    names: { me: mine.nick, op: theirs.nick || '好友' },
    col: { me: { ring: '#3FA0FF', shorts: '#1D428A', trim: '#FDB927', sleeve: '#1D428A' }, op: { ring: '#FF5A4A', shorts: '#860038', trim: '#FDBB30', sleeve: '#5A0020' } },
    score: [0, 0], lv: 1, timeouts: mine.to, timeouts2: theirs.to, fx: mine.fx && mine.fx.style ? mine.fx : { style: mine.fx || {} }, fx2: theirs.fx && theirs.fx.style ? theirs.fx : { style: theirs.fx || {} }, clock: 360, period: '友誼賽',
    energy: { me: [1, 1, 1, 1, 1], op: [1, 1, 1, 1, 1] }, net: tr,
    done: (res) => { tr.close(); const w = document.getElementById('liveWrap'); if (w) w.remove(); frResult(theirCode, theirs.nick, res); },
  };
  const w = document.createElement('div'); w.id = 'liveWrap'; w.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#071022';
  w.innerHTML = '<iframe src="live.html" title="友誼賽" style="border:0;width:100%;height:100%;display:block"></iframe>';
  document.body.appendChild(w);
}
function frResult(code, nick, res) {
  liveQuestEvents(res.stats); if (res.net !== 'lost') questEvent('friendly');
  S.save.frRec = S.save.frRec || {}; const r = S.save.frRec[code] = S.save.frRec[code] || { w: 0, l: 0, d: 0 };
  if (res.net === 'lost') { flash('連線中斷，這場不計勝負'); return render(); }
  let msg;
  if (res.net === 'quit-me') { r.l++; msg = `你投降了，記為敗場（對 ${nick}：${r.w} 勝 ${r.l} 敗）`; }
  else if (res.net === 'quit-op') { r.w++; msg = `${nick} 投降，你贏了！（${r.w} 勝 ${r.l} 敗）`; }
  else { const [a, b] = res.score; if (a > b) r.w++; else if (a < b) r.l++; else r.d++; msg = `友誼賽 ${a}：${b}，${a > b ? '你贏了！' : a < b ? '輸了，再接再厲' : '平手'}（對 ${nick}：${r.w} 勝 ${r.l} 敗${r.d ? ` ${r.d} 和` : ''}）`; }
  save(); flash(msg); render();
}



// ---------- 每日／每週任務 ----------
function questState() {
  const Q = S.save.quests = S.save.quests || {}, d = today(), w = weekKey(new Date(d + 'T00:00:00'));
  if (Q.day !== d) { Q.day = d; Q.daily = pickQuests(DAILY_POOL, DAILY_N, 'd' + d); Q.reroll = false; }
  if (Q.week !== w) { Q.week = w; Q.weekly = pickQuests(WEEKLY_POOL, WEEKLY_N, 'w' + w, cloud.cloudOn() ? [] : ['w_friend']); Q.days = []; Q.attend = false; }   // 沒有雲端（沒有好友）就不出友誼賽任務
  return Q;
}
function questEvent(ev, n = 1) {   // 比賽結束、開卡包、強化等時候呼叫
  if (!S.save || !n) return; const Q = questState(); let hit = false;
  for (const q of Q.daily.concat(Q.weekly)) { const D = questDef(q.id); if (D && D.ev === ev && q.p < D.n) { q.p = Math.min(D.n, q.p + n); hit = true; } }
  if (hit) { if (Q.daily.every(q => q.p >= questDef(q.id).n) && !Q.days.includes(Q.day)) Q.days.push(Q.day); save(); }
}
const questClaimable = () => { if (!S.save) return 0; const Q = questState(); return Q.daily.concat(Q.weekly).filter(q => !q.claimed && q.p >= questDef(q.id).n).length + (Q.days.length >= ATTEND_DAYS && !Q.attend ? 1 : 0) + (giftReady() ? 1 : 0); };
function liveQuestEvents(st) { if (!st) return; const m = st.me || {}; questEvent('perf', m.perf || 0); questEvent('three', m.fg3m || 0); questEvent('def', (m.stl || 0) + (m.blk || 0)); questEvent('sig', m.sig || 0); }
function renderQuests() {
  const Q = questState();
  const row = (q, kind) => { const D = questDef(q.id), done = q.p >= D.n, pct = Math.round(q.p / D.n * 100);
    return `<div class="q-row ${q.claimed ? 'claimed' : done ? 'ready' : ''}"><div class="q-main"><b>${D.t}</b><div class="q-bar"><i style="width:${pct}%"></i></div><small>${q.p} / ${D.n}</small></div>
      <span class="q-r"><i class="coin"></i>${fmt(D.r)}</span>
      ${q.claimed ? '<span class="q-done">已領取</span>' : done ? `<button class="btn gold sm" data-act="qclaim" data-id="${q.id}" data-k="${kind}">領取</button>` : (kind === 'd' && !Q.reroll ? `<button class="btn sm" data-act="qreroll" data-id="${q.id}">換一個</button>` : '<span class="q-done muted">進行中</span>')}</div>`; };
  const att = Q.days.length;
  app.innerHTML = `${topbar('任務', '每日任務每天重置；每週任務每週一重置')}
  <main class="body">${tabs('quests')}
    <section class="panel main q-wrap"><div class="q-head"><b>每日任務</b><small>${Q.reroll ? '今天已換過任務' : '每天可以免費換 1 個任務'}</small></div>${Q.daily.map(q => row(q, 'd')).join('')}
      <div class="q-head"><b>每週任務</b><small>本週到 ${weekEnd(Q.week)}</small></div>${Q.weekly.map(q => row(q, 'w')).join('')}</section>
    <aside class="panel side"><b class="h">本週全勤</b><p class="muted">一週內有 ${ATTEND_DAYS} 天完成全部每日任務，送特殊卡包兌換券 1 張。</p>
      <div class="q-days">${Array.from({ length: 7 }, (_, k) => `<i class="${k < att ? 'on' : ''}"></i>`).join('')}</div><b>${att} / ${ATTEND_DAYS} 天</b>
      ${Q.attend ? '<span class="q-done">本週已領取</span>' : `<button class="btn gold" data-act="qattend" ${att >= ATTEND_DAYS ? '' : 'disabled'}>領取特殊卡包兌換券</button>`}${giftPanel()}</aside>
  </main>${toast()}`;
}
const weekEnd = (w) => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() + 6); return `${d.getMonth() + 1}/${d.getDate()}`; };


// ---------- 新秀週禮：上週賽季贏 10 場以上 → 自選 1 張綠卡；贏 30 場以上再多送 1 張隨機綠卡（依模擬決定） ----------
const GIFT_PICK = 10, GIFT_BONUS = 30;
function giftState() {
  const G = S.save.gift = S.save.gift || {}, w = weekKey(new Date(today() + 'T00:00:00'));
  if (G.wk !== w) { if (G.wk) { G.claimWk = G.wk; G.claimWins = G.wins || 0; G.claimed = false; } G.wk = w; G.wins = 0; }
  return G;
}
const giftReady = () => { if (!S.save || !greenReady()) return false; const G = giftState(); return !!G.claimWk && !G.claimed && (G.claimWins || 0) >= GIFT_PICK; };
function giftPanel() {
  const G = giftState(), wins = G.wins || 0;
  const now = `<small class="muted">本週已贏 ${wins} 場（${wins >= GIFT_BONUS ? '已達自選＋隨機' : wins >= GIFT_PICK ? `已達自選，再贏 ${GIFT_BONUS - wins} 場多送 1 張` : `再贏 ${GIFT_PICK - wins} 場可得自選綠卡`}）</small>`;
  if (!greenReady()) return `<div class="divider"></div><b class="h">新秀週禮</b><p class="muted">新賽季第一次週結算後開放。每週賽季贏 ${GIFT_PICK} 場送自選綠卡 1 張，贏 ${GIFT_BONUS} 場再送隨機 1 張。</p>${now}`;
  const can = giftReady();
  return `<div class="divider"></div><b class="h">新秀週禮</b><p class="muted">每週賽季贏 ${GIFT_PICK} 場：下週可自選 1 張綠卡；贏 ${GIFT_BONUS} 場：再多送 1 張隨機綠卡。</p>
    ${G.claimWk ? `<small>上週贏 ${G.claimWins || 0} 場</small>` : ''}
    ${can ? `<button class="btn gold" data-act="giftpick">挑選本週的綠卡</button>` : G.claimWk && G.claimed ? '<span class="q-done">上週的禮物已領取</span>' : ''}${now}`;
}
function renderGiftPick() {
  const G = giftState(), list = (S.db.byTier['綠'] || []).slice().sort((a, b) => b.ovr - a.ovr);
  app.innerHTML = `${topbar('新秀週禮', `上週贏 ${G.claimWins || 0} 場：自選 1 張${(G.claimWins || 0) >= GIFT_BONUS ? '＋隨機 1 張' : ''}`)}
  <main class="body">${tabs('quests')}<section class="panel main"><div class="sm-head"><small class="label">挑一位你看好的新秀（依本週總評排序）</small><button class="btn sm" data-act="giftback">返回任務</button></div>
    <div class="coll-grid">${list.map(c => `<button class="coll-card" data-act="giftget" data-key="${esc(c.key)}">${cardSVG(c)}<span class="price">${c.year === 2 ? '二年級' : '新秀'}</span></button>`).join('')}</div></section></main>${toast()}`;
}


// ---------- 開發者：所有玩家狀況（只有開啟開發者模式的裝置看得到） ----------
async function loadDevPlayers() {
  S.dev = { busy: true }; render();
  try {
    const [saves, profs, invs, pres] = await Promise.all([cloud.listSaves(), cloud.listProfiles().catch(() => []), cloud.listInvites().catch(() => []), net.presenceAll().catch(() => ({ on: {}, all: {} }))]);
    S.online = pres.on; S.seen = pres.all;
    S.dev = { list: saves, profs: Object.fromEntries(profs.map(p => [p.code, p])), invs: Object.fromEntries(invs.map(i => [i.code, i])), at: Date.now() };
  } catch (e) { S.dev = { err: e.message === '沒有權限' ? '沒有讀取權限：Firestore 規則的 saves 需要允許擁有者讀取（見說明）' : e.message }; }
  render();
}
function devRow(x) {
  const d = x.data || {}, P = (S.dev.profs || {})[x.code] || {}, I = (S.dev.invs || {})[x.code] || {}, seen = (S.seen || {})[x.code];
  const tiers = { '黑': 0, '紫': 0, '紅': 0, '綠': 0 }; for (const o of d.cards || []) { const c = S.db.cards[o.key]; if (c && tiers[c.tier] != null) tiers[c.tier]++; }
  const se = d.season, sd = se ? `${se.team} ${SEASON_DIFF[se.diff || 0].name}・第 ${(se.games || []).length} 場` : '—';
  const inf = d.inf ? (d.inf.best || 0) : 0, beaten = Object.keys((d.hist || {}).beaten || {}), legN = beaten.filter(k => k.startsWith('legend|')).length;
  const clutchS = Object.values(d.clutch || {}).reduce((a, b) => a + b, 0), q = d.quests || {}, qd = (q.day === today() ? (q.daily || []).filter(z => z.claimed).length : 0);
  const st = (S.online || {})[x.code] ? '<em class="on">● 上線中</em>' : seen ? `<small>${agoText(seen.at)}</small>` : '<small class="muted">—</small>';
  return `<tr><td><b>${esc(I.name || '')}</b><br><small class="muted">${esc(x.code)}</small></td><td>${esc(d.nick || P.nick || '—')}${P.test ? ' <em>測試</em>' : ''}</td><td>${st}<br><small class="muted">${esc((seen && seen.ver) || '')}</small></td>
    <td>Lv.${(d.mgr || {}).lv || 1}</td><td>${fmt(d.coins || 0)}</td><td>${(d.cards || []).length}<br><small>黑${tiers['黑']} 紫${tiers['紫']} 紅${tiers['紅']} 綠${tiers['綠']}</small></td>
    <td>${P.power ? P.power.toFixed(1) : '—'}</td><td><small>${sd}</small></td><td>${inf}</td><td>${beaten.length - legN}／${legN}</td><td>${clutchS}</td><td>${qd}/3</td>
    <td><small>${x.updatedAt ? agoText(x.updatedAt) : '—'}</small></td></tr>`;
}
function renderDevPlayers() {
  if (!devOn()) { S.screen = 'settings'; return renderSettings(); }
  const D = S.dev || {};
  const rows = (D.list || []).slice().sort((a, b) => presRank(b.code) - presRank(a.code) || b.updatedAt - a.updatedAt).map(devRow).join('');
  const onN = (D.list || []).filter(x => (S.online || {})[x.code]).length;
  app.innerHTML = `${topbar('玩家狀況（開發者）', D.list ? `共 ${D.list.length} 位玩家・${onN} 位上線中` : '')}
  <main class="body"><section class="panel main dev-wrap"><div class="sm-head"><small class="label">只有開啟開發者模式的裝置看得到這一頁</small><button class="chip" data-act="devplayers">${D.busy ? '讀取中…' : '重新整理'}</button></div>
    ${D.err ? `<p class="bad">${esc(D.err)}</p>` : ''}
    ${D.list ? `<div class="tele-wrap"><table class="tele dev-t"><tr><th>邀請碼給誰</th><th>遊戲 ID</th><th>狀態／版本</th><th>經理</th><th>遊戲幣</th><th>卡片</th><th>隊伍 1 戰力</th><th>賽季</th><th>無限最高</th><th>歷史／傳奇擊敗</th><th>關鍵時刻★</th><th>今日任務</th><th>最後存檔</th></tr>${rows}</table></div>` : D.busy ? '<p class="muted">讀取中…</p>' : ''}
  </section></main>${toast()}`;
}

// ---------- 關鍵時刻挑戰 ----------
function clutchUnlocked(i) { if (i === 0) return true; const prev = CLUTCH[i - 1]; return ((S.save.clutch || {})[prev.id] || 0) > 0; }
function renderClutch() {
  const got = S.save.clutch || {}, total = CLUTCH.reduce((a, l) => a + (got[l.id] || 0), 0);
  const star = (n) => `<span class="cl-stars">${[0, 1, 2].map(k => `<i class="${k < n ? 'on' : ''}">★</i>`).join('')}</span>`;
  const chs = CLUTCH_CH.map(ch => {
    const lvs = CLUTCH.map((l, i) => ({ l, i })).filter(x => x.l.ch === ch.id);
    const chStars = lvs.reduce((a, x) => a + (got[x.l.id] || 0), 0);
    return `<section class="cl-ch"><div class="cl-head"><b>${ch.name}</b><small>${ch.desc}</small><span class="cl-sum">${chStars} / ${lvs.length * 3} ★${(S.save.clutchCh || {})[ch.id] ? '・已領章節獎勵' : '・集滿送特殊卡包券'}</span></div>
      <div class="cl-row">${lvs.map(({ l, i }) => { const open = clutchUnlocked(i), n = got[l.id] || 0;
        return `<div class="cl-lv ${open ? '' : 'lock'} ${n ? 'done' : ''}"><b>${i + 1}. ${esc(l.name)}</b>${star(n)}<p>${esc(l.intro)}</p>
          <small>★ 贏球　★ ${CLUTCH_STAR[l.stars[0]]}　★ ${CLUTCH_STAR[l.stars[1]]}</small>
          <small class="muted">首次每顆星 ${fmt(ch.coin)}</small>
          ${open ? `<button class="btn ${n ? 'blue' : 'gold'} sm" data-act="clplay" data-id="${l.id}">${n ? '再挑戰' : '開始'}</button>` : '<button class="btn sm" disabled>完成上一關後開放</button>'}</div>`; }).join('')}</div></section>`; }).join('');
  app.innerHTML = `${topbar('關鍵時刻', `已拿 ${total} / ${CLUTCH.length * 3} 顆星`)}
  <main class="body">${tabs('clutch')}<section class="panel main cl-wrap">${chs}</section></main>${toast()}`;
}
function clutchOpp(l, myPower) {
  const ch = CLUTCH_CH.find(c => c.id === l.ch), target = myPower + ch.gap;
  let side;
  if (l.legend != null) { const L = legendTeams(S.db).slice().sort((a, b) => b.power - a.power); side = legendSide(S.db, L[Math.min(l.legend, L.length - 1)]); }
  else side = buildSide(l.opp, realRoster(S.db, l.opp));
  const d = target - side.power; for (const p of side.team.players) for (const k of Object.keys(p.ab)) p.ab[k] += d;   // 調到「你的戰力 + 差距」
  side.power = target; return side;
}
function startClutch(id) {
  const err = limitError(); if (err) return flash(err);
  const l = CLUTCH.find(x => x.id === id), mine = mySide(), opp = clutchOpp(l, mine.power), fx = FX();
  const ZH = { sc: '得分', ins: '內線', thr: '外線', ft: '罰球', pm: '組織', reb: '籃板', de: '防守', sta: '耐力' };
  const toD = (p, isMe, st) => { const c = p.key && S.db.cards[p.key];
    return { n: p.short || p.name, full: p.name, pos: (c && c.pos) || 'F', a: Object.fromEntries(Object.entries(ZH).map(([k, zh]) => [zh, Math.round(p.ab[k])])), ovr: c ? (isMe ? c.ovr + .65 * ENH_TOTAL[plusOfKey(p.key)] : c.ovr) : 70, tier: c ? c.tier : '銀', img: (c && artSrc(c)) || '', st,
      tr: c ? (isMe ? unlockedTraits(c, plusOfKey(p.key)) : oppTraits(c, l.ch >= 3 ? 1 : 0)) : [] }; };
  const mp = mine.team.players, op = opp.team.players, base = 100, sc = l.diff >= 0 ? [base + l.diff, base] : [base, base - l.diff];
  const timeouts = l.to != null ? l.to : 2 + (fx.timeouts > 0 ? 1 : 0);
  window.__LIVE = {
    data: { me: mp.slice(0, 5).map(p => toD(p, true, l.st[0])), op: op.slice(0, 5).map(p => toD(p, false, l.st[1])) },
    bench: { me: mp.slice(5).map(p => toD(p, true, .9)), op: op.slice(5).map(p => toD(p, false, .9)) },
    names: { me: mine.team.abbr || '我方', op: opp.team.abbr || '對手' },
    col: { me: { ring: '#3FA0FF', shorts: '#1D428A', trim: '#FDB927', sleeve: '#1D428A' }, op: { ring: '#FF5A4A', shorts: '#860038', trim: '#FDBB30', sleeve: '#5A0020' } },
    score: sc, lv: l.ch >= 3 ? 1 : 0, timeouts, clock: l.clock, period: '關鍵時刻',
    fx: { style: fx.style || {}, gauge: fx.gauge || 0, stam: fx.stam || 0, toRec: fx.toRec || 0 },
    energy: { me: [0, 1, 2, 3, 4].map(() => l.st[0]), op: [0, 1, 2, 3, 4].map(() => l.st[1]) },
    clutch: { poss: l.poss, shot: l.shot, title: `${CLUTCH_CH.find(c => c.id === l.ch).name}・${l.name}`, intro: l.intro },
    done: (res) => { const w = document.getElementById('liveWrap'); if (w) w.remove(); clutchResult(l, res, sc[1]); },
  };
  const w = document.createElement('div'); w.id = 'liveWrap'; w.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#071022';
  w.innerHTML = '<iframe src="live.html" title="關鍵時刻" style="border:0;width:100%;height:100%;display:block"></iframe>';
  document.body.appendChild(w);
}
function clutchResult(l, res, startOp) {
  const R = clutchStars(l, res, startOp), ch = CLUTCH_CH.find(c => c.id === l.ch);
  liveQuestEvents(res.stats); if (R.n) { questEvent('clutch'); questEvent('clutchStar', R.n); }
  S.save.clutch = S.save.clutch || {}; const before = S.save.clutch[l.id] || 0;
  if (!R.n) { flash(res.quit ? '已放棄挑戰' : `挑戰失敗（${res.score[0]}：${res.score[1]}），再試一次！`); return render(); }
  const add = Math.max(0, R.n - before), coin = add * ch.coin; S.save.clutch[l.id] = Math.max(before, R.n); S.save.coins += coin;
  let msg = `${l.name} 完成！${'★'.repeat(R.n)}${'☆'.repeat(3 - R.n)}${coin ? `，獲得 ${fmt(coin)} 遊戲幣` : '（已拿過的星星不再給遊戲幣）'}`;
  const all = CLUTCH.filter(x => x.ch === l.ch).every(x => (S.save.clutch[x.id] || 0) >= 3);
  S.save.clutchCh = S.save.clutchCh || {};
  if (all && !S.save.clutchCh[l.ch]) { S.save.clutchCh[l.ch] = true; S.save.vouchers = S.save.vouchers || {}; S.save.vouchers.special = (S.save.vouchers.special || 0) + 1; msg += `｜${ch.name}全部 3 星，獲得特殊卡包兌換券 1 張！`; }
  save(); flash(msg); render();
}

function renderSettings() {
  const ready = cloudReady(), dev = devOn();
  const hist = S.hist ? S.hist.map(h => `<div class="hist ${S.confirm === h.sha ? 'warn-row' : ''}"><span>${fmtTime(h.date)}</span><small>${esc(h.msg.split(' · ')[0])}</small>
      <button class="btn sm ${S.confirm === h.sha ? 'red' : ''}" data-act="restore" data-sha="${h.sha}">${S.confirm === h.sha ? '確定還原' : '還原'}</button></div>`).join('') || '<small class="muted">還沒有任何備份</small>'
    : `<button class="btn sm" data-act="loadhist" ${ready ? '' : 'disabled'}>讀取備份紀錄</button>`;
  const toggle = (label, on, act) => `<div class="set-row"><span>${label}</span><button class="chip ${on ? 'on' : ''}" data-act="${act}">${on ? '開啟' : '關閉'}</button></div>`;
  // 一般玩家：只有畫面設定與說明；存檔只存在這台裝置（不能回溯）
  // 開發者（輸入密碼的裝置）：雲端備份、備份紀錄與還原、匯出匯入、測試模式
  const devCards = (dev && cloud.cloudOn() ? `<div class="set-card"><b class="h">玩家狀況（開發者）</b><p class="muted">查看所有玩家的上線狀態、版本、經理等級、遊戲幣、卡片、賽季與各模式進度。</p><div class="set-btns"><button class="btn gold" data-act="devplayers">打開玩家狀況</button></div></div>` : '') + (dev ? `<div class="set-card"><b class="h">雲端備份（開發者）</b>
      <div class="set-row"><span>狀態</span><b class="${ready ? 'ok' : 'bad'}">${ready ? '已設定' : '未設定'}</b></div>
      <div class="set-row"><span>上次備份</span><b>${fmtTime(lastBackup())}</b></div>
      ${ready ? `<div class="set-btns"><button class="btn gold" data-act="backupnow">立即備份</button><button class="btn" data-act="clearkey">移除金鑰</button></div>`
        : `<input class="search" id="bk-repo" placeholder="備份 repo（帳號/My-NBA-Game-Save）" value="${esc((window.GAME_CONFIG || {}).saveRepo || '')}"><input class="search" id="bk-token" type="password" placeholder="貼上備份金鑰（只存在這台裝置）"><div class="set-btns"><button class="btn blue" data-act="setkey">儲存金鑰</button></div>`}
      <small class="muted">有金鑰時，遊戲中每隔 1 小時自動備份一次。</small></div>
    <div class="set-card"><b class="h">匯出／匯入（開發者）</b><div class="set-btns"><button class="btn blue" data-act="export">匯出存檔</button><label class="btn">匯入存檔<input type="file" accept=".json,application/json" data-act="import" hidden></label></div>
      ${S.pendingImport ? `<button class="btn red" data-act="importgo">確定用匯入的存檔取代目前進度</button>` : ''}</div>
    ${cloud.cloudOn() ? `<div class="set-card"><b class="h">邀請碼管理（擁有者）</b>
      <div class="set-row"><span>我的雲端 UID</span><b class="uid">${esc(cloud.myUid() || '尚未登入')}</b></div>${cloud.myUid() ? '' : '<div class="set-btns"><button class="btn" data-act="cloudsignin">登入雲端取得 UID</button></div>'}
      <input class="search" id="inv-name" placeholder="朋友的名字（方便辨認）"><div class="set-btns"><button class="btn gold" data-act="mkinvite">產生邀請碼</button><button class="btn" data-act="listinvites">查看全部邀請碼</button></div>
      ${S.newInvite ? `<div class="set-row"><span>新的邀請碼</span><b class="inv-new">${S.newInvite}</b></div>` : ''}
      ${cloud.myCode() ? '' : `<input class="search" id="inv-code" placeholder="輸入自己的邀請碼，把目前進度存到雲端"><div class="set-btns"><button class="btn blue" data-act="invgo">綁定我的邀請碼</button></div>`}
      ${S.invites ? S.invites.map(v => `<div class="set-row"><span>${esc(v.name || '（未命名）')}${v.nick ? `<small class="muted">（${esc(v.nick)}）</small>` : ''}</span><b>${v.code}</b><small class="${v.used ? 'ok' : 'muted'}">${v.used ? '已使用' : '未使用'}</small></div>`).join('') || '<small class="muted">還沒有邀請碼</small>' : ''}</div>` : ''}
    <div class="set-card"><b class="h test-h">開發者功能</b>${toggle('測試模式（遊戲幣與點數無限、不限每日次數）', testOn(), 'testmode')}
      <div class="set-btns"><button class="btn red" data-act="resetgame">${S.confirm === 'reset' ? '再按一次：清除進度' : '重置遊戲'}</button><button class="btn" data-act="devlock">鎖定開發者功能</button></div></div>` : '');
  app.innerHTML = `${topbar('設定')}
  <main class="body"><section class="panel s-left set-col">
      <div class="set-card"><b class="h">畫面</b>
        ${toggle('省電模式', ecoOn(), 'toggleeco')}<small class="muted">卡片背景特效靜止；開卡包、強化、得分動畫照常</small>
        ${toggle('進場與離場動畫', (S.save.settings || {}).cine !== false, 'togglecine')}
</div>
      <div class="set-card"><b class="h">遊戲</b><div class="set-btns"><button class="btn blue" data-act="openhelp">遊戲說明</button><button class="btn blue" data-act="tutorial">新手教學</button></div>
        <small class="muted">${cloud.cloudOn() && cloud.myCode() ? '進度會自動存到雲端，只保留最新一份，無法回溯。' : '進度存在這台裝置上，無法回溯；刪除遊戲會清除進度。'}</small></div>
      ${cloud.cloudOn() && cloud.myCode() ? `<div class="set-card"><b class="h">帳號</b><div class="set-row"><span>邀請碼</span><b>${esc(cloud.myCode().slice(0, 4))}••••</b></div>${S.save && S.save.testAccount ? `<div class="set-row"><span>帳號類型</span><b>測試帳號</b></div>` : ''}
        <div class="set-row"><span>遊戲 ID</span><b>${S.save && S.save.nick ? esc(S.save.nick) : '<span class="muted">尚未設定</span>'}</b></div>
        <input class="search" id="nick-in" maxlength="12" placeholder="輸入遊戲 ID（最多 12 字，好友會看到）" value="${esc((S.save && S.save.nick) || '')}"><div class="set-btns"><button class="btn blue" data-act="setnick">儲存遊戲 ID</button></div>
        <small class="muted">換手機時在新手機輸入同一組邀請碼即可接回進度。</small>
        <div class="set-btns"><button class="btn red" data-act="restart">${S.confirm === 'restart' ? '再按一次：清除進度並重新開始' : '重新開始（2 天一次）'}</button></div></div>` : ''}
      ${devCards}
      <small class="muted ver" data-act="vertap">My NBA Game 版本 ${(window.GAME_CONFIG || {}).version || '開發版'}</small>
    </section>
    ${dev ? `<section class="panel s-mid"><div class="sm-head"><small class="label">雲端備份紀錄（最近 20 次）</small>${S.hist ? '<button class="chip" data-act="loadhist">重新整理</button>' : ''}</div>
      <div class="mlist">${hist}</div><small class="muted note">還原會用選定的版本取代目前的進度，按兩次才會執行。</small></section>` : ''}
  </main>${toast()}`;
}


// ---------- 挑戰：無限模式、歷史挑戰 ----------
function infBlocked() { return lockError('inf'); }
function infPending() {
  const I = S.save.inf, o = infOpponent(S.db, I.floor - 1);
  return { mode: 'infinite', label: `爬塔 · 第 ${I.floor} 關`, title: `${o.legend ? '傳奇隊' : o.season} ${o.team} ${TEAM_ZH[o.team] || ''}`,
    power: o.power + o.bonus, bonus: o.bonus, side: () => sideFor(S.db, o) };
}
function histPending(ts) {
  if (ts.legend) return { mode: 'history', ts, label: `傳奇挑戰 ★${ts.star || 1}`, title: `${ts.team} ${TEAM_ZH[ts.team] || ''} 傳奇隊 ★${ts.star || 1}`, power: ts.power, bonus: ts.bonus || 0, side: () => sideFor(S.db, ts) };
  return { mode: 'history', ts, label: `歷史挑戰 · ${ts.season}`, title: `${ts.season} ${ts.team} ${TEAM_ZH[ts.team] || ''}`, power: ts.power, bonus: 0, side: () => sideFor(S.db, ts) };
}
function startChallenge(P, skip, quick = false) {
  if (limitError()) return flash(limitError());
  const lk = P.mode === 'infinite' ? 'inf' : P.mode === 'history' ? (P.ts && P.ts.legend ? 'leg' : 'hist') : null;
  if (lk && lockError(lk)) return flash(lockError(lk));
  if (P.mode === 'exh') skip = false;   // 一般模式不能跳過
  S.pending = P;
  if (skip) {
    const G = newGame(DEFAULT_TACTIC); G.g.finish();
    S.rewardFactor = quick ? quickF() : 1;
    const res = finishMatch(G); S.rewardFactor = 1;
    S.game = { ...G, stage: 'final', res, skipped: true, quick };
  } else S.game = { stage: 'pre', tactic: { ...DEFAULT_TACTIC } };
  S.screen = 'game'; render();
}
function infResult(G, won) {
  const I = infState(S.save); questEvent('challenge');
  lockOn('inf'); gainXp(won);
  applyFatigue(I, G.g, G.me);
  let reward = 0, note = '';
  const f = I.floor;
  if (won) {
    reward = Math.round(floorReward(f) * rf());
    I.best = Math.max(I.best, f); I.floor = f + 1; questEvent('inf');
    const m = INF_MILESTONES[f];
    if (m && !I.milestones[f]) {
      I.milestones[f] = true; S.save.vouchers = S.save.vouchers || {}; S.save.vouchers[m] = (S.save.vouchers[m] || 0) + 1;
      note = `首次通過第 ${f} 關！獲得${{ normal: '一般', rookie: '新秀', special: '特殊' }[m]}卡包兌換券`;
    } else note = `通過第 ${f} 關！`;
  } else {
    I.losses++;
    note = I.losses >= towerMax() ? `今天的 ${towerMax()} 次失敗機會已用完，明天再挑戰` : `第 ${f} 關挑戰失敗（今天剩 ${towerMax() - I.losses} 次失敗機會）`;
  }
  S.save.coins += reward; save();
  return { won, reward, note };
}

function histResult(G, won) {
  const H = histState(S.save), ts = S.pending.ts; questEvent('challenge');
  lockOn(ts.legend ? 'leg' : 'hist'); gainXp(won);
  let reward = 0, note = '';
  if (ts.legend) {
    H.ln++;
    if (won) {
      S.save.vouchers = S.save.vouchers || {};
      if (!H.beaten[ts.key]) { H.beaten[ts.key] = true; reward = Math.round(histReward(ts.power) * rf()); S.save.vouchers.special = (S.save.vouchers.special || 0) + 1; note = `首次擊敗 ${ts.team} 傳奇隊！獲得特殊卡包兌換券 ×1`; }
      else reward = Math.round(LEGEND_REPEAT * rf());
    }
    S.save.coins += reward; save();
    return { won, reward, note };
  }
  H.n++;
  if (won) {
    if (!H.beaten[ts.key]) { H.beaten[ts.key] = true; reward = Math.round(histReward(ts.power) * rf()); note = `首次擊敗 ${ts.season} ${ts.team}！`; }
    else reward = Math.round(HIST_REPEAT * rf());
    S.save.vouchers = S.save.vouchers || {};
    const champs = Object.entries(CHAMPIONS).filter(([s, t]) => H.beaten[`${s}|${t}`]).length;
    if (champs === Object.keys(CHAMPIONS).length && !H.claimed.champions) { H.claimed.champions = true; S.save.vouchers.special = (S.save.vouchers.special || 0) + 2; note += ' 擊敗十季全部總冠軍隊！獲得特殊卡包兌換券 ×2'; }
    const seasons = S.db.seasons, teamDone = seasons.every(s => H.beaten[`${s}|${ts.team}`]);
    if (teamDone && !H.claimed['team-' + ts.team]) { H.claimed['team-' + ts.team] = true; S.save.vouchers.normal = (S.save.vouchers.normal || 0) + 5; note += ` 擊敗 ${ts.team} 全部十個年度！獲得一般卡包兌換券 ×5`; }
  }
  S.save.coins += reward; save();
  return { won, reward, note };
}

// ---------- 一般模式（練習賽） ----------
// 對手是隨機一支真實球隊年度，全隊能力調到跟你目前的隊伍一樣強；每天不限場數、可以隨時換隊伍與陣容，不能跳過
const EXH = { win: 300, loss: 120, xp: { win: 5, loss: 3 }, full: 10, half: 20 };
function exhState() { const e = S.save.exh || (S.save.exh = { date: '', n: 0, w: 0 }); if (e.date !== today()) { e.date = today(); e.n = 0; e.w = 0; } return e; }
const exhFactor = (n) => (n < EXH.full ? 1 : n < EXH.half ? .5 : .2);   // 當天第 11～20 場獎勵 5 成，第 21 場起 2 成
function exhPending() {
  const all = teamSeasons(S.db), ts = all[Math.floor(Math.random() * all.length)], my = mySide(undefined, ts.team);
  return { mode: 'exh', ts, label: '一般模式', title: `${ts.season} ${ts.team} ${TEAM_ZH[ts.team] || ''}`, power: my.power, bonus: my.power - ts.power, side: () => sideFor(S.db, ts) };
}
function exhResult(G, won) {
  const e = exhState(), f = exhFactor(e.n);
  const reward = Math.round((won ? EXH.win : EXH.loss) * f * rf());
  e.n++; if (won) e.w++;
  gainXp(won, f, EXH.xp);
  S.save.coins += reward; save();
  return { won, reward, note: `一般模式今天第 ${e.n} 場${f < 1 ? `（獎勵 ${f * 10} 成）` : ''}` };
}
function renderExh() {
  const e = exhState(), f = exhFactor(e.n), my = mySide(), err = limitError();
  const teams = S.save.teams.map((t, k) => `<button class="chip ${k === S.save.ti ? 'on' : ''}" data-act="team" data-i="${k}">隊伍 ${k + 1}</button>`).join('');
  app.innerHTML = `${topbar('一般模式', '練習賽')}
  <main class="body">${tabs('challenge')}
    <section class="panel main exh-main">
      <b class="h ban">一般模式 · 練習賽</b>
      <p class="muted">對手是隨機一支真實球隊年度，全隊能力會調到跟你目前的隊伍<b>一樣強</b>，用來測試新陣容、新戰術。每天不限場數，可以隨時切換隊伍、更換陣容；這個模式不能跳過或快速模擬。</p>
      <div class="filters">${teams}</div>
      <div class="kv"><span>目前隊伍 ${S.save.ti + 1} 戰力</span><b>${my.power.toFixed(1)}</b></div>
      <div class="kv"><span>今天已打</span><b>${e.n} 場（${e.w} 勝）</b></div>
      <div class="kv"><span>這一場的獎勵</span><b>勝 <i class="coin"></i>${Math.round(EXH.win * f)} ／ 敗 <i class="coin"></i>${Math.round(EXH.loss * f)}${f < 1 ? `（${f * 10} 成）` : ''}</b></div>
      ${err ? `<small class="bad">${err}</small>` : ''}
      <div class="btns"><button class="btn gold fire" data-act="exhplay" ${err ? 'disabled' : ''}>開始練習賽 🏀</button><button class="btn" data-act="go" data-to="lineup">調整陣容</button></div>
      <small class="muted">每天前 ${EXH.full} 場獎勵全額，第 ${EXH.full + 1}～${EXH.half} 場 5 成，之後 2 成。經理經驗：勝 ${EXH.xp.win}、敗 ${EXH.xp.loss}（同樣依場數遞減）。</small>
    </section>
  </main>${toast()}`;
}
function renderChallengeHub() {
  const I = infState(S.save), H = histState(S.save);
  const legendDone = legendTeams(S.db).filter(x => H.beaten[x.key]).length;
  const champs = Object.entries(CHAMPIONS).filter(([s, t]) => H.beaten[`${s}|${t}`]).length;
  const sparks = (n, cls) => Array.from({ length: n }, (_, k) => `<i class="${cls}" style="--x:${(k * 37 + 11) % 92 + 4}%;--y:${(k * 53 + 7) % 60 + 4}%;--d:${((k * 0.37) % 3).toFixed(2)}s"></i>`).join('');
  const tile = (m, img, fx, stat) => `<button class="ctile m-${m}" data-act="chmode" data-m="${m}"><img src="img/hub/${img}.webp" alt="">${fx}<span class="ct-stat">${stat}</span></button>`;
  app.innerHTML = `${topbar('挑戰')}
  <main class="body hub-bg">${tabs('challenge')}
    <div class="hub four">
      ${tile('inf', 'mode0', `<i class="ct-flash"></i><i class="ct-ball" style="background-image:url(img/hub/mode0.webp)"></i><i class="ct-glow g-inf"></i>${sparks(10, 'ct-twk')}<i class="ct-sweep"></i>`,
        `目前第 ${I.floor} 關 · 最高第 ${I.best} 關<br>今天剩 ${Math.max(0, towerMax() - I.losses)} 次失敗機會`)}
      ${tile('hist', 'mode1', `<i class="ct-glow g-hist"></i><i class="ct-shine"></i>${sparks(14, 'ct-conf')}<i class="ct-sweep"></i>`,
        `總冠軍隊 ${champs} / 10<br>今天剩 ${Math.max(0, histMax() - H.n)} 次`)}
      ${tile('leg', 'mode2', `<i class="ct-glow g-leg"></i><i class="ct-fire" style="background-image:url(img/hub/mode2.webp)"></i>${sparks(14, 'ct-ember')}<i class="ct-sweep"></i>`,
        `傳奇隊 ${legendDone} / ${legendTeams(S.db).length}<br>今天剩 ${Math.max(0, legendMax() - H.ln)} 次`)}
      ${tile('exh', 'mode3', `<i class="ct-glow g-exh"></i>${sparks(10, 'ct-twk')}<i class="ct-sweep"></i>`,
        `今天已打 ${exhState().n} 場 · 不限場數<br>本場獎勵 勝 ${Math.round(EXH.win * exhFactor(exhState().n))}／敗 ${Math.round(EXH.loss * exhFactor(exhState().n))}`)}
    </div>
  </main>${toast()}`;
}

function renderChallenge() {
  if (!S.chMode) return renderChallengeHub();
  if (S.chMode === 'exh') return renderExh();
  const I = infState(S.save), H = histState(S.save), run = I.run;
  const myPow = mySide().power;
  const out = I.losses >= towerMax() && !testOn();
  const P = infPending(), gap = (myPow - P.power) / P.power * 100, can = Math.abs(gap) >= 5, block = infBlocked();
  const added = lockAdded('inf');
  const tired = Object.values(I.fatigue || {}).filter(x => x > .15).length;
  const ahead = [1, 2, 3].map(k => { const o = infOpponent(S.db, I.floor - 1 + k); return `<div class="up fl"><span class="n flb">${I.floor + k}F</span><b class="ss">${o.legend ? '傳奇' : o.season.slice(2)}<br>${o.team}</b><span class="em">${teamEmblem(o.team)}</span><small>戰力 <b>${(o.power + o.bonus).toFixed(1)}</b></small></div>`; }).join('');
  const oInf = infOpponent(S.db, I.floor - 1);
  const inf = `<div class="next-card inf-card"><small class="gold-ban">第 ${I.floor} 關 · 最高紀錄 ${I.best} 關 · 今天剩 ${Math.max(0, towerMax() - I.losses)} 次失敗機會</small>
      <div class="vs inf-vs"><span class="em big">${teamEmblem(oInf.team)}</span><b>${esc(P.title)}</b><span class="pw"><b class="mine">${myPow.toFixed(1)}</b> : <b class="theirs">${P.power.toFixed(1)}</b></span></div>
      <small><span class="tag ${can ? 'skip' : 'man'}">${can ? '可以跳過' : '手動或快速模擬'}</span> · 過關獎勵 <i class="coin"></i> ${floorReward(I.floor)}</small>
      <small>${lockLine('inf')} · 疲勞球員 ${tired} 位</small>${block ? `<small class="bad">${block}</small>` : ''}${out ? '<small class="bad">今天的失敗機會已用完，明天再來</small>' : ''}
      <div class="btns"><button class="btn gold fire" data-act="infplay" ${block || out ? 'disabled' : ''}>挑戰第 ${I.floor} 關 🏀</button>${can ? `<button class="btn" data-act="infskip" ${!block && !out ? '' : 'disabled'}>跳過</button>` : `<button class="btn" data-act="infquick" ${!block && !out ? '' : 'disabled'}>快速模擬<br><small>獎勵 5 成</small></button>`}</div></div>
      <small class="label">接下來</small>${ahead}
      <small class="muted">每天重置時退回前一天進度的 ${TOWER_BACK} 關之前（最低第 1 關），過關獎勵每次都拿得到。</small>`;
  const ms = Object.entries(INF_MILESTONES).map(([w, t]) => `<span class="lim ${I.milestones[w] ? 'done' : ''}">第 ${w} 關 ${I.milestones[w] ? '✓' : ''}</span>`).join('');
  // 歷史挑戰
  const seasons = S.db.seasons, legendMode = S.chMode === 'leg';
  if (!S.histSeason || S.histSeason === 'legend') S.histSeason = seasons[0];
  const sel = S.histSeason;
  const star = S.legStar || 1, sb = STAR_BOOST * (star - 1);
  const list = (legendMode ? legendTeams(S.db).map(x => ({ ...x, power: x.power + sb, bonus: sb, star, key: star > 1 ? `${x.key}|★${star}` : x.key })) : teamSeasons(S.db).filter(x => x.season === sel)).slice().sort((a, b) => b.power - a.power);
  const champs = Object.entries(CHAMPIONS).filter(([s, t]) => H.beaten[`${s}|${t}`]).length;
  const cells = list.map(ts => {
    const done = H.beaten[ts.key], champ = CHAMPIONS[ts.season] === ts.team;
    return `<button class="hteam ${legendMode ? 'leg' : ''} ${S.histPick === ts.key ? 'sel' : ''} ${done ? 'done' : ''}" data-act="histpick" data-k="${ts.key}"><b>${ts.team}${champ ? ' <span class="cup">🏆</span>' : ''}</b>${legendMode ? `<span class="em">${teamEmblem(ts.team)}</span>` : ''}<small>${ts.power.toFixed(1)}</small><i>${done ? '已擊敗' : legendMode ? '🎟️ 特殊券' : `<i class="coin"></i>+${fmt(histReward(ts.power))}`}</i>${legendMode ? '<em class="lg-rib">LEGEND</em>' : ''}</button>`;
  }).join('');
  const pick = list.find(x => x.key === S.histPick);
  const limit = legendMode ? legendMax() : histMax(), used = legendMode ? H.ln : H.n;
  const lkKey = legendMode ? 'leg' : 'hist', lkErr = lockError(lkKey);
  let pickCard = `<small class="muted">點一支球隊挑戰</small><small class="muted">${lockLine(lkKey)}</small>${lkErr ? `<small class="bad">${lkErr}</small>` : ''}`;
  if (pick) {
    const gap = (myPow - pick.power) / pick.power * 100, can = Math.abs(gap) >= 5, full = used >= limit && !testOn();
    pickCard = `<div class="kv"><span>${legendMode ? '傳奇隊' : pick.season} ${pick.team} ${TEAM_ZH[pick.team] || ''}</span><b>${myPow.toFixed(1)} : ${pick.power.toFixed(1)}</b></div>
      <small class="muted">${lockLine(lkKey)}</small>${lkErr ? `<small class="bad">${lkErr}</small>` : ''}
      <div class="btns"><button class="btn gold" data-act="histplay" ${full ? 'disabled' : ''}>手動比賽</button>${can ? `<button class="btn" data-act="histskip" ${!full ? '' : 'disabled'}>跳過</button>` : `<button class="btn" data-act="histquick" ${!full ? '' : 'disabled'}>快速模擬<br><small>獎勵 5 成</small></button>`}</div>`;
  }
  const vouch = S.save.vouchers || {};
  if (S.chMode === 'inf') {
    app.innerHTML = `${topbar('無限模式', `最高第 ${I.best} 關`)}
    <main class="body">${tabs('challenge')}
      <section class="panel inf-main">${inf}</section>
      <aside class="panel side inf-side"><b class="h">首次通過獎勵</b><div class="lims">${ms}</div><div class="reward-art"><img src="img/hub/reward.webp" alt=""><i></i></div>
        <small class="muted">卡包兌換券：一般 ${vouch.normal || 0} · 新秀 ${vouch.rookie || 0} · 特殊 ${vouch.special || 0}（在商店使用）</small></aside>
    </main>${toast()}`;
    return;
  }
  app.innerHTML = `${topbar(legendMode ? '傳奇挑戰' : '歷史挑戰')}
  <main class="body">${tabs('challenge')}
    <section class="panel main grid-page ${legendMode ? 'legend-page' : ''}"><div class="sm-head"><b class="h ban">${legendMode ? '各隊傳奇隊' : `${sel} 球隊`} 💎</b><small class="muted gold-rib">今天剩餘 ${limit - used} / ${limit} 次${legendMode ? ' · 首次擊敗送特殊卡包兌換券' : ` · 總冠軍隊 ${champs} / 10`}</small></div>
      ${legendMode ? `<div class="filters stars">${Array.from({ length: LEGEND_STARS }, (_, i) => i + 1).map(s => `<button class="chip ${s === star ? 'on' : ''}" data-act="legstar" data-s="${s}">${'★'.repeat(s)}<small>${s === 1 ? '原始戰力' : `全隊 +${STAR_BOOST * (s - 1)}`}</small></button>`).join('')}</div>` : `<div class="filters">${seasons.map(s => `<button class="chip ${s === sel ? 'on' : ''}" data-act="histseason" data-s="${s}">${s}</button>`).join('')}</div>`}
      <div class="hgrid">${cells}</div>${pickCard}</section>
  </main>${toast()}`;
}


// ---------- 遊戲說明 ----------
const HELP = [
  ['cards', '卡片與等級', `<p>每張年度卡代表一位球員在某一季的表現，等級由高到低是<b>黑、紫、紅、金、銀、銅</b>，另有新秀專屬的<b>綠卡</b>與<b>畢業卡</b>。</p>
    <p>等級依十季歷史池的比例決定：紫卡約前 1.5%、紅卡約 5%、金卡約 12%、銀卡約 30%。每位球員最多兩張紫卡（取生涯最強的兩季），其餘降為紅卡。黑卡是 60 位傳奇球員，每人一張。</p>`],
  ['ability', '能力與總評', `<p>8 項能力：得分、內線、外線、罰球、組織、籃板、防守、耐力，由真實數據換算，聯盟平均約 70，歷史最突出約 100（黑卡最高 115）。</p>
    <p>總評＝8 項平均 65%＋影響力 35%。全隊戰力＝先發 5 人能力平均 70%＋板凳 7 人 30%（含強化、羈絆、錯置）。</p>`],
  ['enhance', '強化', `<p>最多強化到 +10，全能力最多 +20，強化<b>不會增加薪資</b>。成功率從 100% 逐級降到 55%，失敗時等級不變、素材與費用不退還。</p>
    <p><b>素材</b>：原則上要「同一張卡」。例外：特殊卡包開出的卡可以當同球員、同等級任何賽季的素材；銅卡、銀卡可以用同球員任何賽季的卡（銅卡需要的張數減半）；紫卡也可以用同一位球員的紅卡。</p>
    <p><b>費用</b>：每次強化要花遊戲幣＝等級基數×目標等級（銅、銀 3,000，金 3,500，紅 4,500，紫 7,000，黑 10,000）。任何一隊陣容中的卡與已強化的卡不會被當成素材。</p>`],
  ['get', '取得卡片', `<p><b>一般卡包</b>（500）指定年份或球隊，保底銀卡；<b>特殊卡包</b>（5,000）最低金卡、保底紅卡，每包約 2% 機率開出黑卡；<b>新秀卡包</b>只出綠卡。</p>
    <p>兌換交易頁：紫卡可用遊戲幣指名購買；3 位不同球員的紫卡可換 1 張指定黑卡；分解卡片得到點數（銅 2／銀 5／金 20／紅 60），可兌換指定的卡（銅 40／銀 100／金 250／紅 600）。</p>`],
  ['lineup', '陣容、錯置與羈絆', `<p>先發 5 人（PG、SG、SF、PF、C）＋板凳 7 人，同一位球員只能放一張。每隊名單限制：<b>黑卡 1、紫卡 2、紅卡 4</b>，金、銀、銅卡不限（綠卡 2、畢業卡 1）。</p>
    <p>位置錯置會失去部分能力：相鄰位置 ×0.9、後衛與中鋒互換 ×0.75。羈絆：同隊 3／5／8／10／12 人加 1～5；同季真實隊友 2／3／4／5 人加 1～4；先發五人同一季同一隊「原班人馬」再 +2；黑卡與同隊現役球員的傳承 +2，每人最多 +10。</p>
    <p><b>教練羈絆</b>：球員所屬球隊是總教練執教過的球隊時全能力加成（紫卡教練 +3、紅卡 +2、金卡 +1，教練每強化一級 +10%）。<b>世仇</b>：對手是球員所屬球隊的世仇時（例如塞爾提克對湖人、公牛對活塞），該球員全能力 +2。</p>`],
  ['teams', '三支隊伍、薪資與經理等級', `<p>最多可以組 <b>3 支隊伍</b>，在陣容頁上方切換。每支隊伍有自己的總教練、助理教練，應援團三隊共用；同一張卡、同一位教練不能同時在兩隊。</p>
    <p><b>薪資</b>：每張卡依總評有薪資（例如總評 75 約 $10M、85 約 $25M、95 約 $43M），強化不加薪。每支隊伍 12 人的薪資合計不能超過<b>薪資上限</b>，超過就不能出賽。</p>
    <p><b>經理等級</b>：每場比賽都有經驗（勝 15、敗 8，每天前 5 場再 +15），升級後薪資上限提高：Lv.1 $170M，到 Lv.50 $300M。</p>
    <p><b>隊伍鎖定</b>：賽季模式可以隨時換人。無限模式、歷史挑戰、傳奇挑戰在每天第一場比賽時鎖定出戰隊伍，當天只能用那一隊，而且最多換進 3 位新球員。</p>`],
  ['season', '賽季模式', `<p>選一支球隊接管後打 82 場例行賽，接著附加賽與季後賽（七戰四勝）。每天最多 11 場。</p>
    <p>開季時選擇難度：一般、困難、菁英、傳奇、地獄、煉獄，對手全隊能力分別 −4／+0／+3／+6／+9／+12，勝場獎勵 ×1～×3（輸球固定 350）。戰力差 5% 以上可以「跳過」拿全額獎勵；未達 5% 可以手動比賽或「快速模擬」（遊戲幣 5 成）。</p>`],
  ['game', '比賽流程', `<p>前三節半是文字直播，每節結束可調整節奏、進攻重心、防守體系和下一節每位球員的上場分鐘（合計 60 分鐘）。</p>
    <p>第 4 節剩 5 分鐘、分差 15 分以內時，進入<b>即時對戰</b>由你親自操作；分差超過 15 分直接模擬到結束。延長賽前 2 分鐘模擬、最後 3 分鐘也是即時對戰。</p>`],
  ['duel', '最後 5 分鐘：即時對戰', `<p><b>操作</b>：左半邊按住拖曳移動。進攻時投籃（按住、在綠色區放開＝完美出手；輕點＝假動作）、傳球、招式、加速、叫掩護；防守時封阻、抄截、切換（換成離球最近的隊友）、加速。鍵盤：方向鍵移動、J 投籃／封阻／搶籃板、K 傳球／抄截、L 招式／切換、Shift 加速、I 叫掩護。</p>
    <p><b>規則</b>：比賽時鐘不停，進攻 24 秒（進攻籃板重設 14 秒）、8 秒內過半場、進攻 3 秒、防守 3 秒（技術犯規罰一球）。投籃後全員自動卡位，起跳搶籃板要自己按。</p>
    <p><b>體力</b>：跑越多掉越快，黃燈、紅燈時速度、命中、防守都會下降。<b>暫停</b>每場 2 次（紫卡總教練 +1），場上 5 人各回復 10% 體力並可換人；板凳球員會慢慢回體力。打累了可以按「選單 → 交給教練」由系統打完，獎勵相同。</p>
    <p><b>招牌武器</b>：紫卡、黑卡球員有集氣條，得分、助攻、抄截、籃板都會累積，集滿後按「招式」發動。體力低於 30% 不能發動。<b>特質</b>：紅卡以上強化到 +5 解鎖，在即時對戰中自動生效；對手的紫、黑卡也會依難度帶特質。</p>`],
  ['clutch', '關鍵時刻挑戰', `<p>「比賽 → 關鍵時刻」：4 章 16 關，用隊伍 1 打即時對戰的短情境（指定比分、剩餘時間、球權、體力）。同分算失敗。</p>
    <p>贏球拿 1 星，另外兩個附加條件各 1 星。<b>第一次拿到每顆星</b>給遊戲幣（新手篇 300、逆轉篇 500、守成篇 700、傳奇篇 1,000），重玩不再給；一章全部 3 星送特殊卡包兌換券 1 張。對手強度依你的戰力自動調整。</p>`],
  ['green', '綠卡（新秀）', `<p>綠卡是進聯盟兩年內的新秀，<b>每週一下午 3 點</b>依上一週的真實比賽表現重新結算數值，範圍從銅卡到紅卡水準；那週沒上場就掉到最低。卡面標示「本週○」。</p>
    <p>取得方式：新秀卡包（只出綠卡，可指定球隊）；<b>新秀週禮</b>：每週賽季贏 10 場，下週可自選 1 張綠卡，贏 30 場再送 1 張隨機綠卡（在「任務」頁領取）。陣容最多放 2 張綠卡。強化加成會保留，賽季結束後依兩年表現轉成畢業卡。</p>`],
  ['staff', '教練團與應援團', `<p><b>總教練</b>帶來執教風格（例如三角戰術、外線體系、輪換大師）和全隊能力加成，紫卡總教練暫停 +1；<b>助理教練</b>風格效果減半。教練執教過的球隊有羈絆加成。</p>
    <p><b>應援團</b>最多 3 位啦啦隊，各有技能（例如招財、幸運開包、強化祝福、經驗、集氣、體力、暫停應援），同團 2～3 人另有加成，同類技能只取最高。教練、啦啦隊都能用重複卡在「卡片」裡的強化頁升級。</p>`],
  ['quests', '任務', `<p>每天 3 個每日任務、每週 5 個每週任務，完成後到「任務」頁領遊戲幣。每天可以免費換 1 個還沒有進度的每日任務。一週有 5 天完成全部每日任務，送特殊卡包兌換券 1 張。有可以領的獎勵時，任務分頁會出現紅點。</p>`],
  ['friends', '好友與友誼賽', `<p>在「好友」頁用遊戲 ID 加好友，可以看到彼此的陣容、經理等級和戰力。上線中的好友顯示綠色「● 上線中」。</p>
    <p>雙方都在線而且遊戲版本相同時，可以邀請<b>友誼賽</b>：6 分鐘、0:0 開打、雙方各用隊伍 1 即時對戰，同分加打 2 分鐘延長賽。不給遊戲幣，只記錄你們之間的勝負。</p>`],
  ['challenge', '挑戰模式', `<p><b>無限模式</b>：從第 1 關一路往上，對手戰力隨關數平滑成長（第 1 關約 76、第 20 關約 83、第 50 關約 94、第 80 關約 104），每天重置退回前一天進度的 5 關之前；每天 4 次失敗機會；當天鎖定一支隊伍、最多換進 3 位新球員，疲勞會累積。首次通過第 10／30／50 關有卡包兌換券。</p>
    <p><b>一般模式</b>：練習賽，對手是隨機一支真實球隊年度，全隊能力調到跟你的隊伍一樣強。不限場數、可以隨時換隊伍和陣容，不能跳過。勝 300／敗 120 遊戲幣，每天第 11～20 場 5 成、之後 2 成。</p>
    <p><b>歷史挑戰</b>：挑戰 2016-17 起任一季的真實球隊，每天 6 次，首勝獎勵 400～3,000 依對手強度。<b>傳奇挑戰</b>：各隊黑卡領軍的傳奇隊，分 ★1～★5（每多一星全隊 +3），每一星各自有首勝獎勵（遊戲幣＋特殊卡包兌換券 1 張），每天 4 次。</p>`],
  ['reward', '遊戲幣與獎勵', `<p>賽季勝 1,000（依難度 ×1～×3）／敗 350，附加賽 5,000、季後賽與每晉級一輪 12,000、奪冠 25,000。無限模式每關 50＋關數×5。另外還有每日／每週任務、關鍵時刻首次拿星、新秀週禮。</p>`],
  ['backup', '存檔與帳號', `<p>進度會自動存到雲端，只保留最新一份、無法回溯。換手機時輸入同一組邀請碼就能接回進度。</p>
    <p>開卡包與強化需要連線。想從頭玩可以在「設定 → 帳號 → 重新開始」，每 2 天只能用一次。</p>`],
];
function renderHelp() {
  const cur = S.helpTopic || HELP[0][0];
  const item = HELP.find(h => h[0] === cur) || HELP[0];
  app.innerHTML = `${topbar('遊戲說明')}
  <main class="body"><nav class="panel help-nav"><button class="help-tut" data-act="tutorial">▶ 播放新手教學</button>${HELP.map(([k, t]) => `<button class="${k === cur ? 'on' : ''}" data-act="helptopic" data-k="${k}">${t}</button>`).join('')}</nav>
    <section class="panel main help-body"><h2>${item[1]}</h2>${item[2]}</section></main>${toast()}`;
}

// ---------- 邀請碼（雲端存檔帳號） ----------
function renderInvite() {
  app.innerHTML = `<main class="body col center invite"><div class="pre pre2 inv-box"><div class="pre-ban"><small>WELCOME</small><b>歡迎來到 My NBA Game</b></div>
    <div class="inv-in"><p>請輸入朋友給你的邀請碼。進度會自動存到雲端，換手機時輸入同一組邀請碼就能接回。</p>
    <input class="search" id="inv-code" maxlength="12" placeholder="例如 7KX3PQ2M" autocomplete="off">
    <button class="btn gold fire" data-act="invgo">${S.invBusy ? '連線中…' : '開始遊戲'}</button>${S.invErr ? `<small class="bad">${esc(S.invErr)}</small>` : ''}
    <small class="muted ver" data-act="ownerin">擁有者登入</small></div></div></main>`;
}
async function enterWithCode(code) {
  S.invBusy = true; S.invErr = ''; render();
  try {
    await cloud.claim(code);
    const c = await cloud.fetchSave();
    if (c) { S.save = c.save; writeSave(S.save); }
    else if (S.save && devOn()) { S.save.savedAt = Date.now(); writeSave(S.save); await cloud.pushNow(S.save); }   // 擁有者：把目前的進度上傳成這組邀請碼的存檔
    else { S.save = null; clearSave(); }
    S.invBusy = false; S.screen = 'lineup'; render(); maybeTour(); applyGrant();
  } catch (e) { S.invBusy = false; S.invErr = e.message; render(); }
}
// 測試帳號一次性補發：每份存檔對同一個補發代號只發一次，發完記在存檔裡
const START_COINS = 25000;
async function applyGrant() {
  if (!cloud.cloudOn() || !cloud.myCode() || !S.save) return;
  try {
    const g = await cloud.fetchGrant(); if (!g || !(g.mult > 1)) return;
    S.save.grants = S.save.grants || {};
    if (S.save.grants[g.id]) return;
    await cloud.backupBeforeGrant(S.save, g.id);   // 備份失敗就不發，避免無法還原
    const add = Math.round(START_COINS * (g.mult - 1));
    S.save.coins += add; S.save.grants[g.id] = { at: Date.now(), add }; S.save.testAccount = true;
    save(); render();
    setTimeout(() => flash(`已設為測試帳號：一次性補發 ${add.toLocaleString()} 遊戲幣`), 600);
  } catch (e) { /* 離線或尚未設定：下次開遊戲再檢查 */ }
}
// 啟動時同步：雲端較新就用雲端（換手機、另一台玩過）；雲端沒有就上傳本機
async function syncFromCloud() {
  if (!cloud.cloudOn() || !cloud.myCode()) return;
  try {
    const c = await Promise.race([cloud.fetchSave(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000))]);
    if (c && (!S.save || c.updatedAt > (S.save.savedAt || 0))) { S.save = c.save; writeSave(S.save); }
    else if (!c && S.save) cloud.pushNow(S.save);
  } catch (e) { /* 離線：先用本機進度，開卡包與強化需要連線 */ }
}

// ---------- 開局 ----------
function renderOnboard() {
  const sel = S.onboardPick;
  // 第二步：從三張紫卡中挑一張（候選固定，重畫不會改變）
  if (S.obStep === 2 && sel) {
    S.obChoices = S.obChoices || purpleChoices(S.db, sel);
    const pick2 = S.onboardPick2;
    app.innerHTML = `<header class="topbar"><h1>開始新遊戲</h1><span class="grow"></span><span class="sub">步驟 2／2：再挑一張紫卡</span></header>
    <main class="body col"><p class="lead">從這三張紫卡中挑一張加入隊伍。另外會送你紅卡 2 張、金卡 4 張、銀卡 3 張、銅卡 1 張與 25,000 遊戲幣（陣容薪資會在上限 $170M 內）。</p>
      <div class="onboard-grid ob-three">${S.obChoices.map(k => { const c = S.db.cards[k]; return `<button class="ob-card ${pick2 === k ? 'sel' : ''}" data-act="obpick2" data-key="${esc(k)}">${cardSVG(c)}<small>${c.season} · ${c.team} · ${c.pos}</small></button>`; }).join('')}</div>
      <div class="ob-bar"><button class="btn" data-act="obback">上一步</button>${pick2 ? `<span>已選 <b>${esc(S.db.cards[pick2].name)}</b></span>` : '<span class="muted">點選一張紫卡</span>'}
        <button class="btn gold" data-act="obstart" ${pick2 ? '' : 'disabled'}>開始遊戲</button></div></main>`;
    return;
  }
  const purples = (S.db.byTier['紫'] || []).slice().sort((a, b) => b.ovr - a.ovr);
  app.innerHTML = `<header class="topbar"><h1>開始新遊戲</h1><span class="grow"></span><span class="sub">步驟 1／2：挑選隊伍核心</span></header>
  <main class="body col">
    <p class="lead">先挑一張紫卡當你的隊伍核心。下一步會再從三張紫卡中挑一張。</p>
    <div class="onboard-grid">${purples.map(c => `<button class="ob-card ${sel === c.key ? 'sel' : ''}" data-act="obpick" data-key="${esc(c.key)}">${cardSVG(c)}<small>${c.season} · ${c.team}</small></button>`).join('')}</div>
    <div class="ob-bar">${sel ? `<span>已選 <b>${esc(S.db.cards[sel].name)}</b>（${S.db.cards[sel].season}，總評 ${S.db.cards[sel].ovr}）</span>` : '<span class="muted">點選一張紫卡</span>'}
      <button class="btn gold" data-act="obnext" ${sel ? '' : 'disabled'}>下一步</button></div>
  </main>`;
}

function startGame() {
  const keys = starterCards(S.db, S.onboardPick, S.onboardPick2);
  if (!keys) return flash('產生開局卡片失敗，請再試一次');
  const cards = keys.map(key => ({ uid: newUid(), key, plus: 0 }));
  S.save = { v: 1, created: Date.now(), coins: 25000, points: 0, cards, lineup: { starters: [null, null, null, null, null], bench: Array(7).fill(null) } };
  S.save.teams = [emptyTeam(), emptyTeam(), emptyTeam()]; S.save.ti = 0; S.save.lineup = S.save.teams[0];
  S.save.mgr = { lv: 1, xp: 0, date: '', n: 0 };
  const nl = autoLineup(S.save.cards, S.db, { cap: capOf(1) }); S.save.lineup.starters = nl.starters; S.save.lineup.bench = nl.bench;
  S.save.tut = 0;   // 新玩家：第一次進陣容頁播放新手教學
  save(); S.screen = 'lineup'; render();
  maybeTour(); applyGrant();
}

// ---------- 新手教學（啦啦隊林襄導覽） ----------
// 卡片等級示範：每個等級挑一張有專屬人物圖、總評最高的卡（不同球員）
function tourTierCards() {
  const own = (c) => { const a = S.db.art || {}; const ids = a[c.season]; return !!c.art || (Array.isArray(ids) && ids.includes(c.id)); };
  const used = new Set();
  return ['銅', '銀', '金', '紅', '紫', '黑'].map(t => {
    const pool = (S.db.byTier[t] || []).slice().sort((a, b) => (own(b) - own(a)) || b.ovr - a.ovr);
    const c = pool.find(x => !used.has(x.name)) || pool[0];
    if (c) used.add(c.name); return c;
  }).filter(Boolean);
}
const TIER_COLOR = { '銅': '#E0915A', '銀': '#C9D3DE', '金': '#FFD54A', '紅': '#FF6B6B', '紫': '#C79BFF', '黑': '#FFE7A0' };
function tourSteps() {
  // 14 步 × 4.3 秒 ≈ 60 秒（點畫面可以直接跳下一步，左上角可以略過整段教學）
  return [
    { go: 'lineup', sel: ['.panel.main .row', '[data-act="auto"]'], title: '你的陣容',
      text: '5 位先發加 7 位板凳。不知道怎麼排，就按「自動編排」，系統會幫你排出最強陣容。' },
    { go: 'lineup', sel: ['.panel.side .sal', '.panel.side .lims'], title: '薪資上限與名單限制',
      text: '卡片越強薪資越高，全隊不能超過薪資上限；黑卡 1、紫卡 2、紅卡 4、綠卡 2 張。打比賽升經理等級，上限會越來越高！' },
    { go: 'lineup', sel: ['.panel.side .team-tabs', '.panel.side .bonds'], title: '三支隊伍與羈絆',
      text: '最多可以組 3 支隊伍。同隊、同季真實隊友、原班人馬、教練執教過的球隊都有羈絆加成。' },
    { html: () => `<div class="tg-tiers"><h3>卡片等級</h3><div class="tg-row">${tourTierCards().map((c) =>
        `<div>${cardSVG(c)}<b style="color:${TIER_COLOR[c.tier]}">${c.tier}卡</b></div>`).join('')}</div></div>`,
      title: '卡片等級', text: '銅、銀、金、紅、紫、黑，越高越強。另外還有新秀專屬的綠卡，數值每週跟著真實比賽更新！' },
    { go: 'season', sel: ['.subtabs'], title: '比賽',
      text: '「比賽」裡有三種：賽季（接管一支球隊打 82 場）、挑戰（無限、歷史、傳奇、一般模式），還有關鍵時刻挑戰。' },
    { img: 'img/tut/live.webp', box: [2, 60, 96, 39], at: 'top', title: '最後 5 分鐘：親自上場',
      text: '比分接近時，最後 5 分鐘由你操作！左邊搖桿移動，右邊投籃、傳球、加速。按住投籃、在綠色區放開就是完美出手。' },
    { img: 'img/tut/live.webp', box: [1, 9, 14, 9], at: 'bottom', title: '體力與暫停',
      text: '跑越多體力掉越快，紅燈時速度和命中都會下降。叫「暫停」可以換人、回一點體力；打累了也能按「選單 → 交給教練」自動打完。' },
    { html: () => '<div class="tg-tiers"><h3>招牌武器與特質</h3><p style="max-width:30em;line-height:1.7;font-size:1.5rem;color:#E8EEF6">紫卡、黑卡球員腳下有紫色集氣條，得分、助攻、抄截都會累積。集滿時「招式」鍵變成金色的招牌名稱，按下去就發動！<br>紅卡以上強化到 +5 會解鎖「特質」，在最後 5 分鐘自動生效。</p></div>',
      title: '招牌武器與特質', text: '例如 Curry 的超遠三分、Durant 的死神後仰。對手的球星也會用喔，看到預告記得派人干擾！' },
    { go: 'clutch', sel: ['.cl-ch'], at: 'bottom', title: '關鍵時刻',
      text: '16 個短情境：落後 2 分剩 24 秒、領先 1 分守最後一波…每關 3 顆星，第一次拿星有遊戲幣，一章全滿送特殊卡包券。' },
    { go: 'shop', sel: ['.products .product:nth-child(1)', '.products .product:nth-child(2)', '.products .product:nth-child(3)'], at: 'top-right', title: '卡包',
      text: '一般卡包指定年份或球隊，特殊卡包有機會開出黑卡，新秀卡包只出綠卡。' },
    { go: 'collection', sel: ['.subtabs'], title: '卡片與強化',
      text: '同一張卡可以強化到 +10。球員、教練、啦啦隊各有自己的強化頁，用重複卡升級。' },
    { go: 'staff', sel: ['.panel.st-slots'], at: 'bottom-right', title: '教練團與應援團',
      text: '教練帶來執教風格和羈絆，我們啦啦隊幫你多賺獎勵、加快集氣，記得把我們排進應援團喔！' },
    { go: 'quests', sel: ['.q-wrap', '.panel.side'], title: '任務',
      text: '每天 3 個任務、每週 5 個任務，完成就能領遊戲幣；一週全勤送特殊卡包券。每週賽季贏 10 場，還能自選一張新秀綠卡！' },
    { go: 'lineup', sel: ['.tabs [data-to="friends"]', '.topbar .gear'], first: false, title: '好友與設定',
      text: '「好友」可以加好友、看大家的陣容，在線時還能邀請好友即時打友誼賽。右上齒輪是設定。開始你的傳奇吧！' },
  ];
}

const TUT_VER = 2;   // 教學內容大改時加 1，所有玩家下次登入會自動播一次
function startTour() {
  if (!S.save || guideOn()) return;
  runGuide({
    steps: tourSteps(), avatar: (S.db.cards['cheer|Q18'] && artSrc(S.db.cards['cheer|Q18'])) || 'art/cheer/Q18.webp',   // 導覽員固定林襄；安裝版的人物圖從網頁版讀
    endText: '之後在「設定 → 新手教學」或「遊戲說明」都能再看一次喔～',
    go: (scr) => {
      const changed = S.screen !== scr;
      S.screen = scr; S.pick = null; S.sel = null; S.lsel = null; S.confirm = null; S.batch = null;
      if (scr === 'challenge') S.chMode = null;
      if (scr === 'shop') S.shop.tab = 'packs';
      render(); return changed;
    },
    onEnd: () => { if (S.save) { S.save.tut = 1; S.save.tutV = TUT_VER; save(); } S.screen = 'lineup'; render(); },
  });
}
// 新玩家還沒看過教學時自動播放（中途關掉 App，下次打開會再播）
function maybeTour(tries = 0) {
  if (!S.save || S.save.tut !== 0 || guideOn() || tries > 40) return;
  // 進場動畫、抽卡動畫還在畫面上時先等一下
  if (needNick()) return setTimeout(() => maybeTour(tries), 800);   // 先取好遊戲 ID 再播新手教學（等待不計次）
  if (document.querySelector('.rv, .fx-ov, .cine') || S.screen !== 'lineup') return setTimeout(() => maybeTour(tries + 1), 400);
  setTimeout(() => { if (S.save && S.save.tut === 0 && !guideOn() && !document.querySelector('.rv, .fx-ov, .cine')) startTour(); }, 500);
}

// ---------- 主流程 ----------
// 教練與啦啦隊效果（每次重畫時更新）
const FX = () => S.fx || { style: {}, abil: {}, timeouts: 0, coin: 0, gift: 0, games: 0, hist: 0, tower: 0, legend: 0, quick: .5, cap: 0, cheers: [] };
const dailyMax = () => DAILY_BASE + FX().games;
const histMax = () => HIST_DAILY + FX().hist;
const legendMax = () => LEGEND_DAILY + FX().legend;
const towerMax = () => TOWER_LOSSES + FX().tower;
const quickF = () => FX().quick;
const capMax = () => CAP + FX().cap;
const rf = () => (S.rewardFactor || 1) * (1 + FX().coin);
const sv = (k) => FX().style[k] || 0;
function refreshFx() {
  if (!S.save || !S.db) return;
  ensureTeams();
  S.fx = staffEffects({ ...S.save, staff: { ...(S.save.staff || {}), head: S.save.lineup.head, asst: S.save.lineup.asst } }, S.db);
  Object.assign(ECON, { luck: S.fx.luck, enh: S.fx.enh, discount: S.fx.discount, decomp: S.fx.decomp });
}
const ecoOn = () => !S.save || (S.save.settings || {}).eco !== false;   // 省電模式預設開啟
function render() {
  if (updPending && !updBusy()) { updPending = false; updLast = Date.now(); setTimeout(checkUpdate, 400); }
  refreshFx();
  setEco(ecoOn()); document.body.classList.toggle('eco', ecoOn());
  renderInner();
  if (S.screen !== S._prev) { S._prev = S.screen; app.classList.remove('scr-in'); void app.offsetWidth; app.classList.add('scr-in'); }
}
// 強制取遊戲 ID：有雲端帳號（邀請碼）但還沒取 ID 的玩家，進遊戲先取；比賽進行中不打斷
const needNick = () => cloud.cloudOn() && !!cloud.myCode() && S.save && !S.save.nick && S.screen !== 'game';
function renderNickGate() {
  app.innerHTML = `<main class="body nick-full"><section class="panel main nick-gate">
    <div class="ng-box"><b class="h">取一個遊戲 ID</b>
      <p>遊戲 ID 會顯示在好友名單、友誼賽和排行裡，朋友也會用它加你好友。<br>最多 12 個字，不能和別人重複，之後可以在「好友」頁修改。</p>
      <input class="search" id="nick-in3" maxlength="12" placeholder="例如：林襄最愛的經理">
      <div class="set-btns"><button class="btn gold" data-act="setnick3">確定</button></div></div></section></main>${toast()}`;
  setTimeout(() => { const i = document.getElementById('nick-in3'); if (i) i.focus(); }, 50);
}
function renderInner() {
  if (cloud.cloudOn() && !cloud.myCode() && !devOn()) return renderInvite();
  if (!S.save) return renderOnboard();
  if (needNick()) return renderNickGate();   // 所有玩家都要先取遊戲 ID
  if (S.screen === 'collection') return renderCollection();
  if (S.screen === 'detail') return renderDetail();
  if (S.screen === 'shop') return renderShop();
  if (S.screen === 'exchange') return renderShop(true);
  if (S.screen === 'staff') return renderStaff();
  if (S.screen === 'enhcoach') return renderStaffEnh('coach');
  if (S.screen === 'clutch') return renderClutch();
  if (S.screen === 'devplayers') return renderDevPlayers();
  if (S.screen === 'quests') return S.giftPick ? renderGiftPick() : renderQuests();
  if (S.screen === 'enhcheer') return renderStaffEnh('cheer');
  if (S.screen === 'help') return renderHelp();
  if (S.screen === 'pack') return renderPack();
  if (S.screen === 'settings') return renderSettings();
  if (S.screen === 'friends') return renderFriends();
  if (S.screen === 'challenge') return renderChallenge();
  if (S.screen === 'enhance') return renderEnhance();
  if (S.screen === 'season') return S.save.season ? renderSeason() : renderSeasonStart();
  if (S.screen === 'game' && S.game) return renderGame();
  return renderLineup();
}

function back() {
  if (S.pick) { S.pick = null; return render(); }
  if (S.batch) { S.batch = null; return render(); }
  if (S.screen === 'help') { S.screen = S.helpFrom || 'settings'; return render(); }
  if (S.screen === 'settings') { S.screen = 'lineup'; S.confirm = null; return render(); }
  if (S.screen === 'friends') { if (S.nickEdit) { S.nickEdit = false; return render(); } S.screen = 'lineup'; S.confirm = null; return render(); }
  if (S.screen === 'challenge' && S.chMode) { S.chMode = null; return render(); }
  if (S.screen === 'detail') { S.screen = S.from; S.confirm = null; return render(); }
  if (S.screen === 'pack') { S.screen = 'shop'; return render(); }
  if (S.screen === 'game') { const to = S.pending && S.pending.mode !== 'season' ? 'challenge' : 'season'; if (S.game && (S.game.stage === 'pre' || S.game.stage === 'final')) { S.screen = to; return render(); } return flash('比賽進行中，打完才能離開'); }
  if (S.screen !== 'lineup') { S.screen = 'lineup'; return render(); }
}

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'closepick' && ev.target.closest('[data-stop]') && !ev.target.closest('button')) return;
  const d = el.dataset;
  switch (d.act) {
    case 'back': return back();
    case 'go': if (d.to === 'challenge' && S.screen === 'challenge') S.chMode = null; S.screen = d.to; S.pick = null; S.confirm = null; return render();
    case 'chmode': S.chMode = d.m; S.histPick = null; return render();
    case 'exhplay': if (limitError()) return flash(limitError()); return startChallenge(exhPending(), false);
    case 'team': return switchTeam(+d.i);
    case 'legstar': S.legStar = +d.s; S.histPick = null; return render();
    case 'slot': {
      const target = { kind: d.kind, i: +d.i };
      if (S.sel) { S.target = target; S.pick = null; S.pick = target; return placeCard(S.sel); }
      if (S.save.lineup[target.kind][target.i]) { S.lsel = (S.lsel && S.lsel.kind === target.kind && S.lsel.i === target.i) ? null : target; return render(); }
      S.lsel = null; S.pick = target; return render();
    }
    case 'lswap': S.pick = S.lsel; S.lsel = null; return render();
    case 'lclose': S.lsel = null; return render();
    case 'lremove': { const { kind, i } = S.lsel; S.save.lineup[kind][i] = null; S.lsel = null; save(); return render(); }
    case 'select': S.sel = S.sel === d.uid ? null : d.uid; return render();
    case 'place': return placeCard(d.uid);
    case 'remove': { const { kind, i } = S.pick; S.save.lineup[kind][i] = null; S.pick = null; save(); return render(); }
    case 'closepick': S.pick = null; return render();
    case 'auto': {
      const L = S.save.lineup, nl = autoLineup(S.save.cards, S.db, { cap: capNow(), exclude: new Set([...otherTeamUids(), ...staffUids()]), coach: teamCoach(L), prev: teamUids(L) });
      L.starters = nl.starters; L.bench = nl.bench; S.lsel = null; save(); render();
      return flash(`已在薪資上限 ${fmtSal(capNow())} 內自動編排隊伍 ${S.save.ti + 1}`);
    }
    case 'filter': S.filter[d.f] = d.v; return render();
    case 'detail': S.detail = d.key; S.from = S.screen; S.screen = 'detail'; return render();
    case 'obpick': if (S.onboardPick !== d.key) { S.obChoices = null; S.onboardPick2 = null; } S.onboardPick = d.key; return render();
    case 'obnext': S.obStep = 2; return render();
    case 'obback': S.obStep = 1; return render();
    case 'obpick2': S.onboardPick2 = d.key; return render();
    case 'testmode':
      if (!devOn()) return;
      if (testOn()) { localStorage.removeItem(TEST_KEY); S.save.coins = 25000; S.save.points = 0; flash('已關閉測試模式，遊戲幣重設為 25,000，經理等級還原'); }
      else { localStorage.setItem(TEST_KEY, '1'); flash(`已開啟測試模式：經理 Lv.${MGR_MAX}，薪資上限 ${fmtSal(capOf(MGR_MAX))}`); }
      save(); return render();
    case 'resetgame':
      if (!devOn()) return;
      if (S.confirm !== 'reset') { S.confirm = 'reset'; return render(); }
      S.confirm = null; if (cloud.cloudOn() && cloud.myCode()) cloud.restart().catch(() => {});
      clearSave(); S.save = null; S.pack = null; S.game = null; S.pending = null; S.onboardPick = null; S.teamPick = null; S.screen = 'lineup';
      return render();
    case 'tutorial': return startTour();
    case 'openhelp': S.helpFrom = S.screen; S.helpTopic = d.k || S.helpTopic; S.screen = 'help'; return render();
    case 'helptopic': S.helpTopic = d.k; return render();
    case 'toggleeco': S.save.settings = S.save.settings || {}; S.save.settings.eco = !ecoOn(); save(); return render();
    case 'stslot': S.stf.slot = d.s; return render();
    case 'stauto': staffAuto(); refreshFx(); save(); render(); return flash('已自動安排教練團與應援團');
    case 'stpick': {
      const o = S.save.cards.find(x => x.uid === d.uid), c = o && S.db.cards[o.key];
      const kind = STAFF_SLOTS.find(s => s[0] === S.stf.slot)[2];
      if (!c || c.kind !== kind) return;
      if (kind === 'cheer') { const keys = ['c0', 'c1', 'c2'].filter(k => k !== S.stf.slot).map(k => staffGet(k)).map(u => u && S.save.cards.find(x => x.uid === u)?.key); if (keys.includes(o.key)) return flash('同一位啦啦隊員不能重複放'); }
      if (kind === 'coach') { const other = staffGet(S.stf.slot === 'head' ? 'asst' : 'head'); if (other && S.save.cards.find(x => x.uid === other)?.key === o.key) return flash('同一位教練不能同時擔任總教練和助理教練'); }
      staffSet(S.stf.slot, o.uid); save(); return render();
    }
    case 'stclear': staffSet(S.stf.slot, null); save(); return render();
    case 'stup': {
      const uid = d.uid || staffGet(S.stf.slot), o = S.save.cards.find(x => x.uid === uid), c = o && S.db.cards[o.key]; if (!c) return;
      const used = staffUids(), lvl = o.plus || 0, need = STAFF_NEED[lvl] || 99, cost = staffUpCost(lvl + 1);
      const dups = S.save.cards.filter(x => x.key === o.key && x.uid !== uid && !used.has(x.uid)).slice(0, need);
      if (dups.length < need) return flash(`需要 ${need} 張重複卡`);
      if (S.save.coins < cost) return flash('遊戲幣不足');
      S.save.coins -= cost; const del = new Set(dups.map(x => x.uid));
      S.save.cards = S.save.cards.filter(x => !del.has(x.uid)); o.plus = lvl + 1; refreshFx(); save();
      flash(`${c.name} 升級到 ${staffLevelText(c, o.plus)}`); return render();
    }
    case 'sepick': S.se = S.se || {}; S.se[S.screen] = d.uid; return render();
    case 'sefilter': S.seF = S.seF || {}; S.seF[S.screen] = d.f; return render();
    case 'setkey': { const r = document.getElementById('bk-repo').value, t = document.getElementById('bk-token').value; if (!r || !t) return flash('請輸入 repo 與金鑰'); setBackupKey(r, t); return flash('已儲存備份金鑰'); }
    case 'clearkey': setBackupKey('', ''); return flash('已移除這台裝置的備份金鑰');
    case 'vertap': {   // 連點版本號 5 次：輸入開發者密碼
      S.verTaps = (S.verTaps || 0) + 1; clearTimeout(S.verT); S.verT = setTimeout(() => { S.verTaps = 0; }, 1500);
      if (S.verTaps < 5) return; S.verTaps = 0;
      if (!devHash()) return flash('這個版本沒有設定開發者密碼');
      const pw = prompt('請輸入開發者密碼'); if (!pw) return;
      sha256(pw).then(h => { if (h === devHash()) { localStorage.setItem(DEV_KEY, h); flash('已開啟開發者功能'); } else flash('密碼錯誤'); });
      return;
    }
    case 'devlock': { const wasTest = testOn(); localStorage.removeItem(DEV_KEY); localStorage.removeItem(TEST_KEY); if (wasTest && S.save) { S.save.coins = 25000; S.save.points = 0; applyTest(); writeSave(S.save); } return flash('已鎖定開發者功能'); }
    case 'ownerin': {
      if (!devHash()) return flash('這個版本沒有設定開發者密碼');
      const pw = prompt('請輸入開發者密碼'); if (!pw) return;
      return sha256(pw).then(h => { if (h === devHash()) { localStorage.setItem(DEV_KEY, h); render(); } else flash('密碼錯誤'); });
    }
    case 'invgo': { const v = (document.getElementById('inv-code') || {}).value; return enterWithCode(v); }
    case 'restart': {
      if (S.confirm !== 'restart') { S.confirm = 'restart'; return render(); }
      S.confirm = null;
      return cloud.restart().then(() => { clearSave(); S.save = null; S.pack = null; S.game = null; S.screen = 'lineup'; render(); flash('已重新開始'); }).catch(e => flash(e.message));
    }
    case 'cloudsignin': return cloud.ensureSignedIn().then(() => render()).catch(e => flash(e.message));
    case 'mkinvite': { const name = (document.getElementById('inv-name') || {}).value || ''; return cloud.createInvite(name).then(code => { S.newInvite = code; S.invites = null; render(); }).catch(e => flash(e.message)); }
    case 'listinvites': return Promise.all([cloud.listInvites(), cloud.listProfiles().catch(() => [])]).then(([l, ps]) => { const m = new Map(ps.map(p => [p.code, p.nick])); S.invites = l.map(v => ({ ...v, nick: m.get(v.code) || '' })); render(); }).catch(e => flash(e.message));
    case 'friends': return cloud.listProfiles().then(l => { S.friends = l; render(); }).catch(e => flash(e.message === '沒有權限' ? '好友功能尚未開放（雲端規則未設定）' : e.message));
    case 'friend': S.friendOpen = S.friendOpen === el.dataset.code ? null : el.dataset.code; return render();
    case 'setnick2': return setNick((document.getElementById('nick-in2') || {}).value);
    case 'setnick3': return setNick((document.getElementById('nick-in3') || {}).value);
    case 'nickedit': S.nickEdit = true; return render();
    case 'nickcancel': S.nickEdit = false; return render();
    case 'friendsreload': return loadFriends();
    case 'frinvite': return frInvite(d.code);
    case 'clplay': return startClutch(d.id);
    case 'devplayers': if (!devOn()) return; S.screen = 'devplayers'; return loadDevPlayers();
    case 'qclaim': { const Q = questState(), q = (d.k === 'd' ? Q.daily : Q.weekly).find(x => x.id === d.id), D = questDef(d.id); if (!q || q.claimed || q.p < D.n) return; q.claimed = true; S.save.coins += D.r; save(); return flash(`領取 ${fmt(D.r)} 遊戲幣`); }
    case 'qreroll': { const Q = questState(); if (Q.reroll) return; const i = Q.daily.findIndex(x => x.id === d.id); if (i < 0 || Q.daily[i].p > 0) return flash('已經有進度的任務不能換'); const nx = pickQuests(DAILY_POOL, 1, 'r' + Q.day + d.id, Q.daily.map(x => x.id))[0]; if (!nx) return; Q.daily[i] = nx; Q.reroll = true; save(); return render(); }
    case 'giftpick': if (!giftReady()) return; S.giftPick = true; return render();
    case 'giftback': S.giftPick = false; return render();
    case 'giftget': { if (!giftReady()) { S.giftPick = false; return render(); } const G = giftState(), keys = [d.key];
      if ((G.claimWins || 0) >= GIFT_BONUS) { const pool = S.db.byTier['綠'] || []; keys.push(pool[Math.floor(Math.random() * pool.length)].key); }
      if (S.save.cards.length + keys.length > capMax()) return flash(`卡冊已達上限 ${capMax()} 張，請先分解`);
      G.claimed = true; S.giftPick = false; const got = addCards(keys); save(); cloud.pushNow(S.save);
      return flash(`獲得 ${got.map(x => S.db.cards[x.key].name).join('、')}！`); }
    case 'qattend': { const Q = questState(); if (Q.attend || Q.days.length < ATTEND_DAYS) return; Q.attend = true; S.save.vouchers = S.save.vouchers || {}; S.save.vouchers.special = (S.save.vouchers.special || 0) + 1; save(); return flash('獲得特殊卡包兌換券 1 張！'); }
    case 'addfriend': {
      let code = d.code;
      if (!code) {
        const v = nickKey((document.getElementById('add-in') || {}).value); if (!v) return flash('請輸入對方的遊戲 ID');
        const p = (S.friends || []).find(x => nickKey(x.nick) === v && x.code !== cloud.myCode());
        if (!p) return flash('找不到這個 ID（對方需要先打開遊戲並取好 ID）'); code = p.code;
      }
      S.save.friends = [...new Set([...(S.save.friends || []), code])]; save(); flash('已加入好友'); S.friendOpen = code; return render();
    }
    case 'unfriend': {
      if (S.confirm !== 'unf' + d.code) { S.confirm = 'unf' + d.code; return render(); }
      S.confirm = null; S.save.friends = (S.save.friends || []).filter(c => c !== d.code); save(); return render();
    }
    case 'setnick': {
      const v = ((document.getElementById('nick-in') || {}).value || '').trim().replace(/\s+/g, ' ').slice(0, 12);
      if (!v) return flash('請輸入遊戲 ID');
      return setNick(v);
    }
    case 'togglecine': S.save.settings = S.save.settings || {}; S.save.settings.cine = (S.save.settings.cine === false); save(); return render();
    case 'backupnow':
      flash('備份中…');
      return upload(S.save, '手動備份').then(() => { S.hist = null; flash('備份完成'); }).catch(e => flash(`備份失敗：${e.message}`));
    case 'loadhist': if (!devOn()) return;
      flash('讀取中…');
      return history().then(h => { S.hist = h; S.confirm = null; render(); }).catch(e => flash(`讀取失敗：${e.message}`));
    case 'restore': if (!devOn()) return;
      if (S.confirm !== d.sha) { S.confirm = d.sha; return render(); }
      S.confirm = null; flash('還原中…');
      return fetchVersion(d.sha).then(sv => { S.save = sv; writeSave(sv); S.screen = 'lineup'; flash('已還原這個版本的存檔'); }).catch(e => flash(`還原失敗：${e.message}`));
    case 'export': if (!devOn()) return; return exportSave(S.save).catch(e => flash(`匯出失敗：${e.message}`));
    case 'importgo': if (!devOn()) return; S.save = S.pendingImport; S.pendingImport = null; writeSave(S.save); S.screen = 'lineup'; return flash('已匯入存檔');
    case 'infplay': case 'infskip': case 'infquick': {
      const I = infState(S.save);
      if (I.losses >= towerMax() && !testOn()) return flash('今天的失敗機會已用完');
      if (infBlocked()) return flash(infBlocked());
      return startChallenge(infPending(), d.act !== 'infplay', d.act === 'infquick');
    }
    case 'histseason': S.histSeason = d.s; S.histPick = null; return render();
    case 'histpick': S.histPick = d.k; return render();
    case 'histplay': case 'histskip': case 'histquick': {
      const H = histState(S.save), leg = S.chMode === 'leg';
      if ((leg ? H.ln >= legendMax() : H.n >= histMax()) && !testOn()) return flash(`今天的 ${leg ? legendMax() : histMax()} 次挑戰已經用完`);
      const star = S.legStar || 1, sb = STAR_BOOST * (star - 1);
      const ts = leg ? legendTeams(S.db).map(x => ({ ...x, power: x.power + sb, bonus: sb, star, key: star > 1 ? `${x.key}|★${star}` : x.key })).find(x => x.key === S.histPick) : teamSeasons(S.db).find(x => x.key === S.histPick); return startChallenge(histPending(ts), d.act !== 'histplay', d.act === 'histquick');
    }
    case 'teampick': S.teamPick = d.t; return render();
    case 'seasonstart': return startSeason();
    case 'seasondiff': S.seasonDiff = +d.i; return render();
    case 'standcf': S.standCf = (S.standCf || confOf(S.save.season.team)) === '東區' ? '西區' : '東區'; return render();
    case 'skip': return skipGame();
    case 'quick': return skipGame(true);
    case 'manual': return startManual();
    case 'newseason': S.save.season = null; S.teamPick = null; save(); return render();
    case 'tac': {
      const G = S.game; if (G.stage === 'pre') G.tactic[d.f] = d.v; else G.g.t[G.me].tactic[d.f] = d.v; return render();
    }
    case 'tipoff': {
      const t = S.game.tactic; S.game = { ...newGame(t), stage: 'play', shown: 0 }; return playQuarter();
    }
    case 'skipq': clearInterval(S.game.timer); return quarterDone();
    case 'nextq': S.game.stage = 'play'; return playQuarter();
    case 'min': {   // 只更新這一列與合計，不重畫整頁（清單不會跳動、捲動位置不變）
      const G = S.game, plan = G.g.plan[G.me]; plan[d.id] = Math.max(0, Math.min(12, (plan[d.id] || 0) + +d.d));
      const row = el.closest('.mrow'), num = row && row.querySelector('span');
      const total = G.g.t[G.me].players.reduce((s, p) => s + (plan[p.id] || 0), 0);
      const tot = app.querySelector('.sm-head small:last-child'), go = app.querySelector('[data-act=nextq]');
      if (!num || !tot || !go) return render();
      num.textContent = plan[d.id]; tot.textContent = `合計 ${total} / 60`; tot.className = total === 60 ? 'ok' : 'bad'; go.disabled = total !== 60;
      return;
    }
    case 'shoptab': Object.assign(S.shop, { tab: d.t, q: '', fSeason: '', fTeam: '', fPos: '', page: 0 }); return render();
    case 'shoppos': S.shop.fPos = S.shop.fPos === d.p ? '' : d.p; S.shop.page = 0; return render();
    case 'shoppage': S.shop.page = (S.shop.page || 0) + +d.d; return render();
    case 'xbuy': {
      const c = S.db.cards[d.key], cost = EXCHANGE[c.tier];
      if ((S.save.points || 0) < cost) return flash('分解點數不足');
      if (S.save.cards.length + 1 > capMax()) return flash(`卡冊已達上限 ${capMax()} 張`);
      S.save.points -= cost; addCards([c.key]); save(); render(); return flash(`已兌換 ${c.season} ${c.name}`);
    }
    case 'shopmode': S.shop.mode = d.m; return render();
    case 'shoptier': S.shop.tier = d.t; S.shop.page = 0; return render();
    case 'buy': return buy(d.k, +d.n);
    case 'voucher': return buy(d.k, 1, true);
    case 'tear': {
      const bag = app.querySelector('.bag'); if (bag) bag.classList.add('torn');
      fxFlash('rgba(255,255,255,.8)');
      setTimeout(async () => {
        S.pack.phase = 'cards'; render();
        if (S.pack.n > 1) {   // 10 包：開完後依序展示紫卡、黑卡
          for (const x of S.pack.cards) { const c = S.db.cards[x.key]; if (c.tier === '紫' || c.tier === '黑' || (c.kind === 'cheer' && x.isNew)) await playReveal(c, x.isNew, S.pack.kind); }
        }
      }, 380);
      return;
    }
    case 'flip': return flipOne(+d.i);
    case 'flipall': return flipAll();
    case 'enhance': return doEnhance();
    case 'goenh': S.enh = { ...(S.enh || { filter: 'all', q: '' }), key: S.detail, filter: 'all' }; S.screen = 'enhance'; return render();
    case 'enhpick': S.enh.key = d.key; return render();
    case 'enhfilter': S.enh.filter = d.f; S.enh.key = null; return render();
    case 'enhgo': return doEnhance(S.enh.key);
    case 'enhauto': return doEnhanceAuto(S.enh.key, +d.goal);
    case 'enhbuy': {
      const c = S.db.cards[S.enh.key], cost = EXCHANGE[c.tier];
      if ((S.save.points || 0) < cost) return flash('分解點數不足');
      S.save.points -= cost; addCards([c.key]); save(); return flash(`已兌換 1 張 ${shortName(c.name)}`);
    }
    case 'decompose': return doDecompose();
    case 'lock': { S.save.locks = S.save.locks || {}; if (S.save.locks[S.detail]) delete S.save.locks[S.detail]; else S.save.locks[S.detail] = true; S.confirm = null; save(); flash(S.save.locks[S.detail] ? '已鎖定：這張卡不會被分解' : '已解除鎖定'); return render(); }
    case 'buypurple': {
      const c = S.db.cards[S.detail]; const price = purplePrice(c, purpleThreshold());
      if (!spend(price, 1)) return;
      addCards([c.key]); save(); return flash(`已購買 ${shortName(c.name)} ${c.season} 紫卡`);
    }
    case 'exchange': {
      const c = S.db.cards[S.detail]; const cost = EXCHANGE[c.tier];
      if ((S.save.points || 0) < cost) return flash('分解點數不足');
      if (S.save.cards.length + 1 > capMax()) return flash(`卡冊已達上限 ${capMax()} 張`);
      S.save.points -= cost; addCards([c.key]); save(); return flash(`已兌換 ${shortName(c.name)} ${c.season}`);
    }
    case 'blackx': S.blackx = { sel: [] }; return render();
    case 'bxpick': { const s = S.blackx.sel, i = s.indexOf(d.uid); if (i >= 0) s.splice(i, 1); else if (s.length < 3) s.push(d.uid); return render(); }
    case 'bxclose': S.blackx = null; return render();
    case 'bxgo': {
      const del = new Set(S.blackx.sel), c = S.db.cards[S.detail];
      if (S.save.cards.length - 3 + 1 > capMax()) return flash('卡冊已滿');
      S.save.cards = S.save.cards.filter(o => !del.has(o.uid)); addCards([c.key]); S.blackx = null; save();
      return flash(`已兌換黑卡 ${c.name}！`);
    }
    case 'batch': S.batch = { tiers: { '銅': true, '銀': true, '金': false, '紅': false } }; return render();
    case 'batchtier': S.batch.tiers[d.t] = !S.batch.tiers[d.t]; return render();
    case 'batchclose': S.batch = null; return render();
    case 'batchgo': {
      const plan = batchPlan(); const del = new Set(plan.map(x => x.o.uid));
      const pts = plan.reduce((a, x) => a + decompPts(x.c.tier), 0);
      S.save.cards = S.save.cards.filter(o => !del.has(o.uid)); S.save.points = (S.save.points || 0) + pts; S.batch = null; save();
      return flash(`已分解 ${plan.length} 張，獲得 ${fmt(pts)} 點`);
    }
    case 'obstart': if (!S.onboardPick2) return; S.obStep = 1; S.obChoices = null; return startGame();
  }
});
app.addEventListener('change', (ev) => {
  if (ev.target.dataset.act === 'import' && ev.target.files[0] && devOn()) {
    readImport(ev.target.files[0]).then(s => { S.pendingImport = s; flash('已讀取存檔，請按紅色按鈕確認取代'); }).catch(e => flash(`匯入失敗：${e.message}`));
    return;
  }
  if (ev.target.dataset.act === 'teamf') { const w = ev.target.dataset.w, v = ev.target.value; if (w === 'coll') S.filter.team = v; else if (w === 'enh') S.enh.team = v; else S.seT = v; return render(); }
  if (ev.target.dataset.act === 'shopsel') { S.shop[ev.target.dataset.f] = ev.target.value; render(); }
  if (ev.target.dataset.act === 'shopf') { S.shop[ev.target.dataset.f] = ev.target.value; S.shop.page = 0; render(); }
});
app.addEventListener('input', (ev) => {
  if (ev.target.dataset.act === 'enhq') {
    S.enh.q = ev.target.value;
    clearTimeout(S.qt); S.qt = setTimeout(() => { const pos = ev.target.selectionStart; render(); const inp = app.querySelector('.search'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); } }, 300);
    return;
  }
  if (ev.target.dataset.act === 'shopq') {
    S.shop.q = ev.target.value; S.shop.page = 0;
    clearTimeout(S.qt); S.qt = setTimeout(() => { const pos = ev.target.selectionStart; render(); const inp = app.querySelector('.search'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); } }, 300);
  }
  if (ev.target.dataset.act === 'search') {
    S.filter.q = ev.target.value;
    clearTimeout(S.qt); S.qt = setTimeout(() => { const pos = ev.target.selectionStart; render(); const inp = app.querySelector('.search'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); } }, 300);
  }
});

// 切到背景時嘗試備份（距上次超過 1 小時）
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('paused', document.hidden);
  if (document.hidden && S.save) maybeBackup(S.save);
  if (!document.hidden) maybeCheckUpdate();   // 從背景切回來：檢查有沒有新版本
});
// 更新提示：啟動時一定檢查；從背景切回來時最多每小時檢查一次。
// 比賽中、即時對戰、開卡包或過場動畫時先不跳，等回到一般畫面再提示；按「稍後」之後 6 小時內不再提示
let updLast = Date.now(), updPending = false, updLater = 0;
const updBusy = () => S.screen === 'game' || !!document.getElementById('liveWrap') || !!document.querySelector('.rv, .fx-ov, .cine, .exit-ask');
function maybeCheckUpdate() {
  if (Date.now() - updLast < 3600e3 || Date.now() - updLater < 6 * 3600e3) return;
  if (updBusy()) { updPending = true; return; }
  updLast = Date.now(); checkUpdate();
}

// 網頁版（加入主畫面）：註冊離線快取；Android App 內不需要
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol === 'https:' && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Android 安裝版：檢查網頁版網站上的最新版本，有新版就提示下載
async function checkUpdate() {
  try {
    const cap = window.Capacitor; if (!(cap && cap.isNativePlatform && cap.isNativePlatform())) return;
    const G = window.GAME_CONFIG || {}; if (!G.webUrl || !G.version) return;
    const r = await fetch(`${G.webUrl}version.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return;
    const v = await r.json(); const num = (s) => +String(s).split('.').pop() || 0;
    if (num(v.version) <= num(G.version)) return;
    const el = document.createElement('div'); el.className = 'exit-ask';
    el.innerHTML = `<div class="ea-box"><b>有新版本 ${esc(v.version)}</b><small>目前是 ${esc(G.version)}。下載後點一下安裝即可，進度存在雲端不會遺失。</small>
      <div class="btns"><button class="btn blue" data-x="later">稍後</button><button class="btn gold" data-x="dl">下載更新</button></div></div>`;
    el.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (!x && e.target !== el) return; el.remove(); if (x && x.dataset.x === 'later') updLater = Date.now();
      if (x && x.dataset.x === 'dl') { const url = `${G.webUrl}MyNBAGame.apk?v=${v.version}`; if (cap.Plugins.Browser) cap.Plugins.Browser.open({ url }); else window.open(url, '_system'); } });
    document.body.appendChild(el);
  } catch (e) { /* 離線時略過 */ }
}

// 離開 App 前的確認視窗
function closeExitAsk() { const el = document.querySelector('.exit-ask'); if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 200); } }
function askExit() {
  if (document.querySelector('.exit-ask')) return;
  const el = document.createElement('div'); el.className = 'exit-ask';
  el.innerHTML = `<div class="ea-box"><b>要離開 My NBA Game 嗎？</b><small>進度已自動存檔</small>
    <div class="btns"><button class="btn blue" data-x="cancel">取消</button><button class="btn gold" data-x="ok">確認離開</button></div></div>`;
  el.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (!x && e.target !== el) return; if (!x || x.dataset.x === 'cancel') return closeExitAsk(); exitApp(); });
  document.body.appendChild(el);
}
async function exitApp() {
  closeExitAsk(); save();
  try { if (S.save) await maybeBackup(S.save); } catch (e) { /* 略過 */ }
  await playExitAnim();
  try { window.Capacitor.Plugins.App.exitApp(); } catch (e) { /* 瀏覽器中略過 */ }
}
// 離場動畫「榮耀永存」
function playExitAnim() {
  if ((S.save && S.save.settings || {}).cine === false) return new Promise((r) => { const el = document.createElement('div'); el.className = 'exit-fade'; document.body.appendChild(el); setTimeout(r, 650); });
  return outro({ eco: ecoOn() });
}
// 進場動畫「傳奇序章」：用玩家持有的紅、紫、黑卡（沒有就從卡池挑）
function introCards() {
  const own = (S.save ? S.save.cards : []).map(o => S.db.cards[o.key]).filter(c => c && !c.kind);
  const pick = (tier) => own.filter(c => c.tier === tier).sort((a, b) => b.ovr - a.ovr)[0] || (S.db.byTier[tier] || []).slice().sort((a, b) => b.ovr - a.ovr)[0];
  return [pick('紅'), pick('紫'), pick('黑')];
}

// Android 返回鍵
try {
  const cap = window.Capacitor;
  if (cap && cap.Plugins && cap.Plugins.App) {
    cap.Plugins.App.addListener('backButton', () => {
      if (guideOn()) return guideStop();
      if (document.querySelector('.exit-ask')) return closeExitAsk();
      if (document.querySelector('.rv, .fx-ov')) return;   // 動畫播放中不處理
      if (S.pick || S.screen !== 'lineup') back(); else askExit();
    });
  }
} catch (e) { /* 瀏覽器中略過 */ }

(async () => {
  try {
    S.db = await loadDB();
    if (S.db.artRemote) setArtUrl((season, id) => `${S.db.artRemote}art/${season}/${id}.webp`);   // 安裝版：人物圖從網頁版讀
    setArt(S.db.art, S.db.templates);
    S.save = loadSave();
    if (S.save) {   // 卡片資料改版後，若有已不存在的卡，從存檔與陣容移除
      const before = S.save.cards.length;
      S.save.cards = S.save.cards.filter(o => S.db.cards[o.key]);
      const ok = new Set(S.save.cards.map(o => o.uid));
      for (const k of ['starters', 'bench']) S.save.lineup[k] = S.save.lineup[k].map(u => (u && ok.has(u) ? u : null));
      if (S.save.cards.length !== before) writeSave(S.save);
    }
    applyTest();
    refreshFx();
    await syncFromCloud();
    const intro$ = (!S.save || (S.save.settings || {}).cine !== false) ? intro({ eco: ecoOn(), cards: introCards() }) : Promise.resolve();
    checkUpdate();
    render();
    await intro$;
    if ((S.save.tutV || 0) < TUT_VER) { S.save.tut = 0; S.save.tutV = TUT_VER; save(); }   // 大改版後，所有人都先看一次新的教學
    maybeTour(); applyGrant(); schedProfile(true); frStartListening();
    if (S.save && FX().gift > 0 && S.save.giftDay !== today()) {   // 啦啦隊「每日禮物」
      S.save.giftDay = today(); S.save.coins += Math.round(FX().gift); writeSave(S.save);
      setTimeout(() => flash(`應援團的每日禮物：+${Math.round(FX().gift)} 遊戲幣`), 400);
    }
  } catch (e) {
    app.innerHTML = `<div class="fatal">讀取卡片資料失敗：${esc(e.message)}。請確認 output/cards.json 已產生後重新打包。</div>`;
  }
})();
