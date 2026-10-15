// 賽季模式：分區、賽程、真實球隊陣容、戰績
import { SLOTS, SLOT_GROUP, bonds, effective, teamPower } from './rules.js';
import { makeTeam, quickResult } from './sim.js';

export const CONF = {
  東區: { 大西洋組: ['BOS', 'BKN', 'NY', 'PHI', 'TOR'], 中央組: ['CHI', 'CLE', 'DET', 'IND', 'MIL'], 東南組: ['ATL', 'CHA', 'MIA', 'ORL', 'WSH'] },
  西區: { 西北組: ['DEN', 'MIN', 'OKC', 'POR', 'UTAH'], 太平洋組: ['GS', 'LAC', 'LAL', 'PHX', 'SAC'], 西南組: ['DAL', 'HOU', 'MEM', 'NO', 'SA'] },
};
export const TEAM_ZH = { ATL: '老鷹', BOS: '塞爾提克', BKN: '籃網', CHA: '黃蜂', CHI: '公牛', CLE: '騎士', DAL: '獨行俠', DEN: '金塊', DET: '活塞', GS: '勇士',
  HOU: '火箭', IND: '溜馬', LAC: '快艇', LAL: '湖人', MEM: '灰熊', MIA: '熱火', MIL: '公鹿', MIN: '灰狼', NO: '鵜鶘', NY: '尼克', OKC: '雷霆', ORL: '魔術',
  PHI: '76人', PHX: '太陽', POR: '拓荒者', SAC: '國王', SA: '馬刺', TOR: '暴龍', UTAH: '爵士', WSH: '巫師' };
export const TEAMS = Object.values(CONF).flatMap(c => Object.values(c).flat());
export const confOf = (t) => Object.keys(CONF).find(k => Object.values(CONF[k]).flat().includes(t));

// 82 場賽程：同組 4 場、同區不同組 3 或 4 場、跨區 2 場；排成每天最多 15 場、每隊一天一場
export function buildSchedule(rand = Math.random) {
  const info = {};
  for (const [cf, divs] of Object.entries(CONF)) Object.values(divs).forEach((teams, d) => teams.forEach((t, i) => (info[t] = { cf, d, i })));
  const games = [];
  for (let a = 0; a < TEAMS.length; a++) for (let b = a + 1; b < TEAMS.length; b++) {
    const A = info[TEAMS[a]], B = info[TEAMS[b]];
    let n = 2;
    if (A.cf === B.cf) n = A.d === B.d ? 4 : ((A.i + B.i + A.d + B.d) % 5 <= 1 ? 3 : 4);
    for (let k = 0; k < n; k++) games.push(k % 2 ? [TEAMS[a], TEAMS[b]] : [TEAMS[b], TEAMS[a]]);
  }
  for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }
  const days = [], busy = [];
  for (const g of games) {
    let d = 0;
    while (d < days.length && (days[d].length >= 15 || busy[d].has(g[0]) || busy[d].has(g[1]))) d++;
    if (d === days.length) { days.push([]); busy.push(new Set()); }
    days[d].push(g); busy[d].add(g[0]); busy[d].add(g[1]);
  }
  return days;
}

