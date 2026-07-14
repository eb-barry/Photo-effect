// F5 框住美好 - UI v0.2.0
// 分類開關 + 經典材質縮圖 / 專業類型縮圖 + Gallery 第二層分頁 + 參數下拉／滑桿。

import {
  FRAME_CATEGORIES,
  GALLERY_LIGHT_MODES,
  GALLERY_SUB_TABS,
  PROFESSIONAL_TYPES,
  applyFrameTypeDefaults,
  getFrameTypesForCategory,
  getGalleryWallCatalog,
  getParametersForContext,
  resetFrameAdjustments,
  updateFrameState
} from "./frameState.js";

export function setupFrameUI(root, state, render, persistDraft = () => {}){
  const categoryButtons = () => root.querySelectorAll("[data-frame-category]");
  const materialHost = root.querySelector("#frameMaterialHost");
  const materialPanel = root.querySelector("#frameMaterialPanel");
  const categoryNote = root.querySelector("#frameCategoryNote");
  const professionalSubBar = root.querySelector("#professionalSubBar");
  const wallHost = root.querySelector("#galleryWallHost");
  const wallPanel = root.querySelector("#galleryWallPanel");
  const lightModeRow = root.querySelector("#galleryLightModeRow");
  const lightModeSelect = root.querySelector("#galleryLightModeSelect");
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
      categoryNote?.classList.add("hidden");
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

    categoryNote?.classList.add("hidden");
    if (materialHost) {
      materialHost.innerHTML = categoryId === "professional"
        ? renderProfessionalTypeCarousel(types)
        : renderMaterialCarousel(types, categoryId);
      const carousel = materialHost.querySelector("[data-frame-material-carousel], [data-professional-type-carousel]");
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

  function refreshProfessionalSubBar(){
    const show = state.activeCategory === "professional" && state.frameTypeId === "gallery"
      && state.selectedCategoryId === "professional";
    professionalSubBar?.classList.toggle("hidden", !show);
    if (!show) {
      wallPanel?.classList.add("hidden");
      lightModeRow?.classList.add("hidden");
      return;
    }

    professionalSubBar.querySelectorAll("[data-gallery-subtab]").forEach(button => {
      const active = state.activeProfessionalSubTab === button.dataset.gallerySubtab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const sub = state.activeProfessionalSubTab;
    const showWalls = sub === "wall";
    wallPanel?.classList.toggle("hidden", !showWalls);
    lightModeRow?.classList.toggle("hidden", sub !== "light");

    if (showWalls && wallHost) {
      wallHost.innerHTML = renderWallCarousel(getGalleryWallCatalog());
      const carousel = wallHost.querySelector("[data-gallery-wall-carousel]");
      if (carousel) setupMaterialCarousel(carousel);
      refreshWallButtons();
    }

    if (sub === "light" && lightModeSelect) {
      lightModeSelect.innerHTML = GALLERY_LIGHT_MODES
        .map(item => `<option value="${item.id}" ${item.id === state.galleryLightMode ? "selected" : ""}>${item.label}</option>`)
        .join("");
      lightModeSelect.classList.add("selected");
    }
  }

  function refreshWallButtons(){
    root.querySelectorAll("[data-gallery-wall]").forEach(button => {
      const active = button.dataset.galleryWall === state.galleryWallId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function getParameterConfig(){
    const list = getParametersForContext(state);
    return list.find(item => item.id === state.selectedParameter) || list[0];
  }

  function refreshParamSelect(){
    if (!paramSelect) return;
    const list = getParametersForContext(state);
    paramSelect.innerHTML = list
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    paramSelect.classList.add("selected");
  }

  function refreshSlider(){
    if (!slider) return;
    const config = getParameterConfig();
    if (!config) return;
    const value = Number(state[config.id]);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    if (sliderLabel) sliderLabel.textContent = config.label;
    if (sliderValue) sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshComingSoonNote(){
    if (state.activeCategory !== "professional") return;
    const type = PROFESSIONAL_TYPES.find(item => item.id === state.frameTypeId);
    if (type && !type.enabled) {
      if (categoryNote) {
        categoryNote.classList.remove("hidden");
        categoryNote.textContent = `${type.label}即將推出`;
      }
      professionalSubBar?.classList.add("hidden");
      wallPanel?.classList.add("hidden");
      lightModeRow?.classList.add("hidden");
    }
  }

  function refreshAllControls(){
    refreshCategoryButtons();
    refreshMaterialPanel();
    refreshProfessionalSubBar();
    refreshComingSoonNote();
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
    if (categoryId === "professional" && frameTypeId === "gallery") {
      Object.assign(state, updateFrameState(state, { activeProfessionalSubTab: state.activeProfessionalSubTab || "wall" }));
    }
    refreshAllControls();
    scheduleRender();
    persistDraft();
  });

  professionalSubBar?.addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-subtab]");
    if (!button) return;
    event.preventDefault();
    const tabId = button.dataset.gallerySubtab;
    const next = state.activeProfessionalSubTab === tabId ? null : tabId;
    const patch = { activeProfessionalSubTab: next };
    if (next === "light") patch.selectedParameter = "galleryLightIntensity";
    if (next === "shadow") patch.selectedParameter = "galleryShadowDistance";
    if (next === "frame") patch.selectedParameter = "frameWidth";
    Object.assign(state, updateFrameState(state, patch));
    refreshAllControls();
    persistDraft();
  });

  wallHost?.addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-wall]");
    if (!button) return;
    event.preventDefault();
    Object.assign(state, updateFrameState(state, { galleryWallId: button.dataset.galleryWall }));
    refreshWallButtons();
    scheduleRender();
    persistDraft();
  });

  lightModeSelect?.addEventListener("change", () => {
    Object.assign(state, updateFrameState(state, { galleryLightMode: lightModeSelect.value }));
    lightModeSelect.classList.add("selected");
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

export function renderProfessionalSubTabs(){
  return GALLERY_SUB_TABS.map(tab => `
    <button
      type="button"
      class="crystal-tab-button frame-subtab-button"
      data-gallery-subtab="${tab.id}"
      aria-pressed="false"
    >${tab.label}</button>
  `).join("");
}

export function renderAdjustControlsPanel(){
  return `
    <div class="selection-row crystal-adjust-row hidden" id="galleryLightModeRow">
      <label for="galleryLightModeSelect" class="selection-label">燈光模式</label>
      <select id="galleryLightModeSelect" class="select-control" aria-label="燈光模式"></select>
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

export function renderProfessionalTypeCarousel(types){
  const buttons = types.map(item => `
    <button
      type="button"
      class="crystal-scene-button frame-professional-button ${item.enabled ? "" : "is-soon"}"
      data-frame-category="professional"
      data-frame-type="${item.id}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="frame-professional-swatch" style="background:${item.swatch || "#ddd"}"></span>
      <span class="frame-professional-label">${item.label}</span>
    </button>
  `).join("");

  return `
    <div class="crystal-asset-carousel" data-professional-type-carousel="professional">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="專業畫框類型">${buttons}</div>
      <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
    </div>
  `;
}

export function renderWallCarousel(walls){
  const buttons = walls.map(item => `
    <button
      type="button"
      class="crystal-scene-button frame-material-button"
      data-gallery-wall="${item.id}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="crystal-scene-thumb frame-material-thumb frame-wall-thumb" style="background:${item.color || "#ddd"}">
        ${item.thumb ? `<img src="${item.thumb}" alt="" loading="lazy" onerror="this.remove()" />` : ""}
      </span>
    </button>
  `).join("");

  return `
    <div class="crystal-asset-carousel" data-gallery-wall-carousel="walls">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="展牆">${buttons}</div>
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
  if (config.unit === "degree") return `${Math.round(number)}°`;
  if (config.unit === "px") return `${Math.round(number)}`;
  return `${Math.round(number)}`;
}
