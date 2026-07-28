// F8 小行星 - UI v0.1.0
// 三按鈕分頁（投影模式／畫面變形／氛圍光影）+ 下拉選單 + 單一滑桿。

import {
  ATMOSPHERE_PARAMETERS,
  PROJECTION_MODES,
  TINY_PLANET_CONTROL_TABS,
  WARP_PARAMETERS,
  resetTinyPlanetAdjustments,
  updateTinyPlanetState
} from "./tinyPlanetState.js";

export function setupTinyPlanetUI(root, state, render, persistDraft = () => {}){
  const tabButtons = root.querySelectorAll("[data-control-tab]");
  const tabPanels = root.querySelector("#tinyPlanetTabPanels");
  const modePanel = root.querySelector("#modePanel");
  const warpPanel = root.querySelector("#warpPanel");
  const atmospherePanel = root.querySelector("#atmospherePanel");

  const modeButtons = root.querySelectorAll("[data-projection-mode]");
  const warpParamSelect = root.querySelector("#warpParamSelect");
  const warpSlider = root.querySelector("#warpSlider");
  const warpSliderLabel = root.querySelector("#warpSliderLabel");
  const warpSliderValue = root.querySelector("#warpSliderValue");

  const atmosphereParamSelect = root.querySelector("#atmosphereParamSelect");
  const atmosphereSlider = root.querySelector("#atmosphereSlider");
  const atmosphereSliderLabel = root.querySelector("#atmosphereSliderLabel");
  const atmosphereSliderValue = root.querySelector("#atmosphereSliderValue");

  const resetSettingsButton = root.querySelector("#resetTinyPlanetSettingsBtn");

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
    modePanel?.classList.toggle("hidden", tab !== "mode");
    warpPanel?.classList.toggle("hidden", tab !== "warp");
    atmospherePanel?.classList.toggle("hidden", tab !== "atmosphere");
  }

  function refreshModeButtons(){
    modeButtons.forEach(button => {
      const active = state.projectionMode === button.dataset.projectionMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function getWarpConfig(){
    return WARP_PARAMETERS.find(item => item.id === state.selectedWarpParameter) || WARP_PARAMETERS[0];
  }

  function refreshWarpSelect(){
    if (!warpParamSelect) return;
    warpParamSelect.innerHTML = WARP_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedWarpParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    warpParamSelect.classList.add("selected");
  }

  function refreshWarpSlider(){
    const config = getWarpConfig();
    const value = Number(state[config.id]);
    warpSlider.min = config.min;
    warpSlider.max = config.max;
    warpSlider.step = config.step;
    warpSlider.value = value;
    warpSliderLabel.textContent = config.label;
    warpSliderValue.textContent = formatParameterValue(value, config);
  }

  function getAtmosphereConfig(){
    return ATMOSPHERE_PARAMETERS.find(item => item.id === state.selectedAtmosphereParameter) || ATMOSPHERE_PARAMETERS[0];
  }

  function refreshAtmosphereSelect(){
    if (!atmosphereParamSelect) return;
    atmosphereParamSelect.innerHTML = ATMOSPHERE_PARAMETERS
      .map(item => `<option value="${item.id}" ${item.id === state.selectedAtmosphereParameter ? "selected" : ""}>${item.label}</option>`)
      .join("");
    atmosphereParamSelect.classList.add("selected");
  }

  function refreshAtmosphereSlider(){
    const config = getAtmosphereConfig();
    const value = Number(state[config.id]);
    atmosphereSlider.min = config.min;
    atmosphereSlider.max = config.max;
    atmosphereSlider.step = config.step;
    atmosphereSlider.value = value;
    atmosphereSliderLabel.textContent = config.label;
    atmosphereSliderValue.textContent = formatParameterValue(value, config);
  }

  function refreshAllControls(){
    refreshTabBar();
    refreshTabPanels();
    refreshModeButtons();
    refreshWarpSelect();
    refreshWarpSlider();
    refreshAtmosphereSelect();
    refreshAtmosphereSlider();
  }

  function toggleControlTab(tabId){
    const nextTab = state.activeControlTab === tabId ? null : tabId;
    Object.assign(state, updateTinyPlanetState(state, { activeControlTab: nextTab }));
    refreshAllControls();
    persistDraft();
  }

  tabButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    toggleControlTab(button.dataset.controlTab);
  }));

  modeButtons.forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, updateTinyPlanetState(state, {
      projectionMode: button.dataset.projectionMode
    }));
    refreshModeButtons();
    render();
    persistDraft();
  }));

  warpParamSelect?.addEventListener("change", () => {
    Object.assign(state, updateTinyPlanetState(state, {
      selectedWarpParameter: warpParamSelect.value
    }));
    refreshWarpSlider();
    persistDraft();
  });

  warpSlider?.addEventListener("input", () => {
    const config = getWarpConfig();
    Object.assign(state, updateTinyPlanetState(state, { [config.id]: Number(warpSlider.value) }));
    warpSliderValue.textContent = formatParameterValue(state[config.id], config);
    scheduleRender(config.id === "rotation" ? 16 : 48);
  });
  warpSlider?.addEventListener("change", () => persistDraft());

  atmosphereParamSelect?.addEventListener("change", () => {
    Object.assign(state, updateTinyPlanetState(state, {
      selectedAtmosphereParameter: atmosphereParamSelect.value
    }));
    refreshAtmosphereSlider();
    persistDraft();
  });

  atmosphereSlider?.addEventListener("input", () => {
    const config = getAtmosphereConfig();
    Object.assign(state, updateTinyPlanetState(state, { [config.id]: Number(atmosphereSlider.value) }));
    atmosphereSliderValue.textContent = formatParameterValue(state[config.id], config);
    scheduleRender(48);
  });
  atmosphereSlider?.addEventListener("change", () => persistDraft());

  resetSettingsButton?.addEventListener("click", event => {
    event.preventDefault();
    Object.assign(state, resetTinyPlanetAdjustments(state));
    refreshAllControls();
    render();
    persistDraft();
  });

  if (!state.activeControlTab) {
    Object.assign(state, updateTinyPlanetState(state, { activeControlTab: "mode" }));
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

export function renderModePanel(){
  return `
    <div class="segment segment-cols-2 tiny-planet-mode-row" role="group" aria-label="投影模式">
      ${PROJECTION_MODES.map(mode => `
        <button
          type="button"
          data-projection-mode="${mode.id}"
          aria-pressed="false"
        >${mode.label}</button>
      `).join("")}
    </div>
    <p class="note" id="tinyPlanetModeHint">小行星：地面收斂球心；隧道：天空收進中心</p>
  `;
}

export function renderWarpPanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="warpParamSelect" class="selection-label">調整項目</label>
      <select id="warpParamSelect" class="select-control" aria-label="畫面變形調整項目"></select>
    </div>
    <div class="slider-row" id="warpSliderRow">
      <div class="slider-head">
        <span id="warpSliderLabel">旋轉角度</span>
        <span id="warpSliderValue">0°</span>
      </div>
      <input id="warpSlider" type="range" />
    </div>
  `;
}

export function renderAtmospherePanel(){
  return `
    <div class="selection-row crystal-adjust-row">
      <label for="atmosphereParamSelect" class="selection-label">調整項目</label>
      <select id="atmosphereParamSelect" class="select-control" aria-label="氛圍光影調整項目"></select>
    </div>
    <div class="slider-row" id="atmosphereSliderRow">
      <div class="slider-head">
        <span id="atmosphereSliderLabel">邊緣暈影</span>
        <span id="atmosphereSliderValue">42%</span>
      </div>
      <input id="atmosphereSlider" type="range" />
    </div>
  `;
}

function formatParameterValue(value, config){
  const number = Number(value ?? 0);
  if (config.suffix === "°") return `${Math.round(number)}°`;
  if (config.suffix === "%") return `${Math.round(number)}%`;
  return `${Math.round(number)}${config.suffix || ""}`;
}
