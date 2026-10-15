// 關鍵時刻挑戰：用即時對戰打的短情境。對手強度以「你的戰力 + 差距」設定，所以不管陣容強弱都有挑戰性
// goal：win＝時間到時領先（同分算失敗）；stars：第 2、3 顆星的附加條件
export const CLUTCH_STAR = {
  noTO: '不叫暫停', perfect: '至少 1 次完美出手', stl: '抄截或封阻至少 1 次', op0: '對手一分都沒拿到',
  no3: '對手沒投進三分', margin3: '贏 3 分以上', sig: '發動招牌武器',
};
export const CLUTCH_CH = [
  { id: 1, name: '新手篇', gap: -4, coin: 300, desc: '對手比你弱一點，熟悉關鍵時刻的節奏' },
  { id: 2, name: '逆轉篇', gap: 0, coin: 500, desc: '實力相當，要在落後時把比賽追回來' },
  { id: 3, name: '守成篇', gap: 3, coin: 700, desc: '對手比你強，守住領先比得分更難' },
  { id: 4, name: '傳奇篇', gap: 5, coin: 1000, desc: '對上傳奇球隊，最後幾秒決勝負', legend: true },
];
// diff：開打時我方減對手的分差；clock：剩餘秒數；poss：誰的球；shot：這一波的進攻時間；st：雙方體力
export const CLUTCH = [
  { id: 'c1', ch: 1, opp: 'MIL', name: '最後一擊', diff: 0, clock: 24, poss: 'me', shot: 24, st: [.8, .8], stars: ['perfect', 'noTO'], intro: '平手、剩 24 秒，你的球。投進就贏！' },
  { id: 'c2', ch: 1, opp: 'MIA', name: '守住它', diff: 2, clock: 20, poss: 'op', shot: 20, st: [.8, .8], stars: ['op0', 'stl'], intro: '領先 2 分、剩 20 秒，對手進攻。守下來！' },
  { id: 'c3', ch: 1, opp: 'CHA', name: '一分之差', diff: -1, clock: 30, poss: 'me', shot: 24, st: [.75, .75], stars: ['noTO', 'perfect'], intro: '落後 1 分、剩 30 秒，你的球。' },
  { id: 'c4', ch: 1, opp: 'NY', name: '反擊時刻', diff: 0, clock: 40, poss: 'op', shot: 24, st: [.75, .75], stars: ['stl', 'margin3'], intro: '平手、剩 40 秒，先守住再反擊。' },
  { id: 'c5', ch: 2, opp: 'TOR', name: '一球逆轉', diff: -2, clock: 24, poss: 'me', shot: 24, st: [.7, .7], stars: ['perfect', 'noTO'], intro: '落後 2 分、剩 24 秒，你的球。投三分直接逆轉，或兩分後再守一波。' },
  { id: 'c6', ch: 2, opp: 'WSH', name: '四分逆轉', diff: -4, clock: 60, poss: 'me', shot: 24, st: [.65, .65], stars: ['stl', 'noTO'], intro: '落後 4 分、剩 1 分鐘，需要連續得分加一次好防守。' },
  { id: 'c7', ch: 2, opp: 'UTAH', name: '先斷後攻', diff: -1, clock: 24, poss: 'op', shot: 12, st: [.7, .7], stars: ['stl', 'perfect'], intro: '落後 1 分、剩 24 秒，對手持球、進攻時間只剩 12 秒。守下來再反擊！' },
  { id: 'c8', ch: 2, opp: 'HOU', name: '撐過疲勞', diff: -3, clock: 75, poss: 'me', shot: 24, st: [.45, .7], stars: ['noTO', 'margin3'], intro: '落後 3 分、剩 75 秒，你的球員都累了，記得叫暫停換人。' },
  { id: 'c9', ch: 3, opp: 'SA', name: '一分領先', diff: 1, clock: 30, poss: 'op', shot: 24, st: [.7, .7], to: 1, stars: ['op0', 'noTO'], intro: '領先 1 分、剩 30 秒，對手進攻，你只剩 1 次暫停。' },
  { id: 'c10', ch: 3, opp: 'BOS', name: '封鎖三分線', diff: 3, clock: 24, poss: 'op', shot: 24, st: [.7, .7], stars: ['no3', 'op0'], intro: '領先 3 分、剩 24 秒，別讓對手投三分！' },
  { id: 'c11', ch: 3, opp: 'LAC', name: '消耗時間', diff: 2, clock: 45, poss: 'me', shot: 12, st: [.65, .65], stars: ['margin3', 'noTO'], intro: '領先 2 分、剩 45 秒，你的球但進攻時間只剩 12 秒。' },
  { id: 'c12', ch: 3, opp: 'GS', name: '最後一分鐘', diff: 0, clock: 60, poss: 'op', shot: 24, st: [.35, .7], stars: ['stl', 'margin3'], intro: '平手、剩 1 分鐘，你的球員體力見底。' },
  { id: 'c13', ch: 4, legend: 0, name: '傳奇最後一擊', diff: -2, clock: 10, poss: 'me', shot: 10, st: [.7, .7], stars: ['perfect', 'noTO'], intro: '落後 2 分、剩 10 秒，對上傳奇球隊。' },
  { id: 'c14', ch: 4, legend: 1, name: '傳奇攻勢', diff: 1, clock: 30, poss: 'op', shot: 24, st: [.7, .7], stars: ['op0', 'stl'], intro: '領先 1 分、剩 30 秒，傳奇球隊持球。' },
  { id: 'c15', ch: 4, legend: 2, name: '兩分之差', diff: -2, clock: 45, poss: 'me', shot: 24, st: [.65, .65], stars: ['noTO', 'sig'], intro: '落後 2 分、剩 45 秒，用你的招牌武器！' },
  { id: 'c16', ch: 4, legend: 3, name: '傳奇決戰', diff: 0, clock: 60, poss: 'me', shot: 24, st: [.6, .6], stars: ['noTO', 'margin3'], intro: '平手、剩 1 分鐘，最後的決戰。' },
];
// 結算：回傳拿到的星數（0 表示失敗）與各條件是否達成
export function clutchStars(lv, res, startOp) {
  const st = res.stats || {}, m = st.me || {}, o = st.op || {}, [a, b] = res.score || [0, 0];
  if (res.quit || a <= b) return { n: 0, ok: [] };
  const test = { noTO: (res.toUsed || 0) === 0, perfect: (m.perf || 0) >= 1, stl: (m.stl || 0) + (m.blk || 0) >= 1, op0: b === startOp,
    no3: (o.fg3m || 0) === 0, margin3: a - b >= 3, sig: (m.sig || 0) >= 1 };
  const ok = lv.stars.map(k => !!test[k]);
  return { n: 1 + ok.filter(Boolean).length, ok };
}
