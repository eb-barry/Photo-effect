// F9 追焦 - UI v0.1.2
// 第一排：自動／向左／向右；第二排：調整項目下拉 + 滑桿。

import {
  ADJUST_PARAMETERS,
  PAN_DIRECTIONS,
  resetPanFocusAdjustments,
  updatePanFocusState
} from "./panFocusState.js";

export function setupPanFocusUI(root, state, render, persistDraft = () => {}){
  const directionButtons = root.querySelectorAll("[data-pan-direction]");
  const paramSelect = root.querySelector("#adjustParamSelect");
  const slider = root.querySelector("#adjustSlider");
  const sliderLabel = root.querySelector("#adjustSliderLabel");
  const sliderValue = root.querySelector("#adjustSliderValue");
  const resetSettingsButton = root.querySelector("#resetPanFocusSettingsBtn");

  let renderTimer = null;
  const scheduleRender = (delay = 40) => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(), delay);
  };

  function getCurrentConfig(){
    return ADJUST_PARAMETERS.find(item => item.id === state.selectedParameter) || ADJUST_PARAMETERS[0];
  }

  function refreshDirectionButtons(){
    directionButtons.forEach(button => {
      const active = state.panDirection === button.dataset.panDirection;
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
    refreshDirectionButtons();
    refreshParamSelect();
    refreshSlider();
  }

  directionButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, updatePanFocusState(state, {
      panDirection: button.dataset.panDirection
    }));
    refreshDirectionButtons();
    render();
    persistDraft();
  }));

  paramSelect?.addEventListener("change", () => {
    Object.assign(state, updatePanFocusState(state, {
      selectedParameter: paramSelect.value
    }));
    refreshSlider();
    persistDraft();
  });

  slider?.addEventListener("input", () => {
    const config = getCurrentConfig();
    Object.assign(state, updatePanFocusState(state, { [config.id]: Number(slider.value) }));
    if (sliderValue) sliderValue.textContent = formatParameterValue(state[config.id], config);
    const heavy = config.id === "subjectThreshold" || config.id === "subjectExpand" || config.id === "edgeFeather";
    scheduleRender(heavy ? 90 : 36);
  });
  slider?.addEventListener("change", () => persistDraft());

  resetSettingsButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetPanFocusAdjustments(state));
    refreshAllControls();
    render();
    persistDraft();
  });

  refreshAllControls();
  return { refreshAllControls };
}

export function renderDirectionRow(){
  return `
    <div class="segment segment-cols-3 pan-focus-direction-row" role="group" aria-label="追焦方向">
      ${PAN_DIRECTIONS.map(direction => `
        <button
          type="button"
          data-pan-direction="${direction.id}"
          aria-pressed="false"
        >${direction.label}</button>
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
    <div class="slider-row pan-focus-slider-row" id="adjustSliderRow">
      <div class="slider-head">
        <span id="adjustSliderLabel">拖影強度</span>
        <span id="adjustSliderValue">62%</span>
      </div>
      <input id="adjustSlider" type="range" aria-label="參數滑桿" />
    </div>
  `;
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.suffix === "px") return `${Math.round(number)}px`;
  if (config.suffix === "%") return `${Math.round(number)}%`;
  return `${Math.round(number)}${config.suffix || ""}`;
}
