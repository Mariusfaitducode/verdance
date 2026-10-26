/* Verdance — service worker : l'app s'ouvre même sans réseau, et prévient quand c'est ton tour. */
const CACHE = 'verdance-v3';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'net.js', 'world.js', 'rules.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // Réseau d'abord pour l'app (mises à jour immédiates), cache en secours ; cache d'abord pour three.js, polices et modèles.
  const static_ = url.origin !== location.origin || url.pathname.startsWith('/models/');
  if (static_) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return res; })));
  } else {
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))));
  }
});
// Push sans contenu : le serveur dit seulement « c'est ton tour ».
self.addEventListener('push', e => {
  let data = {}; try { data = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title || 'Verdance', {
    body: data.body || 'C’est ton tour de jouer.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'verdance-turn', renotify: true,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
