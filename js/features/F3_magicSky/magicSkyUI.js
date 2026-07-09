// F3 魔法天空 - UI v0.1.0
// 四按鈕分頁 + 橫向滑動天空素材列 + 影像微調 slider。

import { getMagicSkyItems } from "./magicSkyAssets.js";
import {
  MAGIC_SKY_CONTROL_TABS,
  MAGIC_SKY_PARAMETERS,
  getSelectedSkyIdKey,
  updateMagicSkyState
} from "./magicSkyState.js";

export function mountSkyCarousels(root){
  for (const category of ["sunny", "night", "sunset"]) {
    const host = root.querySelector(`#${category}AssetHost`);
    if (host) host.innerHTML = renderSkyCarousel(getMagicSkyItems(category), category);
  }
  root.querySelectorAll("[data-sky-carousel]").forEach(setupSkyCarousel);
}

export function refreshAllCarouselHints(root){
  root.querySelectorAll("[data-sky-carousel]").forEach(carousel => {
    const track = carousel.querySelector(".crystal-asset-track");
    const left = carousel.querySelector(".crystal-carousel-hint-left");
    const right = carousel.querySelector(".crystal-carousel-hint-right");
    updateCarouselHints(track, left, right);
  });
}

export function setupMagicSkyUI(root, state, render, persistDraft = () => {}){
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const tabPanels = root.querySelector("#magicSkyTabPanels");
  const sunnyPanel = root.querySelector("#sunnyPanel");
  const nightPanel = root.querySelector("#nightPanel");
  const sunsetPanel = root.querySelector("#sunsetPanel");
  const adjustPanel = root.querySelector("#adjustPanel");
  const sliderTarget = root.querySelector("#sliderTarget");
  const slider = root.querySelector("#mainSlider");
  const sliderRow = root.querySelector("#sliderRow");
  const sliderLabel = root.querySelector("#sliderLabel");
  const sliderValue = root.querySelector("#sliderValue");

  function refreshSkyButtons(category){
    const selectedId = state[getSelectedSkyIdKey(category)];
    root.querySelectorAll(`[data-sky-category="${category}"]`).forEach(button => {
      const active = button.dataset.skyId === selectedId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshAllSkyButtons(){
    refreshSkyButtons("sunny");
    refreshSkyButtons("night");
    refreshSkyButtons("sunset");
  }

  function refreshTabBar(){
    tabButtons.forEach(button => {
      const active = state.activeControlTab === button.dataset.controlTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshTabPanels(){
    const tab = state.activeControlTab;
    const expanded = Boolean(tab);
    tabPanels?.classList.toggle("hidden", !expanded);
    sunnyPanel?.classList.toggle("hidden", tab !== "sunny");
    nightPanel?.classList.toggle("hidden", tab !== "night");
    sunsetPanel?.classList.toggle("hidden", tab !== "sunset");
    adjustPanel?.classList.toggle("hidden", tab !== "adjust");
    if (expanded) requestAnimationFrame(() => refreshAllCarouselHints(root));
  }

  function refreshSelectOptions(){
    if (!MAGIC_SKY_PARAMETERS.some(item => item.id === state.selectedParameter)) {
      state.selectedParameter = "skyOpacity";
    }
    sliderTarget.innerHTML = MAGIC_SKY_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    sliderTarget.classList.add("selected");
  }

  function getCurrentConfig(){
    return MAGIC_SKY_PARAMETERS.find(item => item.id === state.selectedParameter) || MAGIC_SKY_PARAMETERS[0];
  }

  function refreshSlider(){
    const showAdjust = state.activeControlTab === "adjust";
    sliderRow?.classList.toggle("hidden", !showAdjust);
    if (!showAdjust) return;

    const config = getCurrentConfig();
    const value = Number(state[config.id] ?? config.min);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    sliderLabel.textContent = config.label;
    sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshTabBar();
    refreshTabPanels();
    refreshAllSkyButtons();
    refreshSelectOptions();
    refreshSlider();
  }

  function toggleControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    Object.assign(state, updateMagicSkyState(state, { activeControlTab: nextTab }));
    refreshAllControls();
    persistDraft();
  }

  tabButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    toggleControlTab(button.dataset.controlTab);
  }));

  for (const category of ["sunny", "night", "sunset"]) {
    const panel = root.querySelector(`#${category}Panel`);
    panel?.addEventListener("click", event => {
      const button = event.target.closest("[data-sky-id]");
      if (!button || button.dataset.skyCategory !== category) return;
      event.preventDefault();
      const key = getSelectedSkyIdKey(category);
      Object.assign(state, updateMagicSkyState(state, {
        [key]: button.dataset.skyId,
        activeSkyCategory: category
      }));
      refreshAllSkyButtons();
      render();
    });
  }

  sliderTarget.addEventListener("change", () => {
    Object.assign(state, updateMagicSkyState(state, { selectedParameter: sliderTarget.value }));
    refreshSlider();
    persistDraft();
  });

  slider.addEventListener("input", () => {
    const config = getCurrentConfig();
    Object.assign(state, updateMagicSkyState(state, { [config.id]: Number(slider.value) }));
    sliderValue.textContent = formatParameterValue(state[config.id], config);
    persistDraft();
  });

  if (!state.activeControlTab) {
    Object.assign(state, updateMagicSkyState(state, { activeControlTab: "sunny" }));
  }

  refreshAllControls();
}

export function renderControlTabs(){
  return MAGIC_SKY_CONTROL_TABS.map(tab => `
    <button
      type="button"
      class="crystal-tab-button"
      data-control-tab="${tab.id}"
      aria-pressed="false"
    >${tab.label}</button>
  `).join("");
}

export function renderSkyCarousel(items, category){
  const labels = { sunny: "晴天", night: "夜晚", sunset: "夕陽" };
  const buttons = items.map(item => `
    <button
      type="button"
      class="magic-sky-button"
      data-sky-category="${category}"
      data-sky-id="${item.id}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="magic-sky-thumb"><img src="${item.asset}" alt="" loading="lazy" /></span>
    </button>
  `).join("");

  return `
    <div class="crystal-asset-carousel" data-sky-carousel="${category}">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="${labels[category] || category}">${buttons}</div>
      <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
    </div>
  `;
}

function setupSkyCarousel(carousel){
  const track = carousel.querySelector(".crystal-asset-track");
  const left = carousel.querySelector(".crystal-carousel-hint-left");
  const right = carousel.querySelector(".crystal-carousel-hint-right");
  if (!track) return;

  const update = () => updateCarouselHints(track, left, right);
  track.addEventListener("scroll", update, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(update);
    observer.observe(track);
    carousel._resizeObserver = observer;
  }
  requestAnimationFrame(update);
}

function updateCarouselHints(track, leftHint, rightHint){
  if (!track) return;
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const offset = track.scrollLeft;
  const showLeft = offset > 4;
  const showRight = maxScroll - offset > 4;
  leftHint?.classList.toggle("hidden", !showLeft);
  rightHint?.classList.toggle("hidden", !showRight);
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  return `${Math.round(number)}${config.suffix || ""}`;
}
