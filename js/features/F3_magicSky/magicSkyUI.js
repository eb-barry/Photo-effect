// F3 魔法天空 - UI v0.3.2
// 三按鈕分頁 + 天空類別 + 天空/照片微調 + 拖曳/縮放手勢。

import { getMagicSkyItems } from "./magicSkyAssets.js";
import { INTENSIVE_RENDER_PARAMS } from "./magicSkyBusy.js";
import { sampleSkyMaskAt } from "./magicSkySegment.js";
import {
  MAGIC_SKY_CATEGORIES,
  MAGIC_SKY_CONTROL_TABS,
  SKY_CATEGORY_LABELS,
  getParametersForControlTab,
  getSelectedSkyIdKey,
  updateMagicSkyState
} from "./magicSkyState.js";

export function mountSkyCarousel(root, category){
  const host = root.querySelector("#skyAssetHost");
  if (!host) return;
  host.innerHTML = renderSkyCarousel(getMagicSkyItems(category), category);
  const carousel = host.querySelector("[data-sky-carousel]");
  if (carousel) setupSkyCarousel(carousel);
}

export function refreshSkyCarouselHints(root){
  const carousel = root.querySelector("[data-sky-carousel]");
  if (!carousel) return;
  const track = carousel.querySelector(".crystal-asset-track");
  const left = carousel.querySelector(".crystal-carousel-hint-left");
  const right = carousel.querySelector(".crystal-carousel-hint-right");
  updateCarouselHints(track, left, right);
}

