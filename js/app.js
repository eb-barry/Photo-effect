import { renderHomeScreen } from "./home/homeScreen.js";
import { renderSettingsPage } from "./settings/settingsPage.js";
import { renderMirrorPage } from "./features/F1_mirror/mirrorPage.js";
import { initCrystalBallPage } from "./features/F2_crystalBall/crystalPage.js";
import { applySettings } from "./config/settingsStore.js";

const app = document.getElementById("app");

const routes = {
  home: () => renderHomeScreen(app, navigate),
  settings: () => renderSettingsPage(app, navigate),
  F1_mirror: () => renderMirrorPage(app, navigate),
  F2_crystalBall: () => initCrystalBallPage(app, { goHome: () => navigate("home") })
};

function navigate(routeName){
  const route = routes[routeName] || routes.home;
  route();
  window.scrollTo({ top: 0, behavior: "instant" });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=0.3.8").catch(console.warn);
  });
}

applySettings();
navigate("home");
