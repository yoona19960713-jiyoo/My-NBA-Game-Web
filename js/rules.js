// 遊戲規則（對應設計文件）
export const ABIL = ['得分', '內線', '外線', '罰球', '組織', '籃板', '防守', '耐力'];
export const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const SLOT_GROUP = { PG: 'G', SG: 'G', SF: 'F', PF: 'F', C: 'C' };
export const TIER_ORDER = ['銅', '銀', '金', '紅', '紫', '黑', '綠', '畢業'];
export const TIER_KEY = { '銅': 'bronze', '銀': 'silver', '金': 'gold', '紅': 'red', '紫': 'purple', '黑': 'black', '綠': 'green' };
export const ENH_TOTAL = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20];       // 強化 +0～+10 的累計加成
export const ENH_NEED = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];           // 升到該級需要的同名卡
export const ENH_RATE = [0, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55]; // 升到該級的成功率
export const LIMITS = { '黑': 1, '紫': 2, '紅': 4, '綠': 2, '畢業': 1 };   // 每支隊伍的名單限制（金、銀、銅不限）
const STARTER_SLOTS = 5;

// 錯置懲罰：相鄰 ×0.9，跨位 ×0.75
export function penalty(slot, group) {
  if (!slot) return 1;
  const need = SLOT_GROUP[slot];
  if (need === group) return 1;
  const far = (need === 'G' && group === 'C') || (need === 'C' && group === 'G');
  return far ? 0.75 : 0.9;
}