export function setupMagicSkyUI(root, state, renderApi, gestureContext = {}){
  const render = renderApi.render;
  const renderBusy = renderApi.renderBusy;
  const persistDraft = typeof renderApi.persistDraft === "function" ? renderApi.persistDraft : () => {};
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const tabPanels = root.querySelector("#magicSkyTabPanels");
  const skyPanel = root.querySelector("#skyPanel");
  const skyAdjustPanel = root.querySelector("#skyAdjustPanel");
  const photoAdjustPanel = root.querySelector("#photoAdjustPanel");
  const categoryButtons = root.querySelectorAll("[data-sky-category-tab]");
  const sliderTarget = root.querySelector("#sliderTarget");
  const slider = root.querySelector("#mainSlider");
  const sliderRow = root.querySelector("#sliderRow");
  const sliderValue = root.querySelector("#sliderValue");
  let sliderRenderTimer = null;

  function refreshSkyButtons(category){
    const selectedId = state[getSelectedSkyIdKey(category)];
    root.querySelectorAll(`[data-sky-category="${category}"][data-sky-id]`).forEach(button => {
      const active = button.dataset.skyId === selectedId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshCategoryButtons(){
    categoryButtons.forEach(button => {
      const active = state.activeSkyCategory === button.dataset.skyCategoryTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
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
    skyPanel?.classList.toggle("hidden", tab !== "sky");
    skyAdjustPanel?.classList.toggle("hidden", tab !== "skyAdjust");
    photoAdjustPanel?.classList.toggle("hidden", tab !== "photoAdjust");
    if (tab === "sky") requestAnimationFrame(() => refreshSkyCarouselHints(root));
  }

  function refreshSelectOptions(){
    const params = getParametersForControlTab(state.activeControlTab);
    if (!params.length) return;
    if (!params.some(item => item.id === state.selectedParameter)) {
      state.selectedParameter = params[0]?.id;
    }
    sliderTarget.innerHTML = params
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    sliderTarget.classList.add("selected");
  }

  function getCurrentConfig(){
    const params = getParametersForControlTab(state.activeControlTab);
    return params.find(item => item.id === state.selectedParameter) || params[0];
  }

  function refreshSlider(){
    const showAdjust = state.activeControlTab === "skyAdjust" || state.activeControlTab === "photoAdjust";
    sliderRow?.classList.toggle("hidden", !showAdjust);
    if (!showAdjust) return;

    const config = getCurrentConfig();
    if (!config) return;
    const value = Number(state[config.id] ?? config.min);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshTabBar();
    refreshTabPanels();
    refreshCategoryButtons();
    refreshSkyButtons(state.activeSkyCategory);
    refreshSelectOptions();
    refreshSlider();
  }

  function switchSkyCategory(category){
    if (!MAGIC_SKY_CATEGORIES.includes(category)) return;
    Object.assign(state, updateMagicSkyState(state, { activeSkyCategory: category }));
    mountSkyCarousel(root, category);
    refreshAllControls();
    persistDraft();
  }

  function toggleControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    const partial = { activeControlTab: nextTab };
    if (nextTab === "skyAdjust") {
      partial.selectedParameter = "skyOffsetX";
    }
    if (nextTab === "photoAdjust") {
      partial.selectedParameter = "photoExposure";
    }
    Object.assign(state, updateMagicSkyState(state, partial));
    refreshAllControls();
    persistDraft();
  }

  tabButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    toggleControlTab(button.dataset.controlTab);
  }));

  categoryButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    switchSkyCategory(button.dataset.skyCategoryTab);
  }));

  skyPanel?.addEventListener("click", event => {
    const button = event.target.closest("[data-sky-id]");
    if (!button) return;
    const category = button.dataset.skyCategory;
    if (category !== state.activeSkyCategory) return;
    event.preventDefault();
    const key = getSelectedSkyIdKey(category);
    Object.assign(state, updateMagicSkyState(state, {
      [key]: button.dataset.skyId,
      activeSkyCategory: category
    }));
    refreshSkyButtons(category);
    renderBusy("切換天空效果，請稍候…", { delay: 0 });
    persistDraft();
  });

  sliderTarget.addEventListener("change", () => {
    Object.assign(state, updateMagicSkyState(state, { selectedParameter: sliderTarget.value }));
    refreshSlider();
    persistDraft();
  });

  slider.addEventListener("input", () => {
    const config = getCurrentConfig();
    Object.assign(state, updateMagicSkyState(state, { [config.id]: Number(slider.value) }));
    sliderValue.textContent = formatParameterValue(state[config.id], config);

    clearTimeout(sliderRenderTimer);
    const intensive = INTENSIVE_RENDER_PARAMS.has(config.id);
    if (intensive) {
      sliderRenderTimer = setTimeout(() => {
        const busyMessage = state.activeControlTab === "photoAdjust"
          ? "調整照片效果，請稍候…"
          : "調整天空效果，請稍候…";
        renderBusy(busyMessage, { delay: 0 });
      }, 50);
      return;
    }

    sliderRenderTimer = setTimeout(() => {
      render();
    }, 16);
  });

  const canvas = gestureContext.canvas;
  const canvasWrap = gestureContext.canvasWrap;
  if (canvas) {
    enableSkyPanGesture(canvas, canvasWrap, state, gestureContext, partial => {
      Object.assign(state, updateMagicSkyState(state, partial));
      if (state.activeControlTab === "skyAdjust") refreshSlider();
      render();
    }, async () => {
      await renderBusy("調整天空位置，請稍候…", { delay: 120 });
      persistDraft();
    });
  }

  if (!state.activeControlTab) {
    Object.assign(state, updateMagicSkyState(state, { activeControlTab: "sky" }));
  }

  mountSkyCarousel(root, state.activeSkyCategory);
  refreshAllControls();

  return { refreshAllControls, switchSkyCategory };
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

export function renderSkyCategoryBar(){
  return `
    <div class="magic-sky-category-bar segment" role="tablist" aria-label="天空類型">
      ${MAGIC_SKY_CATEGORIES.map(category => `
        <button
          type="button"
          class="magic-sky-category-tab"
          data-sky-category-tab="${category}"
          aria-pressed="false"
        >${SKY_CATEGORY_LABELS[category]}</button>
      `).join("")}
    </div>
  `;
}

