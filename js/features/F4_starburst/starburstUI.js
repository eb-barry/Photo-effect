// F4 星芒鏡 - UI v0.1.3
// 三按鈕分頁（光圈葉片／光源／星芒效果）+ 下拉選單 + 單一滑桿 + 畫布點選/拖曳定位。

import {
  APERTURE_PARAMETERS,
  BLADE_COUNTS,
  EFFECT_PARAMETERS,
  LIGHT_SOURCES,
  STARBURST_CONTROL_TABS,
  getSpikeCount,
  resetStarburstAdjustments,
  resetStarburstPosition,
  updateStarburstState
} from "./starburstState.js";

export function setupStarburstUI(root, state, render, persistDraft = () => {}){
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const tabPanels = root.querySelector("#starburstTabPanels");
  const aperturePanel = root.querySelector("#aperturePanel");
  const lightPanel = root.querySelector("#lightPanel");
  const effectPanel = root.querySelector("#effectPanel");

  const bladeCountSelect = root.querySelector("#bladeCountSelect");
  const bladeSpikeHint = root.querySelector("#bladeSpikeHint");
  const apertureParamSelect = root.querySelector("#apertureParamSelect");
  const apertureSlider = root.querySelector("#apertureSlider");
  const apertureSliderLabel = root.querySelector("#apertureSliderLabel");
  const apertureSliderValue = root.querySelector("#apertureSliderValue");

  const lightSourceSelect = root.querySelector("#lightSourceSelect");
  const lightIntensitySlider = root.querySelector("#lightIntensitySlider");
  const lightIntensityValue = root.querySelector("#lightIntensityValue");

  const effectParamSelect = root.querySelector("#effectParamSelect");
  const effectSlider = root.querySelector("#effectSlider");
  const effectSliderLabel = root.querySelector("#effectSliderLabel");
  const effectSliderValue = root.querySelector("#effectSliderValue");

  const resetSettingsButton = root.querySelector("#resetStarburstSettingsBtn");
  const resetPositionButton = root.querySelector("#resetStarburstPositionBtn");
  const canvas = root.querySelector("#editorCanvas");

  let renderTimer = null;
  const scheduleRender = (delay = 16) => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), delay);
  };

  function refreshTabBar(){
    tabButtons.forEach(button => {
      const active = state.activeControlTab === button.dataset.controlTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshTabPanels(){
    const tab = state.activeControlTab;
    const expanded = Boolean(tab);
    tabPanels?.classList.toggle("hidden", !expanded);
    aperturePanel?.classList.toggle("hidden", tab !== "aperture");
    lightPanel?.classList.toggle("hidden", tab !== "light");
    effectPanel?.classList.toggle("hidden", tab !== "effect");
  }

  function refreshBladeSelect(){
    if (!bladeCountSelect) return;
    bladeCountSelect.innerHTML = BLADE_COUNTS
      .map(count => `<option value="${count}" ${count === state.bladeCount ? "selected" : ""}>${count} 片葉片</option>`)
      .join("");
    bladeCountSelect.classList.add("selected");
    if (bladeSpikeHint) {
      bladeSpikeHint.textContent = `目前 ${state.bladeCount} 片葉片 → ${getSpikeCount(state.bladeCount)} 道星芒`;
    }
  }

  function getApertureConfig(){
    return APERTURE_PARAMETERS.find(item => item.id === state.selectedApertureParameter) || APERTURE_PARAMETERS[0];
  }

  function refreshApertureSelect(){
    if (!apertureParamSelect) return;
    apertureParamSelect.innerHTML = APERTURE_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedApertureParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    apertureParamSelect.classList.add("selected");
  }

  function refreshApertureSlider(){
    const config = getApertureConfig();
    const value = Number(state[config.id]);
    apertureSlider.min = config.min;
    apertureSlider.max = config.max;
    apertureSlider.step = config.step;
    apertureSlider.value = value;
    apertureSliderLabel.textContent = config.label;
    apertureSliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshLightSelect(){
    if (!lightSourceSelect) return;
    lightSourceSelect.innerHTML = LIGHT_SOURCES
      .map(item => `<option value="${item.id}" ${item.id === state.lightSourceId ? "selected" : ""}>${item.label}</option>`)
      .join("");
    lightSourceSelect.classList.add("selected");
  }

  function refreshLightSlider(){
    lightIntensitySlider.value = state.lightIntensity;
    lightIntensityValue.textContent = `${Math.round(state.lightIntensity)}`;
  }

  const POSITION_IDS = new Set(["positionX", "positionY"]);

  function getEffectConfig(){
    return EFFECT_PARAMETERS.find(item => item.id === state.selectedEffectParameter) || EFFECT_PARAMETERS[0];
  }

  function refreshEffectSelect(){
    if (!effectParamSelect) return;
    effectParamSelect.innerHTML = EFFECT_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedEffectParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    effectParamSelect.classList.add("selected");
  }

  function refreshEffectSlider(){
    const config = getEffectConfig();
    const stateValue = POSITION_IDS.has(config.id)
      ? (config.id === "positionX" ? state.starburstX * 100 : state.starburstY * 100)
      : Number(state[config.id]);
    effectSlider.min = config.min;
    effectSlider.max = config.max;
    effectSlider.step = config.step;
    effectSlider.value = stateValue;
    effectSliderLabel.textContent = config.label;
    effectSliderValue.textContent = formatParameterValue(stateValue, config);
  }

  function refreshAllControls(){
    refreshTabBar();
    refreshTabPanels();
    refreshBladeSelect();
    refreshApertureSelect();
    refreshApertureSlider();
    refreshLightSelect();
    refreshLightSlider();
    refreshEffectSelect();
    refreshEffectSlider();
  }

  function toggleControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    Object.assign(state, updateStarburstState(state, { activeControlTab: nextTab }));
    refreshAllControls();
    persistDraft();
  }

  tabButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    toggleControlTab(button.dataset.controlTab);
  }));

  bladeCountSelect?.addEventListener("change", () => {
    Object.assign(state, updateStarburstState(state, { bladeCount: Number(bladeCountSelect.value) }));
    refreshBladeSelect();
    render();
    persistDraft();
  });

  apertureParamSelect?.addEventListener("change", () => {
    Object.assign(state, updateStarburstState(state, { selectedApertureParameter: apertureParamSelect.value }));
    refreshApertureSlider();
    persistDraft();
  });

  apertureSlider?.addEventListener("input", () => {
    const config = getApertureConfig();
    Object.assign(state, updateStarburstState(state, { [config.id]: Number(apertureSlider.value) }));
    apertureSliderValue.textContent = formatParameterValue(state[config.id], config);
    scheduleRender(90);
  });
  apertureSlider?.addEventListener("change", () => persistDraft());

  lightSourceSelect?.addEventListener("change", () => {
    Object.assign(state, updateStarburstState(state, { lightSourceId: lightSourceSelect.value }));
    render();
    persistDraft();
  });

  lightIntensitySlider?.addEventListener("input", () => {
    Object.assign(state, updateStarburstState(state, { lightIntensity: Number(lightIntensitySlider.value) }));
    lightIntensityValue.textContent = `${Math.round(state.lightIntensity)}`;
    scheduleRender(16);
  });
  lightIntensitySlider?.addEventListener("change", () => persistDraft());

  effectParamSelect?.addEventListener("change", () => {
    Object.assign(state, updateStarburstState(state, { selectedEffectParameter: effectParamSelect.value }));
    refreshEffectSlider();
    persistDraft();
  });

  effectSlider?.addEventListener("input", () => {
    const config = getEffectConfig();
    const numValue = Number(effectSlider.value);
    if (POSITION_IDS.has(config.id)) {
      // Pass ONLY positionX/Y — NOT starburstX/Y — so updateStarburstState routes to the
      // slider branch, keeps ghostRefX/Y frozen, and translates the ghost pattern rigidly.
      const partial = config.id === "positionX"
        ? { positionX: numValue, hasPlacedPoint: true }
        : { positionY: numValue, hasPlacedPoint: true };
      Object.assign(state, updateStarburstState(state, partial));
    } else {
      Object.assign(state, updateStarburstState(state, { [config.id]: numValue }));
    }
    effectSliderValue.textContent = formatParameterValue(numValue, config);
    scheduleRender(16);
  });
  effectSlider?.addEventListener("change", () => persistDraft());

  resetSettingsButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetStarburstAdjustments(state));
    refreshAllControls();
    render();
    persistDraft();
  });

  resetPositionButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetStarburstPosition(state));
    render();
    persistDraft();
  });

  if (canvas) {
    enableStarburstPointerGesture(canvas, state, partial => {
      Object.assign(state, updateStarburstState(state, partial));
      if (POSITION_IDS.has(state.selectedEffectParameter)) refreshEffectSlider();
      render();
    }, () => persistDraft());
  }

  if (!state.activeControlTab) {
    Object.assign(state, updateStarburstState(state, { activeControlTab: "aperture" }));
  }

  refreshAllControls();
  return { refreshAllControls };
}

