// 教練與啦啦隊：資料、等級數值、組合效果（數值皆經模擬確認，見設計文件）

export const STYLES = {
  def: { name: '防守體系', icon: '🛡️', ab: 'de', amt: 1, desc: (v) => `被我方干擾的對手出手，命中再 −${pct(.025 * v)}` },
  run: { name: '跑轟進攻', icon: '🏃', ab: 'sta', amt: 2, desc: (v) => `抄截或防守籃板後 6 秒內出手（快攻）命中 +${pct(.12 * v)}` },
  team: { name: '團隊籃球', icon: '🤝', ab: 'pm', amt: 2, desc: (v) => `接球後直接出手命中 +${pct(.05 * v)}` },
  tri: { name: '三角戰術', icon: '🔺', ab: 'pm', amt: 2, desc: (v) => `全隊所有出手命中 +${pct(.03 * v)}` },
  rota: { name: '輪換大師', icon: '🔄', ab: 'sta', amt: 2, desc: (v) => `最後 5 分鐘全隊體力消耗 −${pct(.15 * Math.min(1, v))}` },
  moti: { name: '激勵大師', icon: '🔥', ab: 'sc', amt: 1, desc: (v) => `招牌集氣 +${pct(.5 * v)}，最後 5 分鐘開打就有 ${Math.round(30 * v)} 點集氣` },
  star: { name: '球星驅動', icon: '⭐', ab: 'sc', amt: 1, desc: (v) => `場上總評最高的球員出手命中 +${pct(.12 * v)}` },
  tac: { name: '戰術鬼才', icon: '🧩', ab: 'pm', amt: 2, desc: (v) => `我方傳球被抄截的機率 −${pct(.5 * Math.min(1, v))}` },
  in: { name: '內線體系', icon: '💪', ab: 'ins', amt: 1, desc: (v) => `全隊籃下出手（上籃、灌籃、拋投）命中 +${pct(.13 * v)}` },
  out: { name: '外線體系', icon: '🎯', ab: 'thr', amt: 1, desc: (v) => `全隊三分命中 +${pct(.045 * v)}` },
  pnr: { name: '擋拆體系', icon: '🔁', ab: 'pm', amt: 2, desc: (v) => `叫掩護時擋住對手的時間 +${pct(1 * v)}` },
};
export const AB_ZH = { de: '防守', sta: '耐力', pm: '組織', sc: '得分', ins: '內線', thr: '外線' };
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
export const COACH_TIER = { '紫': 1, '紅': .75, '金': .5 };
export const COACH_MAX = 5, CHEER_MAX = 5;

// 啦啦隊技能：Lv1～Lv5；count 類（次數）不吃同團加成
export const SKILLS = {
  coin: { name: '招財應援', lv: [.02, .03, .04, .05, .06], fmt: v => `比賽遊戲幣 +${pct(v)}`, cap: .084 },
  gift: { name: '每日禮物', lv: [150, 250, 350, 450, 500], fmt: v => `每天第一次開 App 送 ${Math.round(v)} 遊戲幣`, cap: 700 },
  luck: { name: '幸運開包', lv: [.05, .07, .09, .12, .15], fmt: v => `卡包紅卡以上機率 +${pct(v)}（相對）`, cap: .21 },
  discount: { name: '精打細算', lv: [.02, .03, .04, .05, .06], fmt: v => `紫卡指名購買 −${pct(v)}`, cap: .084 },
  enh: { name: '強化祝福', lv: [.01, .02, .03, .04, .05], fmt: v => `強化成功率 +${pct(v)}`, cap: .07 },
  decomp: { name: '分解達人', lv: [.05, .08, .11, .15, .2], fmt: v => `分解點數 +${pct(v)}`, cap: .28 },
  // 原本的次數型技能（加場、挑戰、不屈、傳奇應援）中間等級沒有變化，改成每一級都有感的技能
  exp: { name: '經驗應援', lv: [.04, .06, .08, .1, .12], fmt: v => `經理經驗 +${pct(v)}`, cap: .17 },
  gauge: { name: '集氣應援', lv: [.1, .15, .2, .25, .3], fmt: v => `最後 5 分鐘招牌集氣 +${pct(v)}`, cap: .42 },
  stam: { name: '體力應援', lv: [.04, .06, .08, .1, .12], fmt: v => `最後 5 分鐘我方體力消耗 −${pct(v)}`, cap: .17 },
  toRec: { name: '暫停應援', lv: [.02, .03, .04, .05, .06], fmt: v => `叫暫停時場上體力多回復 ${pct(v)}（原本 10%）`, cap: .084 },
  quick: { name: '快速應援', lv: [.52, .54, .56, .58, .6], fmt: v => `快速模擬獎勵提高到 ${Math.round(v * 100) / 10} 成`, cap: .65 },
  cap: { name: '收藏應援', lv: [100, 200, 300, 400, 500], count: true, fmt: v => `卡冊上限 +${v}` },
};
const SYN = [0, 0, .2, .4];   // 同團 0／1／2／3 人

