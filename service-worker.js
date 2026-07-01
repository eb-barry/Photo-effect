const CACHE_NAME = "photo-editor-v0.1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/styles/main.css",
  "./assets/icons/app-icon-192.svg",
  "./assets/icons/app-icon-512.svg",
  "./js/app.js",
  "./js/home/homeScreen.js",
  "./js/core/canvasManager.js",
  "./js/core/imageLoader.js",
  "./js/core/exportManager.js",
  "./js/features/F1_mirror/mirrorPage.js",
  "./js/features/F1_mirror/mirrorTool.js",
  "./js/features/F1_mirror/mirrorUI.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
