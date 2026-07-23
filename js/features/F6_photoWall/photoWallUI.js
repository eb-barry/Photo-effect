// F6 照片牆 - UI v0.1.0 (Phase 1)

import { getPhotoWallScenes } from "./photoWallAssets.js";
import {
  PHOTO_WALL_TABS,
  POSITION_PARAMETERS,
  applyRelativeAdjustment,
  bringPhotoToFront,
  canEnableTab,
  clearCanvasForSceneChange,
  getParameterDisplayValue,
  setPhotoCanvasVisibility,
  togglePhotoChecked,
  updatePhotoWallState
} from "./photoWallState.js";
import {
  clientToCanvasPoint,
  hitTestCanvasPhoto
} from "./photoWallTool.js";

export function renderControlTabs(state){
  return PHOTO_WALL_TABS.map(tab => {
    const enabled = canEnableTab(tab.id, state);
    const active = state.activeTab === tab.id;
    return `
      <button
        type="button"
        class="crystal-tab-button photo-wall-tab-button${active ? " active" : ""}${enabled ? "" : " is-disabled"}"
        data-photo-wall-tab="${tab.id}"
        aria-pressed="${String(active)}"
        ${enabled ? "" : "disabled"}
      >${tab.label}</button>
    `;
  }).join("");
}

export function renderSceneCarousel(state){
  const scenes = getPhotoWallScenes();
  const buttons = scenes.map(item => `
    <button
      type="button"
      class="crystal-scene-button photo-wall-scene-button${state.sceneId === item.id ? " active" : ""}"
      data-photo-wall-scene="${item.id}"
      aria-pressed="${String(state.sceneId === item.id)}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="crystal-scene-thumb photo-wall-scene-thumb">
        <span class="photo-wall-scene-aspect">${item.aspect === "4x3" ? "4:3" : "3:4"}</span>
        <img src="${item.thumb}" alt="" loading="lazy" decoding="async" />
      </span>
      <span class="photo-wall-scene-label">${item.label}</span>
    </button>
  `).join("");

  return `
    <p class="note photo-wall-scene-hint">選擇場景後，畫布比例會依場景自動切換為 4:3 或 3:4。</p>
    <div class="crystal-asset-carousel" data-photo-wall-carousel="scenes">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="場景">${buttons}</div>
      <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
    </div>
  `;
}

export function renderPhotoStrip(state){
  if (!state.photos.length) {
    return `<p class="note photo-wall-strip-empty">請點右上方開啟照片，挑選多張相片。</p>`;
  }

  const items = state.photos.map((photo, index) => `
    <div
      class="photo-wall-thumb${photo.onCanvas ? " is-on-canvas" : " is-off-canvas"}"
      data-photo-wall-thumb="${photo.id}"
    >
      <img src="${photo.thumbDataUrl || photo.workDataUrl || photo.dataUrl}" alt="" loading="lazy" decoding="async" />
      <label class="photo-wall-thumb-check" aria-label="顯示於畫布 ${photo.label}">
        <input type="checkbox" data-photo-wall-check="${photo.id}" ${photo.onCanvas ? "checked" : ""} />
        <span class="photo-wall-thumb-check-box" aria-hidden="true"></span>
      </label>
      <span class="photo-wall-thumb-label">照片 ${index + 1}</span>
    </div>
  `).join("");

  return `
    <p class="note photo-wall-strip-hint">勾選縮圖可顯示在畫布上；取消勾選則從畫布移除。開啟照片後預設全部顯示。</p>
    <div class="photo-wall-thumb-strip" id="photoWallThumbStrip">
      ${items}
    </div>
  `;
}

export function renderPositionPanel(state){
  const disabled = !state.photos.some(photo => photo.onCanvas && photo.checked);
  const paramOptions = POSITION_PARAMETERS.map(item => `
    <option value="${item.id}" ${state.selectedParameter === item.id ? "selected" : ""}>${item.label}</option>
  `).join("");

  const config = POSITION_PARAMETERS.find(item => item.id === state.selectedParameter) || POSITION_PARAMETERS[0];
  const displayValue = getParameterDisplayValue(state, config.id);

  return `
    <div class="selection-row crystal-adjust-row">
      <label for="photoWallParamTarget" class="selection-label">調整項目</label>
      <select id="photoWallParamTarget" class="select-control" aria-label="調整項目" ${disabled ? "disabled" : ""}>
        ${paramOptions}
      </select>
    </div>

    <div class="slider-row" id="photoWallSliderRow">
      <div class="slider-head">
        <span id="photoWallSliderLabel">${config.label}</span>
        <span id="photoWallSliderValue">${displayValue}${config.suffix || ""}</span>
      </div>
      <input id="photoWallSlider" type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${displayValue}" ${disabled ? "disabled" : ""} />
    </div>

    <p class="note photo-wall-position-hint">直接拖曳或雙指縮放畫布上的照片；點選照片可切換紅框，下方滑桿僅作用於紅框選取的照片。</p>
  `;
}

