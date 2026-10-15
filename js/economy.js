// 遊戲幣、卡包、分解兌換、強化（對應設計文件）
import { ENH_NEED, ENH_RATE } from './rules.js';

export const PRICE = { normal: 500, rookie: 800, special: 5000, coach: 2000, cheer: 2000 };
export const DECOMPOSE = { '銅': 2, '銀': 5, '金': 20, '紅': 60 };
export const EXCHANGE = { '銅': 40, '銀': 100, '金': 250, '紅': 600 };
export const CAP = 3000;
// 啦啦隊技能帶來的經濟加成（由 App 依目前應援團設定）
export const ECON = { luck: 0, enh: 0, discount: 0, decomp: 0 };
export const decompPts = (tier) => Math.round(DECOMPOSE[tier] * (1 + ECON.decomp));
const lucky = (table) => table.map(([t, w]) => [t, (t === '紅' || t === '黑') ? w * (1 + ECON.luck) : w]);

const pickWeighted = (table, rand = Math.random) => {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of table) { if ((r -= w) < 0) return v; }
  return table[table.length - 1][0];
};

const NORMAL = [['銅', .55], ['銀', .28], ['金', .13], ['紅', .04]];
const NORMAL_GUARANTEE = [['銀', .28], ['金', .13], ['紅', .04]];
// 平衡調整（薪資上限版模擬後）：每包約 1.5% 開出黑卡
const SPECIAL = [['金', .818], ['紅', .18], ['黑', .002]];
const SPECIAL_GUARANTEE = [['紅', .993], ['黑', .007]];
const DOWN = { '黑': '紅', '紅': '金', '金': '銀', '銀': '銅' };

// 一般卡包：filter = { season } 或 { team }
export function openNormal(db, filter) {
  const pool = (tier) => db.byTier[tier].filter(c => filter.season ? c.season === filter.season : c.team === filter.team);
  const draw = (tier) => {
    let t = tier, p = pool(t);
    while (!p.length && DOWN[t]) { t = DOWN[t]; p = pool(t); }
    return p.length ? p[Math.floor(Math.random() * p.length)] : null;
  };
  const tiers = [pickWeighted(lucky(NORMAL_GUARANTEE)), ...Array.from({ length: 4 }, () => pickWeighted(lucky(NORMAL)))];
  return shuffle(tiers.map(draw).filter(Boolean));
}

// 特殊卡包：全聯盟，黑卡名單尚未建立時以紅卡代替
export function openSpecial(db) {
  const draw = (tier) => {
    let t = tier, p = db.byTier[t] || [];
    while (!p.length && DOWN[t]) { t = DOWN[t]; p = db.byTier[t] || []; }
    return p[Math.floor(Math.random() * p.length)];
  };
  const tiers = [pickWeighted(lucky(SPECIAL_GUARANTEE)), ...Array.from({ length: 4 }, () => pickWeighted(lucky(SPECIAL)))];
  return shuffle(tiers.map(draw));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 紫卡價格：60,000 ×〔1 + 0.1 ×（總評 − 紫卡門檻）〕，以千為單位取整
export function purplePrice(card, threshold) {
  return Math.round(60000 * (1 + 0.1 * Math.max(0, card.ovr - threshold)) * (1 - ECON.discount) / 1000) * 1000;
}

// 強化：回傳 { ok, newPlus, used }
export function tryEnhance(plus) {
  const next = plus + 1;   // 素材張數與遊戲幣由 App 檢查（見 rules.js 的 enhNeed、enhCost）
  const ok = Math.random() * 100 < ENH_RATE[next] + ECON.enh * 100;
  return { ok, newPlus: ok ? next : plus, used: ENH_NEED[next] };
}

// 教練卡包（金 70%、紅 25%、紫 5%）與啦啦隊卡包（白金）：各 3 張
export const STAFF_PRICE = 2000;
export function openStaff(db, kind) {
  const pool = db.staff.filter(c => c.kind === kind);
  return Array.from({ length: 3 }, () => {
    if (kind === 'coach') { const t = pickWeighted([['金', .7], ['紅', .25 * (1 + ECON.luck)], ['紫', .05 * (1 + ECON.luck)]]); const p = pool.filter(c => c.tier === t); return p[Math.floor(Math.random() * p.length)]; }
    return pool[Math.floor(Math.random() * pool.length)];
  });
}