export function renderControlTabs(){
  return STARBURST_CONTROL_TABS.map(tab => `
    <button
      type="button"
      class="crystal-tab-button"
      data-control-tab="${tab.id}"
      aria-pressed="false"
    >${tab.label}</button>
  `).join("");
}

export function renderAperturePanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="bladeCountSelect" class="selection-label">光圈葉片數</label>
      <select id="bladeCountSelect" class="select-control" aria-label="光圈葉片數"></select>
    </div>
    <p class="note" id="bladeSpikeHint"></p>
    <div class="selection-row crystal-adjust-row">
      <label for="apertureParamSelect" class="selection-label">調整項目</label>
      <select id="apertureParamSelect" class="select-control" aria-label="光圈調整項目"></select>
    </div>
    <div class="slider-row" id="apertureSliderRow">
      <div class="slider-head">
        <span id="apertureSliderLabel">光圈大小</span>
        <span id="apertureSliderValue">f/8.0</span>
      </div>
      <input id="apertureSlider" type="range" />
    </div>
  `;
}

export function renderLightPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="lightSourceSelect" class="selection-label">光源</label>
      <select id="lightSourceSelect" class="select-control" aria-label="光源"></select>
    </div>
    <div class="slider-row" id="lightIntensityRow">
      <div class="slider-head">
        <span>光源亮度</span>
        <span id="lightIntensityValue">72</span>
      </div>
      <input id="lightIntensitySlider" type="range" min="0" max="100" step="1" />
    </div>
  `;
}

