// F8 小行星 - 狀態管理 v0.3.1
// 第一排：小行星／隧道／魚眼畸變；第二排：畫面變形／氛圍光影；其下為調整項目 + 滑桿。

export const TINY_PLANET_FEATURE_ID = "F8_tinyPlanet";
export const TINY_PLANET_FEATURE_VERSION = "0.3.1";
export const TINY_PLANET_DRAFT_KEY = "photoEffects.F8_tinyPlanet.draft.v4";

/** 第二排：調整類別（可收合） */
export const TINY_PLANET_CONTROL_TABS = [
  { id: "warp", label: "畫面變形" },
  { id: "atmosphere", label: "氛圍光影" }
];

/** 第一排：獨立子功能 */
export const PROJECTION_MODES = [
  { id: "planet", label: "小行星" },
  { id: "tunnel", label: "隧道" },
  { id: "fisheye", label: "魚眼畸變" }
];

/** 小行星／隧道 的畫面變形參數 */
export const PLANET_WARP_PARAMETERS = [
  { id: "rotation", label: "旋轉角度", min: 0, max: 360, step: 1, suffix: "°" },
  { id: "bendStrength", label: "彎曲強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "equatorOffset", label: "地平線位置", min: -50, max: 50, step: 1, suffix: "%" },
  { id: "seamBlend", label: "左右融合", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "seamHeight", label: "接縫高低", min: -50, max: 50, step: 1, suffix: "%" },
  { id: "zoom", label: "行星縮放", min: 60, max: 160, step: 1, suffix: "%" }
];

/**
 * 魚眼畸變模式的畫面變形參數。
 * 焦距範圍刻意加大（2–200mm）：愈短畸變愈強，愈長愈接近原圖。
 */
export const FISHEYE_WARP_PARAMETERS = [
  { id: "fisheyeFocalLength", label: "魚眼鏡頭焦距", min: 2, max: 200, step: 1, suffix: "mm" },
  { id: "zoom", label: "畫面縮放", min: 60, max: 200, step: 1, suffix: "%" },
  { id: "rotation", label: "旋轉角度", min: 0, max: 360, step: 1, suffix: "°" }
];

/** @deprecated 相容舊名稱 */
export const WARP_PARAMETERS = PLANET_WARP_PARAMETERS;

/** 氛圍光影參數（各模式共用） */
export const ATMOSPHERE_PARAMETERS = [
  { id: "vignette", label: "邊緣暈影", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "atmosphere", label: "大氣散射", min: 0, max: 100, step: 1, suffix: "%" }
];

export function getWarpParametersForMode(mode){
  return mode === "fisheye" ? FISHEYE_WARP_PARAMETERS : PLANET_WARP_PARAMETERS;
}

export function normalizeProjectionMode(mode){
  return PROJECTION_MODES.some(item => item.id === mode) ? mode : "planet";
}

export function normalizeActiveControlTab(tab){
  if (tab === null || tab === "none" || tab === "" || tab === "mode" || tab === "fisheye") return null;
  if (TINY_PLANET_CONTROL_TABS.some(item => item.id === tab)) return tab;
  return "warp";
}

export function createDefaultTinyPlanetState(){
  return {
    featureId: TINY_PLANET_FEATURE_ID,
    featureVersion: TINY_PLANET_FEATURE_VERSION,
    activeControlTab: "warp",
    sourceImageDataUrl: null,

    projectionMode: "planet",

    selectedWarpParameter: "rotation",
    rotation: 0,
    bendStrength: 55,
    equatorOffset: 0,
    seamBlend: 35,
    seamHeight: 0,
    zoom: 100,
    fisheyeFocalLength: 16,

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
    seamBlend: defaults.seamBlend,
    seamHeight: defaults.seamHeight,
    zoom: defaults.zoom,
    fisheyeFocalLength: defaults.fisheyeFocalLength,
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

  const warpParams = getWarpParametersForMode(next.projectionMode);
  if (!warpParams.some(item => item.id === next.selectedWarpParameter)) {
    next.selectedWarpParameter = warpParams[0].id;
  }
  next.selectedAtmosphereParameter = ATMOSPHERE_PARAMETERS.some(item => item.id === next.selectedAtmosphereParameter)
    ? next.selectedAtmosphereParameter
    : "vignette";

  for (const parameter of [...PLANET_WARP_PARAMETERS, ...FISHEYE_WARP_PARAMETERS]) {
    if (parameter.id === "zoom" || parameter.id === "rotation") continue;
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }
  for (const parameter of warpParams) {
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
    const raw = localStorage.getItem(TINY_PLANET_DRAFT_KEY)
      || localStorage.getItem("photoEffects.F8_tinyPlanet.draft.v3")
      || localStorage.getItem("photoEffects.F8_tinyPlanet.draft.v2")
      || localStorage.getItem("photoEffects.F8_tinyPlanet.draft.v1");
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
    localStorage.removeItem("photoEffects.F8_tinyPlanet.draft.v3");
    localStorage.removeItem("photoEffects.F8_tinyPlanet.draft.v2");
    localStorage.removeItem("photoEffects.F8_tinyPlanet.draft.v1");
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