export function renderAdjustControls(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="sliderTarget" class="selection-label">調整項目</label>
      <select id="sliderTarget" class="select-control" aria-label="調整項目"></select>
    </div>
    <div class="slider-row magic-sky-slider-row" id="sliderRow">
      <div class="slider-head magic-sky-slider-head">
        <span id="sliderValue">0</span>
      </div>
      <input id="mainSlider" type="range" />
    </div>
  `;
}

export function renderSkyCarousel(items, category){
  const label = SKY_CATEGORY_LABELS[category] || category;
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
      <div class="crystal-asset-track" role="group" aria-label="${label}">${buttons}</div>
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
  leftHint?.classList.toggle("hidden", offset <= 4);
  rightHint?.classList.toggle("hidden", maxScroll - offset <= 4);
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  return `${Math.round(number)}${config.suffix || ""}`;
}

function enableSkyPanGesture(canvas, canvasWrap, state, gestureContext, setPartialState, onPanEnd){
  const pointers = new Map();
  let lastDrag = null;
  let lastPinchDistance = null;
  let didMove = false;
  let scrollLocked = false;
  let gestureStartedInSky = false;

  const lockScroll = locked => {
    if (scrollLocked === locked) return;
    scrollLocked = locked;
    document.documentElement.classList.toggle("magic-sky-scroll-locked", locked);
    document.body.classList.toggle("magic-sky-scroll-locked", locked);
  };

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  canvasWrap?.style && (canvasWrap.style.touchAction = "none");

  const toCanvasPoint = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const insideSky = (clientX, clientY) => {
    const maskEntry = gestureContext.getMaskEntry?.();
    const layout = gestureContext.getPhotoLayout?.();
    if (!maskEntry || !layout) return true;
    const point = toCanvasPoint(clientX, clientY);
    return sampleSkyMaskAt(maskEntry, layout, point.x, point.y) > 0.35;
  };

  const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const blockTouchMove = event => {
    if (!pointers.size) return;
    event.preventDefault();
  };

  canvas.addEventListener("pointerdown", event => {
    if (!state.sourceImageDataUrl) return;
    const inSky = insideSky(event.clientX, event.clientY);
    if (!inSky && pointers.size === 0) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gestureStartedInSky = inSky;
      canvas.style.cursor = "grabbing";
      lastDrag = { x: event.clientX, y: event.clientY };
    }
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      lastPinchDistance = pointerDistance(pts[0], pts[1]);
      lastDrag = null;
    }
    lockScroll(true);
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2 && gestureStartedInSky) {
      const pts = [...pointers.values()];
      const distance = pointerDistance(pts[0], pts[1]);
      if (lastPinchDistance) {
        const ratio = distance / Math.max(1, lastPinchDistance);
        setPartialState({
          skyScale: clamp(Number(state.skyScale || 100) * ratio, 50, 300)
        });
        didMove = true;
      }
      lastPinchDistance = distance;
      return;
    }

    if (!gestureStartedInSky || pointers.size !== 1) return;
    if (!lastDrag) {
      lastDrag = { x: event.clientX, y: event.clientY };
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - lastDrag.x) / Math.max(1, rect.width);
    const dy = (event.clientY - lastDrag.y) / Math.max(1, rect.height);
    lastDrag = { x: event.clientX, y: event.clientY };

    setPartialState({
      skyOffsetX: clamp(Number(state.skyOffsetX || 0) + dx * 180, -150, 150),
      skyOffsetY: clamp(Number(state.skyOffsetY || 0) + dy * 180, -150, 150)
    });
    didMove = true;
  });

  const endPointer = event => {
    if (pointers.has(event.pointerId)) pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (pointers.size < 2) lastPinchDistance = null;
    if (pointers.size === 0) {
      lockScroll(false);
      if (didMove) onPanEnd?.();
      didMove = false;
      lastDrag = null;
      gestureStartedInSky = false;
      canvas.style.cursor = "grab";
    }
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("touchmove", blockTouchMove, { passive: false });
  canvasWrap?.addEventListener("touchmove", blockTouchMove, { passive: false });
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, Number(value)));
}
