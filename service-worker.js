const CACHE_NAME = "photo-effects-v0.9.18.0";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/styles/main.css",
  "./js/app.js",
  "./js/config/features.js",
  "./js/config/settingsStore.js",
  "./js/core/canvasManager.js",
  "./js/core/exportManager.js",
  "./js/core/iconLoader.js",
  "./js/core/imageLoader.js",
  "./js/core/draftStorage.js",
  "./js/home/homeScreen.js",
  "./js/settings/settingsPage.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : null))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url){
  return url.origin === self.location.origin;
}

function shouldCache(url){
  // Cache app shell + static assets. Skip opaque third-party and non-GET handled elsewhere.
  return /\.(html|css|js|json|webp|png|jpg|jpeg|svg|woff2?)(\?|$)/i.test(url.pathname)
    || url.pathname.endsWith("/");
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!isSameOrigin(url)) return;

  event.respondWith(staleWhileRevalidate(event.request, url));
});

async function staleWhileRevalidate(request, url){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok && shouldCache(url)) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  // Serve cache immediately when present — critical for home + feature snappiness on mobile.
  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  if (request.mode === "navigate" || request.destination === "document") {
    const fallback = await cache.match("./index.html");
    if (fallback) return fallback;
  }

  return Response.error();
}
