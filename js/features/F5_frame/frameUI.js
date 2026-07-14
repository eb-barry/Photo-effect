// F5 框住美好 - UI v0.3.2
// 分類開關 + 經典材質 / 專業類型 + Gallery 展場（依比例篩選）+ 燈光參數 + Layer2 手勢。

import {
  FRAME_CATEGORIES,
  GALLERY_SUB_TABS,
  PROFESSIONAL_TYPES,
  applyFrameTypeDefaults,
  getFrameTypesForCategory,
  getGalleryScenesForPhoto,
  getParametersForContext,
  isGalleryMode,
  pickDefaultGallerySceneId,
  resetFrameAdjustments,
  resetGalleryPlacement,
  updateFrameState
} from "./frameState.js";

export function setupFrameUI(root, state, render, persistDraft = () => {}, options = {}){
  const getPhotoSize = typeof options.getPhotoSize === "function"
    ? options.getPhotoSize
    : () => ({ width: 1200, height: 1600 });
  const onGestureStart = typeof options.onGestureStart === "function" ? options.onGestureStart : () => {};
  const onGestureEnd = typeof options.onGestureEnd === "function" ? options.onGestureEnd : () => persistDraft();

  const categoryButtons = () => root.querySelectorAll("[data-frame-category]");
  const materialHost = root.querySelector("#frameMaterialHost");
  const materialPanel = root.querySelector("#frameMaterialPanel");
  const categoryNote = root.querySelector("#frameCategoryNote");
  const professionalSubBar = root.querySelector("#professionalSubBar");
  const sceneHost = root.querySelector("#galleryWallHost");
  const scenePanel = root.querySelector("#galleryWallPanel");
  const galleryHint = root.querySelector("#galleryGestureHint");
  const paramSelect = root.querySelector("#frameParamSelect");
  const slider = root.querySelector("#frameSlider");
  const sliderLabel = root.querySelector("#frameSliderLabel");
  const sliderValue = root.querySelector("#frameSliderValue");
  const resetButton = root.querySelector("#resetFrameSettingsBtn");
  const resetPlacementButton = root.querySelector("#resetGalleryPlacementBtn");
  const canvas = root.querySelector("#editorCanvas");

  let rafId = null;
  let pendingRenderOpts = null;

  const scheduleRender = (opts = {}) => {
    pendingRenderOpts = { ...(pendingRenderOpts || {}), ...opts };
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const next = pendingRenderOpts || {};
      pendingRenderOpts = null;
      render(next);
    });
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
    const show = state.activeCategory === "professional"
      && state.selectedCategoryId === "professional"
      && state.frameTypeId === "gallery";
    professionalSubBar?.classList.toggle("hidden", !show);
    galleryHint?.classList.toggle("hidden", !show);
    resetPlacementButton?.classList.toggle("hidden", !show);

    if (!show) {
      scenePanel?.classList.add("hidden");
      return;
    }

    professionalSubBar.querySelectorAll("[data-gallery-subtab]").forEach(button => {
      const active = state.activeProfessionalSubTab === button.dataset.gallerySubtab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const sub = state.activeProfessionalSubTab;
    const showScenes = sub === "scene";
    scenePanel?.classList.toggle("hidden", !showScenes);

    if (showScenes && sceneHost) {
      const photo = getPhotoSize();
      const scenes = getGalleryScenesForPhoto(photo.width, photo.height);
      if (!scenes.length) {
        sceneHost.innerHTML = "";
        if (categoryNote) {
          categoryNote.classList.remove("hidden");
          categoryNote.textContent = "尚無對應比例的展場圖（請放入 wall-3x4-*.webp 或 wall-4x3-*.webp）";
        }
      } else {
        sceneHost.innerHTML = renderSceneCarousel(scenes);
        const carousel = sceneHost.querySelector("[data-gallery-scene-carousel]");
        if (carousel) setupMaterialCarousel(carousel);
        refreshSceneButtons();
      }
    }
  }

  function refreshSceneButtons(){
    root.querySelectorAll("[data-gallery-scene]").forEach(button => {
      const active = button.dataset.galleryScene === state.gallerySceneId;
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
      scenePanel?.classList.add("hidden");
      galleryHint?.classList.add("hidden");
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
      const photo = getPhotoSize();
      const sceneId = pickDefaultGallerySceneId(photo.width, photo.height, state.gallerySceneId);
      Object.assign(state, updateFrameState(state, {
        activeProfessionalSubTab: state.activeProfessionalSubTab || "scene",
        gallerySceneId: sceneId
      }));
    }

    refreshAllControls();
    scheduleRender({ fastPreview: false });
    persistDraft();
  });

  professionalSubBar?.addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-subtab]");
    if (!button) return;
    event.preventDefault();
    const tabId = button.dataset.gallerySubtab;
    const next = state.activeProfessionalSubTab === tabId ? null : tabId;
    const patch = { activeProfessionalSubTab: next };
    if (next === "light") patch.selectedParameter = "galleryLightCount";
    if (next === "scene") patch.selectedParameter = "frameWidth";
    Object.assign(state, updateFrameState(state, patch));
    refreshAllControls();
    persistDraft();
  });

  sceneHost?.addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-scene]");
    if (!button) return;
    event.preventDefault();
    Object.assign(state, updateFrameState(state, { gallerySceneId: button.dataset.galleryScene }));
    refreshSceneButtons();
    scheduleRender({ fastPreview: false });
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
    // Placement/light sliders can use fast path; frame chrome needs full Layer-2 rebuild.
    const fast = isGalleryMode(state) && String(config.id).startsWith("gallery");
    scheduleRender({ fastPreview: fast });
  });

  slider?.addEventListener("change", () => {
    scheduleRender({ fastPreview: false });
    persistDraft();
  });

  resetButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetFrameAdjustments(state));
    refreshAllControls();
    scheduleRender({ fastPreview: false });
    persistDraft();
  });

  resetPlacementButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetGalleryPlacement(state));
    refreshSlider();
    scheduleRender({ fastPreview: false });
    persistDraft();
  });

  if (canvas) {
    enableGalleryPlacementGesture(canvas, state, patch => {
      if (!isGalleryMode(state)) return;
      Object.assign(state, updateFrameState(state, patch));
      scheduleRender({ fastPreview: true });
    }, {
      onStart: onGestureStart,
      onEnd: onGestureEnd
    });
  }

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
        <img data-src="${item.thumb}" alt="" loading="lazy" decoding="async" />
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

