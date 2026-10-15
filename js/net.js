// 好友連線友誼賽：用 Firebase Realtime Database（REST＋即時串流），沿用遊戲原本的登入
// ・presence/{邀請碼}：在線狀態（每 30 秒更新一次）
// ・invites/{對方邀請碼}/{我的邀請碼}：邀請
// ・rooms/{房間}/…：雙方陣容、回覆、比賽畫面與操作
import { cloudOn, myCode, authToken, fbConf } from './cloud.js';

const dbURL = () => { const f = fbConf() || {}; return (f.databaseURL || `https://${f.projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`).replace(/\/$/, ''); };
async function url(path) { return `${dbURL()}/${path}.json?auth=${encodeURIComponent(await authToken())}`; }
async function rq(method, path, body) {
  const r = await fetch(await url(path), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? '連線對戰尚未開放（即時資料庫未設定）' : '連線失敗');
  return r.status === 204 ? null : r.json();
}
export const rget = (p) => rq('GET', p), rput = (p, d) => rq('PUT', p, d), rpost = (p, d) => rq('POST', p, d), rdel = (p) => rq('DELETE', p);
// 即時串流：路徑底下有變動就回呼（第一次會收到目前的全部資料）
export async function rstream(path, onData) {
  const es = new EventSource(await url(path));
  const h = (e) => { try { const d = JSON.parse(e.data); onData(d.path, d.data); } catch (err) { /* 心跳 */ } };
  es.addEventListener('put', h); es.addEventListener('patch', h);
  return es;
}

// ---------- 在線狀態 ----------
let presT = 0, myNick = '';
export const appVer = () => (window.GAME_CONFIG || {}).version || 'dev';   // 版本不同的兩人不能連線對戰
export function startPresence(nick) {
  myNick = nick || myNick; if (!cloudOn() || !myCode()) return;
  const beat = () => rput(`presence/${myCode()}`, { nick: myNick, ver: appVer(), at: { '.sv': 'timestamp' } }).catch(() => {});
  clearInterval(presT); beat(); presT = setInterval(() => { if (!document.hidden) beat(); }, 30000);
}
export function stopPresence() { clearInterval(presT); }   // 不刪掉紀錄，好友才看得到「最後上線時間」
// 在線狀態：on＝75 秒內有心跳（上線中）；all＝每個人最後一次上線的時間
export async function presenceAll() {
  const p = await rget('presence'), t = Date.now(), on = {}, all = {};
  for (const [c, v] of Object.entries(p || {})) { if (!v || !v.at) continue; all[c] = v; if (t - v.at < 75000) on[c] = v; }
  return { on, all };
}
export async function onlineMap() { return (await presenceAll()).on; }

// ---------- 邀請 ----------
export async function sendInvite(to, roomId, lineup) {
  await rput(`rooms/${roomId}`, { host: myCode(), guest: to, lineup_h: lineup, at: { '.sv': 'timestamp' } });
  await rput(`invites/${to}/${myCode()}`, { nick: myNick, room: roomId, ver: appVer(), at: { '.sv': 'timestamp' } });
}
export const cancelInvite = (to, roomId) => Promise.all([rdel(`invites/${to}/${myCode()}`), rdel(`rooms/${roomId}`)]).catch(() => {});
export function listenInvites(cb) { if (!cloudOn() || !myCode()) return null; return rstream(`invites/${myCode()}`, (path, data) => {
  if (path === '/') { if (data) for (const [from, v] of Object.entries(data)) cb(from, v); }
  else { const from = path.split('/')[1]; if (data && from) cb(from, data); } }); }
export const clearInvite = (from) => rdel(`invites/${myCode()}/${from}`).catch(() => {});
export const answerInvite = async (roomId, ok, lineup, why) => { if (ok) await rput(`rooms/${roomId}/lineup_g`, lineup); await rput(`rooms/${roomId}/answer`, ok ? 'accept' : (why || 'reject')); };

// 往返延遲（毫秒）：連續量 4 次取中位數
export async function measureRtt() { const a = []; for (let i = 0; i < 4; i++) { const t = performance.now(); await rget('.info/serverTimeOffset').catch(() => {}); a.push(performance.now() - t); } a.sort((x, y) => x - y); return (a[1] + a[2]) / 2; }

// ---------- 比賽中的傳輸 ----------
// 房主：畫面（覆蓋 st，只留最新）＋事件（push 到 h）；對方：搖桿（覆蓋 gs）＋按鍵（push 到 g）
export function transport(roomId, role, delay) {
  const R = `rooms/${roomId}`, subs = [], cbs = [];
  let stBusy = false, stNext = null, gsBusy = false, gsNext = null;
  const putLatest = (path, m, busyKey) => {   // 同一時間只送一個，沒送完的只保留最新那一筆
    if (busyKey === 'st') { if (stBusy) { stNext = m; return; } stBusy = true; rput(path, m).catch(() => {}).finally(() => { stBusy = false; if (stNext) { const n = stNext; stNext = null; putLatest(path, n, 'st'); } }); }
    else { if (gsBusy) { gsNext = m; return; } gsBusy = true; rput(path, m).catch(() => {}).finally(() => { gsBusy = false; if (gsNext) { const n = gsNext; gsNext = null; putLatest(path, n, 'gs'); } }); }
  };
  const emit = (m) => cbs.forEach(f => f(m));
  const seen = new Set();
  const pushed = (path, data) => {   // push 進來的訊息（第一次會收到全部，用 id 去重）
    if (path === '/') { if (data) Object.entries(data).sort().forEach(([id, m]) => { if (!seen.has(id)) { seen.add(id); emit(m); } }); }
    else { const id = path.slice(1); if (data && !seen.has(id)) { seen.add(id); emit(data); } } };
  if (role === 'host') { rstream(`${R}/g`, pushed).then(e => subs.push(e)); rstream(`${R}/gs`, (p, d) => { if (d) emit(d); }).then(e => subs.push(e)); }
  else { rstream(`${R}/h`, pushed).then(e => subs.push(e)); rstream(`${R}/st`, (p, d) => { if (d) emit(d); }).then(e => subs.push(e)); }
  return {
    role, delay,
    send(m) {
      if (role === 'host') { if (m.k === 'st') putLatest(`${R}/st`, m, 'st'); else rpost(`${R}/h`, m).catch(() => {}); }
      else { if (m.k === 's') putLatest(`${R}/gs`, m, 'gs'); else rpost(`${R}/g`, m).catch(() => {}); }
    },
    onMessage(f) { cbs.push(f); },
    close() { subs.forEach(e => e.close()); if (role === 'host') setTimeout(() => rdel(R).catch(() => {}), 3000); },
  };
}
