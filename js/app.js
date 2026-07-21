import { renderHomeScreen } from "./home/homeScreen.js";
import { applySettings } from "./config/settingsStore.js";
import { pruneOversizedLocalDrafts } from "./core/draftStorage.js";

const app = document.getElementById("app");

/** Lazy feature loaders — keep home boot off the F1–F5 module graphs. */
const routeLoaders = {
  home: () => Promise.resolve({ run: (root, navigate) => renderHomeScreen(root, navigate) }),
  settings: () => import("./settings/settingsPage.js").then(mod => ({
    run: (root, navigate) => mod.renderSettingsPage(root, navigate)
  })),
  F1_mirror: () => import("./features/F1_mirror/mirrorPage.js").then(mod => ({
    run: (root, navigate) => mod.renderMirrorPage(root, navigate)
  })),
  F2_crystalBall: () => import("./features/F2_crystalBall/crystalPage.js").then(mod => ({
    run: (root, navigate) => mod.initCrystalBallPage(root, { goHome: () => navigate("home") })
  })),
  F3_magicSky: () => import("./features/F3_magicSky/magicSkyPage.js").then(mod => ({
    run: (root, navigate) => mod.initMagicSkyPage(root, { goHome: () => navigate("home") })
  })),
  F4_starburst: () => import("./features/F4_starburst/starburstPage.js").then(mod => ({
    run: (root, navigate) => mod.initStarburstPage(root, { goHome: () => navigate("home") })
  })),
  F5_frame: () => import("./features/F5_frame/framePage.js").then(mod => ({
    run: (root, navigate) => mod.initFramePage(root, { goHome: () => navigate("home") })
  })),
  F6_photoWall: () => import("./features/F6_photoWall/photoWallPage.js").then(mod => ({
    run: (root, navigate) => mod.initPhotoWallPage(root, { goHome: () => navigate("home") })
  }))
};

let navSerial = 0;

async function navigate(routeName){
  const serial = ++navSerial;
  const key = routeLoaders[routeName] ? routeName : "home";
  try {
    const { run } = await routeLoaders[key]();
    if (serial !== navSerial) return;
    run(app, navigate);
    window.scrollTo({ top: 0, behavior: "instant" });
  } catch (error) {
    console.error(`[app] failed to open route: ${key}`, error);
    if (key !== "home" && serial === navSerial) {
      navigate("home");
    }
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=0.4.18.0").catch(console.warn);
  });
}

// Drop multi‑MB photo drafts from localStorage so the whole origin stays responsive.
pruneOversizedLocalDrafts();
applySettings();
navigate("home");
