// Service worker: يخزّن التطبيق ليعمل بدون إنترنت. غيّر رقم الإصدار عند تحديث الملفات.
const V = 'quran-player-v2';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin && u.hostname !== 'fonts.googleapis.com' && u.hostname !== 'fonts.gstatic.com') return;
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
