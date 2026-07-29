// F8 小行星 - 狀態管理 v0.5.1
// 第一排：小行星／隧道／調整項目；調整項目內為合併後的參數清單。

export const TINY_PLANET_FEATURE_ID = "F8_tinyPlanet";
export const TINY_PLANET_FEATURE_VERSION = "0.5.1";
export const TINY_PLANET_DRAFT_KEY = "photoEffects.F8_tinyPlanet.draft.v7";

/** 第一排子功能 */
export const TINY_PLANET_CONTROL_TABS = [
  { id: "planet", label: "小行星" },
  { id: "tunnel", label: "隧道" },
  { id: "adjust", label: "調整項目" }
];

/** 調整項目（畫面變形 + 氛圍光影，已移除光暈神秘光） */
export const ADJUST_PARAMETERS = [
  { id: "rotation", label: "旋轉角度", min: 0, max: 360, step: 1, suffix: "°" },
  { id: "bendStrength", label: "彎曲強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "equatorOffset", label: "地平線位置", min: -50, max: 50, step: 1, suffix: "%" },
  { id: "seamBlend", label: "左右融合", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "seamHeight", label: "接縫高低", min: -50, max: 50, step: 1, suffix: "%" },
  { id: "zoom", label: "行星縮放", min: 60, max: 160, step: 1, suffix: "%" },
  { id: "perspectiveSquash", label: "透視壓扁", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "perspectiveLift", label: "拉高", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "centerRimStretch", label: "中心偏移外圈拉伸", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "swirlTwist", label: "漩渦扭曲", min: -100, max: 100, step: 1, suffix: "%" },
  { id: "vignette", label: "邊緣暈影", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "atmosphere", label: "大氣散射", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "temperatureRing", label: "日月色溫環", min: -100, max: 100, step: 1, suffix: "%" }
];

export function normalizeProjectionMode(mode){
  if (mode === "fisheye") return "planet";
  if (mode === "tunnel") return "tunnel";
  return "planet";
}

export function normalizeActiveControlTab(tab){
  if (tab === null || tab === "none" || tab === "") return null;
  // 舊草稿：畫面變形／氛圍光影 → 調整項目
  if (tab === "warp" || tab === "atmosphere" || tab === "mode" || tab === "fisheye") return "adjust";
  // planet/tunnel tabs also valid as "last focused" when adjust is closed
  if (TINY_PLANET_CONTROL_TABS.some(item => item.id === tab)) return tab;
  return "adjust";
}

export function createDefaultTinyPlanetState(){
  return {
    featureId: TINY_PLANET_FEATURE_ID,
    featureVersion: TINY_PLANET_FEATURE_VERSION,
    activeControlTab: "adjust",
    sourceImageDataUrl: null,

    projectionMode: "planet",
    selectedParameter: "rotation",

    rotation: 0,
    bendStrength: 55,
    equatorOffset: 0,
    seamBlend: 35,
    seamHeight: 0,
    zoom: 100,
    perspectiveSquash: 0,
    perspectiveLift: 0,
    centerRimStretch: 0,
    swirlTwist: 0,
    vignette: 42,
    atmosphere: 28,
    temperatureRing: 0,

    updatedAt: Date.now()
  };
}

export function resetTinyPlanetAdjustments(currentState){
  const defaults = createDefaultTinyPlanetState();
  return updateTinyPlanetState(currentState, {
    activeControlTab: defaults.activeControlTab,
    projectionMode: defaults.projectionMode,
    selectedParameter: defaults.selectedParameter,
    rotation: defaults.rotation,
    bendStrength: defaults.bendStrength,
    equatorOffset: defaults.equatorOffset,
    seamBlend: defaults.seamBlend,
    seamHeight: defaults.seamHeight,
    zoom: defaults.zoom,
    perspectiveSquash: defaults.perspectiveSquash,
    perspectiveLift: defaults.perspectiveLift,
    centerRimStretch: defaults.centerRimStretch,
    swirlTwist: defaults.swirlTwist,
    vignette: defaults.vignette,
    atmosphere: defaults.atmosphere,
    temperatureRing: defaults.temperatureRing
  });
}

export function updateTinyPlanetState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  // Migrate selected parameter from old warp/atmosphere keys before dropping them.
  let selectedParameter = next.selectedParameter
    || next.selectedWarpParameter
    || next.selectedAtmosphereParameter
    || "rotation";
  if (selectedParameter === "mysticGlow") {
    selectedParameter = "temperatureRing";
  }

  // Drop legacy fields from older drafts
  delete next.fisheyeFocalLength;
  delete next.selectedFisheyeParameter;
  delete next.selectedWarpParameter;
  delete next.selectedAtmosphereParameter;
  delete next.mysticGlow;

  next.activeControlTab = normalizeActiveControlTab(next.activeControlTab);

  // Projection mode is independent from whether the adjust panel is open.
  if (partial && Object.prototype.hasOwnProperty.call(partial, "projectionMode")) {
    next.projectionMode = normalizeProjectionMode(partial.projectionMode);
  } else if (next.activeControlTab === "planet" || next.activeControlTab === "tunnel") {
    // Legacy: if tab itself is a mode and projectionMode missing/stale, sync from tab.
    next.projectionMode = next.activeControlTab;
  } else {
    next.projectionMode = normalizeProjectionMode(next.projectionMode);
  }

  next.selectedParameter = ADJUST_PARAMETERS.some(item => item.id === selectedParameter)
    ? selectedParameter
    : "rotation";

  for (const parameter of ADJUST_PARAMETERS) {
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
    delete saved.fisheyeFocalLength;
    delete saved.selectedFisheyeParameter;
    delete saved.selectedWarpParameter;
    delete saved.selectedAtmosphereParameter;
    delete saved.mysticGlow;
    localStorage.setItem(TINY_PLANET_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F8 小行星] 無法儲存草稿：", error);
  }
}

export function loadTinyPlanetDraft(){
  try {
    const raw = localStorage.getItem(TINY_PLANET_DRAFT_KEY)
      || localStorage.getItem("photoEffects.F8_tinyPlanet.draft.v6")
      || localStorage.getItem("photoEffects.F8_tinyPlanet.draft.v5")
      || localStorage.getItem("photoEffects.F8_tinyPlanet.draft.v4")
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
    localStorage.removeItem("photoEffects.F8_tinyPlanet.draft.v6");
    localStorage.removeItem("photoEffects.F8_tinyPlanet.draft.v5");
    localStorage.removeItem("photoEffects.F8_tinyPlanet.draft.v4");
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
