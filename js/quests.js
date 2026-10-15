// 每日／每週任務：獎勵規模依全年經濟模擬（每天全部完成約多 12% 收入，不會打亂遊戲幣平衡）
export const DAILY_POOL = [
  { id: 'd_play', t: '打 5 場賽季比賽', ev: 'season', n: 5, r: 500 },
  { id: 'd_win', t: '贏 3 場賽季比賽', ev: 'seasonWin', n: 3, r: 650 },
  { id: 'd_perf', t: '即時對戰中投出 4 次完美出手', ev: 'perf', n: 4, r: 650 },
  { id: 'd_three', t: '即時對戰中投進 3 顆三分', ev: 'three', n: 3, r: 550 },
  { id: 'd_def', t: '即時對戰中抄截或封阻合計 3 次', ev: 'def', n: 3, r: 550 },
  { id: 'd_pack', t: '開 2 包任何卡包', ev: 'pack', n: 2, r: 450 },
  { id: 'd_enh', t: '嘗試強化 3 次（成敗不拘）', ev: 'enh', n: 3, r: 450 },
  { id: 'd_ch', t: '打 2 場歷史、傳奇或無限模式', ev: 'challenge', n: 2, r: 600 },
  { id: 'd_clutch', t: '完成 1 個關鍵時刻挑戰（贏球）', ev: 'clutch', n: 1, r: 550 },
];
export const WEEKLY_POOL = [
  { id: 'w_win', t: '贏 20 場賽季比賽', ev: 'seasonWin', n: 20, r: 3500 },
  { id: 'w_sig', t: '發動招牌武器 5 次', ev: 'sig', n: 5, r: 3000 },
  { id: 'w_friend', t: '打 2 場友誼賽', ev: 'friendly', n: 2, r: 3000 },
  { id: 'w_inf', t: '無限模式累計前進 10 關', ev: 'inf', n: 10, r: 3500 },
  { id: 'w_star', t: '拿到 6 顆關鍵時刻星星（含重玩達成）', ev: 'clutchStar', n: 6, r: 3000 },
  { id: 'w_new', t: '卡冊新增 5 張新卡', ev: 'newCard', n: 5, r: 2500 },
  { id: 'w_perf', t: '即時對戰中投出 20 次完美出手', ev: 'perf', n: 20, r: 3000 },
];
export const DAILY_N = 3, WEEKLY_N = 5, ATTEND_DAYS = 5;
// 依日期決定當天的任務（同一天重開 App 不會變）
function seeded(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
export function pickQuests(pool, n, seed, exclude = []) {
  const r = seeded(seed), list = pool.filter(q => !exclude.includes(q.id)).slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, n).map(q => ({ id: q.id, p: 0, claimed: false }));
}
export const questDef = (id) => DAILY_POOL.concat(WEEKLY_POOL).find(q => q.id === id);
export function weekKey(d = new Date()) {   // 週一為一週的開始
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