export function loadStaff(db, data) {
  db.staff = [];
  for (const c of data.coaches) { const x = { ...c, kind: 'coach', season: 'coach', key: 'coach|' + c.id, ovr: { '紫': 95, '紅': 88, '金': 82 }[c.tier], pos: '教練' }; db.cards[x.key] = x; db.staff.push(x); }
  for (const c of data.cheers) { const x = { ...c, kind: 'cheer', season: 'cheer', key: 'cheer|' + c.id, ovr: 0, pos: '應援', team: c.squad.split(' ')[0] }; db.cards[x.key] = x; db.staff.push(x); }
}

export const coachValue = (c, plus, assistant = false) => COACH_TIER[c.tier] * (1 + .1 * (plus || 0)) * (assistant ? .5 : 1);
export function cheerValue(c, plus, syn) {
  const s = SKILLS[c.skill], base = s.lv[Math.min(4, plus || 0)];
  if (s.count) return base;
  if (c.skill === 'quick') return Math.min(s.cap, .5 + (base - .5) * (1 + syn));
  return Math.min(s.cap, base * (1 + syn));
}

// 目前陣容的所有效果
export function staffEffects(save, db) {
  const st = save.staff || {}, own = (uid) => save.cards.find(o => o.uid === uid);
  const fx = { style: {}, abil: {}, timeouts: 0, coin: 0, gift: 0, luck: 0, discount: 0, enh: 0, decomp: 0, games: 0, hist: 0, tower: 0, legend: 0, exp: 0, gauge: 0, stam: 0, toRec: 0, quick: .5, cap: 0, cheers: [], head: null, asst: null };
  for (const [slot, asst] of [['head', false], ['asst', true]]) {
    const o = st[slot] && own(st[slot]); const c = o && db.cards[o.key];
    if (!c || c.kind !== 'coach') continue;
    const v = coachValue(c, o.plus, asst);
    fx[slot] = { c, o, v };
    fx.style[c.style] = Math.max(fx.style[c.style] || 0, v);
    if (!asst) {
      const S = STYLES[c.style];
      fx.abil[S.ab] = S.amt * COACH_TIER[c.tier] * (1 + .1 * (o.plus || 0));
      if (c.tier === '紫') fx.timeouts = 1;
    }
  }
  const cs = (st.cheer || []).map(u => u && own(u)).filter(Boolean).map(o => ({ o, c: db.cards[o.key] })).filter(x => x.c && x.c.kind === 'cheer');
  const squadN = {}; cs.forEach(x => { squadN[x.c.squad] = (squadN[x.c.squad] || 0) + 1; });
  for (const x of cs) {
    const syn = SYN[squadN[x.c.squad]] || 0, v = cheerValue(x.c, x.o.plus, syn);
    x.syn = syn; x.v = v; fx.cheers.push(x);
    if (x.c.skill === 'quick') fx.quick = Math.max(fx.quick, v);
    else fx[x.c.skill] = Math.max(fx[x.c.skill], v);   // 同類技能不疊加，取最高
  }
  return fx;
}

// 升級：需要的重複卡（升到下一級）與遊戲幣（2,000 × 下一級）
export const STAFF_NEED = [1, 1, 2, 2, 3];
export const staffUpCost = (next) => 2000 * next;
