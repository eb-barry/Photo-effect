// F2 水晶球 - UI v0.3.0
// 場景縮圖列 + 單一下拉選單 / 單一 slider + 球內拖曳 / 雙指縮放。

import {
  CRYSTAL_PARAMETERS,
  CRYSTAL_SCENES,
  resetPhotoPlacement,
  updateCrystalState
} from "./crystalState.js";
import { getCrystalLayout } from "./crystalTool.js";

export function setupCrystalUI(root, state, render){
  const sceneButtons = root.querySelectorAll("[data-scene]");
  const centerButton = root.querySelector("#centerPhotoBtn");
  const sliderTarget = root.querySelector("#sliderTarget");
  const slider = root.querySelector("#mainSlider");
  const sliderLabel = root.querySelector("#sliderLabel");
  const sliderValue = root.querySelector("#sliderValue");
  const canvas = root.querySelector("#editorCanvas");

  function refreshSceneButtons(){
    sceneButtons.forEach(button => {
      const active = button.dataset.scene === state.selectedSceneId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshSelectOptions(){
    if (!CRYSTAL_PARAMETERS.some(item => item.id === state.selectedParameter)) {
      state.selectedParameter = "photoScale";
    }
    sliderTarget.innerHTML = CRYSTAL_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    sliderTarget.classList.add("selected");
  }

  function getCurrentConfig(){
    return CRYSTAL_PARAMETERS.find(item => item.id === state.selectedParameter) || CRYSTAL_PARAMETERS[0];
  }

  function refreshSlider(){
    const config = getCurrentConfig();
    const value = Number(state[config.id] ?? config.min);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    sliderLabel.textContent = config.label;
    sliderValue.textContent = formatParameterValue(value, config);
  }

  sceneButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, updateCrystalState(state, { selectedSceneId: button.dataset.scene }));
    refreshSceneButtons();
    render();
  }));

  centerButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetPhotoPlacement(state));
    refreshSlider();
    render();
  });

  sliderTarget.addEventListener("change", () => {
    Object.assign(state, updateCrystalState(state, { selectedParameter: sliderTarget.value }));
    refreshSlider();
    render();
  });

  slider.addEventListener("input", () => {
    const config = getCurrentConfig();
    Object.assign(state, updateCrystalState(state, { [config.id]: Number(slider.value) }));
    sliderValue.textContent = formatParameterValue(state[config.id], config);
    render();
  });

  enablePhotoGesture(canvas, state, partial => {
    Object.assign(state, updateCrystalState(state, partial));
    refreshSlider();
    render();
  });

  refreshSceneButtons();
  refreshSelectOptions();
  refreshSlider();
}

export function renderSceneButtons(){
  return CRYSTAL_SCENES.map(scene => `
    <button type="button" class="crystal-seat-button" data-scene="${scene.id}" aria-label="${scene.label}" title="${scene.label}">
      <span class="crystal-seat-thumb"><img src="${scene.asset}" alt="" loading="lazy" /></span>
    </button>
  `).join("");
}

/** @deprecated 保留別名 */
export const renderSeatButtons = renderSceneButtons;

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  return `${Math.round(number)}${config.suffix || ""}`;
}

function enablePhotoGesture(canvas, state, setPartialState){
  const pointers = new Map();
  let lastDrag = null;
  let lastPinchDistance = 0;
  let startScale = 118;

  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  const insideSphere = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = pointX * scaleX;
    const y = pointY * scaleY;
    const layout = getCrystalLayout(canvas.width, canvas.height, state.selectedSceneId);
    return Math.hypot(x - layout.sphereX, y - layout.sphereY) <= layout.sphereRadius;
  };

  const getTwoPointerDistance = () => {
    const values = [...pointers.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  };

  canvas.addEventListener("pointerdown", event => {
    if (!state.sourceImageDataUrl || !insideSphere(event.clientX, event.clientY)) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.style.cursor = "grabbing";

    if (pointers.size === 1) {
      lastDrag = { x: event.clientX, y: event.clientY };
    } else if (pointers.size === 2) {
      lastPinchDistance = getTwoPointerDistance();
      startScale = Number(state.photoScale || 118);
      lastDrag = null;
    }
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const distance = getTwoPointerDistance();
      if (lastPinchDistance > 0 && distance > 0) {
        const nextScale = clamp(startScale * (distance / lastPinchDistance), 100, 220);
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

    setPartialState({
      photoOffsetX: clamp(Number(state.photoOffsetX || 0) + dx * 165, -100, 100),
      photoOffsetY: clamp(Number(state.photoOffsetY || 0) + dy * 165, -100, 100)
    });
  });

  const endPointer = event => {
    if (pointers.has(event.pointerId)) pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (pointers.size === 0) {
      lastDrag = null;
      lastPinchDistance = 0;
      canvas.style.cursor = "grab";
    } else if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      lastDrag = { x: remaining.x, y: remaining.y };
      lastPinchDistance = 0;
    }
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, Number(value)));
}
