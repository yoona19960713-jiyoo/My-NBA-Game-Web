// 球員特質：紅卡 +5 開 1 個；紫卡 +5／+7 開 2 個；黑卡 +5／+7／+10 開 3 個（在最後 5 分鐘即時對戰生效）
// 數值經模擬調整：每個特質約讓最後 5 分鐘多 0.3～0.55 分（勝率約 +1～1.5%）
export const TRAITS = {
  sharp: { name: '神射手', icon: '🎯', from: '外線', desc: '三分出手命中 +6%' },
  paint: { name: '禁區霸主', icon: '💪', from: '內線', desc: '籃下出手（上籃、灌籃、拋投）命中 +7%' },
  mid: { name: '中距離大師', icon: '🏀', from: '得分', desc: '中距離出手命中 +6%' },
  stop: { name: '防守大閘', icon: '🛡️', from: '防守', desc: '他干擾的對手出手命中再 −5%' },
  clutch: { name: '關鍵先生', icon: '⏱️', from: 'imp', desc: '比賽最後 3 分鐘所有出手命中 +5%' },
  play: { name: '組織大師', icon: '🧠', from: '組織', desc: '他的傳球被抄截機率 −40%，接他傳球直接出手的隊友命中 +4%' },
  reb: { name: '籃板怪物', icon: '🙌', from: '籃板', desc: '搶籃板搆得比較遠、搶贏的機會 +35%' },
  ft: { name: '罰球機器', icon: '🎳', from: '罰球', desc: '被貼身干擾時命中懲罰減少（+3.5%）' },
  iron: { name: '鐵人', icon: '🔋', from: '耐力', desc: '最後 5 分鐘體力消耗 −60%' },
};
const COUNT = { '紅': 1, '紫': 2, '黑': 3 };
export const UNLOCK = { '紅': [5], '紫': [5, 7], '黑': [5, 7, 10] };

// 依同為紅／紫／黑卡的能力百分位，挑出最突出的特質
export function assignTraits(db) {
  const pool = db.list.filter(c => COUNT[c.tier]);
  const val = (c, f) => (f === 'imp' ? (c.imp ?? c.ovr) : c.abil[f]);
  const sorted = {};
  for (const [k, t] of Object.entries(TRAITS)) sorted[k] = pool.map(c => val(c, t.from)).sort((a, b) => a - b);
  const pct = (k, v) => { const a = sorted[k]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo / a.length; };
  for (const c of pool) {
    c.traits = Object.keys(TRAITS).map(k => [k, pct(k, val(c, TRAITS[k].from))]).sort((a, b) => b[1] - a[1]).slice(0, COUNT[c.tier]).map(x => x[0]);
  }
}
export function unlockedTraits(card, plus) {
  if (!card || !card.traits) return [];
  return card.traits.filter((_, i) => (plus || 0) >= UNLOCK[card.tier][i]);
}
