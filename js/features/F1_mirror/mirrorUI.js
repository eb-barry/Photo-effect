const BASE_ITEMS = [
  { key:"rightOffset", label:"移動右(下)圖", min:-50, max:50, step:1, suffix:"%" },
  { key:"leftOffset", label:"移動左(上)圖", min:-50, max:50, step:1, suffix:"%" },
  { key:"opacity", label:"不透明度", min:0, max:100, step:1, suffix:"%" }
];
const WATER_ITEMS = [
  { key:"ripple", label:"水波強度", min:0, max:60, step:1, suffix:"" },
  { key:"density", label:"水波密度", min:4, max:60, step:1, suffix:"" }
];
function getItemsForMode(mode){ return mode === "water" ? [...BASE_ITEMS, ...WATER_ITEMS] : BASE_ITEMS; }
export function setupMirrorUI(root, state, render){
  const modeButtons = root.querySelectorAll("[data-mode]");
  const sliderTarget = root.querySelector("#sliderTarget");
  const slider = root.querySelector("#mainSlider");
  const sliderLabel = root.querySelector("#sliderLabel");
  const sliderValue = root.querySelector("#sliderValue");
  function refreshModeButtons(){ modeButtons.forEach(button => { const isActive = button.dataset.mode === state.mode; button.classList.toggle("active", isActive); button.setAttribute("aria-pressed", String(isActive)); }); }
  function refreshSelectOptions(){ const items = getItemsForMode(state.mode); if (!items.some(item => item.key === state.sliderTarget)) state.sliderTarget = "rightOffset"; sliderTarget.innerHTML = items.map(item => `<option value="${item.key}" ${item.key === state.sliderTarget ? "selected" : ""}>${item.label}</option>`).join(""); sliderTarget.classList.add("selected"); }
  function getCurrentConfig(){ return getItemsForMode(state.mode).find(item => item.key === state.sliderTarget) || BASE_ITEMS[0]; }
  function refreshSlider(){ const config = getCurrentConfig(); slider.min = config.min; slider.max = config.max; slider.step = config.step; slider.value = state[config.key]; sliderLabel.textContent = config.label; sliderValue.textContent = `${state[config.key]}${config.suffix}`; }
  modeButtons.forEach(button => button.addEventListener("click", event => { event.preventDefault(); state.mode = button.dataset.mode; refreshModeButtons(); refreshSelectOptions(); refreshSlider(); render(true); }));
  sliderTarget.addEventListener("change", () => { state.sliderTarget = sliderTarget.value; sliderTarget.classList.add("selected"); refreshSlider(); render(true); });
  slider.addEventListener("input", () => { const config = getCurrentConfig(); state[config.key] = Number(slider.value); sliderValue.textContent = `${state[config.key]}${config.suffix}`; render(true); });
  refreshModeButtons(); refreshSelectOptions(); refreshSlider();
  return {
    refreshAllControls(){
      refreshModeButtons();
      refreshSelectOptions();
      refreshSlider();
    }
  };
}
