const CACHE = 'nonlodire-v5';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './game.js', './cards.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/zilla-slab-600.woff2', './fonts/zilla-slab-700.woff2',
  './fonts/atkinson-hyperlegible-400.woff2', './fonts/atkinson-hyperlegible-700.woff2',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' scavalca la cache HTTP (GitHub Pages: max-age=600): senza, una versione
  // nuova installata entro 10 minuti dall'ultima apertura metteva in cache i file VECCHI.
  const fresh = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
