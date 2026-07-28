// F8 小行星 - 狀態管理 v0.1.0
// 子功能：投影模式／畫面變形／氛圍光影

export const TINY_PLANET_FEATURE_ID = "F8_tinyPlanet";
export const TINY_PLANET_FEATURE_VERSION = "0.1.0";
export const TINY_PLANET_DRAFT_KEY = "photoEffects.F8_tinyPlanet.draft.v1";

export const TINY_PLANET_CONTROL_TABS = [
  { id: "mode", label: "投影模式" },
  { id: "warp", label: "畫面變形" },
  { id: "atmosphere", label: "氛圍光影" }
];

export const PROJECTION_MODES = [
  { id: "planet", label: "小行星" },
  { id: "tunnel", label: "隧道" }
];

/** 畫面變形參數：旋轉、彎曲、地平線、縮放 */
export const WARP_PARAMETERS = [
  { id: "rotation", label: "旋轉角度", min: 0, max: 360, step: 1, suffix: "°" },
  { id: "bendStrength", label: "彎曲強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "equatorOffset", label: "地平線位置", min: -50, max: 50, step: 1, suffix: "%" },
  { id: "zoom", label: "行星縮放", min: 60, max: 160, step: 1, suffix: "%" }
];

/** 氛圍光影參數：暈影、大氣 */
export const ATMOSPHERE_PARAMETERS = [
  { id: "vignette", label: "邊緣暈影", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "atmosphere", label: "大氣散射", min: 0, max: 100, step: 1, suffix: "%" }
];

export function normalizeProjectionMode(mode){
  return PROJECTION_MODES.some(item => item.id === mode) ? mode : "planet";
}

export function normalizeActiveControlTab(tab){
  if (tab === null || tab === "none" || tab === "") return null;
  if (TINY_PLANET_CONTROL_TABS.some(item => item.id === tab)) return tab;
  return "mode";
}

export function createDefaultTinyPlanetState(){
  return {
    featureId: TINY_PLANET_FEATURE_ID,
    featureVersion: TINY_PLANET_FEATURE_VERSION,
    activeControlTab: "mode",
    sourceImageDataUrl: null,

    projectionMode: "planet",

    selectedWarpParameter: "rotation",
    rotation: 0,
    bendStrength: 55,
    equatorOffset: 0,
    zoom: 100,

    selectedAtmosphereParameter: "vignette",
    vignette: 42,
    atmosphere: 28,

    updatedAt: Date.now()
  };
}

export function resetTinyPlanetAdjustments(currentState){
  const defaults = createDefaultTinyPlanetState();
  return updateTinyPlanetState(currentState, {
    activeControlTab: defaults.activeControlTab,
    projectionMode: defaults.projectionMode,
    selectedWarpParameter: defaults.selectedWarpParameter,
    rotation: defaults.rotation,
    bendStrength: defaults.bendStrength,
    equatorOffset: defaults.equatorOffset,
    zoom: defaults.zoom,
    selectedAtmosphereParameter: defaults.selectedAtmosphereParameter,
    vignette: defaults.vignette,
    atmosphere: defaults.atmosphere
  });
}

export function updateTinyPlanetState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeControlTab = normalizeActiveControlTab(next.activeControlTab);
  next.projectionMode = normalizeProjectionMode(next.projectionMode);

  next.selectedWarpParameter = WARP_PARAMETERS.some(item => item.id === next.selectedWarpParameter)
    ? next.selectedWarpParameter
    : "rotation";
  next.selectedAtmosphereParameter = ATMOSPHERE_PARAMETERS.some(item => item.id === next.selectedAtmosphereParameter)
    ? next.selectedAtmosphereParameter
    : "vignette";

  for (const parameter of WARP_PARAMETERS) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }
  for (const parameter of ATMOSPHERE_PARAMETERS) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }

  return next;
}

export function saveTinyPlanetDraft(state){
  try {
    const saved = {
      ...state,
      sourceImageDataUrl: null,
      featureId: TINY_PLANET_FEATURE_ID,
      featureVersion: TINY_PLANET_FEATURE_VERSION,
      updatedAt: Date.now()
    };
    localStorage.setItem(TINY_PLANET_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F8 小行星] 無法儲存草稿：", error);
  }
}

export function loadTinyPlanetDraft(){
  try {
    const raw = localStorage.getItem(TINY_PLANET_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== TINY_PLANET_FEATURE_ID) return null;
    return updateTinyPlanetState(createDefaultTinyPlanetState(), parsed);
  } catch (error) {
    console.warn("[F8 小行星] 無法讀取草稿：", error);
    return null;
  }
}

export function clearTinyPlanetDraft(){
  try {
    localStorage.removeItem(TINY_PLANET_DRAFT_KEY);
  } catch (error) {
    console.warn("[F8 小行星] 無法清除草稿：", error);
  }
}

function createDefaultValue(parameterId){
  return createDefaultTinyPlanetState()[parameterId];
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
