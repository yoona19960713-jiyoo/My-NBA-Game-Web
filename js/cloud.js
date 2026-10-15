// 雲端存檔（Firebase，直接用 REST API，不需要額外套件）
// ・每位玩家用你發的「邀請碼」建立帳號；換手機輸入同一組碼即可接回進度
// ・存檔只保留最新一份（無法回溯），進度變動後幾秒內自動上傳
// ・重新開始需冷卻 2 天（由雲端資料庫規則強制，刪遊戲重裝也繞不過）
const K = { code: 'mynba.cloud.code', refresh: 'mynba.cloud.refresh', uid: 'mynba.cloud.uid' };
const fb = () => (window.GAME_CONFIG || {}).firebase || null;
export const cloudOn = () => { const f = fb(); return !!(f && f.apiKey && f.projectId); };
export const myCode = () => localStorage.getItem(K.code) || '';
export const myUid = () => localStorage.getItem(K.uid) || '';

let idToken = '', tokenExp = 0;
async function auth() {
  const f = fb(); if (idToken && Date.now() < tokenExp - 60000) return idToken;
  const refresh = localStorage.getItem(K.refresh);
  let res;
  if (refresh) {
    res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${f.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh)}` });
    if (res.ok) { const j = await res.json(); idToken = j.id_token; tokenExp = Date.now() + (+j.expires_in) * 1000; localStorage.setItem(K.refresh, j.refresh_token); localStorage.setItem(K.uid, j.user_id); return idToken; }
  }
  res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${f.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  if (!res.ok) throw new Error('無法連線到雲端');
  const j = await res.json(); idToken = j.idToken; tokenExp = Date.now() + (+j.expiresIn) * 1000;
  localStorage.setItem(K.refresh, j.refreshToken); localStorage.setItem(K.uid, j.localId); return idToken;
}
export const authToken = () => auth();   // 給即時連線（Realtime Database）用
export const fbConf = () => fb();
const base = () => `https://firestore.googleapis.com/v1/projects/${fb().projectId}/databases/(default)/documents`;
const docName = (p) => `projects/${fb().projectId}/databases/(default)/documents/${p}`;
async function req(method, path, body) {
  const t = await auth();
  const res = await fetch(`${base()}/${path}`, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error(res.status === 403 ? '沒有權限' : `雲端回應 ${res.status}`); e.status = res.status; throw e; }
  return res.status === 204 ? {} : res.json();
}
const val = (f) => (f ? (f.stringValue ?? f.integerValue ?? f.timestampValue ?? f.booleanValue ?? null) : null);
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---- 邀請碼：綁定這台裝置 ----
export async function claim(code) {
  code = normCode(code); if (code.length < 6) throw new Error('邀請碼格式不正確');
  const inv = await req('GET', `invites/${code}`); if (!inv) throw new Error('找不到這組邀請碼');
  await auth();
  await req('PATCH', `invites/${code}?updateMask.fieldPaths=uid`, { fields: { uid: { stringValue: myUid() } } });
  localStorage.setItem(K.code, code);
  return code;
}

// ---- 存檔 ----
export async function fetchSave() {
  const d = await req('GET', `saves/${myCode()}`); if (!d) return null;
  return { save: JSON.parse(val(d.fields.data)), updatedAt: +val(d.fields.updatedAt) || 0 };
}
let pending = null, timer = 0, inflight = null;
export async function pushNow(save) {
  if (!cloudOn() || !myCode()) return true;
  pending = null; clearTimeout(timer);
  const body = { fields: { data: { stringValue: JSON.stringify(save) }, updatedAt: { integerValue: String(save.savedAt || Date.now()) }, uid: { stringValue: myUid() } } };
  inflight = req('PATCH', `saves/${myCode()}`, body).then(() => true).catch(() => false);
  return inflight;
}
// 進度變動後 3 秒內上傳（合併連續的變動）
export function pushSoon(save) { if (!cloudOn() || !myCode()) return; pending = save; clearTimeout(timer); timer = setTimeout(() => pending && pushNow(pending), 3000); }

// ---- 重新開始（雲端規則限制 2 天一次；擁有者不受限） ----
export async function restart() {
  const t = await auth(); const code = myCode();
  const res = await fetch(`${base()}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [
    { update: { name: docName(`invites/${code}`), fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: 'lastReset', setToServerValue: 'REQUEST_TIME' }] },
    { delete: docName(`saves/${code}`) },
  ] }) });
  if (res.status === 403) throw new Error('距離上次重新開始還不到 2 天');
  if (!res.ok) throw new Error('無法連線到雲端');
  return true;
}
export async function lastReset() { const d = await req('GET', `invites/${myCode()}`); const v = d && val(d.fields.lastReset); return v ? Date.parse(v) : 0; }

// ---- 擁有者工具：產生與查看邀請碼 ----
export async function createInvite(name) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = ''; for (let i = 0; i < 8; i++) code += abc[Math.floor(Math.random() * abc.length)];
  await req('PATCH', `invites/${code}`, { fields: { name: { stringValue: name || '' }, uid: { stringValue: '' } } });
  return code;
}
export async function listInvites() {
  const d = await req('GET', 'invites?pageSize=100'); if (!d || !d.documents) return [];
  return d.documents.map(x => ({ code: x.name.split('/').pop(), name: val(x.fields.name) || '', used: !!val(x.fields.uid), lastReset: val(x.fields.lastReset) }));
}
// ---- 測試帳號：擁有者在 Firestore 的 grants/{邀請碼} 設定一次性補發（玩家只能讀、不能寫） ----
export async function fetchGrant() {
  if (!cloudOn() || !myCode()) return null;
  const d = await req('GET', `grants/${myCode()}`); if (!d || !d.fields) return null;
  return { id: String(val(d.fields.id) || 'grant'), mult: Number(val(d.fields.mult) || d.fields.mult?.doubleValue || 1), note: String(val(d.fields.note) || '') };
}
// 補發前把目前存檔備份一份（backups/{邀請碼}_{補發代號}，只能新增、不能讀改）
export async function backupBeforeGrant(save, id) {
  const body = { fields: { data: { stringValue: JSON.stringify(save) }, at: { integerValue: String(Date.now()) }, uid: { stringValue: myUid() }, code: { stringValue: myCode() } } };
  await req('PATCH', `backups/${myCode()}_${id}`, body);
}
// ---- 好友名片：每位玩家一份（profiles/{邀請碼}），只能寫自己的、大家都能讀 ----
export async function pushProfile(p) {
  if (!cloudOn() || !myCode()) return;
  const fields = { nick: { stringValue: p.nick || '' }, mgr: { integerValue: String(p.mgr || 1) }, power: { doubleValue: +p.power || 0 },
    cards: { integerValue: String(p.cards || 0) }, starters: { stringValue: JSON.stringify(p.starters || []) }, test: { booleanValue: !!p.test },
    updatedAt: { integerValue: String(Date.now()) }, uid: { stringValue: myUid() } };
  await req('PATCH', `profiles/${myCode()}`, { fields });
}
export async function listProfiles() {
  const d = await req('GET', 'profiles?pageSize=100'); if (!d || !d.documents) return [];
  return d.documents.map(x => { const f = x.fields || {}; let st = []; try { st = JSON.parse(val(f.starters) || '[]'); } catch (e) { /* 舊資料 */ }
    return { code: x.name.split('/').pop(), nick: val(f.nick) || '', mgr: +val(f.mgr) || 1, power: f.power ? +(f.power.doubleValue ?? f.power.integerValue ?? 0) : 0,
      cards: +val(f.cards) || 0, starters: st, test: !!(f.test && f.test.booleanValue), updatedAt: +val(f.updatedAt) || 0 }; });
}
export async function ensureSignedIn() { await auth(); return myUid(); }
export const forgetDevice = () => { localStorage.removeItem(K.code); };


// ---- 開發者：讀取所有玩家的存檔（Firestore 規則只允許擁有者讀） ----
export async function listSaves() {
  const out = []; let tok = '';
  for (let i = 0; i < 5; i++) { const d = await req('GET', `saves?pageSize=100${tok ? `&pageToken=${tok}` : ''}`); if (!d || !d.documents) break;
    for (const x of d.documents) { let data = null; try { data = JSON.parse(val(x.fields.data) || 'null'); } catch (e) { /* 壞掉的存檔 */ }
      out.push({ code: x.name.split('/').pop(), data, updatedAt: +val(x.fields.updatedAt) || 0 }); }
    if (!d.nextPageToken) break; tok = d.nextPageToken; }
  return out;
}
