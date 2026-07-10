// F3 魔法天空 - UI v0.3.0
// 四按鈕分頁 + 三分段影像微調 + 天空平移手勢。

import { getMagicSkyItems } from "./magicSkyAssets.js";
import { INTENSIVE_RENDER_PARAMS } from "./magicSkyBusy.js";
import { sampleSkyMaskAt } from "./magicSkySegment.js";
import {
  ADJUST_SEGMENTS,
  MAGIC_SKY_CONTROL_TABS,
  getAdjustSegmentHint,
  getParametersForAdjustSegment,
  getSelectedSkyIdKey,
  getSliderTitle,
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

export function setupMagicSkyUI(root, state, renderApi, persistDraft = () => {}, gestureContext = {}){
  const render = renderApi.render;
  const renderBusy = renderApi.renderBusy;
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const tabPanels = root.querySelector("#magicSkyTabPanels");
  const sunnyPanel = root.querySelector("#sunnyPanel");
  const nightPanel = root.querySelector("#nightPanel");
  const sunsetPanel = root.querySelector("#sunsetPanel");
  const adjustPanel = root.querySelector("#adjustPanel");
  const adjustSegmentButtons = root.querySelectorAll("[data-adjust-segment]");
  const adjustSegmentHint = root.querySelector("#adjustSegmentHint");
  const sliderTarget = root.querySelector("#sliderTarget");
  const slider = root.querySelector("#mainSlider");
  const sliderRow = root.querySelector("#sliderRow");
  const sliderLabel = root.querySelector("#sliderLabel");
  const sliderValue = root.querySelector("#sliderValue");
  let sliderRenderTimer = null;

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

  function refreshAdjustSegments(){
    adjustSegmentButtons.forEach(button => {
      const active = state.adjustSegment === button.dataset.adjustSegment;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (adjustSegmentHint) {
      adjustSegmentHint.textContent = getAdjustSegmentHint(state.adjustSegment);
    }
    sliderRow?.classList.toggle("magic-sky-slider-photo", state.adjustSegment === "photo");
    sliderRow?.classList.toggle("magic-sky-slider-sky", state.adjustSegment === "sky");
    sliderRow?.classList.toggle("magic-sky-slider-edge", state.adjustSegment === "edge");
  }

  function refreshSelectOptions(){
    const params = getParametersForAdjustSegment(state.adjustSegment);
    if (!params.some(item => item.id === state.selectedParameter)) {
      state.selectedParameter = params[0]?.id || "photoExposure";
    }
    sliderTarget.innerHTML = params
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    sliderTarget.classList.add("selected");
  }

  function getCurrentConfig(){
    const params = getParametersForAdjustSegment(state.adjustSegment);
    return params.find(item => item.id === state.selectedParameter) || params[0];
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
    sliderLabel.textContent = getSliderTitle(state.adjustSegment, config);
    sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshTabBar();
    refreshTabPanels();
    refreshAllSkyButtons();
    refreshAdjustSegments();
    refreshSelectOptions();
    refreshSlider();
  }

  function switchAdjustSegment(segmentId){
    const params = getParametersForAdjustSegment(segmentId);
    Object.assign(state, updateMagicSkyState(state, {
      adjustSegment: segmentId,
      selectedParameter: params[0]?.id
    }));
    refreshAllControls();
    persistDraft();
  }

  adjustSegmentButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    switchAdjustSegment(button.dataset.adjustSegment);
  }));

  function toggleControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    const partial = { activeControlTab: nextTab };
    if (nextTab === "adjust") {
      partial.adjustSegment = state.adjustSegment || "photo";
      partial.selectedParameter = getParametersForAdjustSegment(partial.adjustSegment)[0]?.id || "photoExposure";
    }
    Object.assign(state, updateMagicSkyState(state, partial));
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
      renderBusy("切換天空效果，請稍候…", { delay: 0 });
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

    clearTimeout(sliderRenderTimer);
    const intensive = INTENSIVE_RENDER_PARAMS.has(config.id);
    if (intensive) {
      sliderRenderTimer = setTimeout(() => {
        const busyMessage = state.adjustSegment === "photo"
          ? "調整照片效果，請稍候…"
          : state.adjustSegment === "sky"
            ? "調整天空效果，請稍候…"
            : "調整邊緣融合，請稍候…";
        renderBusy(busyMessage, { delay: 0 });
      }, 50);
      return;
    }

    sliderRenderTimer = setTimeout(() => {
      render();
    }, 16);
  });

  const canvas = gestureContext.canvas;
  if (canvas) {
    enableSkyPanGesture(canvas, state, gestureContext, partial => {
      Object.assign(state, updateMagicSkyState(state, partial));
      refreshSlider();
      render();
    }, async () => {
      await renderBusy("調整天空位置，請稍候…", { delay: 120 });
      persistDraft();
    });
  }

  if (!state.activeControlTab) {
    Object.assign(state, updateMagicSkyState(state, { activeControlTab: "sunny" }));
  }

  refreshAllControls();
}

export function renderAdjustSegmentBar(){
  return `
    <div class="magic-sky-adjust-segments segment" role="tablist" aria-label="微調對象">
      ${ADJUST_SEGMENTS.map(segment => `
        <button
          type="button"
          class="magic-sky-adjust-segment"
          data-adjust-segment="${segment.id}"
          aria-pressed="false"
        >${segment.label}</button>
      `).join("")}
    </div>
    <p class="magic-sky-adjust-hint" id="adjustSegmentHint">${ADJUST_SEGMENTS[0].hint}</p>
  `;
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

function enableSkyPanGesture(canvas, state, gestureContext, setPartialState, onPanEnd){
  const pointers = new Map();
  let lastDrag = null;
  let didMove = false;

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

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

  canvas.addEventListener("pointerdown", event => {
    if (!state.sourceImageDataUrl || !insideSky(event.clientX, event.clientY)) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.style.cursor = "grabbing";
    lastDrag = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!lastDrag) {
      lastDrag = { x: event.clientX, y: event.clientY };
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - lastDrag.x) / Math.max(1, rect.width);
    const dy = (event.clientY - lastDrag.y) / Math.max(1, rect.height);
    lastDrag = { x: event.clientX, y: event.clientY };

    setPartialState({
      skyOffsetX: clamp(Number(state.skyOffsetX || 0) + dx * 165, -100, 100),
      skyOffsetY: clamp(Number(state.skyOffsetY || 0) + dy * 165, -100, 100)
    });
    didMove = true;
  });

  const endPointer = event => {
    if (pointers.has(event.pointerId)) pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (pointers.size === 0) {
      if (didMove) onPanEnd?.();
      didMove = false;
      lastDrag = null;
      canvas.style.cursor = "grab";
    }
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, Number(value)));
}
