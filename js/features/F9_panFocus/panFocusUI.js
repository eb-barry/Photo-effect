// F9 追焦 - UI v0.1.7
// 第一排：汽車／機車・自行車／調整項目；第二排僅在「調整項目」時顯示。

import {
  ADJUST_PARAMETERS,
  PRIMARY_MODES,
  resetPanFocusAdjustments,
  updatePanFocusState
} from "./panFocusState.js";

/**
 * @param {ParentNode} root
 * @param {object} state
 * @param {(reason?: string) => void|Promise<void>} render
 * @param {() => void} persistDraft
 * @param {{ onVehicleModeChange?: (mode: "car"|"rider") => void|Promise<void> }} [hooks]
 */
export function setupPanFocusUI(root, state, render, persistDraft = () => {}, hooks = {}){
  const primaryButtons = root.querySelectorAll("[data-pan-primary]");
  const adjustPanel = root.querySelector("#panFocusAdjustPanel");
  const paramSelect = root.querySelector("#adjustParamSelect");
  const slider = root.querySelector("#adjustSlider");
  const sliderLabel = root.querySelector("#adjustSliderLabel");
  const sliderValue = root.querySelector("#adjustSliderValue");
  const resetSettingsButton = root.querySelector("#resetPanFocusSettingsBtn");

  let renderTimer = null;
  const scheduleRender = (delay = 40) => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render("adjust"), delay);
  };

  function getCurrentConfig(){
    return ADJUST_PARAMETERS.find(item => item.id === state.selectedParameter) || ADJUST_PARAMETERS[0];
  }

  function refreshPrimaryButtons(){
    primaryButtons.forEach(button => {
      const id = button.dataset.panPrimary;
      const active = state.primaryMode === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshAdjustPanelVisibility(){
    const show = state.primaryMode === "adjust";
    adjustPanel?.classList.toggle("hidden", !show);
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
    refreshPrimaryButtons();
    refreshAdjustPanelVisibility();
    refreshParamSelect();
    refreshSlider();
  }

  primaryButtons.forEach(button => button.addEventListener("click", async event => {
    event.preventDefault();
    const id = button.dataset.panPrimary;
    if (!id) return;

    if (id === "adjust") {
      Object.assign(state, updatePanFocusState(state, { primaryMode: "adjust" }));
      refreshAllControls();
      persistDraft();
      return;
    }

    const previousVehicle = state.vehicleMode;
    Object.assign(state, updatePanFocusState(state, {
      primaryMode: id,
      vehicleMode: id
    }));
    refreshAllControls();
    persistDraft();

    if (typeof hooks.onVehicleModeChange === "function") {
      await hooks.onVehicleModeChange(id, previousVehicle);
    } else {
      await render("vehicle");
    }
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
    const heavy = config.id === "subjectThreshold"
      || config.id === "subjectExpand"
      || config.id === "edgeFeather";
    scheduleRender(heavy ? 90 : 36);
  });
  slider?.addEventListener("change", () => persistDraft());

  resetSettingsButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetPanFocusAdjustments(state));
    refreshAllControls();
    render("reset");
    persistDraft();
  });

  refreshAllControls();
  return { refreshAllControls };
}

export function renderPrimaryRow(){
  return `
    <div class="segment segment-cols-3 pan-focus-primary-row" role="group" aria-label="追焦模式">
      ${PRIMARY_MODES.map(mode => `
        <button
          type="button"
          data-pan-primary="${mode.id}"
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
    <div class="slider-row pan-focus-slider-row" id="adjustSliderRow">
      <div class="slider-head">
        <span id="adjustSliderLabel">向右拖影強度</span>
        <span id="adjustSliderValue">58%</span>
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
