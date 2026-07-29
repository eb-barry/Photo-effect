// F8 小行星 - UI v0.3.0
// 第一排：小行星／隧道；第二排：畫面變形／氛圍光影／魚眼畸變；第三排調整項目；第四排滑桿。

import {
  ATMOSPHERE_PARAMETERS,
  FISHEYE_PARAMETERS,
  PROJECTION_MODES,
  TINY_PLANET_CONTROL_TABS,
  WARP_PARAMETERS,
  resetTinyPlanetAdjustments,
  updateTinyPlanetState
} from "./tinyPlanetState.js";

export function setupTinyPlanetUI(root, state, render, persistDraft = () => {}){
  const modeButtons = root.querySelectorAll("[data-projection-mode]");
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const adjustPanel = root.querySelector("#tinyPlanetAdjustPanel");

  const paramSelect = root.querySelector("#adjustParamSelect");
  const slider = root.querySelector("#adjustSlider");
  const sliderLabel = root.querySelector("#adjustSliderLabel");
  const sliderValue = root.querySelector("#adjustSliderValue");

  const resetSettingsButton = root.querySelector("#resetTinyPlanetSettingsBtn");

  let renderTimer = null;
  const scheduleRender = (delay = 16) => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), delay);
  };

  function getActiveParameters(){
    if (state.activeControlTab === "atmosphere") return ATMOSPHERE_PARAMETERS;
    if (state.activeControlTab === "fisheye") return FISHEYE_PARAMETERS;
    return WARP_PARAMETERS;
  }

  function getSelectedParameterId(){
    if (state.activeControlTab === "atmosphere") return state.selectedAtmosphereParameter;
    if (state.activeControlTab === "fisheye") return state.selectedFisheyeParameter;
    return state.selectedWarpParameter;
  }

  function getCurrentConfig(){
    const list = getActiveParameters();
    const id = getSelectedParameterId();
    return list.find(item => item.id === id) || list[0];
  }

  function refreshModeButtons(){
    modeButtons.forEach(button => {
      const active = state.projectionMode === button.dataset.projectionMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshTabBar(){
    tabButtons.forEach(button => {
      const active = state.activeControlTab === button.dataset.controlTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshAdjustPanel(){
    const expanded = Boolean(state.activeControlTab);
    adjustPanel?.classList.toggle("hidden", !expanded);
  }

  function refreshParamSelect(){
    if (!paramSelect || !state.activeControlTab) return;
    const list = getActiveParameters();
    const selected = getSelectedParameterId();
    paramSelect.innerHTML = list
      .map(item => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${item.label}</option>`)
      .join("");
    paramSelect.classList.add("selected");
  }

  function refreshSlider(){
    if (!slider || !state.activeControlTab) return;
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
    refreshModeButtons();
    refreshTabBar();
    refreshAdjustPanel();
    refreshParamSelect();
    refreshSlider();
  }

  function toggleControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    Object.assign(state, updateTinyPlanetState(state, { activeControlTab: nextTab }));
    refreshAllControls();
    persistDraft();
  }

  modeButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, updateTinyPlanetState(state, {
      projectionMode: button.dataset.projectionMode
    }));
    refreshModeButtons();
    render();
    persistDraft();
  }));

  tabButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    toggleControlTab(button.dataset.controlTab);
  }));

  paramSelect?.addEventListener("change", () => {
    if (state.activeControlTab === "atmosphere") {
      Object.assign(state, updateTinyPlanetState(state, {
        selectedAtmosphereParameter: paramSelect.value
      }));
    } else if (state.activeControlTab === "fisheye") {
      Object.assign(state, updateTinyPlanetState(state, {
        selectedFisheyeParameter: paramSelect.value
      }));
    } else {
      Object.assign(state, updateTinyPlanetState(state, {
        selectedWarpParameter: paramSelect.value
      }));
    }
    refreshSlider();
    persistDraft();
  });

  slider?.addEventListener("input", () => {
    const config = getCurrentConfig();
    Object.assign(state, updateTinyPlanetState(state, { [config.id]: Number(slider.value) }));
    if (sliderValue) sliderValue.textContent = formatParameterValue(state[config.id], config);
    const fast = config.id === "rotation" || config.id === "seamHeight" || config.id === "fisheyeFocalLength";
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
    Object.assign(state, updateTinyPlanetState(state, { activeControlTab: "warp" }));
  }

  refreshAllControls();
  return { refreshAllControls };
}

export function renderModeRow(){
  return `
    <div class="segment segment-cols-2 tiny-planet-mode-row" role="group" aria-label="小行星模式">
      ${PROJECTION_MODES.map(mode => `
        <button
          type="button"
          data-projection-mode="${mode.id}"
          aria-pressed="false"
        >${mode.label}</button>
      `).join("")}
    </div>
  `;
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
    <div class="slider-row" id="adjustSliderRow">
      <div class="slider-head">
        <span id="adjustSliderLabel">旋轉角度</span>
        <span id="adjustSliderValue">0°</span>
      </div>
      <input id="adjustSlider" type="range" />
    </div>
  `;
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.suffix === "°") return `${Math.round(number)}°`;
  if (config.suffix === "%") return `${Math.round(number)}%`;
  if (config.suffix === "mm") return `${Math.round(number)}mm`;
  return `${Math.round(number)}${config.suffix || ""}`;
}