export function renderPerspectivePanel(){
  return `
    <p class="note photo-wall-perspective-hint">視角調整將於 Phase 2 開放（六軸透視 + Slider）。</p>
  `;
}

export function mountSceneCarousel(root){
  const host = root.querySelector("#photoWallSceneHost");
  if (!host) return;
  host.querySelectorAll("[data-photo-wall-carousel]").forEach(setupCarousel);
}

export function setupPhotoWallUI(root, state, hooks){
  const tabBar = root.querySelector("#photoWallTabBar");
  const tabPanels = root.querySelector("#photoWallTabPanels");
  const sceneHost = root.querySelector("#photoWallSceneHost");
  const photoHost = root.querySelector("#photoWallPhotoHost");
  const positionHost = root.querySelector("#photoWallPositionHost");
  const perspectiveHost = root.querySelector("#photoWallPerspectiveHost");
  const canvas = root.querySelector("#editorCanvas");

  let sliderStartValue = 0;
  let lastOverlays = [];
  let gestureDepth = 0;

  const applyState = (nextState, options = {}) => {
    const {
      refreshUi = true,
      render = true,
      persist = true,
      fastPreview = false
    } = options;

    Object.assign(state, nextState);
    hooks.onStateChange?.(state);

    if (refreshUi) refreshAll();
    if (render) {
      if (fastPreview) hooks.scheduleRender?.({ fastPreview: true });
      else hooks.scheduleRenderAndPersist?.({ fastPreview: false });
    } else if (persist) {
      hooks.persist?.();
    }
  };

  const setState = (nextState, options = {}) => {
    applyState(nextState, {
      refreshUi: true,
      render: true,
      persist: true,
      fastPreview: false,
      ...options
    });
  };

  const patchCanvasState = partial => {
    applyState(updatePhotoWallState(state, partial), {
      refreshUi: false,
      render: true,
      persist: false,
      fastPreview: true
    });
  };

  const beginGesture = () => {
    if (gestureDepth === 0) hooks.onGestureStart?.();
    gestureDepth += 1;
  };

  const endGesture = () => {
    gestureDepth = Math.max(0, gestureDepth - 1);
    if (gestureDepth === 0) hooks.onGestureEnd?.();
  };

  const patchState = partial => {
    setState(updatePhotoWallState(state, partial));
  };

  const refreshTabs = () => {
    if (tabBar) tabBar.innerHTML = renderControlTabs(state);
  };

  const refreshPanels = () => {
    const tab = state.activeTab;
    root.querySelector("#photoWallScenePanel")?.classList.toggle("hidden", tab !== "scene");
    root.querySelector("#photoWallPhotoPanel")?.classList.toggle("hidden", tab !== "photo");
    root.querySelector("#photoWallPositionPanel")?.classList.toggle("hidden", tab !== "position");
    root.querySelector("#photoWallPerspectivePanel")?.classList.toggle("hidden", tab !== "perspective");

    if (sceneHost) sceneHost.innerHTML = renderSceneCarousel(state);
    if (photoHost) photoHost.innerHTML = renderPhotoStrip(state);
    if (positionHost) positionHost.innerHTML = renderPositionPanel(state);
    if (perspectiveHost) perspectiveHost.innerHTML = renderPerspectivePanel();

    mountSceneCarousel(root);
    bindSlider();
    refreshGestureHint();
  };

  const refreshGestureHint = () => {
    const hint = root.querySelector("#photoWallGestureHint");
    if (!hint) return;
    const show = Boolean(state.sceneId) && state.photos.some(photo => photo.onCanvas);
    hint.classList.toggle("hidden", !show);
    hint.textContent = state.activeTab === "position"
      ? "拖曳移動、雙指縮放手指下的照片；點選切換紅框，滑桿僅調整紅框照片"
      : "切換至位置分頁後，可直接拖曳縮放照片，點選可選取供滑桿調整";
  };

  const refreshAll = () => {
    refreshTabs();
    refreshPanels();
    root.querySelector("#emptyCanvas")?.classList.toggle("hidden", Boolean(state.sceneId));
    canvas?.classList.toggle("hidden", !state.sceneId);
  };

  const bindSlider = () => {
    const slider = root.querySelector("#photoWallSlider");
    const label = root.querySelector("#photoWallSliderLabel");
    const valueEl = root.querySelector("#photoWallSliderValue");
    if (!slider || !label || !valueEl) return;

    const config = POSITION_PARAMETERS.find(item => item.id === state.selectedParameter) || POSITION_PARAMETERS[0];
    const displayValue = getParameterDisplayValue(state, config.id);
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(displayValue);
    label.textContent = config.label;
    valueEl.textContent = `${displayValue}${config.suffix || ""}`;
  };

  if (!root.dataset.photoWallUiBound) {
    root.dataset.photoWallUiBound = "1";

    positionHost?.addEventListener("change", event => {
      const select = event.target.closest("#photoWallParamTarget");
      if (!select) return;
      patchState({ selectedParameter: select.value });
    });

    let sliderGesture = false;

    positionHost?.addEventListener("pointerdown", event => {
      const slider = event.target.closest("#photoWallSlider");
      if (!slider) return;
      sliderStartValue = Number(slider.value);
      sliderGesture = true;
      beginGesture();
    });

    positionHost?.addEventListener("input", event => {
      const slider = event.target.closest("#photoWallSlider");
      if (!slider) return;
      const valueEl = root.querySelector("#photoWallSliderValue");
      const config = POSITION_PARAMETERS.find(item => item.id === state.selectedParameter) || POSITION_PARAMETERS[0];
      const nextValue = Number(slider.value);
      if (valueEl) valueEl.textContent = `${Math.round(nextValue)}${config.suffix || ""}`;
      const delta = nextValue - sliderStartValue;
      if (!delta) return;
      applyState(applyRelativeAdjustment(state, state.selectedParameter, delta), {
        refreshUi: false,
        render: true,
        persist: false,
        fastPreview: true
      });
      sliderStartValue = nextValue;
    });

    positionHost?.addEventListener("pointerup", event => {
      if (!sliderGesture || !event.target.closest("#photoWallSlider")) return;
      sliderGesture = false;
      endGesture();
    });

    positionHost?.addEventListener("pointercancel", event => {
      if (!sliderGesture || !event.target.closest("#photoWallSlider")) return;
      sliderGesture = false;
      endGesture();
    });
  }

  tabBar?.addEventListener("click", event => {
    const button = event.target.closest("[data-photo-wall-tab]");
    if (!button || button.disabled) return;
    patchState({ activeTab: button.dataset.photoWallTab });
  });

  sceneHost?.addEventListener("click", event => {
    const button = event.target.closest("[data-photo-wall-scene]");
    if (!button) return;
    const nextSceneId = button.dataset.photoWallScene;
    if (state.sceneId && state.sceneId !== nextSceneId && state.photos.some(photo => photo.onCanvas)) {
      const ok = window.confirm("更換場景會清空畫布上的照片，確定要更換嗎？");
      if (!ok) return;
    }
    if (state.sceneId === nextSceneId) return;
    if (state.sceneId && state.photos.some(photo => photo.onCanvas)) {
      setState(clearCanvasForSceneChange(state, nextSceneId));
    } else {
      patchState({ sceneId: nextSceneId, activeTab: "scene" });
    }
    hooks.onSceneChange?.();
  });

  photoHost?.addEventListener("change", event => {
    const input = event.target.closest("[data-photo-wall-check]");
    if (!input) return;
    setState(setPhotoCanvasVisibility(state, input.dataset.photoWallCheck, input.checked));
  });

  enableCanvasInteractions(canvas, {
    getState: () => state,
    getOverlays: () => lastOverlays,
    setOverlays: overlays => { lastOverlays = overlays; },
    setState,
    patchCanvasState,
    beginGesture,
    endGesture
  });

  refreshAll();

  return {
    refreshAll,
    setOverlays: overlays => { lastOverlays = overlays; },
    getOverlays: () => lastOverlays
  };
}

