// sw.js — service worker. Precaches the full app shell on install and serves it
// cache-first so there is NO runtime network dependency (airtight offline).
//
// UPDATES: bump CACHE_VERSION to ship any change. On activate we delete caches
// that don't match, and skipWaiting()+clients.claim() make the new SW take over
// promptly. (See README — forgetting to bump CACHE_VERSION means clients keep
// serving the old cached files.)

const CACHE_VERSION = 'aeon-forge-v1';

// Relative paths so the SW works from a domain root OR a project subpath.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js',
  './js/engine/constants.js',
  './js/engine/state.js',
  './js/engine/tick.js',
  './js/engine/save.js',
  './js/engine/offline.js',
  './js/engine/format.js',
  './js/content/resources.js',
  './js/content/generators.js',
  './js/ui/render.js',
  './js/ui/panels.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for GET requests: serve the precached shell, fall back to network
// only for anything not in cache (none expected at runtime).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
