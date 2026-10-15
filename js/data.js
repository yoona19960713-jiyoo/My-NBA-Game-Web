// 卡片資料（打包時從 output/cards.json 複製進來）與本機存檔
import { assignTraits } from './traits.js';
import { loadStaff } from './staff.js';
const SAVE_KEY = 'mynba.save.v1';

export async function loadDB() {
  const res = await fetch('data/cards.json');
  const list = await res.json();
  const cards = {}, byTier = {};
  for (const c of list) {
    c.key = c.season + '|' + c.id;
    cards[c.key] = c;
    (byTier[c.tier] = byTier[c.tier] || []).push(c);
  }
  const seasons = [...new Set(list.map(c => c.season))].sort();
  try {   // 黑卡（傳奇球員）
    const legends = await (await fetch('data/legends.json')).json();
    for (const c of legends) { c.key = c.season + '|' + c.id; cards[c.key] = c; (byTier[c.tier] = byTier[c.tier] || []).push(c); list.push(c); }
  } catch (e) { /* 沒有黑卡資料 */ }
  assignTraits({ list });
  let art = {}, templates = [];
  // Android 安裝版不內建人物圖（APK 比較小、更新比較快）：人物圖清單與圖片都從網頁版讀取，手機會自動快取
  let artRemote = null;
  const cfg = (typeof window !== 'undefined' && window.GAME_CONFIG) || {}, cap = typeof window !== 'undefined' && window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cfg.webUrl) {
    try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
      art = await (await fetch(`${cfg.webUrl}art/manifest.json?v=${encodeURIComponent(cfg.version || '')}`, { signal: ctl.signal })).json(); clearTimeout(t); artRemote = cfg.webUrl;
    } catch (e) { art = {}; }
  }
  if (!artRemote) { try { art = await (await fetch('art/manifest.json')).json(); } catch (e) { /* 還沒有人物圖 */ } }
  try { templates = await (await fetch('art/_tpl/templates.json')).json(); } catch (e) { /* 沒有模板 */ }
  // 綠卡（新秀每週數值）：每週一結算；安裝版從網頁版讀最新的一份
  let green = null;
  try { const base = artRemote || (cfg.webUrl && cap && cap.isNativePlatform && cap.isNativePlatform() ? cfg.webUrl : '');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    green = await (await fetch(`${base}data/green.json?t=${Math.floor(Date.now() / 3600e3)}`, { signal: ctl.signal })).json(); clearTimeout(t);
  } catch (e) { green = null; }
  if (green && Array.isArray(green.cards)) {
    byTier['綠'] = [];
    for (const g of green.cards) { const c = { ...g, key: 'green|' + g.id, season: 'green', tier: '綠', lv: g.lv, week: green.week, gid: g.id }; cards[c.key] = c; byTier['綠'].push(c); }
  }
  const db = { cards, byTier, list, seasons, art, templates, artRemote, green };
  try { loadStaff(db, await (await fetch('data/staff.json')).json()); } catch (e) { db.staff = []; }
  return db;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 空間不足時略過 */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 略過 */ }
}

let seq = Date.now();
export const newUid = () => (seq++).toString(36);
