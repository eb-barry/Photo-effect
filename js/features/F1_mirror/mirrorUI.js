export function setupMirrorUI(root, state, render){
  const modeButtons = root.querySelectorAll("[data-mode]");

  function refreshModeButtons(){
    modeButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
    });
  }

  modeButtons.forEach(button => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      refreshModeButtons();
      render();
    });
  });

  bindSlider(root, "axisSlider", "axisValue", state, "axis", "%", render);
  bindSlider(root, "blendSlider", "blendValue", state, "blend", "%", render);
  bindSlider(root, "rippleSlider", "rippleValue", state, "ripple", "", render);
  bindSlider(root, "densitySlider", "densityValue", state, "density", "", render);

  root.getElementById("resetBtn").addEventListener("click", () => {
    state.mode = "water";
    state.axis = 50;
    state.blend = 75;
    state.ripple = 18;
    state.density = 24;

    root.getElementById("axisSlider").value = state.axis;
    root.getElementById("blendSlider").value = state.blend;
    root.getElementById("rippleSlider").value = state.ripple;
    root.getElementById("densitySlider").value = state.density;

    root.getElementById("axisValue").textContent = `${state.axis}%`;
    root.getElementById("blendValue").textContent = `${state.blend}%`;
    root.getElementById("rippleValue").textContent = `${state.ripple}`;
    root.getElementById("densityValue").textContent = `${state.density}`;

    refreshModeButtons();
    render();
  });

  refreshModeButtons();
}

function bindSlider(root, inputId, valueId, state, key, suffix, render){
  const input = root.getElementById(inputId);
  const label = root.getElementById(valueId);

  label.textContent = `${state[key]}${suffix}`;

  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    label.textContent = `${state[key]}${suffix}`;
    render();
  });
}