function enableCanvasInteractions(canvas, hooks){
  if (!canvas) return;

  const pointers = new Map();
  let lastDrag = null;
  let lastPinchDistance = 0;
  let startScales = new Map();
  let pressPhotoId = null;
  let manipulatePhotoId = null;
  let gestureActive = false;

  canvas.style.touchAction = "none";

  const getState = () => hooks.getState();
  const overlays = () => hooks.getOverlays();

  function rememberStartScales(state, photoId){
    startScales = new Map();
    const photo = state.photos.find(item => item.id === photoId);
    if (photo) {
      startScales.set(photoId, photo.position?.scale || 0.28);
    }
  }

  function clearAllSelections(state){
    if (!state.photos.some(photo => photo.checked)) return;
    hooks.setState(updatePhotoWallState(state, {
      photos: state.photos.map(photo => (
        photo.checked ? { ...photo, checked: false } : photo
      ))
    }), { fastPreview: false });
  }

  canvas.addEventListener("pointerdown", event => {
    const state = getState();
    if (!state.sceneId) return;
    event.preventDefault();

    const isSecondFinger = pointers.size >= 1;
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (isSecondFinger) {
      if (state.activeTab === "position" && manipulatePhotoId) {
        if (!gestureActive) {
          gestureActive = true;
          hooks.beginGesture?.();
          rememberStartScales(getState(), manipulatePhotoId);
        }
        lastPinchDistance = getPinchDistance();
        lastDrag = null;
      }
      return;
    }

    const point = clientToCanvasPoint(canvas, event.clientX, event.clientY);
    const hit = hitTestCanvasPhoto(overlays(), point.x, point.y);

    if (hit) {
      pressPhotoId = hit.id;
      manipulatePhotoId = state.activeTab === "position" ? hit.id : null;
      const next = bringPhotoToFront(state, hit.id);
      hooks.patchCanvasState({ photos: next.photos });

      if (state.activeTab === "position") {
        lastDrag = { x: event.clientX, y: event.clientY };
      }
    } else {
      pressPhotoId = null;
      manipulatePhotoId = null;
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const state = getState();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.activeTab !== "position" || !manipulatePhotoId) return;

    if (!gestureActive) {
      const moved = Math.abs(event.movementX) > 2 || Math.abs(event.movementY) > 2;
      if (moved) {
        gestureActive = true;
        hooks.beginGesture?.();
        rememberStartScales(state, manipulatePhotoId);
      }
    }

    if (!gestureActive) return;

    event.preventDefault();

    if (pointers.size >= 2) {
      const distance = getPinchDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        const ratio = distance / lastPinchDistance;
        const targetId = manipulatePhotoId;
        hooks.patchCanvasState({
          photos: state.photos.map(item => {
            if (item.id !== targetId) return item;
            const baseScale = startScales.get(item.id) ?? item.position.scale;
            return {
              ...item,
              position: {
                ...item.position,
                scale: clamp(baseScale * ratio, 0.08, 0.85)
              }
            };
          })
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
    const targetId = manipulatePhotoId;

    hooks.patchCanvasState({
      photos: state.photos.map(item => {
        if (item.id !== targetId) return item;
        return {
          ...item,
          position: {
            ...item.position,
            x: clamp(item.position.x + dx, 0, 1),
            y: clamp(item.position.y + dy, 0, 1)
          }
        };
      })
    });
  });

  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);

    if (pointers.size === 0) {
      const latest = getState();
      if (!gestureActive && latest.activeTab === "position") {
        if (pressPhotoId) {
          hooks.setState(togglePhotoChecked(latest, pressPhotoId), { fastPreview: false });
        } else {
          clearAllSelections(latest);
        }
      }

      if (gestureActive) {
        gestureActive = false;
        hooks.endGesture?.();
      }
      lastDrag = null;
      lastPinchDistance = 0;
      startScales = new Map();
      pressPhotoId = null;
      manipulatePhotoId = null;
    } else if (pointers.size === 1 && gestureActive) {
      lastPinchDistance = 0;
      const latest = getState();
      if (manipulatePhotoId) rememberStartScales(latest, manipulatePhotoId);
      const values = [...pointers.values()][0];
      lastDrag = values ? { x: values.x, y: values.y } : null;
    }
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  function getPinchDistance(){
    const values = [...pointers.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }
}

function setupCarousel(carousel){
  const track = carousel.querySelector(".crystal-asset-track");
  const left = carousel.querySelector(".crystal-carousel-hint-left");
  const right = carousel.querySelector(".crystal-carousel-hint-right");
  if (!track) return;

  const update = () => updateCarouselHints(track, left, right);
  track.addEventListener("scroll", update, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(update);
    observer.observe(track);
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

function clamp(value, min, max){
  return Math.min(max, Math.max(min, Number(value) || 0));
}