export function renderEffectPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="effectParamSelect" class="selection-label">效果項目</label>
      <select id="effectParamSelect" class="select-control" aria-label="星芒效果項目"></select>
    </div>
    <div class="slider-row" id="effectSliderRow">
      <div class="slider-head">
        <span id="effectSliderLabel">眩光</span>
        <span id="effectSliderValue">46</span>
      </div>
      <input id="effectSlider" type="range" />
    </div>
  `;
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.unit === "fstop") return `f/${number.toFixed(1)}`;
  if (config.unit === "position") return `${number.toFixed(0)}%`;
  return `${Math.round(number)}`;
}

function enableStarburstPointerGesture(canvas, state, setPartialState, onGestureEnd){
  let active = false;

  canvas.style.touchAction = "none";
  canvas.style.cursor = "crosshair";

  const toNormalizedPoint = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: clamp01(x), y: clamp01(y) };
  };

  canvas.addEventListener("pointerdown", event => {
    if (!state.sourceImageDataUrl) return;
    event.preventDefault();
    const point = toNormalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    active = true;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = "grabbing";
    setPartialState({ starburstX: point.x, starburstY: point.y, hasPlacedPoint: true });
  });

  canvas.addEventListener("pointermove", event => {
    if (!active) return;
    event.preventDefault();
    const point = toNormalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    setPartialState({ starburstX: point.x, starburstY: point.y });
  });

  const endGesture = event => {
    if (!active) return;
    active = false;
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.style.cursor = "crosshair";
    onGestureEnd?.();
  };

  canvas.addEventListener("pointerup", endGesture);
  canvas.addEventListener("pointercancel", endGesture);
}

function clamp01(value){
  return Math.max(0.02, Math.min(0.98, value));
}
