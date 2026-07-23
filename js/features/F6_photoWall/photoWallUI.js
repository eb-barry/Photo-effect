// F6 照片牆 - UI v0.1.0 (Phase 1)

import { getPhotoWallScenes } from "./photoWallAssets.js";
import {
  PHOTO_WALL_TABS,
  POSITION_PARAMETERS,
  PERSPECTIVE_PARAMETERS,
  applyPerspectiveMicroPolar,
  applyRelativeAdjustment,
  bringPhotoToFront,
  canEnableTab,
  clearCanvasForSceneChange,
  clonePerspectiveRecord,
  getParameterDisplayValue,
  resetCheckedPerspective,
  setPhotoCanvasVisibility,
  togglePhotoChecked,
  togglePhotoCheckedExclusive,
  enforceSingleCheckedPhoto,
  updatePhotoPerspectiveCorner,
  updatePhotoWallState
} from "./photoWallState.js";
import {
  clientToCanvasPoint,
  hitTestPerspectiveHandle,
  pickCanvasPhotoAtPoint
} from "./photoWallTool.js";
import {
  canvasPointToCorner,
  computeEdgeCurveFromPoint,
  cornersToCanvas,
  buildCustomizedPerspective,
  getWarpPointDef,
  transformCornersWithPosition
} from "./photoWallWarp.js";

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
        <img src="${item.thumb}" alt="" loading="lazy" decoding="async" draggable="false" />
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
      <img src="${photo.thumbDataUrl || photo.workDataUrl || photo.dataUrl}" alt="" loading="lazy" decoding="async" draggable="false" />
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

    <p class="note photo-wall-position-hint">直接拖曳或雙指縮放畫布上的照片；點選照片可切換紅框。若照片重疊，可在同一位置連續點選以切換下層照片。</p>
  `;
}

export function renderPerspectivePanel(state, overlays = [], polarKnob = { distance: 0, angleDeg: 0 }){
  const disabled = !state.photos.some(photo => photo.onCanvas && photo.checked);
  const paramOptions = PERSPECTIVE_PARAMETERS.map(item => `
    <option value="${item.id}" ${state.selectedPerspectiveParameter === item.id ? "selected" : ""}>${item.label}</option>
  `).join("");

  const config = PERSPECTIVE_PARAMETERS.find(item => item.id === state.selectedPerspectiveParameter) || PERSPECTIVE_PARAMETERS[0];
  const def = getWarpPointDef(config.id);

  return `
    <div class="selection-row crystal-adjust-row">
      <label for="photoWallPerspectiveParamTarget" class="selection-label">調整項目</label>
      <select id="photoWallPerspectiveParamTarget" class="select-control" aria-label="視角調整項目" ${disabled ? "disabled" : ""}>
        ${paramOptions}
      </select>
    </div>

    <div class="photo-wall-polar-wrap" id="photoWallPolarWrap">
      <div class="photo-wall-polar-head">
        <span id="photoWallPolarLabel">${config.label}</span>
        <span id="photoWallPolarValue">${Math.round(polarKnob.distance)}% · ${Math.round(polarKnob.angleDeg)}°</span>
      </div>
      <div
        class="photo-wall-polar-pad${disabled ? " is-disabled" : ""}"
        id="photoWallPolarPad"
        aria-label="${config.label} 方向距離調整"
        ${disabled ? "aria-disabled=\"true\"" : ""}
      >
        <span class="photo-wall-polar-ring" aria-hidden="true"></span>
        <span class="photo-wall-polar-center" id="photoWallPolarCenter" aria-hidden="true">
          <span class="photo-wall-polar-center-letter">${def.letter}</span>
        </span>
        <span class="photo-wall-polar-knob" id="photoWallPolarKnob" aria-hidden="true">
          <span class="photo-wall-polar-sphere-shine" aria-hidden="true"></span>
        </span>
      </div>
      <p class="note photo-wall-polar-hint">以選定點為中心微調；畫布調整後旋鈕會自動歸正，可再進一步細調。</p>
    </div>

    <div class="photo-wall-perspective-actions">
      <button type="button" class="photo-wall-reset-btn" data-photo-wall-reset-perspective ${disabled ? "disabled" : ""}>還原視角變形</button>
    </div>

    <p class="note photo-wall-perspective-hint">一次僅能選定一張照片（點選切換紅框）。A–H 定位點放大顯示，畫布調整後旋鈕會歸正以便微調。</p>
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
  let polarKnob = { angle: 0, distance: 0, angleDeg: 0 };
  let polarBaselines = new Map();
  let perspectiveTabWasActive = false;
  let lastCheckedPhotoKey = "";
  const POLAR_PAD_RATIO = 0.88;

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

  const capturePolarBaselines = () => {
    polarBaselines = new Map();
    state.photos
      .filter(photo => photo.checked && photo.onCanvas)
      .forEach(photo => {
        polarBaselines.set(photo.id, clonePerspectiveRecord(photo.perspective));
      });
  };

  const resetPolarKnob = (captureBaseline = true) => {
    if (captureBaseline) capturePolarBaselines();
    polarKnob = { angle: 0, distance: 0, angleDeg: 0 };
    bindPerspectivePolar();
  };

  const ensurePolarBaselines = () => {
    if (!polarBaselines.size && state.photos.some(photo => photo.checked && photo.onCanvas)) {
      capturePolarBaselines();
    }
  };

  const patchState = partial => {
    setState(updatePhotoWallState(state, partial));
  };

  const applyPolarKnob = (angle, distance, dx, dy) => {
    polarKnob = {
      angle,
      distance,
      angleDeg: (angle * 180 / Math.PI + 360) % 360
    };
    const pad = root.querySelector("#photoWallPolarPad");
    const knob = root.querySelector("#photoWallPolarKnob");
    const valueEl = root.querySelector("#photoWallPolarValue");
    updatePolarKnobVisual(pad, knob, dx, dy);
    if (valueEl) {
      valueEl.textContent = `${Math.round(polarKnob.distance)}% · ${Math.round(polarKnob.angleDeg)}°`;
    }
    ensurePolarBaselines();
    applyState(
      applyPerspectiveMicroPolar(state, state.selectedPerspectiveParameter, angle, distance, polarBaselines, lastOverlays),
      {
        refreshUi: false,
        render: true,
        persist: false,
        fastPreview: true
      }
    );
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
    if (perspectiveHost) perspectiveHost.innerHTML = renderPerspectivePanel(state, lastOverlays, polarKnob);

    if (tab === "perspective" && !perspectiveTabWasActive) {
      const next = enforceSingleCheckedPhoto(state);
      if (next !== state) Object.assign(state, next);
      resetPolarKnob(true);
    }
    if (tab === "perspective") {
      const checkedKey = state.photos
        .filter(photo => photo.checked && photo.onCanvas)
        .map(photo => photo.id)
        .sort()
        .join(",");
      if (checkedKey !== lastCheckedPhotoKey) {
        resetPolarKnob(true);
        lastCheckedPhotoKey = checkedKey;
      }
    } else {
      lastCheckedPhotoKey = "";
    }
    perspectiveTabWasActive = tab === "perspective";

    mountSceneCarousel(root);
    bindSlider();
    bindPerspectivePolar();
    refreshGestureHint();
  };

  const refreshGestureHint = () => {
    const hint = root.querySelector("#photoWallGestureHint");
    if (!hint) return;
    const show = Boolean(state.sceneId) && state.photos.some(photo => photo.onCanvas);
    hint.classList.toggle("hidden", !show);
    hint.textContent = state.activeTab === "position"
      ? "拖曳移動、雙指縮放手指下的照片；點選切換紅框，滑桿僅調整紅框照片"
      : state.activeTab === "perspective"
        ? "一次僅能選定一張照片；點選切換紅框，畫布調整後旋鈕歸正"
        : "切換至位置或視角分頁後可操作畫布";
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

  const polarFromClient = (pad, clientX, clientY) => {
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = (rect.width / 2) * POLAR_PAD_RATIO;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    const angle = Math.atan2(dy, dx);
    const distance = (Math.hypot(dx, dy) / Math.max(1, maxR)) * 100;
    return { angle, distance, dx, dy };
  };

  const updatePolarKnobVisual = (pad, knob, dx, dy) => {
    if (!pad || !knob) return;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };

  const bindPerspectivePolar = () => {
    const pad = root.querySelector("#photoWallPolarPad");
    const knob = root.querySelector("#photoWallPolarKnob");
    const label = root.querySelector("#photoWallPolarLabel");
    const valueEl = root.querySelector("#photoWallPolarValue");
    const center = root.querySelector("#photoWallPolarCenter");
    if (!pad || !knob) return;

    const config = PERSPECTIVE_PARAMETERS.find(item => item.id === state.selectedPerspectiveParameter) || PERSPECTIVE_PARAMETERS[0];
    const def = getWarpPointDef(config.id);
    const rect = pad.getBoundingClientRect();
    const maxR = (rect.width / 2) * POLAR_PAD_RATIO;
    const dx = Math.cos(polarKnob.angle) * (polarKnob.distance / 100) * maxR;
    const dy = Math.sin(polarKnob.angle) * (polarKnob.distance / 100) * maxR;

    updatePolarKnobVisual(pad, knob, dx, dy);
    if (label) label.textContent = config.label;
    if (valueEl) valueEl.textContent = `${Math.round(polarKnob.distance)}% · ${Math.round(polarKnob.angleDeg)}°`;
    if (center) {
      const letter = center.querySelector(".photo-wall-polar-center-letter");
      if (letter) letter.textContent = def.letter;
    }
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

    perspectiveHost?.addEventListener("change", event => {
      const select = event.target.closest("#photoWallPerspectiveParamTarget");
      if (!select) return;
      patchState({ selectedPerspectiveParameter: select.value });
      resetPolarKnob(true);
    });

    let polarPadGesture = false;

    perspectiveHost?.addEventListener("touchstart", event => {
      const pad = event.target.closest("#photoWallPolarPad");
      if (!pad || pad.classList.contains("is-disabled")) return;
      event.preventDefault();
    }, { passive: false });

    perspectiveHost?.addEventListener("pointerdown", event => {
      const pad = event.target.closest("#photoWallPolarPad");
      if (!pad || pad.classList.contains("is-disabled")) return;
      event.preventDefault();
      polarPadGesture = true;
      pad.classList.add("is-active");
      pad.setPointerCapture?.(event.pointerId);
      beginGesture();
      ensurePolarBaselines();
      const { angle, distance, dx, dy } = polarFromClient(pad, event.clientX, event.clientY);
      applyPolarKnob(angle, distance, dx, dy);
    });

    perspectiveHost?.addEventListener("pointermove", event => {
      if (!polarPadGesture) return;
      const pad = root.querySelector("#photoWallPolarPad");
      if (!pad) return;
      event.preventDefault();
      const { angle, distance, dx, dy } = polarFromClient(pad, event.clientX, event.clientY);
      applyPolarKnob(angle, distance, dx, dy);
    });

    const endPolarPadGesture = event => {
      if (!polarPadGesture) return;
      polarPadGesture = false;
      const pad = root.querySelector("#photoWallPolarPad");
      pad?.classList.remove("is-active");
      if (pad?.hasPointerCapture?.(event.pointerId)) {
        pad.releasePointerCapture(event.pointerId);
      }
      endGesture();
    };

    perspectiveHost?.addEventListener("pointerup", endPolarPadGesture);
    perspectiveHost?.addEventListener("pointercancel", endPolarPadGesture);

    perspectiveHost?.addEventListener("click", event => {
      const resetButton = event.target.closest("[data-photo-wall-reset-perspective]");
      if (!resetButton || resetButton.disabled) return;
      setState(resetCheckedPerspective(state));
      resetPolarKnob(true);
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
    endGesture,
    onPerspectiveCanvasChange: () => resetPolarKnob(true)
  });

  refreshAll();

  return {
    refreshAll,
    setOverlays: overlays => {
      lastOverlays = overlays;
      bindPerspectivePolar();
    },
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
  let activeWarpHandle = null;
  let gestureActive = false;
  let sessionHadPerspectiveEdit = false;
  let hitCycle = { x: 0, y: 0, photoIds: [], index: 0 };
  let broughtPhotoToFront = false;

  canvas.style.touchAction = "none";

  const getState = () => hooks.getState();
  const overlays = () => hooks.getOverlays();

  function allowsPhotoManipulation(tab){
    return tab === "position" || tab === "perspective";
  }

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

  function ensureCustomizedPerspective(state, photoId){
    const entry = overlays().find(item => item.photo.id === photoId);
    if (!entry?.baseCorners) return state;
    const photo = state.photos.find(item => item.id === photoId);
    if (photo?.perspective?.customized) return state;
    return updatePhotoWallState(state, {
      photos: state.photos.map(item => (
        item.id === photoId
          ? {
            ...item,
            perspective: buildCustomizedPerspective(item, entry.baseCorners, {
              corners: entry.corners,
              edgeCurve: entry.edgeCurve
            })
          }
          : item
      ))
    });
  }

  function applyWarpHandlePoint(state, photoId, handleId, canvasX, canvasY){
    const entry = overlays().find(item => item.photo.id === photoId);
    if (!entry?.baseCorners) return state;
    const { canvasW, canvasH, baseCorners } = entry;

    if (handleId === "top" || handleId === "right" || handleId === "bottom" || handleId === "left") {
      const cornersPx = cornersToCanvas(baseCorners, canvasW, canvasH);
      const edgeCurve = computeEdgeCurveFromPoint(cornersPx, handleId, { x: canvasX, y: canvasY });
      return updatePhotoPerspectiveCorner(state, photoId, handleId, { edgeCurve }, baseCorners);
    }

    const point = canvasPointToCorner(canvasX, canvasY, canvasW, canvasH);
    return updatePhotoPerspectiveCorner(state, photoId, handleId, point, baseCorners);
  }

  function patchPhotoPosition(state, photoId, afterPosition){
    hooks.patchCanvasState({
      photos: state.photos.map(item => {
        if (item.id !== photoId) return item;
        const before = { ...item.position };
        const position = { ...afterPosition };
        let perspective = item.perspective;
        if (perspective?.customized && perspective.corners) {
          perspective = {
            ...perspective,
            corners: transformCornersWithPosition(perspective.corners, before, position)
          };
        }
        return { ...item, position, perspective };
      })
    });
  }

  canvas.addEventListener("pointerdown", event => {
    const state = getState();
    if (!state.sceneId) return;
    event.preventDefault();

    const isSecondFinger = pointers.size >= 1;
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const point = clientToCanvasPoint(canvas, event.clientX, event.clientY);

    if (state.activeTab === "perspective") {
      const handleHit = hitTestPerspectiveHandle(overlays(), point.x, point.y);
      if (!isSecondFinger && handleHit) {
        const nextState = ensureCustomizedPerspective(state, handleHit.photo.id);
        if (nextState !== state) {
          hooks.patchCanvasState({ photos: nextState.photos });
        }
        activeWarpHandle = { photoId: handleHit.photo.id, handleId: handleHit.handleId };
        pressPhotoId = handleHit.photo.id;
        gestureActive = true;
        hooks.beginGesture?.();
        return;
      }
    }

    if (isSecondFinger) {
      if (allowsPhotoManipulation(state.activeTab) && manipulatePhotoId) {
        if (!gestureActive) {
          gestureActive = true;
          hooks.beginGesture?.();
          rememberStartScales(getState(), manipulatePhotoId);
          if (!broughtPhotoToFront) {
            broughtPhotoToFront = true;
            const latest = getState();
            const next = bringPhotoToFront(latest, manipulatePhotoId);
            hooks.patchCanvasState({ photos: next.photos });
          }
        }
        lastPinchDistance = getPinchDistance();
        lastDrag = null;
      }
      return;
    }

    const hit = pickCanvasPhotoAtPoint(overlays(), point.x, point.y, hitCycle);

    if (hit) {
      pressPhotoId = hit.id;
      manipulatePhotoId = allowsPhotoManipulation(state.activeTab) ? hit.id : null;
      broughtPhotoToFront = false;

      if (allowsPhotoManipulation(state.activeTab)) {
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
    const point = clientToCanvasPoint(canvas, event.clientX, event.clientY);

    if (state.activeTab === "perspective" && activeWarpHandle) {
      event.preventDefault();
      sessionHadPerspectiveEdit = true;
      const nextState = applyWarpHandlePoint(
        state,
        activeWarpHandle.photoId,
        activeWarpHandle.handleId,
        point.x,
        point.y
      );
      hooks.patchCanvasState({ photos: nextState.photos });
      return;
    }

    if (!allowsPhotoManipulation(state.activeTab) || !manipulatePhotoId) return;

    if (!gestureActive) {
      const moved = Math.abs(event.movementX) > 2 || Math.abs(event.movementY) > 2;
      if (moved) {
        gestureActive = true;
        hooks.beginGesture?.();
        rememberStartScales(state, manipulatePhotoId);
        if (!broughtPhotoToFront && manipulatePhotoId) {
          broughtPhotoToFront = true;
          const next = bringPhotoToFront(state, manipulatePhotoId);
          hooks.patchCanvasState({ photos: next.photos });
        }
      }
    }

    if (!gestureActive) return;

    event.preventDefault();
    if (state.activeTab === "perspective") {
      sessionHadPerspectiveEdit = true;
    }

    if (pointers.size >= 2) {
      const distance = getPinchDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        const ratio = distance / lastPinchDistance;
        const targetId = manipulatePhotoId;
        const photo = state.photos.find(item => item.id === targetId);
        if (!photo) return;
        const baseScale = startScales.get(targetId) ?? photo.position.scale;
        const nextScale = clamp(baseScale * ratio, 0.08, 0.85);
        patchPhotoPosition(state, targetId, {
          ...photo.position,
          scale: nextScale
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
    const photo = state.photos.find(item => item.id === targetId);
    if (!photo) return;
    patchPhotoPosition(state, targetId, {
      ...photo.position,
      x: clamp(photo.position.x + dx, 0, 1),
      y: clamp(photo.position.y + dy, 0, 1)
    });
  });

  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);

    if (pointers.size === 0) {
      const latest = getState();
      const selectionTab = latest.activeTab === "position" || latest.activeTab === "perspective";
      if (!gestureActive && !activeWarpHandle && selectionTab) {
        if (pressPhotoId) {
          const toggle = latest.activeTab === "perspective"
            ? togglePhotoCheckedExclusive
            : togglePhotoChecked;
          let next = toggle(latest, pressPhotoId);
          next = bringPhotoToFront(next, pressPhotoId);
          hooks.setState(next, { fastPreview: false });
        } else {
          clearAllSelections(latest);
        }
      }

      if (gestureActive) {
        gestureActive = false;
        hooks.endGesture?.();
      }

      if (sessionHadPerspectiveEdit && latest.activeTab === "perspective") {
        hooks.onPerspectiveCanvasChange?.();
      }
      sessionHadPerspectiveEdit = false;

      lastDrag = null;
      lastPinchDistance = 0;
      startScales = new Map();
      pressPhotoId = null;
      manipulatePhotoId = null;
      activeWarpHandle = null;
      broughtPhotoToFront = false;
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
