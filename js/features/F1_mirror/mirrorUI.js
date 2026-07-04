<<<<<<< HEAD
const SLIDER_CONFIG = {
  rightOffset: {
    label: "鏡像位置（可移動右邊圖）",
    min: -50,
    max: 50,
    step: 1,
    suffix: "%"
  },
  leftOffset: {
    label: "鏡像位置（可移動左邊圖）",
    min: -50,
    max: 50,
    step: 1,
    suffix: "%"
  },
  blend: {
    label: "融合程度",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%"
  },
  ripple: {
    label: "水波強度",
    min: 0,
    max: 60,
    step: 1,
    suffix: ""
  },
  density: {
    label: "水波密度",
    min: 4,
    max: 60,
    step: 1,
    suffix: ""
  }
};

export function setupMirrorUI(root, state, render){
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

  function refreshSlider(){
    const key = sliderTarget.value;
    const config = SLIDER_CONFIG[key];

    slider.min = config.min;
    slider.max = config.max;
    slider.step = config.step;
    slider.value = state[key];

    sliderLabel.textContent = config.label;
    sliderValue.textContent = `${state[key]}${config.suffix}`;
  }

  modeButtons.forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      state.mode = button.dataset.mode;
      refreshModeButtons();
      render(true);
    });
  });

  sliderTarget.addEventListener("change", () => {
    refreshSlider();
    render(true);
  });

  slider.addEventListener("input", () => {
    const key = sliderTarget.value;
    const config = SLIDER_CONFIG[key];

    state[key] = Number(slider.value);
    sliderValue.textContent = `${state[key]}${config.suffix}`;
    render(true);
  });

  refreshModeButtons();
  refreshSlider();
}
=======
const SLIDER_CONFIG={rightOffset:{label:"鏡像位置（可移動右邊圖）",min:-50,max:50,step:1,suffix:"%"},leftOffset:{label:"鏡像位置（可移動左邊圖）",min:-50,max:50,step:1,suffix:"%"},blend:{label:"融合程度",min:0,max:100,step:1,suffix:"%"},ripple:{label:"水波強度",min:0,max:60,step:1,suffix:""},density:{label:"水波密度",min:4,max:60,step:1,suffix:""}};export function setupMirrorUI(root,state,render){const modeButtons=root.querySelectorAll("[data-mode]");const sliderTarget=root.getElementById("sliderTarget");const slider=root.getElementById("mainSlider");const sliderLabel=root.getElementById("sliderLabel");const sliderValue=root.getElementById("sliderValue");function refreshModeButtons(){modeButtons.forEach(button=>{button.classList.toggle("active",button.dataset.mode===state.mode)})}function refreshSlider(){const key=sliderTarget.value;const config=SLIDER_CONFIG[key];slider.min=config.min;slider.max=config.max;slider.step=config.step;slider.value=state[key];sliderLabel.textContent=config.label;sliderValue.textContent=`${state[key]}${config.suffix}`}modeButtons.forEach(button=>{button.addEventListener("click",()=>{state.mode=button.dataset.mode;refreshModeButtons();render(true)})});sliderTarget.addEventListener("change",refreshSlider);slider.addEventListener("input",()=>{const key=sliderTarget.value;const config=SLIDER_CONFIG[key];state[key]=Number(slider.value);sliderValue.textContent=`${state[key]}${config.suffix}`;render(true)});refreshModeButtons();refreshSlider()}
>>>>>>> 16b9092c9433c51a2c6d4dcf530f67adc546a2f4
