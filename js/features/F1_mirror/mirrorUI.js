const BASE_ITEMS = [
  { key: "rightOffset", label: "移動右(下)圖", min: -50, max: 50, step: 1, suffix: "%" },
  { key: "leftOffset", label: "移動左(上)圖", min: -50, max: 50, step: 1, suffix: "%" },
  { key: "opacity", label: "不透明度", min: 0, max: 100, step: 1, suffix: "%" }
];
const WATER_ITEMS = [
  { key: "ripple", label: "水波強度", min: 0, max: 60, step: 1, suffix: "" },
  { key: "density", label: "水波密度", min: 4, max: 60, step: 1, suffix: "" }
];
const PAN_MODES = new Set(["horizontal", "vertical"]);
const PAN_SENSITIVITY = 100;

function getItemsForMode(mode){
  return mode === "water" ? [...BASE_ITEMS, ...WATER_ITEMS] : BASE_ITEMS;
}

export function setupMirrorUI(root, state, render, gestureOptions = {}){
  const modeButtons = root.querySelectorAll("[data-mode]");
  const sliderTarget = root.querySelector("#sliderTarget");
  const slider = root.querySelector("#mainSlider");
  const sliderLabel = root.querySelector("#sliderLabel");
  const sliderValue = root.querySelector("#sliderValue");

  function refreshModeButtons(){
    modeButtons.forEach(button => {
      const isActive = button.dataset.mode === state.mode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function refreshSelectOptions(){
    const items = getItemsForMode(state.mode);
    if (!items.some(item => item.key === state.sliderTarget)) {
      state.sliderTarget = "rightOffset";
    }
    sliderTarget.innerHTML = items.map(item => `
      <option value="${item.key}" ${item.key === state.sliderTarget ? "selected" : ""}>${item.label}</option>
    `).join("");
    sliderTarget.classList.add("selected");
  }

  function getCurrentConfig(){
    return getItemsForMode(state.mode).find(item => item.key === state.sliderTarget) || BASE_ITEMS[0];
  }

  function refreshSlider(){
    const config = getCurrentConfig();
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = state[config.key];
    sliderLabel.textContent = config.label;
    sliderValue.textContent = `${state[config.key]}${config.suffix}`;
  }

  modeButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    state.mode = button.dataset.mode;
    refreshModeButtons();
    refreshSelectOptions();
    refreshSlider();
    if (gestureOptions.canvas) {
      gestureOptions.canvas.style.cursor = PAN_MODES.has(state.mode) ? "grab" : "";
    }
    render(true);
  }));

  sliderTarget.addEventListener("change", () => {
    state.sliderTarget = sliderTarget.value;
    sliderTarget.classList.add("selected");
    refreshSlider();
    render(true);
  });

  slider.addEventListener("input", () => {
    const config = getCurrentConfig();
    state[config.key] = Number(slider.value);
    sliderValue.textContent = `${state[config.key]}${config.suffix}`;
    render(true);
  });

  refreshModeButtons();
  refreshSelectOptions();
  refreshSlider();

  if (gestureOptions.canvas) {
    enableMirrorPanGesture(gestureOptions.canvas, state, {
      onRender: gestureOptions.onGestureRender || render,
      onPanEnd: gestureOptions.onPanEnd,
      refreshSlider
    });
  }

  return {
    refreshAllControls(){
      refreshModeButtons();
      refreshSelectOptions();
      refreshSlider();
    }
  };
}

function enableMirrorPanGesture(canvas, state, { onRender, onPanEnd, refreshSlider }){
  const pointers = new Map();
  let lastDrag = null;
  let activeOffsetKey = null;

  canvas.style.touchAction = "none";

  const updateCursor = () => {
    if (!PAN_MODES.has(state.mode)) {
      canvas.style.cursor = "";
      return;
    }
    canvas.style.cursor = pointers.size ? "grabbing" : "grab";
  };

  const resolveOffsetKey = (clientX, clientY) => {
    if (!state.source || !PAN_MODES.has(state.mode)) return null;

    const point = canvasPointFromClient(canvas, clientX, clientY);
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return null;

    if (state.mode === "horizontal") {
      return point.x < width / 2 ? "leftOffset" : "rightOffset";
    }

    return point.y < height / 2 ? "leftOffset" : "rightOffset";
  };

  canvas.addEventListener("pointerdown", event => {
    if (!state.source || !PAN_MODES.has(state.mode)) return;

    activeOffsetKey = resolveOffsetKey(event.clientX, event.clientY);
    if (!activeOffsetKey) return;

    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastDrag = { x: event.clientX, y: event.clientY };
    state.sliderTarget = activeOffsetKey;
    refreshSlider();
    updateCursor();
  });

  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId) || !activeOffsetKey) return;
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

    const delta = state.mode === "horizontal" ? dx : dy;
    state[activeOffsetKey] = clamp(
      Number(state[activeOffsetKey] || 0) + delta * PAN_SENSITIVITY,
      -50,
      50
    );
    refreshSlider();
    onRender(true);
  });

  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;

    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);

    if (pointers.size === 0) {
      const shouldPersist = Boolean(lastDrag);
      lastDrag = null;
      activeOffsetKey = null;
      updateCursor();
      if (shouldPersist) onPanEnd?.();
      return;
    }

    const remaining = [...pointers.values()][0];
    lastDrag = { x: remaining.x, y: remaining.y };
    updateCursor();
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  updateCursor();
}

function canvasPointFromClient(canvas, clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}
