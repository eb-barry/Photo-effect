// F5 框住美好 - UI v0.1.0
// 6 個可水平滑動分類按鈕 + 畫框類型下拉 + 參數下拉 + 單一滑桿。

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
  const frameTypeSelect = root.querySelector("#frameTypeSelect");
  const paramSelect = root.querySelector("#frameParamSelect");
  const slider = root.querySelector("#frameSlider");
  const sliderLabel = root.querySelector("#frameSliderLabel");
  const sliderValue = root.querySelector("#frameSliderValue");
  const categoryNote = root.querySelector("#frameCategoryNote");
  const controlsPanel = root.querySelector("#frameControlsPanel");
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

  function getActiveCategoryMeta(){
    return FRAME_CATEGORIES.find(item => item.id === state.activeCategory) || FRAME_CATEGORIES[0];
  }

  function refreshCategoryAvailability(){
    const meta = getActiveCategoryMeta();
    const enabled = Boolean(meta.enabled);
    if (controlsPanel) controlsPanel.classList.toggle("hidden", !enabled);
    if (categoryNote) {
      if (enabled) {
        categoryNote.classList.add("hidden");
        categoryNote.textContent = "";
      } else {
        categoryNote.classList.remove("hidden");
        categoryNote.textContent = `${meta.label}將於後續階段開放（目前為 Phase 1 MVP）`;
      }
    }
  }

  function refreshFrameTypeSelect(){
    if (!frameTypeSelect) return;
    const types = getFrameTypesForCategory(state.activeCategory);
    if (!types.length) {
      frameTypeSelect.innerHTML = `<option value="">尚無可用畫框</option>`;
      frameTypeSelect.disabled = true;
      return;
    }
    frameTypeSelect.disabled = false;
    frameTypeSelect.innerHTML = types
      .map(item => `<option value="${item.id}" ${item.id === state.frameTypeId ? "selected" : ""}>${item.label}</option>`)
      .join("");
    frameTypeSelect.classList.add("selected");
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
    const config = getParameterConfig();
    const value = Number(state[config.id]);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    sliderLabel.textContent = config.label;
    sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshCategoryButtons();
    refreshCategoryAvailability();
    refreshFrameTypeSelect();
    refreshParamSelect();
    refreshSlider();
  }

  categoryButtons().forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    const categoryId = button.dataset.frameCategory;
    const meta = FRAME_CATEGORIES.find(item => item.id === categoryId);
    Object.assign(state, updateFrameState(state, { activeCategory: categoryId }));
    if (meta?.enabled) {
      const types = getFrameTypesForCategory(categoryId);
      if (types[0]) {
        Object.assign(state, applyFrameTypeDefaults(state, types[0].id));
      }
    }
    refreshAllControls();
    if (meta?.enabled) scheduleRender();
    persistDraft();
  }));

  frameTypeSelect?.addEventListener("change", () => {
    Object.assign(state, applyFrameTypeDefaults(state, frameTypeSelect.value));
    frameTypeSelect.classList.add("selected");
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
    sliderValue.textContent = formatParameterValue(state[config.id], config);
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
      class="crystal-tab-button frame-category-button ${category.enabled ? "" : "is-preview"}"
      data-frame-category="${category.id}"
      aria-pressed="false"
    >${category.label}</button>
  `).join("");
}

export function renderFrameControlsPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="frameTypeSelect" class="selection-label">畫框類型</label>
      <select id="frameTypeSelect" class="select-control" aria-label="畫框類型"></select>
    </div>
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

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.unit === "percent") return `${Math.round(number)}%`;
  if (config.unit === "px") return `${Math.round(number)}`;
  return `${Math.round(number)}`;
}
