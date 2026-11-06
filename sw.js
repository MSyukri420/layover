const CACHE = 'layover-v8';
const FILES = ['./', 'index.html', 'styles.css', 'words.js', 'world.js', 'core.js', 'modes-guess.js',
  'modes-word.js', 'modes-logic.js', 'modes-fun.js', 'geo.js', 'chess-data.js', 'chess.js', 'modes-chess.js', 'modes-globe.js', 'boot.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).catch(() =>
        e.request.mode === 'navigate' ? caches.match('index.html') : Response.error());
    })
  );
});
