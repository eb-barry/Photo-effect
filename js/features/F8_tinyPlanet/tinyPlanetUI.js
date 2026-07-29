// F8 小行星 - UI v0.5.0
// 第一排：小行星／隧道／調整項目；展開後為參數下拉 + 滑桿。

import {
  ADJUST_PARAMETERS,
  TINY_PLANET_CONTROL_TABS,
  resetTinyPlanetAdjustments,
  updateTinyPlanetState
} from "./tinyPlanetState.js";

export function setupTinyPlanetUI(root, state, render, persistDraft = () => {}){
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const adjustPanel = root.querySelector("#tinyPlanetAdjustPanel");

  const paramSelect = root.querySelector("#adjustParamSelect");
  const slider = root.querySelector("#adjustSlider");
  const sliderRow = root.querySelector("#adjustSliderRow");
  const sliderLabel = root.querySelector("#adjustSliderLabel");
  const sliderValue = root.querySelector("#adjustSliderValue");

  const resetSettingsButton = root.querySelector("#resetTinyPlanetSettingsBtn");

  let renderTimer = null;
  const scheduleRender = (delay = 16) => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), delay);
  };

  function getCurrentConfig(){
    return ADJUST_PARAMETERS.find(item => item.id === state.selectedParameter) || ADJUST_PARAMETERS[0];
  }

  function refreshTabBar(){
    tabButtons.forEach(button => {
      const active = state.activeControlTab === button.dataset.controlTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshAdjustPanel(){
    const expanded = state.activeControlTab === "adjust";
    adjustPanel?.classList.toggle("hidden", !expanded);
  }

  function refreshParamSelect(){
    if (!paramSelect || state.activeControlTab !== "adjust") return;
    paramSelect.innerHTML = ADJUST_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    paramSelect.classList.add("selected");
  }

  function refreshSlider(){
    if (!slider || state.activeControlTab !== "adjust") return;
    const config = getCurrentConfig();
    const value = Number(state[config.id]);
    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = value;
    if (sliderLabel) sliderLabel.textContent = config.label;
    if (sliderValue) sliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshTabBar();
    refreshAdjustPanel();
    refreshParamSelect();
    refreshSlider();
  }

  function selectControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    const partial = { activeControlTab: nextTab };
    if (tabId === "planet" || tabId === "tunnel") {
      // Selecting a mode tab always applies that projection, even when collapsing.
      partial.projectionMode = tabId;
    }
    Object.assign(state, updateTinyPlanetState(state, partial));
    refreshAllControls();
    if (tabId === "planet" || tabId === "tunnel") {
      render();
    }
    persistDraft();
  }

  tabButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    selectControlTab(button.dataset.controlTab);
  }));

  paramSelect?.addEventListener("change", () => {
    Object.assign(state, updateTinyPlanetState(state, {
      selectedParameter: paramSelect.value
    }));
    refreshSlider();
    persistDraft();
  });

  // Keep horizontal slider gestures from hijacking page scroll / sideways pan.
  const stopPagePan = event => {
    event.stopPropagation();
  };
  sliderRow?.addEventListener("touchstart", stopPagePan, { passive: true });
  sliderRow?.addEventListener("touchmove", stopPagePan, { passive: false });
  slider?.addEventListener("touchstart", stopPagePan, { passive: true });
  slider?.addEventListener("touchmove", event => {
    event.stopPropagation();
  }, { passive: true });

  slider?.addEventListener("input", () => {
    const config = getCurrentConfig();
    Object.assign(state, updateTinyPlanetState(state, { [config.id]: Number(slider.value) }));
    if (sliderValue) sliderValue.textContent = formatParameterValue(state[config.id], config);
    const fast = config.id === "rotation"
      || config.id === "seamHeight"
      || config.id === "zoom"
      || config.id === "swirlTwist"
      || config.id === "temperatureRing";
    scheduleRender(fast ? 16 : 48);
  });
  slider?.addEventListener("change", () => persistDraft());

  resetSettingsButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetTinyPlanetAdjustments(state));
    refreshAllControls();
    render();
    persistDraft();
  });

  if (!state.activeControlTab) {
    Object.assign(state, updateTinyPlanetState(state, { activeControlTab: "planet" }));
  }

  refreshAllControls();
  return { refreshAllControls };
}

export function renderControlTabs(){
  return TINY_PLANET_CONTROL_TABS.map(tab => `
    <button
      type="button"
      class="crystal-tab-button"
      data-control-tab="${tab.id}"
      aria-pressed="false"
    >${tab.label}</button>
  `).join("");
}

export function renderAdjustPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="adjustParamSelect" class="selection-label">調整項目</label>
      <select id="adjustParamSelect" class="select-control" aria-label="調整項目"></select>
    </div>
    <div class="slider-row tiny-planet-slider-row" id="adjustSliderRow">
      <div class="slider-head">
        <span id="adjustSliderLabel">旋轉角度</span>
        <span id="adjustSliderValue">0°</span>
      </div>
      <div class="tiny-planet-slider-track">
        <input id="adjustSlider" type="range" aria-label="參數滑桿" />
      </div>
    </div>
  `;
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.suffix === "°") return `${Math.round(number)}°`;
  if (config.suffix === "%") return `${Math.round(number)}%`;
  return `${Math.round(number)}${config.suffix || ""}`;
}
