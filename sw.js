// 網頁版離線快取：程式與資料「先抓網路、失敗用快取」（確保更新）；圖片「先用快取」（省流量、離線也能玩）
const VER = 'mynba-140';
const SHELL = ['./', './index.html', './css/style.css', './config.js', './manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isImg = /\.(webp|png|jpg|jpeg|svg)$/i.test(new URL(req.url).pathname);
  if (isImg) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const cp = res.clone(); caches.open(VER).then(c => c.put(req, cp)); return res; })));
  } else {
    e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(VER).then(c => c.put(req, cp)); return res; }).catch(() => caches.match(req)));
  }
});
