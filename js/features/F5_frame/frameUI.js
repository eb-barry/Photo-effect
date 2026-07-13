// F5 框住美好 - UI v0.1.3
// 6 個可水平滑動分類（再點收合）+ 材質縮圖水平捲動（動態 manifest）+ 參數下拉 + 單一滑桿。

import {
  FRAME_CATEGORIES,
  FRAME_PARAMETERS,
  applyFrameTypeDefaults,
  getFrameTypesForCategory,
  resetFrameAdjustments,
  updateFrameState
} from "./frameState.js";

export function setupFrameUI(root, state, render, persistDraft = () => {}){
  const categoryButtons = () => root.querySelectorAll("[data-frame-category]");
  const materialHost = root.querySelector("#frameMaterialHost");
  const materialPanel = root.querySelector("#frameMaterialPanel");
  const categoryNote = root.querySelector("#frameCategoryNote");
  const paramSelect = root.querySelector("#frameParamSelect");
  const slider = root.querySelector("#frameSlider");
  const sliderLabel = root.querySelector("#frameSliderLabel");
  const sliderValue = root.querySelector("#frameSliderValue");
  const resetButton = root.querySelector("#resetFrameSettingsBtn");

  let renderTimer = null;
  const scheduleRender = (delay = 16) => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), delay);
  };

  function refreshCategoryButtons(){
    categoryButtons().forEach(button => {
      const active = state.activeCategory === button.dataset.frameCategory;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshMaterialPanel(){
    const categoryId = state.activeCategory;
    const expanded = Boolean(categoryId);
    materialPanel?.classList.toggle("hidden", !expanded);

    if (!expanded) {
      if (categoryNote) {
        categoryNote.classList.add("hidden");
        categoryNote.textContent = "";
      }
      if (materialHost) materialHost.innerHTML = "";
      return;
    }

    const types = getFrameTypesForCategory(categoryId);
    const meta = FRAME_CATEGORIES.find(item => item.id === categoryId);

    if (!types.length) {
      if (materialHost) materialHost.innerHTML = "";
      if (categoryNote) {
        categoryNote.classList.remove("hidden");
        categoryNote.textContent = `${meta?.label || "此分類"}即將推出`;
      }
      return;
    }

    if (categoryNote) {
      categoryNote.classList.add("hidden");
      categoryNote.textContent = "";
    }

    if (materialHost) {
      materialHost.innerHTML = renderMaterialCarousel(types, categoryId);
      const carousel = materialHost.querySelector("[data-frame-material-carousel]");
      if (carousel) setupMaterialCarousel(carousel);
    }

    refreshMaterialButtons();
  }

  function refreshMaterialButtons(){
    root.querySelectorAll("[data-frame-type]").forEach(button => {
      const sameCategory = button.dataset.frameCategory === state.selectedCategoryId;
      const active = sameCategory && button.dataset.frameType === state.frameTypeId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function getParameterConfig(){
    return FRAME_PARAMETERS.find(item => item.id === state.selectedParameter) || FRAME_PARAMETERS[0];
  }

  function refreshParamSelect(){
    if (!paramSelect) return;
    paramSelect.innerHTML = FRAME_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    paramSelect.classList.add("selected");
  }

  function refreshSlider(){
    if (!slider) return;
    const config = getParameterConfig();
    const value = Number(state[config.id]);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    if (sliderLabel) sliderLabel.textContent = config.label;
    if (sliderValue) sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshCategoryButtons();
    refreshMaterialPanel();
    refreshParamSelect();
    refreshSlider();
  }

  function toggleCategory(categoryId){
    const nextCategory = state.activeCategory === categoryId ? null : categoryId;
    Object.assign(state, updateFrameState(state, { activeCategory: nextCategory }));
    refreshAllControls();
    persistDraft();
  }

  categoryButtons().forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    toggleCategory(button.dataset.frameCategory);
  }));

  materialHost?.addEventListener("click", event => {
    const button = event.target.closest("[data-frame-type]");
    if (!button) return;
    event.preventDefault();
    const categoryId = button.dataset.frameCategory;
    const frameTypeId = button.dataset.frameType;
    Object.assign(state, applyFrameTypeDefaults(state, categoryId, frameTypeId));
    refreshMaterialButtons();
    refreshSlider();
    scheduleRender();
    persistDraft();
  });

  paramSelect?.addEventListener("change", () => {
    Object.assign(state, updateFrameState(state, { selectedParameter: paramSelect.value }));
    paramSelect.classList.add("selected");
    refreshSlider();
    persistDraft();
  });

  slider?.addEventListener("input", () => {
    const config = getParameterConfig();
    Object.assign(state, updateFrameState(state, { [config.id]: Number(slider.value) }));
    if (sliderValue) sliderValue.textContent = formatParameterValue(state[config.id], config);
    scheduleRender();
  });

  slider?.addEventListener("change", () => persistDraft());

  resetButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetFrameAdjustments(state));
    refreshAllControls();
    scheduleRender();
    persistDraft();
  });

  refreshAllControls();
  return { refreshAllControls };
}

export function renderCategoryScroller(){
  return FRAME_CATEGORIES.map(category => `
    <button
      type="button"
      class="crystal-tab-button frame-category-button"
      data-frame-category="${category.id}"
      aria-pressed="false"
    >${category.label}</button>
  `).join("");
}

export function renderAdjustControlsPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="frameParamSelect" class="selection-label">調整項目</label>
      <select id="frameParamSelect" class="select-control" aria-label="調整項目"></select>
    </div>
    <div class="slider-row" id="frameSliderRow">
      <div class="slider-head">
        <span id="frameSliderLabel">框寬</span>
        <span id="frameSliderValue">40</span>
      </div>
      <input id="frameSlider" type="range" />
    </div>
  `;
}

export function renderMaterialCarousel(types, categoryId){
  const buttons = types.map(item => `
    <button
      type="button"
      class="crystal-scene-button frame-material-button"
      data-frame-category="${categoryId}"
      data-frame-type="${item.id}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="crystal-scene-thumb frame-material-thumb">
        <img src="${item.thumb}" alt="" loading="lazy" />
      </span>
    </button>
  `).join("");

  return `
    <div class="crystal-asset-carousel" data-frame-material-carousel="${categoryId}">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="畫框材質">${buttons}</div>
      <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
    </div>
  `;
}

function setupMaterialCarousel(carousel){
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
  if (config.unit === "percent") return `${Math.round(number)}%`;
  if (config.unit === "px") return `${Math.round(number)}`;
  return `${Math.round(number)}`;
}
