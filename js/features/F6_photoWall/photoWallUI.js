// F6 照片牆 - UI v0.1.0 (Phase 1)

import { getPhotoWallScenes } from "./photoWallAssets.js";
import {
  PHOTO_WALL_TABS,
  POSITION_PARAMETERS,
  applyAbsoluteAdjustment,
  applyRelativeAdjustment,
  bringPhotoToFront,
  canEnableTab,
  clearCanvasForSceneChange,
  getParameterDisplayValue,
  moveCheckedLayers,
  placePhotoOnCanvas,
  removePhotoFromCanvas,
  setPhotoChecked,
  togglePhotoChecked,
  updatePhotoWallState
} from "./photoWallState.js";
import {
  clientToCanvasPoint,
  hitTestCanvasPhoto,
  normalizedPointFromCanvas
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
      class="crystal-asset-thumb photo-wall-scene-thumb${state.sceneId === item.id ? " active" : ""}"
      data-photo-wall-scene="${item.id}"
      aria-pressed="${String(state.sceneId === item.id)}"
      aria-label="${item.label}"
    >
      <span class="photo-wall-scene-aspect">${item.aspect === "4x3" ? "4:3" : "3:4"}</span>
      <img src="${item.thumb}" alt="" loading="lazy" decoding="async" />
      <span class="crystal-asset-label">${item.label}</span>
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

  const items = state.photos.map(photo => `
    <div
      class="photo-wall-thumb${photo.onCanvas ? " is-on-canvas" : ""}${photo.checked ? " is-checked" : ""}"
      data-photo-wall-thumb="${photo.id}"
    >
      <label class="photo-wall-thumb-check" aria-label="選取 ${photo.label}">
        <input type="checkbox" data-photo-wall-check="${photo.id}" ${photo.checked ? "checked" : ""} />
        <span aria-hidden="true"></span>
      </label>
      <img src="${photo.dataUrl}" alt="" loading="lazy" decoding="async" />
      <span class="photo-wall-thumb-label">${photo.onCanvas ? "已上牆" : "拖入畫布"}</span>
    </div>
  `).join("");

  return `
    <p class="note photo-wall-strip-hint">勾選縮圖可多選批次調整；將縮圖拖入畫布，或從畫布拖回此處移除。</p>
    <div class="photo-wall-thumb-strip" id="photoWallThumbStrip" data-photo-wall-dropzone="strip">
      ${items}
    </div>
  `;
}

