const MIRROR_STATE_KEY = "photoEffectsMirrorState";
export function loadMirrorState(){
  try {
    const saved = JSON.parse(localStorage.getItem(MIRROR_STATE_KEY) || "{}");
    return { mode: saved.mode === "reflection" ? "water" : (saved.mode || "water"), leftOffset: Number(saved.leftOffset ?? 0), rightOffset: Number(saved.rightOffset ?? 0), opacity: Number(saved.opacity ?? saved.blend ?? 75), ripple: Number(saved.ripple ?? 18), density: Number(saved.density ?? 24), sliderTarget: saved.sliderTarget || "rightOffset" };
  } catch { return { mode:"water", leftOffset:0, rightOffset:0, opacity:75, ripple:18, density:24, sliderTarget:"rightOffset" }; }
}
export function saveMirrorState(state){ localStorage.setItem(MIRROR_STATE_KEY, JSON.stringify({ mode:state.mode, leftOffset:state.leftOffset, rightOffset:state.rightOffset, opacity:state.opacity, ripple:state.ripple, density:state.density, sliderTarget:state.sliderTarget })); }