export function renderSceneCarousel(scenes){
  const buttons = scenes.map(item => `
    <button
      type="button"
      class="crystal-scene-button frame-material-button"
      data-gallery-scene="${item.id}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="crystal-scene-thumb frame-material-thumb frame-wall-thumb" style="background:#d8d4cc">
        <img data-src="${item.thumb}" alt="" loading="lazy" decoding="async" data-fallback="${item.aspect}" />
      </span>
    </button>
  `).join("");

  return `
    <div class="crystal-asset-carousel" data-gallery-scene-carousel="scenes">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="展場場景">${buttons}</div>
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
  hydrateLazyThumbs(track);
  requestAnimationFrame(update);
}

/** Only decode thumbs that enter (or are near) the horizontal track viewport. */
function hydrateLazyThumbs(track){
  const images = [...track.querySelectorAll("img[data-src]")];
  if (!images.length) return;

  const activate = (img) => {
    if (!img.dataset.src) return;
    img.src = img.dataset.src;
    delete img.dataset.src;
    if (img.dataset.fallback) {
      img.onerror = () => {
        const span = document.createElement("span");
        span.className = "frame-scene-fallback";
        span.textContent = img.dataset.fallback;
        img.replaceWith(span);
      };
    }
  };

  if (typeof IntersectionObserver === "undefined") {
    images.forEach(activate);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      activate(entry.target);
      observer.unobserve(entry.target);
    });
  }, {
    root: track,
    rootMargin: "120px 160px",
    threshold: 0.01
  });

  images.forEach(img => observer.observe(img));
  track._thumbObserver = observer;
}

function updateCarouselHints(track, leftHint, rightHint){
  if (!track) return;
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  const offset = track.scrollLeft;
  leftHint?.classList.toggle("hidden", offset <= 4);
  rightHint?.classList.toggle("hidden", maxScroll - offset <= 4);
}

function enableGalleryPlacementGesture(canvas, state, setPartialState, hooks = {}){
  const pointers = new Map();
  let lastDrag = null;
  let lastPinchDistance = 0;
  let startScale = 100;
  let gesturing = false;

  canvas.style.touchAction = "none";

  const getTwoPointerDistance = () => {
    const values = [...pointers.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  };

  canvas.addEventListener("pointerdown", event => {
    if (!isGalleryMode(state) || !state.sourceImageDataUrl) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.style.cursor = "grabbing";
    if (!gesturing) {
      gesturing = true;
      hooks.onStart?.();
    }
    if (pointers.size === 1) {
      lastDrag = { x: event.clientX, y: event.clientY };
    } else if (pointers.size === 2) {
      lastPinchDistance = getTwoPointerDistance();
      startScale = Number(state.galleryPhotoScale || 100);
      lastDrag = null;
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId) || !isGalleryMode(state)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const distance = getTwoPointerDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        setPartialState({
          galleryPhotoScale: clamp(startScale * (distance / lastPinchDistance), 40, 180)
        });
      }
      return;
    }

    if (!lastDrag) {
      lastDrag = { x: event.clientX, y: event.clientY };
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - lastDrag.x) / Math.max(1, rect.width);
    const dy = (event.clientY - lastDrag.y) / Math.max(1, rect.height);
    lastDrag = { x: event.clientX, y: event.clientY };
    setPartialState({
      galleryOffsetX: clamp(Number(state.galleryOffsetX || 0) + dx * 165, -100, 100),
      galleryOffsetY: clamp(Number(state.galleryOffsetY || 0) + dy * 165, -100, 100)
    });
  });

  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (pointers.size === 0) {
      lastDrag = null;
      lastPinchDistance = 0;
      canvas.style.cursor = isGalleryMode(state) ? "grab" : "";
      if (gesturing) {
        gesturing = false;
        hooks.onEnd?.();
      }
    } else if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      lastDrag = { x: remaining.x, y: remaining.y };
      lastPinchDistance = 0;
    }
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.unit === "percent") return `${Math.round(number)}%`;
  if (config.unit === "degree") return `${Math.round(number)}°`;
  if (config.unit === "count") return `${Math.round(number)}`;
  if (config.unit === "px") return `${Math.round(number)}`;
  return `${Math.round(number)}`;
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, Number(value)));
}
