// 無限模式與歷史挑戰
import { TEAMS, realRoster, buildSide } from './season.js';
import { SLOTS, SLOT_GROUP, who } from './rules.js';

export const CHAMPIONS = { '2016-17': 'GS', '2017-18': 'GS', '2018-19': 'TOR', '2019-20': 'LAL', '2020-21': 'MIL',
  '2021-22': 'GS', '2022-23': 'DEN', '2023-24': 'BOS', '2024-25': 'OKC', '2025-26': 'NY' };
export const INF_RUNS = 3, INF_SWAPS = 3, INF_WIN = 20, HIST_DAILY = 5, HIST_REPEAT = 150;
export const INF_MILESTONES = { 10: 'normal', 30: 'rookie', 50: 'special', 70: 'special', 100: 'special' };   // 首次通過該關
const today = () => new Date().toISOString().slice(0, 10);

// 所有球隊年度的戰力（第一次用到時計算並快取）
let cache = null;
export function teamSeasons(db) {
  if (cache) return cache;
  cache = [];
  for (const season of db.seasons) {
    for (const t of TEAMS) {
      if (!db.list.some(c => c.season === season && c.team === t)) continue;
      const entries = realRoster(db, t, season);
      cache.push({ season, team: t, key: `${season}|${t}`, power: buildSide(t, entries).power });
    }
  }
  return cache;
}
export const sideFor = (db, ts, tactic) => ts.legend ? buildSide(ts.team, legendRoster(db, ts.team), tactic) : buildSide(ts.team, realRoster(db, ts.team, ts.season), tactic);

// 無限模式第 n 關（0 起算）：對手戰力依關數平滑成長，76 起每關 +0.36（第 20 關約 83、第 50 關約 94、第 80 關約 104）
// 對手依序取當季、歷史強隊、傳奇隊，再以全隊能力加成補到目標戰力
export const infTarget = (n) => 76 + 0.36 * n;
export function infOpponent(db, n) {
  const all = teamSeasons(db), latest = db.seasons[db.seasons.length - 1];
  const pool = [...all.filter(x => x.season === latest).sort((a, b) => a.power - b.power),
    ...all.filter(x => x.season !== latest).sort((a, b) => b.power - a.power).slice(0, 30).reverse(),
    ...legendTeams(db).slice().sort((a, b) => a.power - b.power)];
  const target = infTarget(n);
  // 找戰力不超過目標、最接近的一隊（循環使用），差距用加成補齊
  const cands = pool.filter(x => x.power <= target + .5);
  const base = cands.length ? cands[cands.length - 1 - (n % Math.min(4, cands.length))] : pool[0];
  return { ...base, bonus: Math.max(0, Math.round((target - base.power) * 10) / 10) };
}

// 爬塔：從第 1 關一路往上，不能選關；每天重置時退回前一天進度的 5 關之前
export const TOWER_BACK = 5, TOWER_LOSSES = 3;
export const floorReward = (f) => 50 + Math.min(f, 30) * 5;
export function infState(save) {
  let s = save.inf;
  if (!s || s.floor == null) s = save.inf = { date: today(), floor: 1, best: 0, losses: 0, base: null, fatigue: {}, milestones: (s && s.milestones) || {} };
  if (s.date !== today()) {
    s.date = today(); s.floor = Math.max(1, s.floor - TOWER_BACK); s.losses = 0; s.base = null; s.fatigue = {};
  }
  return s;
}
export function histState(save) {
  const h = save.hist || (save.hist = { beaten: {}, date: '', n: 0, claimed: {} });
  if (h.date !== today()) { h.date = today(); h.n = 0; h.ln = 0; }
  h.ln = h.ln || 0;
  return h;
}
// 首次擊敗獎勵：依對手戰力 500～5,000
export const histReward = (power) => Math.max(400, Math.min(3000, Math.round(((power - 74) / 8 * 2600 + 400) / 100) * 100));

// 比賽後的疲勞：上場越久扣越多，幾乎沒上場的人恢復一點
export function applyFatigue(run, g, me) {
  for (const p of g.t[me].players) {
    if (!p.key) continue;
    const m = g.box[me][p.id].min;
    const f = run.fatigue[p.key] || 0;
    run.fatigue[p.key] = m >= 5 ? Math.min(.5, f + Math.min(m / 48, 1) * .08) : Math.max(0, f - .04);
  }
}

// 球隊傳奇隊：該隊的黑卡＋隊史（2016-17 起）最強的年度卡補滿 12 人，每位球員一張
let legendCache = null;
export function legendRoster(db, team) {
  const blacks = (db.byTier['黑'] || []).filter(c => c.team === team);
  const used = new Set(blacks.map(who));
  const pool = db.list.filter(c => c.team === team && c.tier !== '黑').sort((a, b) => b.ovr - a.ovr);
  const cs = [...blacks];
  for (const c of pool) { if (cs.length >= 12) break; if (!used.has(who(c))) { used.add(who(c)); cs.push(c); } }
  const starters = [], rest = cs.slice().sort((a, b) => b.ovr - a.ovr);
  for (const slot of SLOTS) { const i = rest.findIndex(c => c.group === SLOT_GROUP[slot]); starters.push(rest.splice(i >= 0 ? i : 0, 1)[0]); }
  return [...starters, ...rest].map(c => ({ c, plus: 0 }));
}
export function legendTeams(db) {
  if (legendCache) return legendCache;
  legendCache = TEAMS.filter(t => (db.byTier['黑'] || []).some(c => c.team === t))
    .map(t => ({ season: '傳奇', team: t, key: `legend|${t}`, legend: true, power: buildSide(t, legendRoster(db, t)).power }));
  return legendCache;
}
export const legendSide = (db, lt, tactic) => buildSide(lt.team, legendRoster(db, lt.team), tactic);
export const LEGEND_DAILY = 3, LEGEND_REPEAT = 300;

// 賽季難度：對手全隊能力加成與獎勵倍率（模擬依各階段戰力分配，讓每個階段都有約五成勝率的選擇）
export const SEASON_DIFF = [
  { name: '一般', boost: -4, mul: 1 }, { name: '困難', boost: 0, mul: 1.3 }, { name: '菁英', boost: 3, mul: 1.6 },
  { name: '傳奇', boost: 6, mul: 2 }, { name: '地獄', boost: 9, mul: 2.5 }, { name: '煉獄', boost: 12, mul: 3 },
];
// 傳奇挑戰星級：★1 為原本戰力，每多一星全隊 +6
export const LEGEND_STARS = 5, STAR_BOOST = 3;