// 真實球隊：最新一季該隊總評最高的 12 人；不足 12 人時以替補球員補齊
export function realRoster(db, abbr, seasonArg) {
  const season = seasonArg || db.seasons[db.seasons.length - 1];
  let cs = db.list.filter(c => c.season === season && c.team === abbr).sort((a, b) => b.ovr - a.ovr).slice(0, 12);
  while (cs.length < 12) {
    const g = ['G', 'F', 'C'][cs.length % 3];
    cs.push({ key: `filler|${abbr}|${cs.length}`, id: `filler${abbr}${cs.length}`, name: `${abbr} Reserve ${cs.length + 1}`, team: abbr, season, group: g, pos: g, tier: '銅', ovr: 55,
      abil: { 得分: 55, 內線: 55, 外線: 55, 罰球: 60, 組織: 55, 籃板: 55, 防守: 55, 耐力: 60 }, filler: true });
  }
  const starters = [], rest = [...cs];
  for (const slot of SLOTS) {
    const i = rest.findIndex(c => c.group === SLOT_GROUP[slot]);
    starters.push(rest.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return [...starters, ...rest].map(c => ({ c, plus: 0 }));
}

// 把 [{ c, plus }]（前 5 位為先發）轉成模擬用球隊與戰力
// extra(card)：額外加成（玩家隊伍的教練羈絆、世仇）
export function buildSide(abbr, entries, tactic, extra) {
  const b = bonds(entries.filter(e => e && !e.c.filler).map(e => e.c));
  const effs = entries.map((e, i) => effective(e.c, e.plus, (b.bonus.get(e.c.key) || 0) + (extra && !e.c.filler ? extra(e.c) : 0), i < 5 ? SLOTS[i] : null));
  const power = teamPower(effs.slice(0, 5).map(x => x.pw), effs.slice(5).map(x => x.pw)).total;
  const team = makeTeam(abbr, entries.map((e, i) => ({ key: e.c.filler ? null : e.c.key, name: e.c.name, group: e.c.group, abil: effs[i].abil })), tactic);
  return { team, power, bonds: b };
}

export function standings(season) {
  const rec = {};
  TEAMS.forEach(t => (rec[t] = { t, w: 0, l: 0, last: [] }));
  season.days.forEach((day, d) => day.forEach((g, i) => {
    const r = season.results[`${d}-${i}`];
    if (!r) return;
    const [h, a] = g, hw = r[0] > r[1];
    rec[h][hw ? 'w' : 'l']++; rec[a][hw ? 'l' : 'w']++;
    rec[h].last.push(hw ? 'W' : 'L'); rec[a].last.push(hw ? 'L' : 'W');
  }));
  const conf = {};
  for (const cf of Object.keys(CONF)) {
    conf[cf] = Object.values(CONF[cf]).flat().map(t => rec[t])
      .sort((x, y) => (y.w - y.l) - (x.w - x.l) || y.w - x.w);
  }
  return { rec, conf };
}

// 依序列出玩家球隊的比賽
export function userGames(season) {
  const out = [];
  season.days.forEach((day, d) => day.forEach((g, i) => { if (g.includes(season.team)) out.push({ d, i, g, id: `${d}-${i}` }); }));
  return out;
}

// 模擬到第 d 天（不含玩家的比賽）
export function simulateOthers(season, uptoDay) {
  for (let d = 0; d <= uptoDay && d < season.days.length; d++) {
    season.days[d].forEach((g, i) => {
      const id = `${d}-${i}`;
      if (season.results[id] || g.includes(season.team)) return;
      season.results[id] = quickResult(season.power[g[0]] + 1, season.power[g[1]]);   // 主場 +1
    });
  }
}

// ---------- 附加賽與季後賽 ----------
// 階段：附加賽第一輪（7v8、9v10）→ 附加賽第二輪（7v8 敗者 vs 9v10 勝者）→ 首輪 → 分區準決賽 → 分區冠軍賽 → 總冠軍賽
export const STAGES = ['playinA', 'playinB', 'R1', 'R2', 'CF', 'Finals'];
export const STAGE_ZH = { playinA: '附加賽', playinB: '附加賽（爭第 8 種子）', R1: '季後賽首輪', R2: '分區準決賽', CF: '分區冠軍賽', Finals: '總冠軍賽' };
const HOME_PATTERN = [true, true, false, false, true, false, true];   // 2-2-1-1-1，true 為高種子主場

export function postInit(se) {
  const st = standings(se);
  se.post = { stage: 'playinA', seeds: {}, series: [], done: {}, champion: null, rewarded: {} };
  for (const cf of Object.keys(CONF)) se.post.seeds[cf] = st.conf[cf].map(r => r.t);
  makeStage(se);
}

function series(se, conf, hi, lo, need, tag) {
  return { id: `${se.post.stage}-${conf}-${tag}`, stage: se.post.stage, conf, hi, lo, need, wins: [0, 0], games: [], tag };
}

function makeStage(se) {
  const P = se.post, out = [];
  for (const cf of Object.keys(CONF)) {
    const s = P.seeds[cf], d = P.done;
    if (P.stage === 'playinA') { out.push(series(se, cf, s[6], s[7], 1, '7v8'), series(se, cf, s[8], s[9], 1, '9v10')); }
    if (P.stage === 'playinB') out.push(series(se, cf, d[`${cf}-7v8-loser`], d[`${cf}-9v10-winner`], 1, '8th'));
    if (P.stage === 'R1') {
      const seed = [s[0], s[1], s[2], s[3], s[4], s[5], d[`${cf}-7v8-winner`], d[`${cf}-8th-winner`]];
      P.bracket = P.bracket || {}; P.bracket[cf] = seed;
      [[0, 7], [3, 4], [2, 5], [1, 6]].forEach(([a, b], k) => out.push(series(se, cf, seed[a], seed[b], 4, `r1-${k}`)));
    }
    if (P.stage === 'R2') [[0, 1], [2, 3]].forEach(([a, b], k) => out.push(orderBySeed(se, cf, d[`${cf}-r1-${a}-winner`], d[`${cf}-r1-${b}-winner`], `r2-${k}`)));
    if (P.stage === 'CF') out.push(orderBySeed(se, cf, d[`${cf}-r2-0-winner`], d[`${cf}-r2-1-winner`], 'cf'));
  }
  if (P.stage === 'Finals') {
    const st = standings(se), e = d2(se, '東區'), w = d2(se, '西區');
    const better = (st.rec[e].w - st.rec[e].l) >= (st.rec[w].w - st.rec[w].l) ? [e, w] : [w, e];
    out.push(series(se, 'NBA', better[0], better[1], 4, 'finals'));
  }
  P.series = out;
}
const d2 = (se, cf) => se.post.done[`${cf}-cf-winner`];
function orderBySeed(se, cf, a, b, tag) {
  const seed = se.post.bracket[cf];
  return seed.indexOf(a) <= seed.indexOf(b) ? series(se, cf, a, b, 4, tag) : series(se, cf, b, a, 4, tag);
}

export function userSeries(se) {
  return se.post && se.post.series.find(s => (s.hi === se.team || s.lo === se.team) && Math.max(...s.wins) < s.need);
}

export function nextPostGame(s) {
  const n = s.games.length;
  const hiHome = s.need === 1 ? true : HOME_PATTERN[n];
  return hiHome ? [s.hi, s.lo] : [s.lo, s.hi];
}

export function addPostResult(se, s, home, score) {
  const hiWon = (home === s.hi) === (score[0] > score[1]);
  s.wins[hiWon ? 0 : 1]++;
  s.games.push({ home, score });
  if (Math.max(...s.wins) >= s.need) {
    const winner = s.wins[0] >= s.need ? s.hi : s.lo, loser = winner === s.hi ? s.lo : s.hi;
    se.post.done[`${s.conf}-${s.tag}-winner`] = winner; se.post.done[`${s.conf}-${s.tag}-loser`] = loser;
    if (s.tag === 'finals') se.post.champion = winner;
  }
}

// 模擬所有不含玩家的系列賽，整個階段結束就進到下一階段；玩家出局後一路模擬到總冠軍
export function postAdvance(se) {
  const P = se.post;
  for (let guard = 0; guard < 20 && !P.champion; guard++) {
    for (const s of P.series) {
      if (s.hi === se.team || s.lo === se.team) continue;
      while (Math.max(...s.wins) < s.need) {
        const [h, a] = nextPostGame(s);
        addPostResult(se, s, h, quickResult(se.power[h] + 1, se.power[a]));
      }
    }
    if (P.series.some(s => Math.max(...s.wins) < s.need)) return;   // 等玩家打完
    const i = STAGES.indexOf(P.stage);
    if (i >= STAGES.length - 1) return;
    P.stage = STAGES[i + 1];
    makeStage(se);
  }
}
