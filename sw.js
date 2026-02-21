/* Service Worker - La versión (CACHE_NAME) se actualiza con: node update-version.js 1.0.9 */
const CACHE_NAME = 'dragonkeep-v1.0.9';

/** Base path del SW (ej. /dm-dashboard-modular/) para que funcione bajo subpath */
function getBase() {
  var path = self.location.pathname;
  var i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '/';
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var base = getBase();
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request));
    return;
  }
  var path = url.pathname;
  var rel = path.indexOf(base) === 0 ? (path.slice(base.length) || 'index.html') : path.replace(/^\//, '');
  var isHtml = /\.html?$/i.test(rel) || path === base || path === base.replace(/\/$/, '');
  var isAsset = /\.(css|js|png|ico|woff2?|webp|svg)$/i.test(rel) || rel.indexOf('icons/') === 0;

  /* No cachear el SW para que siempre se descargue la versión nueva al desplegar */
  if (rel === 'sw.js' || path.endsWith('/sw.js')) {
    e.respondWith(fetch(e.request));
    return;
  }

  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then(function (r) { return r.ok ? r : Promise.reject(new Error('not ok')); })
        .then(function (r) {
          var clone = r.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, clone); });
          return r;
        })
        .catch(function () {
          return caches.match(e.request).then(function (cached) {
            if (cached) return cached;
            return caches.match(base + 'index.html').then(function (cached) {
              return cached || caches.match('index.html');
            });
          });
        })
    );
    return;
  }

  if (isAsset) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        if (cached) return cached;
        return fetch(e.request).then(function (r) {
          if (!r.ok) return r;
          var clone = r.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, clone); });
          return r;
        });
      })
    );
    return;
  }

  e.respondWith(fetch(e.request));
});
