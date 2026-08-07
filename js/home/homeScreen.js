import { buildFeatures } from "../config/features.js";
import { iconButton } from "../core/iconLoader.js";
export function renderHomeScreen(root, navigate){
  const features = buildFeatures();
  root.innerHTML = `<main class="app-shell"><header class="home-header"><h1>Photo Effects</h1><p>影像創作工具箱</p>${iconButton({ icon:"settings", label:"設定", id:"settingsBtn", className:"home-settings" })}</header><section class="icon-grid" aria-label="功能列表">${features.map(feature => `<button class="feature-icon ${feature.enabled ? "is-enabled" : "is-disabled"}" ${feature.enabled ? "" : "disabled"} data-route="${feature.route || ""}" aria-label="${feature.label}" type="button"><span class="icon-tile">${feature.icon ? `<img src="${feature.icon}" alt="" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />` : ""}<span class="icon-fallback">${feature.id}</span></span><span class="icon-label">${feature.label}</span></button>`).join("")}</section></main>`;
  root.querySelector("#settingsBtn")?.addEventListener("click", event => { event.preventDefault(); navigate("settings"); });
  root.querySelectorAll(".feature-icon.is-enabled").forEach(button => button.addEventListener("click", event => { event.preventDefault(); const route = button.dataset.route; if (route) navigate(route); }));
}