// 同一位球員（年度卡與黑卡也算同一人）
export const who = (c) => (c.name || '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

export const shortName = (name) => {
  const parts = (name || '').split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
};

// 羈絆（以 12 人陣容計算）
const TEAM_STEPS = [[12, 5], [10, 4], [8, 3], [5, 2], [3, 1]];
const MATE_STEPS = [[5, 4], [4, 3], [3, 2], [2, 1]];   // 真實隊友（同季同隊）：2 人 +1、3 人 +2、4 人 +3、5 人以上 +4
const step = (n, steps) => (steps.find(([k]) => n >= k) || [0, 0])[1];

// cards 的前 5 張是先發（用來判斷「原班人馬」）
export function bonds(cards) {
  const list = cards.filter(Boolean);
  const byTeam = {}, byMate = {};
  for (const c of list) {
    (byTeam[c.team] = byTeam[c.team] || []).push(c);
    if (c.tier !== '黑') (byMate[c.season + '|' + c.team] = byMate[c.season + '|' + c.team] || []).push(c);
  }
  const result = [], bonus = new Map();
  const add = (c, v) => bonus.set(c.key, Math.min(10, (bonus.get(c.key) || 0) + v));
  for (const [team, cs] of Object.entries(byTeam)) {
    const v = step(cs.length, TEAM_STEPS);
    if (v) { result.push({ kind: '同隊', label: `同隊 · ${team} ${cs.length} 人`, who: cs, bonus: v }); cs.forEach(c => add(c, v)); }
  }
  for (const [k, cs] of Object.entries(byMate)) {
    const v = step(cs.length, MATE_STEPS);
    if (v) { const [season, team] = k.split('|'); result.push({ kind: '真實隊友', label: `真實隊友 · ${season} ${team} ${cs.length} 人`, who: cs, bonus: v }); cs.forEach(c => add(c, v)); }
  }
  // 原班人馬：先發五人是同一季同一隊，五人再各 +2
  const st = cards.slice(0, 5);
  if (st.length === 5 && st.every(c => c && c.tier !== '黑' && c.season === st[0].season && c.team === st[0].team)) {
    result.push({ kind: '原班人馬', label: `原班人馬 · ${st[0].season} ${st[0].team}`, who: st, bonus: 2 }); st.forEach(c => add(c, 2));
  }
  for (const legend of list.filter(c => c.tier === '黑')) {
    const heirs = list.filter(c => c.tier !== '黑' && c.team === legend.team);
    if (heirs.length) { result.push({ kind: '傳承', label: `傳承 · ${legend.team}`, who: [legend, ...heirs], bonus: 2 }); heirs.forEach(c => add(c, 2)); }
  }
  return { list: result, bonus };
}

// 單張卡在陣容中的實際能力與總評
export function effective(card, plus, bond, slot) {
  const enh = ENH_TOTAL[plus || 0];
  const f = penalty(slot, card.group);
  const abil = {};
  for (const a of ABIL) abil[a] = Math.round((card.abil[a] + enh + (bond || 0)) * f);
  const ovr = Math.round(((card.ovr + 0.65 * (enh + (bond || 0))) * f) * 10) / 10;
  const pw = ABIL.reduce((a, k) => a + abil[k], 0) / 8;   // 戰力用：實際上場能力的平均（比賽引擎直接使用能力值）
  return { abil, ovr, factor: f, pw };
}

export function teamPower(starters, bench) {
  const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const s = avg(starters), b = avg(bench);
  return { starters: s, bench: b, total: starters.length ? 0.7 * s + 0.3 * b : 0 };
}

export function limitCheck(cards) {
  const count = {};
  for (const c of cards.filter(Boolean)) count[c.tier] = (count[c.tier] || 0) + 1;
  return Object.entries(LIMITS).map(([t, max]) => ({ tier: t, n: count[t] || 0, max, over: (count[t] || 0) > max }));
}

// 開局：自選紫卡＋紅2、金4、其餘5張依一般卡包機率；保證位置足夠
const PACK_ODDS = [['銅', .55], ['銀', .28], ['金', .13], ['紅', .04]];
export function rollTier(rand = Math.random) {
  let r = rand();
  for (const [t, p] of PACK_ODDS) { if ((r -= p) < 0) return t; }
  return '銅';
}

// 開局：自選紫卡＋三選一的第二張紫卡＋固定 2 紅、4 金、3 銀、1 銅（後衛、前鋒各至少 4 張，中鋒至少 2 張，薪資在上限內）
export function starterCards(db, purpleKey, secondKey) {
  const pick = (tier) => { const pool = db.byTier[tier]; return pool[Math.floor(Math.random() * pool.length)]; };
  for (let tries = 0; tries < 500; tries++) {
    const keys = [purpleKey, secondKey].filter(Boolean);
    const ids = new Set(keys.map(k => who(db.cards[k])));
    for (const t of ['紅', '紅', '金', '金', '金', '金', '銀', '銀', '銀', '銅']) {
      let c, guard = 0;
      do { c = pick(t); } while (ids.has(who(c)) && guard++ < 60);
      ids.add(who(c)); keys.push(c.key);
    }
    const g = { G: 0, F: 0, C: 0 };
    keys.forEach(k => g[db.cards[k].group]++);
    const sal = keys.reduce((a, k) => a + salaryOf(db.cards[k]), 0);
    if (g.G >= 4 && g.F >= 4 && g.C >= 2 && sal <= CAP_MIN - 4) return keys;
  }
  return null;
}
// 第二張紫卡的三個候選（不同於自選的那位球員）
export function purpleChoices(db, firstKey, n = 3) {
  const first = db.cards[firstKey], pool = (db.byTier['紫'] || []).filter(c => who(c) !== who(first));
  const out = [], seen = new Set();
  while (out.length < n && seen.size < pool.length) { const c = pool[Math.floor(Math.random() * pool.length)]; if (seen.has(who(c))) continue; seen.add(who(c)); out.push(c.key); }
  return out;
}

// ---------- 薪資、經理等級 ----------
// 薪資（百萬美元）依總評計算，在錨點之間線性內插；強化不加薪
export const SALARY_PTS = [[50, 1], [55, 1.5], [63, 3], [70, 6], [75, 10], [80, 17], [85, 25], [90, 33], [95, 43], [100, 56], [110, 76], [120, 92]];
export function salaryOf(card) {
  if (!card || card.kind) return 0;
  const o = card.ovr, P = SALARY_PTS;
  if (o <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (o <= P[i][0]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return Math.round((y0 + (y1 - y0) * (o - x0) / (x1 - x0)) * 10) / 10; }
  return P[P.length - 1][1];
}
export const fmtSal = (v) => `$${(Math.round(v * 10) / 10).toFixed(1)}M`;
export const MGR_MAX = 50, CAP_MIN = 170, CAP_MAX = 300;
export const capOf = (lv) => Math.round(CAP_MIN + (CAP_MAX - CAP_MIN) * (Math.min(MGR_MAX, lv) - 1) / (MGR_MAX - 1));
export const xpNeed = (lv) => 1300 + 65 * lv;   // 升到下一級需要的經驗值
export const XP = { win: 15, loss: 8, bonusGames: 5, bonus: 15 };
export function lineupSalary(cards) { return cards.filter(Boolean).reduce((a, c) => a + salaryOf(c), 0); }

// ---------- 世仇與教練羈絆 ----------
// 對手是球員所屬球隊的世仇時，該球員全能力 +2
export const RIVALS = { BOS: ['LAL', 'PHI'], LAL: ['BOS', 'LAC', 'SA'], PHI: ['BOS', 'LAL'], LAC: ['LAL'], NY: ['MIA', 'IND', 'CHI', 'BKN'], GS: ['CLE', 'HOU'],
  BKN: ['NY'], SAC: ['LAL'], TOR: ['PHI', 'CLE'], PHX: ['SA'], CHI: ['DET', 'NY'], SA: ['DAL', 'LAL', 'PHX'], DET: ['CHI', 'LAL'], DAL: ['SA', 'MIA'],
  CLE: ['GS', 'CHI'], HOU: ['SA', 'UTAH', 'GS'], IND: ['NY', 'MIA'], MEM: ['LAC'], MIL: ['BOS'], NO: ['MEM'], MIA: ['NY', 'IND', 'BOS'], DEN: ['LAL', 'UTAH'],
  ORL: ['MIA'], MIN: ['DEN'], ATL: ['ORL', 'BOS'], OKC: ['GS', 'SA'], CHA: ['MIA'], POR: ['LAL'], WSH: ['CLE'], UTAH: ['HOU', 'CHI'] };
export const RIVAL_BONUS = 2;
export const isRival = (team, opp) => !!opp && (RIVALS[team] || []).includes(opp);
// 總教練的隊伍羈絆：球員所屬球隊是總教練執教過的球隊時加成（紫 +3、紅 +2、金 +1，教練每強化一級 +10%）
export const COACH_BOND = { '紫': 3, '紅': 2, '金': 1 };
export function coachBond(coach, plus) {
  if (!coach || coach.kind !== 'coach') return null;
  return { name: coach.name, teams: String(coach.teams || coach.team || '').split(/[／\/]/).map(x => x.trim()).filter(Boolean), v: Math.round(COACH_BOND[coach.tier] * (1 + .1 * (plus || 0)) * 10) / 10 };
}
// 單張卡的額外加成（教練羈絆＋世仇）
export function extraBonus(card, coach, opp) {
  let v = 0;
  if (coach && coach.teams.includes(card.team)) v += coach.v;
  if (isRival(card.team, opp)) v += RIVAL_BONUS;
  return v;
}

// ---------- 強化規則 ----------
// 素材：原則上要「同一張卡」；特殊卡包開出的卡、銅銀卡可用同球員同等級任何賽季；紫卡也可以用同一位球員的紅卡；銅卡需要的張數減半
export const ENH_COST = { '銅': 3000, '銀': 3000, '金': 3500, '紅': 4500, '紫': 7000, '黑': 10000, '綠': 3500, '畢業': 4500 };
export const enhCost = (tier, next) => (ENH_COST[tier] || 3500) * next;
export const enhNeed = (card, next) => card.tier === '銅' ? Math.ceil(ENH_NEED[next] / 2) : ENH_NEED[next];
export function isEnhMat(o, x, card) {   // o：素材卡的持有紀錄，x：素材卡資料，card：要強化的卡
  if (!x || x.kind || who(x) !== who(card)) return false;
  if (x.tier === card.tier) return o.key === card.key || !!o.sp || card.tier === '銅' || card.tier === '銀';
  return card.tier === '紫' && x.tier === '紅';
}

// 自動編排：在薪資上限與名單限制內，找全隊戰力最高的 12 人（考慮羈絆、教練羈絆），再依位置排先發
// opts：{ cap, exclude（不可用的 uid）, coach（教練羈絆）, prev（目前陣容，當起點） }
export function autoLineup(owned, db, opts = {}) {
  // 自動編排：先發一律放在原本的位置（2 後衛、2 前鋒、1 中鋒），在位置合理的前提下排出最高戰力；
  // 只有某個位置完全沒有可用球員時才會錯置。12 人名單也盡量保持位置平衡（後衛 4、前鋒 4、中鋒 2）
  const cap = opts.cap || 1e9, exclude = opts.exclude || new Set(), coach = opts.coach || null;
  const byWho = new Map();
  for (const o of owned) {
    const c = db.cards[o.key]; if (!c || c.kind || exclude.has(o.uid)) continue;
    const it = { o, c, v: c.ovr + ENH_TOTAL[o.plus || 0] + extraBonus(c, coach, null), s: salaryOf(c), w: who(c), g: c.group };
    (byWho.get(it.w) || byWho.set(it.w, []).get(it.w)).push(it);
  }
  // 同一位球員只留「更強或更便宜」的卡
  let cands = [];
  for (const arr of byWho.values()) { arr.sort((a, b) => b.v - a.v); let minS = 1e9; for (const it of arr) if (it.s < minS) { cands.push(it); minS = it.s; } }
  const lim = LIMITS, TST = [[12, 5], [10, 4], [8, 3], [5, 2], [3, 1]], MST = MATE_STEPS;
  // 位置下限（持有的球員不夠時就放寬）
  const avail = { G: new Set(), F: new Set(), C: new Set() }; for (const it of cands) if (avail[it.g]) avail[it.g].add(it.w);
  const NEED = { G: Math.min(4, avail.G.size), F: Math.min(4, avail.F.size), C: Math.min(2, avail.C.size) };
  const START = [['G', 2], ['F', 2], ['C', 1]];
  const val = new Float64Array(12), cur = new Array(12);
  // 依位置挑先發：每個位置取最強的；缺人時才用其他位置補（打 75 折，盡量避免）
  const pickStarters = (items, vals) => {
    const idx = items.map((_, k) => k), used = new Set(), st = [];
    for (const [g, n] of START) { const cand = idx.filter(k => !used.has(k) && items[k].g === g).sort((a, b) => vals[b] - vals[a]); for (let j = 0; j < n; j++) { const k = cand[j]; if (k == null) { st.push(null); continue; } used.add(k); st.push(k); } }
    for (let j = 0; j < 5; j++) if (st[j] == null) { const k = idx.filter(x => !used.has(x)).sort((a, b) => vals[b] - vals[a])[0]; if (k != null) { used.add(k); st[j] = k; st[j + 100] = true; } }
    return { st, used };
  };
  const score = (L, i = -1, c = null) => {
    for (let k = 0; k < 12; k++) cur[k] = k === i ? c : L[k];
    for (let k = 0; k < 12; k++) { const a = cur[k].c; let nt = 0, nm = 0;
      for (let j = 0; j < 12; j++) { const b = cur[j].c; if (b.team === a.team) { nt++; if (a.tier !== '黑' && b.tier !== '黑' && b.season === a.season) nm++; } }
      val[k] = cur[k].v + Math.min(10, step(nt, TST) + (a.tier !== '黑' ? step(nm, MST) : 0)); }
    const { st, used } = pickStarters(cur, val); let s5 = 0, s7 = 0;
    for (let j = 0; j < 5; j++) if (st[j] != null) s5 += val[st[j]] * (st[j + 100] ? .75 : 1);
    for (let k = 0; k < 12; k++) if (!used.has(k)) s7 += val[k];
    return .7 * s5 / 5 + .3 * s7 / 7; };
  const cnt = (L) => { const n = { G: 0, F: 0, C: 0 }; for (const x of L) if (n[x.g] != null) n[x.g]++; return n; };
  const posOk = (n) => n.G >= NEED.G && n.F >= NEED.F && n.C >= NEED.C;
  const seen = new Set(), n0 = {}; let L = [];
  const can = (it) => !seen.has(it.w) && !(it.c.tier in lim && (n0[it.c.tier] || 0) >= lim[it.c.tier]);
  const take = (it) => { seen.add(it.w); n0[it.c.tier] = (n0[it.c.tier] || 0) + 1; L.push(it); };
  const bySal = cands.slice().sort((a, b) => a.s - b.s);
  const fill = () => {   // 先補齊各位置的最低人數（用最便宜的），再補滿 12 人
    for (const g of ['G', 'F', 'C']) { let k = L.filter(x => x.g === g).length; for (const it of bySal) { if (k >= NEED[g] || L.length >= 12) break; if (it.g === g && can(it)) { take(it); k++; } } }
    for (const it of bySal) { if (L.length >= 12) break; if (can(it)) take(it); }
  };
  const prevSet = new Set(opts.prev || []);
  for (const it of cands) if (prevSet.has(it.o.uid) && can(it)) take(it);
  fill();
  let sal = L.reduce((a, it) => a + it.s, 0);
  if (sal > cap || !posOk(cnt(L))) { seen.clear(); for (const k in n0) delete n0[k]; L = []; fill(); sal = L.reduce((a, it) => a + it.s, 0); }
  if (L.length === 12 && sal <= cap) {
    const pool = [...new Set([...cands.slice().sort((a, b) => b.v - a.v).slice(0, 110), ...cands.slice().sort((a, b) => b.v / b.s - a.v / a.s).slice(0, 60)])];
    for (let it = 0; it < 200; it++) {
      const base = score(L); let best = null; const inL = new Set(L.map(x => x.w)); const n = {}; for (const x of L) n[x.c.tier] = (n[x.c.tier] || 0) + 1;
      const pc = cnt(L);
      for (let i = 0; i < 12; i++) for (const c of pool) {
        if (inL.has(c.w)) continue; const ds = c.s - L[i].s; if (sal + ds > cap) continue;
        if (c.c.tier !== L[i].c.tier && c.c.tier in lim && (n[c.c.tier] || 0) >= lim[c.c.tier]) continue;
        if (c.g !== L[i].g && pc[L[i].g] != null && pc[L[i].g] - 1 < NEED[L[i].g]) continue;   // 不能讓某個位置少於最低人數
        const g = score(L, i, c) - base; if (g <= 1e-6) continue;
        const r = ds > 0 ? g / ds : g * 1000 + 1; if (!best || r > best.r) best = { i, c, ds, r };
      }
      if (!best) break; L[best.i] = best.c; sal += best.ds;
    }
  }
  // 先發：PG、SG 放後衛，SF、PF 放前鋒，C 放中鋒（各取最強的，後衛、前鋒中較強的放 PG／SF）
  for (let k = 0; k < L.length; k++) val[k] = L[k].v;
  const { st } = L.length ? pickStarters(L, val) : { st: [] };
  const starters = [0, 1, 2, 3, 4].map(j => (st[j] != null ? L[st[j]] : null));
  const rest = L.filter(x => !starters.includes(x)).sort((a, b) => b.v - a.v);
  const bench = rest.slice(0, 7).map(x => x.o.uid); while (bench.length < 7) bench.push(null);
  return { starters: starters.map(x => (x ? x.o.uid : null)), bench };
}
