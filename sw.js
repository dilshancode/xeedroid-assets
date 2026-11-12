/**
 * XEEDROID - Service Worker (sw.js)
 * High-performance caching for offline support, icons, images, CSS, scripts, and pages.
 */

const CACHE_NAME = 'xeedroid-cache-v11';

// All critical assets to cache immediately upon installation
const PRECACHE_ASSETS = [
  '/',
  '/videos',
  '/posts',
  '/about',
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/css/style.css',
  '/js/main.js',
  '/js/youtube-api.js',
  '/js/video-catalog.js',
  '/assets/icons/Logo_No_bg 1.png',
  '/assets/icons/logo.png'
];

// Helper to resolve URLs relative to the service worker's root scope
function getScopeUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

// 1. Install Event: Cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const fullUrls = PRECACHE_ASSETS.map((path) => getScopeUrl(path));
      return Promise.allSettled(
        fullUrls.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[XEEDROID SW] Precache skip: ${url}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Intelligent Caching Strategies
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests and external origins (e.g. YouTube, Blogger APIs)
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Strategy A: Cache-First for static assets (images, icons, fonts)
  if (
    url.pathname.includes('/assets/') ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        }).catch(() => {
          return caches.match(getScopeUrl('assets/icons/Logo_No_bg 1.png'));
        });
      })
    );
    return;
  }

  // Strategy B: Network-First for CSS & JS
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' }).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Strategy C: Network-First for HTML navigation
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(request).then((cached) => cached || caches.match(getScopeUrl('/')));
      })
    );
    return;
  }

  // Default: Cache with network fallback
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
