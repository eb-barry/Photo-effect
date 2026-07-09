const CACHE_NAME = "photo-effects-v0.3.8.1";

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
  "./js/home/homeScreen.js",
  "./js/settings/settingsPage.js",
  "./js/features/F1_mirror/mirrorPage.js",
  "./js/features/F1_mirror/mirrorTool.js",
  "./js/features/F1_mirror/mirrorUI.js",
  "./js/features/F1_mirror/mirrorState.js",
  "./js/features/F2_crystalBall/crystalPage.js",
  "./js/features/F2_crystalBall/crystalTool.js",
  "./js/features/F2_crystalBall/crystalUI.js",
  "./js/features/F2_crystalBall/crystalState.js",
  "./js/features/F2_crystalBall/crystalAssets.js",
  "./js/features/F2_crystalBall/crystalFeature.js",
  "./assets/features/F2_crystalBall/scenes/manifest.json",
  "./assets/features/F2_crystalBall/seats/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)))
  );
  self.clients.claim();
});

function isAppCodeRequest(url){
  return /\.(html|css|js)(\?|$)/i.test(url.pathname) || url.pathname.endsWith("/");
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(response => {
        if (response && response.ok && isAppCodeRequest(new URL(event.request.url))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});
