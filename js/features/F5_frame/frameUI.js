// F5 畫框 - UI v0.4.6
// L1：經典／藝術／照片畫廊／參數調整。材質分頁只顯示縮圖；參數集中於參數調整。

import {
  FRAME_CATEGORIES,
  applyFrameTypeDefaults,
  getArtisticFramesForPhoto,
  getClassicInnerFrames,
  getClassicOuterFrames,
  getFrameTypesForCategory,
  getGalleryScenesForPhoto,
  getParametersForContext,
  isAdjustMode,
  isGalleryMode,
  pickDefaultGallerySceneId,
  resetFrameAdjustments,
  resolvePhotoPlacement,
  selectArtisticFrame,
  selectClassicFrameRole,
  updateFrameState
} from "./frameState.js";

export function setupFrameUI(root, state, render, persistDraft = () => {}, options = {}){
  const getPhotoSize = typeof options.getPhotoSize === "function"
    ? options.getPhotoSize
    : () => ({ width: 1200, height: 1600 });
  const onGestureStart = typeof options.onGestureStart === "function" ? options.onGestureStart : () => {};
  const onGestureEnd = typeof options.onGestureEnd === "function" ? options.onGestureEnd : () => persistDraft();
  const onMaterialChange = typeof options.onMaterialChange === "function" ? options.onMaterialChange : () => {};

  const categoryButtons = () => root.querySelectorAll("[data-frame-category]");
  const materialHost = root.querySelector("#frameMaterialHost");
  const materialPanel = root.querySelector("#frameMaterialPanel");
  const categoryNote = root.querySelector("#frameCategoryNote");
  const sceneHost = root.querySelector("#galleryWallHost");
  const scenePanel = root.querySelector("#galleryWallPanel");
  const controlsPanel = root.querySelector("#frameControlsPanel");
  const galleryHint = root.querySelector("#galleryGestureHint")
    || root.querySelector("#photoGestureHint");
  const paramSelect = root.querySelector("#frameParamSelect");
  const slider = root.querySelector("#frameSlider");
  const sliderLabel = root.querySelector("#frameSliderLabel");
  const sliderValue = root.querySelector("#frameSliderValue");
  const resetButton = root.querySelector("#resetFrameSettingsBtn");
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

  /** 參數調整分頁才顯示滑桿；材質／畫廊分頁只顯示縮圖。 */
  function refreshControlsPanelVisibility(){
    if (!controlsPanel) return;
    const show = Boolean(state.sourceImageDataUrl) && isAdjustMode(state);
    controlsPanel.classList.toggle("hidden", !show);
  }

  function refreshMaterialPanel(){
    const categoryId = state.activeCategory;
    const showMaterials = categoryId === "classic" || categoryId === "artistic";
    materialPanel?.classList.toggle("hidden", !showMaterials);

    if (!showMaterials) {
      if (categoryId !== "gallery") categoryNote?.classList.add("hidden");
      if (materialHost) materialHost.innerHTML = "";
      refreshControlsPanelVisibility();
      return;
    }

    if (categoryId === "classic") {
      const outerTypes = getClassicOuterFrames();
      const innerTypes = getClassicInnerFrames();
      if (!outerTypes.length && !innerTypes.length) {
        if (materialHost) materialHost.innerHTML = "";
        if (categoryNote) {
          categoryNote.classList.remove("hidden");
          categoryNote.textContent = "尚無經典畫框材質：請放入 classic-*.webp / inner-*.webp（2560×256），再同步 manifest";
        }
        refreshControlsPanelVisibility();
        return;
      }
      categoryNote?.classList.add("hidden");
      if (materialHost) {
        materialHost.innerHTML = renderClassicDualRows(outerTypes, innerTypes);
        materialHost.querySelectorAll("[data-frame-material-carousel]").forEach(setupMaterialCarousel);
      }
      refreshMaterialButtons();
      refreshControlsPanelVisibility();
      return;
    }

    const photo = getPhotoSize();
    const types = categoryId === "artistic"
      ? getArtisticFramesForPhoto(photo.width, photo.height)
      : getFrameTypesForCategory(categoryId);
    const meta = FRAME_CATEGORIES.find(item => item.id === categoryId);

    if (!types.length) {
      if (materialHost) materialHost.innerHTML = "";
      if (categoryNote) {
        categoryNote.classList.remove("hidden");
        if (categoryId === "artistic") {
          categoryNote.textContent = "尚無藝術畫框：請放入 assets/features/F5_frame/textures/artistic/（art-3x4-*.webp / art-4x3-*.webp），再執行 sync";
        } else {
          categoryNote.textContent = `${meta?.label || "此分類"}即將推出`;
        }
      }
      refreshControlsPanelVisibility();
      return;
    }

    categoryNote?.classList.add("hidden");
    if (materialHost) {
      materialHost.innerHTML = renderMaterialCarousel(types, categoryId);
      const carousel = materialHost.querySelector("[data-frame-material-carousel]");
      if (carousel) setupMaterialCarousel(carousel);
    }
    refreshMaterialButtons();
    refreshControlsPanelVisibility();
  }

  function refreshMaterialButtons(){
    root.querySelectorAll("[data-frame-type]").forEach(button => {
      const categoryId = button.dataset.frameCategory;
      const typeId = button.dataset.frameType;
      const role = button.dataset.frameRole;

      if (categoryId === "artistic") {
        const active = state.artisticFrameId === typeId;
        button.classList.toggle("active", active);
        button.classList.remove("is-outer-frame", "is-inner-frame");
        button.setAttribute("aria-pressed", String(active));
        button.querySelector(".frame-material-role")?.remove();
        return;
      }

      if (categoryId === "classic") {
        const active = role === "inner"
          ? state.innerFrameTypeId === typeId
          : state.outerFrameTypeId === typeId;
        button.classList.toggle("active", active);
        button.classList.toggle("is-outer-frame", role === "outer" && active);
        button.classList.toggle("is-inner-frame", role === "inner" && active);
        button.setAttribute("aria-pressed", String(active));
        button.querySelector(".frame-material-role")?.remove();
        return;
      }

      button.classList.remove("active", "is-outer-frame", "is-inner-frame");
      button.setAttribute("aria-pressed", "false");
      button.querySelector(".frame-material-role")?.remove();
    });
  }

  function refreshGestureHint(){
    if (!galleryHint) return;
    const show = Boolean(state.sourceImageDataUrl);
    galleryHint.classList.toggle("hidden", !show);
    if (!show) return;
    galleryHint.textContent = isGalleryMode(state)
      ? "拖曳移動作品，雙指縮放大小"
      : "拖曳移動照片，雙指縮放大小";
  }

  function refreshGalleryPanel(){
    const show = state.activeCategory === "gallery";
    scenePanel?.classList.toggle("hidden", !show);
    refreshGestureHint();

    if (!show) return;

    // Entering photo gallery applies gallery mode so classic/artistic frames composite onto walls.
    if (state.selectedCategoryId !== "gallery") {
      const photo = getPhotoSize();
      const sceneId = pickDefaultGallerySceneId(photo.width, photo.height, state.gallerySceneId);
      Object.assign(state, updateFrameState(state, {
        selectedCategoryId: "gallery",
        frameTypeId: "gallery",
        gallerySceneId: sceneId
      }));
    }

    if (!sceneHost) return;
    const photo = getPhotoSize();
    const scenes = getGalleryScenesForPhoto(photo.width, photo.height);
    if (!scenes.length) {
      sceneHost.innerHTML = "";
      if (categoryNote) {
        categoryNote.classList.remove("hidden");
        categoryNote.textContent = "尚無對應比例的展場圖（請放入 wall-3x4-*.webp 或 wall-4x3-*.webp）";
      }
      return;
    }
    categoryNote?.classList.add("hidden");
    sceneHost.innerHTML = renderSceneCarousel(scenes);
    const carousel = sceneHost.querySelector("[data-gallery-scene-carousel]");
    if (carousel) setupMaterialCarousel(carousel);
    refreshSceneButtons();
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

  function refreshAllControls(){
    refreshCategoryButtons();
    refreshMaterialPanel();
    refreshGalleryPanel();
    refreshGestureHint();
    refreshParamSelect();
    refreshSlider();
    refreshControlsPanelVisibility();
  }

  function toggleCategory(categoryId){
    const nextCategory = state.activeCategory === categoryId ? null : categoryId;
    const patch = { activeCategory: nextCategory };

    if (nextCategory === "adjust") {
      // 參數調整：隱藏縮圖、顯示統一參數；不改變目前材質／畫廊渲染模式。
    } else if (nextCategory === "gallery") {
      patch.selectedCategoryId = "gallery";
      patch.frameTypeId = "gallery";
      const photo = getPhotoSize();
      patch.gallerySceneId = pickDefaultGallerySceneId(photo.width, photo.height, state.gallerySceneId);
    } else if (nextCategory === "classic" || nextCategory === "artistic") {
      patch.selectedCategoryId = nextCategory;
      if (nextCategory === "artistic") {
        patch.framePresentation = "artistic";
        if (state.artisticFrameId) {
          patch.frameTypeId = state.artisticFrameId;
        }
      } else {
        patch.framePresentation = "classic";
        if (state.outerFrameTypeId || state.innerFrameTypeId) {
          patch.frameTypeId = state.outerFrameTypeId || state.innerFrameTypeId;
        }
      }
    }

    Object.assign(state, updateFrameState(state, patch));
    refreshAllControls();
    scheduleRender({ fastPreview: false });
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
    const role = button.dataset.frameRole;

    if (categoryId === "classic") {
      Object.assign(state, selectClassicFrameRole(state, frameTypeId, role === "inner" ? "inner" : "outer"));
      onMaterialChange();
      refreshMaterialButtons();
      refreshParamSelect();
      refreshSlider();
      scheduleRender({ fastPreview: false });
      persistDraft();
      return;
    }

    if (categoryId === "artistic") {
      Object.assign(state, selectArtisticFrame(state, frameTypeId));
      onMaterialChange();
      refreshMaterialButtons();
      refreshParamSelect();
      refreshSlider();
      scheduleRender({ fastPreview: false });
      persistDraft();
      return;
    }

    Object.assign(state, applyFrameTypeDefaults(state, categoryId, frameTypeId));
    refreshAllControls();
    scheduleRender({ fastPreview: false });
    persistDraft();
  });

  sceneHost?.addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-scene]");
    if (!button) return;
    event.preventDefault();
    Object.assign(state, updateFrameState(state, {
      selectedCategoryId: "gallery",
      frameTypeId: "gallery",
      gallerySceneId: button.dataset.galleryScene
    }));
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
    const fast = isGalleryMode(state) && (
      config.id === "photoScale"
      || config.id === "photoOffsetX"
      || config.id === "photoOffsetY"
    );
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

  if (canvas) {
    enablePhotoPlacementGesture(canvas, state, patch => {
      if (!state.sourceImageDataUrl) return;
      Object.assign(state, updateFrameState(state, patch));
      refreshSlider();
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

export function renderAdjustControlsPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="frameParamSelect" class="selection-label">參數調整</label>
      <select id="frameParamSelect" class="select-control" aria-label="參數調整"></select>
    </div>
    <div class="slider-row" id="frameSliderRow">
      <div class="slider-head">
        <span id="frameSliderLabel">外框寬</span>
        <span id="frameSliderValue">40</span>
      </div>
      <input id="frameSlider" type="range" />
    </div>
  `;
}

export function renderClassicDualRows(outerTypes, innerTypes){
  return `
    <div class="frame-classic-rows">
      <div class="frame-classic-row">
        <p class="frame-row-label">外框</p>
        ${renderMaterialCarousel(outerTypes, "classic", "outer")}
      </div>
      <div class="frame-classic-row">
        <p class="frame-row-label">內框</p>
        ${innerTypes.length
          ? renderMaterialCarousel(innerTypes, "classic", "inner")
          : `<p class="note">尚無內框材質（inner-*.webp）</p>`}
      </div>
    </div>
  `;
}

export function renderMaterialCarousel(types, categoryId, role = null){
  const artistic = categoryId === "artistic";
  const classicRole = categoryId === "classic" ? (role || "outer") : null;
  const buttons = types.map(item => `
    <button
      type="button"
      class="crystal-scene-button frame-material-button"
      data-frame-category="${categoryId}"
      data-frame-type="${item.id}"
      ${classicRole ? `data-frame-role="${classicRole}"` : ""}
      aria-label="${item.label}"
      title="${artistic ? `${item.label}（點選套用藝術畫框）` : item.label}"
    >
      <span class="crystal-scene-thumb frame-material-thumb${classicRole ? " frame-strip-thumb" : ""}">
        <img data-src="${item.thumb}" alt="" loading="lazy" decoding="async" />
      </span>
    </button>
  `).join("");

  const aria = classicRole === "inner"
    ? "內框材質"
    : classicRole === "outer"
      ? "外框材質"
      : artistic
        ? "藝術畫框"
        : "畫框材質";

  return `
    <div class="crystal-asset-carousel" data-frame-material-carousel="${categoryId}${classicRole ? `-${classicRole}` : ""}">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="${aria}">${buttons}</div>
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

function enablePhotoPlacementGesture(canvas, state, setPartialState, hooks = {}){
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

  const canGesture = () => Boolean(state.sourceImageDataUrl);

  const placementMode = () => (isGalleryMode(state) ? "gallery" : "photo");

  canvas.addEventListener("pointerdown", event => {
    if (!canGesture()) return;
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
      startScale = resolvePhotoPlacement(state).photoScale;
      lastDrag = null;
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId) || !canGesture()) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const distance = getTwoPointerDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        const nextScale = clamp(startScale * (distance / lastPinchDistance), 80, 160);
        setPartialState({ photoScale: nextScale });
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

    const place = resolvePhotoPlacement(state);
    const dragGain = placementMode() === "gallery" ? 165 : 120;
    setPartialState({
      photoOffsetX: clamp(place.photoOffsetX + dx * dragGain, -40, 40),
      photoOffsetY: clamp(place.photoOffsetY + dy * dragGain, -40, 40)
    });
  });

  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (pointers.size === 0) {
      lastDrag = null;
      lastPinchDistance = 0;
      canvas.style.cursor = canGesture() ? "grab" : "";
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
