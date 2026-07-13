const CACHE_NAME = "photo-effects-v0.9.5.1";

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
  "./js/core/materialEngine.js",
  "./js/core/frameRenderer.js",
  "./js/core/photoAnalyzer.js",
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
  "./assets/features/F2_crystalBall/seats/manifest.json",
  "./js/features/F3_magicSky/magicSkyPage.js",
  "./js/features/F3_magicSky/magicSkyTool.js",
  "./js/features/F3_magicSky/magicSkyUI.js",
  "./js/features/F3_magicSky/magicSkyState.js",
  "./js/features/F3_magicSky/magicSkyAssets.js",
  "./js/features/F3_magicSky/magicSkyFeature.js",
  "./js/features/F3_magicSky/magicSkySegment.js",
  "./js/features/F3_magicSky/magicSkyBusy.js",
  "./assets/features/F3_magicSky/sunny/manifest.json",
  "./assets/features/F3_magicSky/night/manifest.json",
  "./assets/features/F3_magicSky/sunset/manifest.json",
  "./js/features/F4_starburst/starburstPage.js",
  "./js/features/F4_starburst/starburstTool.js",
  "./js/features/F4_starburst/starburstUI.js",
  "./js/features/F4_starburst/starburstState.js",
  "./js/features/F4_starburst/starburstFeature.js",
  "./js/features/F5_frame/framePage.js",
  "./js/features/F5_frame/frameTool.js",
  "./js/features/F5_frame/frameUI.js",
  "./js/features/F5_frame/frameState.js",
  "./js/features/F5_frame/frameAssets.js",
  "./js/features/F5_frame/frameFeature.js",
  "./assets/features/F5_frame/textures/classic/manifest.json",
  "./assets/features/F5_frame/textures/classic/wood.webp",
  "./assets/features/F5_frame/textures/classic/walnut.webp",
  "./assets/features/F5_frame/textures/classic/oak.webp",
  "./assets/features/F5_frame/textures/classic/pine.webp",
  "./assets/features/F5_frame/textures/classic/gold.webp",
  "./assets/features/F5_frame/textures/classic/silver.webp",
  "./assets/features/F5_frame/textures/classic/bronze.webp",
  "./assets/features/F5_frame/textures/classic/aluminum.webp",
  "./assets/features/F5_frame/textures/classic/acrylic.webp",
  "./assets/features/F5_frame/textures/professional/manifest.json"
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

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(response => {
        if (response && response.ok && isAppCodeRequest(url)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === "navigate" || event.request.destination === "document") {
          return caches.match("./index.html");
        }
        return Response.error();
      }))
  );
});
