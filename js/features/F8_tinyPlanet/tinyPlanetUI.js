// F8 小行星 - UI v0.5.2
// 第一排：小行星／隧道；第二排：調整項目下拉 + 滑桿。

import {
  ADJUST_PARAMETERS,
  PROJECTION_MODES,
  resetTinyPlanetAdjustments,
  updateTinyPlanetState
} from "./tinyPlanetState.js";

export function setupTinyPlanetUI(root, state, render, persistDraft = () => {}){
  const modeButtons = root.querySelectorAll("[data-projection-mode]");
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

  function getCurrentConfig(){
    return ADJUST_PARAMETERS.find(item => item.id === state.selectedParameter) || ADJUST_PARAMETERS[0];
  }

  function refreshModeButtons(){
    modeButtons.forEach(button => {
      const active = state.projectionMode === button.dataset.projectionMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshParamSelect(){
    if (!paramSelect) return;
    paramSelect.innerHTML = ADJUST_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    paramSelect.classList.add("selected");
  }

  function refreshSlider(){
    if (!slider) return;
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
    refreshParamSelect();
    refreshSlider();
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

  paramSelect?.addEventListener("change", () => {
    Object.assign(state, updateTinyPlanetState(state, {
      selectedParameter: paramSelect.value
    }));
    refreshSlider();
    persistDraft();
  });

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
      <input id="adjustSlider" type="range" aria-label="參數滑桿" />
    </div>
  `;
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.suffix === "°") return `${Math.round(number)}°`;
  if (config.suffix === "%") return `${Math.round(number)}%`;
  return `${Math.round(number)}${config.suffix || ""}`;
}
