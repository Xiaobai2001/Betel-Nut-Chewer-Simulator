const CACHE = 'chew-simulator-v1.1.1';
const FILES = ['./', './index.html', './styles.css', './immersive.css', './model.js', './visuals.js', './immersive-scene.js', './immersive.js', './app.js', './assets/icon.svg', './assets/icon.png', './manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('chew-simulator-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
