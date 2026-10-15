// 比賽模擬引擎（由原型校準後的參數移植）
// 能力對應：得分 sc、內線 ins、外線 thr、罰球 ft、組織 pm、籃板 reb、防守 de、耐力 sta
const P = {
  poss: 99, baseIn: .566, baseMid: .41, baseThr: .344, kIn: .0032, kMid: .0035, kThr: .0046,
  baseTo: .148, kTo: .0016, baseOrb: .245, kOrb: .0025, foulIn: .24, foulMid: .07, foulThr: .02,
  ast: .62, drain: 1 / 820, recover: 1 / 520, fatFloor: .86,
};
const MAP = { '得分': 'sc', '內線': 'ins', '外線': 'thr', '罰球': 'ft', '組織': 'pm', '籃板': 'reb', '防守': 'de', '耐力': 'sta' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const short = (n) => { const p = (n || '').split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : n; };

// entries: [{ name, group, abil:{得分…}, slot }]，前 5 位為先發（PG SG SF PF C），之後為板凳
export function makeTeam(abbr, entries, tactic) {
  const players = entries.map((e, i) => {
    const ab = {};
    for (const [zh, k] of Object.entries(MAP)) ab[k] = e.abil[zh];
    return { id: abbr + i, key: e.key, name: e.name, short: short(e.name), group: e.group, ab, starter: i < 5 };
  });
  return { abbr, players, starters: players.slice(0, 5), bench: players.slice(5), tactic: tactic || { pace: '中', focus: '均衡', defense: '人盯人' } };
}

export class Game {
  constructor(home, away, rand = Math.random) {
    this.t = [home, away]; this.rand = rand;
    this.score = [0, 0]; this.q = 0; this.clock = 720; this.side = 0;
    this.qScore = [[], []];
    this.energy = [{}, {}]; this.on = [[...home.starters], [...away.starters]];
    this.box = [{}, {}];
    this.team = [0, 1].map(() => ({ fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0, tov: 0, orb: 0, drb: 0, stl: 0 }));
    this.run = [0, 0]; this.events = [];
    for (const s of [0, 1]) for (const p of this.t[s].players) {
      this.energy[s][p.id] = 1;
      this.box[s][p.id] = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0, min: 0 };
    }
    this.plan = [this.defaultPlan(home), this.defaultPlan(away)];
    this.used = [{}, {}];
  }

  // 每節上場分鐘：先發 9/9/8/8/8、替補 4/4/4/3/3，其餘 0（合計 60）
  defaultPlan(team) {
    const plan = {};
    const base = [9, 9, 8, 8, 8, 4, 4, 4, 3, 3, 0, 0];
    team.players.forEach((p, i) => { plan[p.id] = base[i] || 0; });
    return plan;
  }

  eff(p, s, k) { return p.ab[k] * (P.fatFloor + (1 - P.fatFloor) * this.energy[s][p.id]); }

  rotate(s, crunch) {
    const on = this.on[s], team = this.t[s], used = this.used[s], plan = this.plan[s], en = this.energy[s];
    if (crunch) {   // 關鍵時刻：讓體力足夠的先發回場
      this.on[s] = team.starters.map((st, i) => (en[st.id] > .25 ? st : on[i]));
      return;
    }
    for (let i = 0; i < 5; i++) {
      const cur = on[i];
      const left = (plan[cur.id] || 0) * 60 - (used[cur.id] || 0);
      if (left > 0 && en[cur.id] > .35) continue;
      const cands = team.players.filter(p => !on.includes(p) && ((plan[p.id] || 0) * 60 - (used[p.id] || 0)) > 20);
      if (!cands.length) continue;
      cands.sort((a, b) => (b.group === cur.group) - (a.group === cur.group) || en[b.id] - en[a.id]);
      on[i] = cands[0];
    }
  }

  tick(secs) {
    for (const s of [0, 1]) {
      const onIds = new Set(this.on[s].map(p => p.id));
      for (const p of this.t[s].players) {
        if (onIds.has(p.id)) {
          const rate = P.drain * (1 + (70 - p.ab.sta) / 60);
          this.energy[s][p.id] = Math.max(0, this.energy[s][p.id] - rate * secs);
          this.box[s][p.id].min += secs / 60;
          this.used[s][p.id] = (this.used[s][p.id] || 0) + secs;
        } else {
          this.energy[s][p.id] = Math.min(1, this.energy[s][p.id] + P.recover * secs);
        }
      }
    }
  }

  weights(s) {
    const focus = this.t[s].tactic.focus;
    return this.on[s].map(p => {
      const usage = Math.exp((this.eff(p, s, 'sc') - 70) / 22);
      let wi = .37 * Math.exp((p.ab.ins - 70) / 22), wm = .27 * Math.exp((p.ab.sc - 70) / 20), wt = .39 * Math.exp((p.ab.thr - 70) / 20);
      if (focus === '內線') { wi *= 1.15; wt *= .88; } else if (focus === '外線') { wt *= 1.15; wi *= .88; }
      const t = wi + wm + wt;
      return { p, usage, sw: [wi / t, wm / t, wt / t] };
    });
  }

  makeProb(s, p, stype, scheme, double) {
    const o = 1 - s;
    const idx = this.on[s].indexOf(p);
    const dfd = this.on[o][idx >= 0 ? idx : 0];
    const teamDef = this.on[o].reduce((a, q) => a + this.eff(q, o, 'de'), 0) / 5;
    let dval = .6 * this.eff(dfd, o, 'de') + .4 * teamDef, prob, foul;
    if (stype === 'ins') {
      const rim = this.on[o].reduce((m, q) => (q.ab.de + q.ab.reb > m.ab.de + m.ab.reb ? q : m));
      dval = .4 * this.eff(dfd, o, 'de') + .3 * this.eff(rim, o, 'de') + .3 * teamDef;
      prob = P.baseIn + P.kIn * (this.eff(p, s, 'ins') - dval); foul = P.foulIn;
    } else if (stype === 'mid') {
      prob = P.baseMid + P.kMid * (this.eff(p, s, 'sc') - dval); foul = P.foulMid;
    } else {
      prob = P.baseThr + P.kThr * (this.eff(p, s, 'thr') - dval); foul = P.foulThr;
    }
    const focus = this.t[s].tactic.focus;
    if (focus === '內線' && stype === 'ins') prob += .016;
    if (focus === '外線' && stype === 'thr') prob += .022;
    if (scheme === '區域聯防') prob += stype === 'ins' ? -.035 : stype === 'thr' ? .025 : 0;
    if (double) prob += p === double ? -.12 : .03;
    return { prob: clamp(prob, .15, .8), foul, dfd };
  }

  ftPct(p, s) { return clamp(.745 + .0045 * (this.eff(p, s, 'ft') - 70), .45, .93); }

  log(s, text, big = false) {
    const m = Math.floor(this.clock / 60), sec = Math.floor(this.clock % 60);
    this.events.push({ q: this.q + 1, clock: `${m}:${String(sec).padStart(2, '0')}`, side: s, text, big, score: [...this.score] });
  }

  // 一個回合；card = { p, stype } 由玩家指定（最後 5 分鐘用），double = 包夾對象
  possession(s, card = null, double = null, opts = {}) {
    const o = 1 - s, st = this.team[s], box = this.box[s], R = this.rand;
    const scheme = opts.scheme || this.t[o].tactic.defense;
    const handler = this.on[s].reduce((m, p) => (p.ab.pm + R() * 10 > m.ab.pm + R() * 10 ? p : m));
    const teamDef = this.on[o].reduce((a, q) => a + this.eff(q, o, 'de'), 0) / 5;
    let pTo = P.baseTo - P.kTo * (this.eff(handler, s, 'pm') - teamDef) + (opts.press ? .045 : 0) + (opts.toAdj || 0);
    this.last = { tov: false, shooter: card ? card.p : null, stype: card ? card.stype : null, made: false, foul: false, pts: 0 };
    if (R() < clamp(card ? pTo * .8 : pTo, .03, .3)) {
      st.tov++; box[(card ? card.p : handler).id].tov++; this.last.tov = true;
      if (R() < .55) {   // 抄截
        const thief = this.on[o].reduce((m, q) => (q.ab.de + R() * 25 > m.ab.de + R() * 25 ? q : m));
        this.box[o][thief.id].stl++; this.team[o].stl++;
        if (R() < .25) this.log(o, `${thief.short} 抄截得手`);
      }
      return 0;
    }
    let pts = 0, picked = !!card;
    for (let guard = 0; guard < 6; guard++) {
      let p, stype;
      if (card) { p = card.p; stype = card.stype; card = null; } else {
        const w = this.weights(s).map(x => ({ ...x, usage: x.usage * (double && x.p === double ? .55 : 1) }));
        let r = R() * w.reduce((a, x) => a + x.usage, 0);
        let pick = w[0];
        for (const x of w) { r -= x.usage; if (r <= 0) { pick = x; break; } }
        p = pick.p; const r2 = R();
        stype = r2 < pick.sw[0] ? 'ins' : r2 < pick.sw[0] + pick.sw[1] ? 'mid' : 'thr';
      }
      let { prob, foul, dfd } = this.makeProb(s, p, stype, scheme, double);
      if (opts.focus && p === opts.focus) prob -= .06;
      if (picked) {
        const key = { ins: 'ins', mid: 'sc', thr: 'thr' }[stype];
        if (p.ab[key] - dfd.ab.de > 6) prob += .045;
        prob = clamp(prob + (opts.probAdj || 0), .08, .9);
        foul = clamp(foul * (opts.foulMult || 1), 0, .6);
        picked = false;
      }
      this.last.shooter = p; this.last.stype = stype; this.last.dfd = dfd;
      const b = box[p.id], val = stype === 'thr' ? 3 : 2;
      if (R() < foul) {
        this.last.foul = true;
        const made = R() < prob * .45, nft = made ? 1 : val;
        this.last.made = made;
        if (made) { pts += val; b.fga++; b.fgm++; st.fga++; st.fgm++; if (val === 3) { b.tpa++; b.tpm++; st.tpa++; st.tpm++; } }
        const ftp = Math.min(.97, this.ftPct(p, s) + (opts.ftAdj && opts.ftFor === p ? opts.ftAdj : 0)); let ftm = 0;
        for (let k = 0; k < nft; k++) { b.fta++; st.fta++; if (R() < ftp) { b.ftm++; st.ftm++; pts++; ftm++; } }
        b.pts += pts;
        if (made) this.log(s, `${p.short} ${val === 3 ? '三分出手命中' : '強攻得手'}並造成犯規，加罰${ftm ? '命中' : '不進'}`, val === 3);
        return pts;
      }
      b.fga++; st.fga++; if (val === 3) { b.tpa++; st.tpa++; }
      if (R() < prob) {
        this.last.made = true;
        b.fgm++; st.fgm++; if (val === 3) { b.tpm++; st.tpm++; }
        b.pts += val;
        let astBy = null;
        if (R() < P.ast) {
          const others = this.on[s].filter(q => q !== p);
          astBy = others.reduce((m, q) => (q.ab.pm + R() * 25 > m.ab.pm + R() * 25 ? q : m));
          box[astBy.id].ast++;
        }
        const desc = stype === 'thr' ? (R() < .3 ? '底角三分命中' : '三分球命中') : stype === 'ins' ? (p.ab.ins > 85 && R() < .4 ? '灌籃得手' : '切入上籃得手') : '中距離跳投命中';
        if (stype === 'thr' || R() < .35) this.log(s, `${astBy && R() < .5 ? `${astBy.short} 助攻，` : ''}${p.short} ${desc}`, stype === 'thr' && this.clock < 120);
        return pts + val;
      }
      if (stype === 'ins' && R() < .12) {
        const blk = this.on[o].reduce((m, q) => (q.ab.de + q.ab.reb + R() * 30 > m.ab.de + m.ab.reb + R() * 30 ? q : m));
        this.box[o][blk.id].blk++;
        if (R() < .5) this.log(o, `${blk.short} 送出火鍋，封阻 ${p.short}`);
      }
      const oreb = this.on[s].reduce((a, q) => a + this.eff(q, s, 'reb'), 0) / 5;
      const dreb = this.on[o].reduce((a, q) => a + this.eff(q, o, 'reb'), 0) / 5;
      if (R() < clamp(P.baseOrb + P.kOrb * (oreb - dreb) + (opts.orbAdj || 0), .12, .48)) {
        st.orb++; const r = this.on[s].reduce((m, q) => (q.ab.reb + R() * 30 > m.ab.reb + R() * 30 ? q : m)); box[r.id].reb++;
        continue;
      }
      this.team[o].drb++;
      const r = this.on[o].reduce((m, q) => (q.ab.reb + R() * 30 > m.ab.reb + R() * 30 ? q : m)); this.box[o][r.id].reb++;
      return pts;
    }
    return pts;
  }

  secPer() {
    const pace = (x) => ({ '快': 1.06, '中': 1, '慢': .94 }[x.tactic.pace] || 1);
    return 2880 / (2 * P.poss * (pace(this.t[0]) + pace(this.t[1])) / 2);
  }

  // 一般回合推進，直到本節剩 stopAt 秒
  advance(stopAt = 0) {
    const sp = this.secPer();
    while (this.clock > stopAt) {
      const crunch = this.q >= 3 && this.clock <= 300 && Math.abs(this.score[0] - this.score[1]) <= 15;
      this.rotate(0, crunch); this.rotate(1, crunch);
      const before = this.score[this.side];
      this.score[this.side] += this.possession(this.side);
      const gained = this.score[this.side] - before;
      if (gained) { this.run[this.side] += gained; this.run[1 - this.side] = 0; if (this.run[this.side] >= 8 && this.run[this.side] - gained < 8) this.log(this.side, `${this.t[this.side].abbr} 打出一波 ${this.run[this.side]}：0 攻勢`, true); }
      const dt = sp * (.7 + .6 * this.rand());
      this.tick(Math.min(dt, this.clock)); this.clock -= dt;
      this.side = 1 - this.side;
    }
    if (stopAt === 0) this.endQuarter();
  }

  // 玩家參與的回合（最後 5 分鐘）：回傳得分與事件
  playerPossession(s, card, double, secs, opts = {}) {
    const before = this.score[s], n = this.events.length;
    this.score[s] += this.possession(s, card, double, opts);
    const dt = Math.min(secs, this.clock); this.tick(dt); this.clock -= dt;
    this.side = 1 - s;
    return { pts: this.score[s] - before, events: this.events.slice(n) };
  }

  // 罰球（加罰狀態等）
  freeThrows(s, p, n) {
    const ftp = this.ftPct(p, s), b = this.box[s][p.id]; let made = 0;
    for (let k = 0; k < n; k++) { b.fta++; this.team[s].fta++; if (this.rand() < ftp) { b.ftm++; this.team[s].ftm++; made++; } }
    b.pts += made; this.score[s] += made; return made;
  }

  // 犯規戰術：讓對手罰球最差的人上罰球線
  foulGame(defSide) {
    const s = 1 - defSide, p = this.on[s].reduce((m, q) => (q.ab.ft < m.ab.ft ? q : m));
    const ftp = this.ftPct(p, s), b = this.box[s][p.id]; let made = 0;
    for (let k = 0; k < 2; k++) { b.fta++; this.team[s].fta++; if (this.rand() < ftp) { b.ftm++; this.team[s].ftm++; made++; } }
    b.pts += made; this.score[s] += made;
    const dt = Math.min(4, this.clock); this.tick(dt); this.clock -= dt; this.side = defSide;
    this.log(s, `犯規戰術：${p.short} 兩罰${made}中`);
    return made;
  }

  // 暫停換人：on 場上第 i 位換成 player
  substitute(s, i, player) { this.on[s][i] = player; }

  endQuarter() {
    for (const s of [0, 1]) this.qScore[s].push(this.score[s] - this.qScore[s].reduce((a, b) => a + b, 0));
    this.q++; this.clock = this.q >= 4 ? 300 : 720; this.used = [{}, {}];
  }

  get over() { return this.q >= 4 && this.score[0] !== this.score[1]; }

  // 一口氣模擬到結束（跳過比賽、AI 對戰用）
  finish() {
    while (this.q < 4) this.advance(0);
    while (this.score[0] === this.score[1]) this.advance(0);   // 延長賽每節 5 分鐘
    return this.score;
  }
}

// 雙方戰力 → 預估勝率（AI 對 AI 快速模擬用）
export function quickResult(powA, powB, rand = Math.random) {
  const pct = (powA - powB) / powB * 100;
  const pA = 1 / (1 + Math.exp(-pct / 4.5)) * .96 + .02;   // 依引擎實測校準
  const aWin = rand() < pA;
  const base = 106 + Math.round(rand() * 14), margin = 2 + Math.round(Math.abs(rand() + rand() - 1) * 18);
  return aWin ? [base + margin, base] : [base, base + margin];
}