export function renderPositionPanel(state){
  const disabled = !state.photos.some(photo => photo.onCanvas && photo.checked);
  const paramOptions = POSITION_PARAMETERS.map(item => `
    <option value="${item.id}" ${state.selectedParameter === item.id ? "selected" : ""}>${item.label}</option>
  `).join("");

  const alignRelative = state.sliderAlignMode !== "absolute";
  const config = POSITION_PARAMETERS.find(item => item.id === state.selectedParameter) || POSITION_PARAMETERS[0];
  const displayValue = getParameterDisplayValue(state, config.id);

  return `
    <div class="selection-row crystal-adjust-row">
      <label for="photoWallParamTarget" class="selection-label">調整項目</label>
      <select id="photoWallParamTarget" class="select-control" aria-label="調整項目" ${disabled ? "disabled" : ""}>
        ${paramOptions}
      </select>
    </div>

    <div class="photo-wall-layer-row">
      <button type="button" class="photo-wall-layer-btn" data-photo-wall-layer="forward" ${disabled ? "disabled" : ""}>往前一層</button>
      <button type="button" class="photo-wall-layer-btn" data-photo-wall-layer="backward" ${disabled ? "disabled" : ""}>往後一層</button>
    </div>

    <div class="photo-wall-align-row" role="group" aria-label="批次調整模式">
      <button type="button" class="photo-wall-align-btn${alignRelative ? " active" : ""}" data-photo-wall-align="relative" ${disabled ? "disabled" : ""}>相對調整</button>
      <button type="button" class="photo-wall-align-btn${!alignRelative ? " active" : ""}" data-photo-wall-align="absolute" ${disabled ? "disabled" : ""}>對齊相同值</button>
    </div>

    <div class="slider-row" id="photoWallSliderRow">
      <div class="slider-head">
        <span id="photoWallSliderLabel">${config.label}</span>
        <span id="photoWallSliderValue">${displayValue}${config.suffix || ""}</span>
      </div>
      <input id="photoWallSlider" type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${displayValue}" ${disabled ? "disabled" : ""} />
    </div>

    <p class="note photo-wall-position-hint">位置模式：可拖曳或雙指縮放畫布上的照片。長按畫布照片可移除。</p>
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
  const canvasWrap = root.querySelector("#canvasWrap");
  const thumbStrip = () => root.querySelector("#photoWallThumbStrip");

  let sliderStartValue = 0;
  let sliderDragging = false;
  let lastOverlays = [];

  const setState = nextState => {
    Object.assign(state, nextState);
    hooks.onStateChange?.(state);
    refreshAll();
    hooks.render?.();
    hooks.persist?.();
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
    bindThumbDrag();
    bindSlider();
    refreshGestureHint();
  };

  const refreshGestureHint = () => {
    const hint = root.querySelector("#photoWallGestureHint");
    if (!hint) return;
    const show = Boolean(state.sceneId) && state.photos.some(photo => photo.onCanvas);
    hint.classList.toggle("hidden", !show);
    hint.textContent = state.activeTab === "position"
      ? "拖曳移動、雙指縮放；長按移除；拖回下方縮圖列亦可移除"
      : "點選畫布照片可選取（紅框光暈）";
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

    positionHost?.addEventListener("pointerdown", event => {
      const slider = event.target.closest("#photoWallSlider");
      if (!slider) return;
      sliderStartValue = Number(slider.value);
      sliderDragging = true;
    });

    positionHost?.addEventListener("input", event => {
      const slider = event.target.closest("#photoWallSlider");
      if (!slider) return;
      const valueEl = root.querySelector("#photoWallSliderValue");
      const config = POSITION_PARAMETERS.find(item => item.id === state.selectedParameter) || POSITION_PARAMETERS[0];
      const nextValue = Number(slider.value);
      if (valueEl) valueEl.textContent = `${Math.round(nextValue)}${config.suffix || ""}`;
      if (state.sliderAlignMode === "absolute") {
        setState(applyAbsoluteAdjustment(state, state.selectedParameter, nextValue));
        return;
      }
      const delta = nextValue - sliderStartValue;
      if (!delta) return;
      setState(applyRelativeAdjustment(state, state.selectedParameter, delta));
      sliderStartValue = nextValue;
    });

    positionHost?.addEventListener("click", event => {
      const alignButton = event.target.closest("[data-photo-wall-align]");
      if (alignButton) {
        patchState({ sliderAlignMode: alignButton.dataset.photoWallAlign });
        return;
      }
      const layerButton = event.target.closest("[data-photo-wall-layer]");
      if (!layerButton) return;
      const direction = layerButton.dataset.photoWallLayer === "forward" ? "forward" : "backward";
      setState(moveCheckedLayers(state, direction));
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
    setState(setPhotoChecked(state, input.dataset.photoWallCheck, input.checked));
  });

  photoHost?.addEventListener("click", event => {
    if (event.target.closest(".photo-wall-thumb-check")) return;
    const thumb = event.target.closest("[data-photo-wall-thumb]");
    if (!thumb) return;
    setState(togglePhotoChecked(state, thumb.dataset.photoWallThumb));
  });

  const bindThumbDrag = () => {
    root.querySelectorAll("[data-photo-wall-thumb]").forEach(thumb => {
      thumb.addEventListener("pointerdown", onThumbPointerDown);
    });
  };

  let dragGhost = null;
  let dragPhotoId = null;
  let dragFromCanvas = false;

  function onThumbPointerDown(event){
    if (event.target.closest(".photo-wall-thumb-check")) return;
    const thumb = event.target.closest("[data-photo-wall-thumb]");
    if (!thumb) return;
    const photoId = thumb.dataset.photoWallThumb;
    const photo = state.photos.find(item => item.id === photoId);
    if (!photo || photo.onCanvas) return;

    event.preventDefault();
    thumb.setPointerCapture?.(event.pointerId);
    dragPhotoId = photoId;
    dragFromCanvas = false;
    createDragGhost(thumb.querySelector("img")?.src, event.clientX, event.clientY);

    const onMove = moveEvent => {
      moveEvent.preventDefault();
      moveDragGhost(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = upEvent => {
      thumb.releasePointerCapture?.(upEvent.pointerId);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      removeDragGhost();

      const dropCanvas = canvas && isInside(canvas, upEvent.clientX, upEvent.clientY);
      if (dropCanvas) {
        const point = normalizedPointFromCanvas(canvas, upEvent.clientX, upEvent.clientY);
        setState(placePhotoOnCanvas(state, photoId, point));
      }
      dragPhotoId = null;
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function createDragGhost(src, x, y){
    removeDragGhost();
    if (!src) return;
    dragGhost = document.createElement("img");
    dragGhost.src = src;
    dragGhost.className = "photo-wall-drag-ghost";
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
    document.body.appendChild(dragGhost);
  }

  function moveDragGhost(x, y){
    if (!dragGhost) return;
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
  }

  function removeDragGhost(){
    dragGhost?.remove();
    dragGhost = null;
  }

  enableCanvasInteractions(canvas, canvasWrap, {
    getState: () => state,
    getOverlays: () => lastOverlays,
    setOverlays: overlays => { lastOverlays = overlays; },
    setState,
    patchState,
    isDropOnStrip: (x, y) => {
      const strip = thumbStrip();
      return strip ? isInside(strip, x, y) : false;
    }
  });

  refreshAll();

  return {
    refreshAll,
    setOverlays: overlays => { lastOverlays = overlays; },
    getOverlays: () => lastOverlays
  };
}

function enableCanvasInteractions(canvas, canvasWrap, hooks){
  if (!canvas) return;

  const pointers = new Map();
  let lastDrag = null;
  let lastPinchDistance = 0;
  let startScale = 0.28;
  let activePhotoId = null;
  let longPressTimer = null;
  let longPressTriggered = false;
  let canvasDragFromPhoto = false;
  let dragMoved = false;

  canvas.style.touchAction = "none";

  const getState = () => hooks.getState();
  const overlays = () => hooks.getOverlays();

  canvas.addEventListener("pointerdown", event => {
    const state = getState();
    if (!state.sceneId) return;
    event.preventDefault();

    const point = clientToCanvasPoint(canvas, event.clientX, event.clientY);
    const hit = hitTestCanvasPhoto(overlays(), point.x, point.y);

    if (hit) {
      activePhotoId = hit.id;
      canvasDragFromPhoto = true;
      let next = setPhotoChecked(state, hit.id, true);
      next = bringPhotoToFront(next, hit.id);
      hooks.setState(next);

      longPressTriggered = false;
      longPressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        hooks.setState(removePhotoFromCanvas(getState(), hit.id));
        activePhotoId = null;
        canvasDragFromPhoto = false;
      }, 550);
    } else {
      activePhotoId = null;
      canvasDragFromPhoto = false;
    }

    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1 && hit && state.activeTab === "position") {
      lastDrag = { x: event.clientX, y: event.clientY };
      const photo = state.photos.find(item => item.id === hit.id);
      startScale = photo?.position?.scale || 0.28;
    } else if (pointers.size === 2 && state.activeTab === "position") {
      lastPinchDistance = getPinchDistance();
      const photo = state.photos.find(item => item.id === activePhotoId);
      startScale = photo?.position?.scale || 0.28;
      lastDrag = null;
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const state = getState();
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (longPressTimer && (Math.abs(event.movementX) > 3 || Math.abs(event.movementY) > 3)) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (state.activeTab === "position" && activePhotoId && (Math.abs(event.movementX) > 2 || Math.abs(event.movementY) > 2)) {
      dragMoved = true;
    }

    if (state.activeTab !== "position" || !activePhotoId) return;

    if (pointers.size >= 2) {
      const distance = getPinchDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        const photo = state.photos.find(item => item.id === activePhotoId);
        if (!photo) return;
        const nextScale = clamp(startScale * (distance / lastPinchDistance), 0.08, 0.85);
        hooks.patchState({
          photos: state.photos.map(item => (
            item.id === activePhotoId
              ? { ...item, position: { ...item.position, scale: nextScale } }
              : item
          ))
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

    hooks.patchState({
      photos: state.photos.map(item => {
        if (item.id !== activePhotoId) return item;
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

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const state = getState();

    if (!longPressTriggered && canvasDragFromPhoto && dragMoved && state.activeTab === "position" && pointers.size === 0) {
      const dropOnStrip = hooks.isDropOnStrip(event.clientX, event.clientY);
      if (dropOnStrip && activePhotoId) {
        hooks.setState(removePhotoFromCanvas(state, activePhotoId));
      }
    }

    if (pointers.size === 0) {
      lastDrag = null;
      lastPinchDistance = 0;
      activePhotoId = null;
      canvasDragFromPhoto = false;
      dragMoved = false;
      longPressTriggered = false;
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

function isInside(element, clientX, clientY){
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, Number(value) || 0));
}
