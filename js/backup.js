// 存檔備份：自動上傳到 GitHub 私人 repo（每次上傳都是一個版本，可挑選還原），另有手動匯出／匯入
const LAST_KEY = 'mynba.backup.last';
const FILE = 'save.json';
const HOUR = 3600 * 1000;

const KEY_TOKEN = 'mynba.backup.token', KEY_REPO = 'mynba.backup.repo';
// 備份金鑰只存在這台裝置；App 與網頁版都不會內含金鑰，別人安裝也不會寫進你的備份
export const setBackupKey = (repo, token) => { if (token) { localStorage.setItem(KEY_TOKEN, token.trim()); localStorage.setItem(KEY_REPO, repo.trim()); } else { localStorage.removeItem(KEY_TOKEN); localStorage.removeItem(KEY_REPO); } };
const cfg = () => {
  const g = window.GAME_CONFIG || {}, token = localStorage.getItem(KEY_TOKEN) || g.saveToken, repo = localStorage.getItem(KEY_REPO) || g.saveRepo;
  return token && repo ? { saveToken: token, saveRepo: repo } : null;
};
export const cloudReady = () => !!cfg();
export const lastBackup = () => +(localStorage.getItem(LAST_KEY) || 0);

const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64decode = (b64) => { const bin = atob(b64.replace(/\n/g, '')); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); };

async function api(path, opt = {}) {
  const c = cfg();
  const res = await fetch(`https://api.github.com/repos/${c.saveRepo}/${path}`, {
    ...opt,
    headers: { Authorization: `Bearer ${c.saveToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub 回應 ${res.status}${res.status === 401 ? '（金鑰無效或已過期）' : ''}`);
  return res.json();
}

let busy = false;
export async function upload(save, note = '自動備份') {
  if (!cfg() || busy) return false;
  busy = true;
  try {
    const cur = await api(`contents/${FILE}`);
    const body = { message: `${note} · ${new Date().toLocaleString('zh-TW', { hour12: false })}`, content: b64encode(JSON.stringify(save)) };
    if (cur && cur.sha) body.sha = cur.sha;
    await api(`contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    localStorage.setItem(LAST_KEY, String(Date.now()));
    return true;
  } finally { busy = false; }
}

// 距離上次備份超過 1 小時才上傳，失敗時不打擾玩家
export function maybeBackup(save) {
  if (!cfg() || Date.now() - lastBackup() < HOUR) return;
  upload(save).catch(() => {});
}

export async function history() {
  const list = await api(`commits?path=${FILE}&per_page=20`);
  return (list || []).map(c => ({ sha: c.sha, date: c.commit.author.date, msg: c.commit.message }));
}

export async function fetchVersion(sha) {
  const f = await api(`contents/${FILE}?ref=${sha}`);
  if (!f) throw new Error('找不到這個版本');
  if (f.content) return JSON.parse(b64decode(f.content));
  const blob = await api(`git/blobs/${f.sha}`);   // 超過 1MB 的檔案改用 blob 讀取
  return JSON.parse(b64decode(blob.content));
}

// 手動匯出：寫成檔案後叫出 Android 分享選單（可存到雲端硬碟、傳給自己）
export async function exportSave(save) {
  const P = window.Capacitor && window.Capacitor.Plugins;
  const text = JSON.stringify(save);
  const name = `my-nba-game-save-${new Date().toISOString().slice(0, 10)}.json`;
  if (P && P.Filesystem && P.Share) {
    const r = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await P.Share.share({ title: 'My NBA Game 存檔', url: r.uri, dialogTitle: '匯出存檔' });
    return;
  }
  const a = document.createElement('a');   // 瀏覽器中測試用
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
}

export function readImport(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { const s = JSON.parse(r.result); if (!s || !Array.isArray(s.cards) || !s.lineup) throw new Error('不是 My NBA Game 的存檔'); resolve(s); } catch (e) { reject(e); } };
    r.onerror = () => reject(new Error('讀取檔案失敗'));
    r.readAsText(file);
  });
}
