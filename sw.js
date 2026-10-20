const CACHE_NAME = 'sakura-anime-list-v11-bodoni-close-gear';
const APP_SHELL = [
  './', './index.html', './styles.css', './config.js', './app.js', './manifest.webmanifest',
  './assets/flower.svg', './assets/avatar-reference.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const requestUrl = new URL(event.request.url);
  // config.js may be edited after deployment: fetch the latest settings, rather than a stale cached copy.
  if (requestUrl.pathname.endsWith('/config.js')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
