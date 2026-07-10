// F3 魔法天空 - 狀態管理 v0.3.5
// 雙極滑桿（中點 0、±150）+ 換天/換圖重置。

import { getMagicSkyItems } from "./magicSkyAssets.js";

export const MAGIC_SKY_FEATURE_ID = "F3_magicSky";
export const MAGIC_SKY_FEATURE_VERSION = "0.3.5";
export const MAGIC_SKY_DRAFT_KEY = "photoEffects.F3_magicSky.draft.v3";

export const ADJUST_SLIDER_MIN = -150;
export const ADJUST_SLIDER_MAX = 150;

export const MAGIC_SKY_CONTROL_TABS = [
  { id: "sky", label: "天空" },
  { id: "skyAdjust", label: "天空微調" },
  { id: "photoAdjust", label: "照片微調" }
];

export const MAGIC_SKY_CATEGORIES = ["sunny", "night", "sunset"];

export const SKY_CATEGORY_LABELS = {
  sunny: "晴天",
  night: "夜晚",
  sunset: "夕陽"
};

const SLIDER_DEF = { min: ADJUST_SLIDER_MIN, max: ADJUST_SLIDER_MAX, step: 1, suffix: "" };

export const PHOTO_PARAMETERS = [
  { id: "photoExposure", label: "曝光", ...SLIDER_DEF },
  { id: "photoContrast", label: "對比", ...SLIDER_DEF },
  { id: "photoBrightness", label: "亮度", ...SLIDER_DEF },
  { id: "photoDarken", label: "增暗", ...SLIDER_DEF },
  { id: "photoWarmth", label: "色溫", ...SLIDER_DEF },
  { id: "photoSaturation", label: "飽和", ...SLIDER_DEF }
];

export const SKY_PARAMETERS = [
  { id: "skyOffsetX", label: "水平移動", ...SLIDER_DEF },
  { id: "skyOffsetY", label: "垂直移動", ...SLIDER_DEF },
  { id: "skyScale", label: "縮放", ...SLIDER_DEF },
  { id: "skyExposure", label: "曝光", ...SLIDER_DEF },
  { id: "skyContrast", label: "對比", ...SLIDER_DEF },
  { id: "skyBrightness", label: "亮度", ...SLIDER_DEF },
  { id: "skyDarken", label: "增暗", ...SLIDER_DEF },
  { id: "skyOpacity", label: "透明度", ...SLIDER_DEF },
  { id: "skyWarmth", label: "色溫", ...SLIDER_DEF },
  { id: "skySaturation", label: "飽和", ...SLIDER_DEF }
];

export const EDGE_PARAMETERS = [
  { id: "edgeFeather", label: "柔光", ...SLIDER_DEF },
  { id: "maskExpansion", label: "邊界擴張", ...SLIDER_DEF }
];

export const SKY_ADJUST_PARAMETERS = [...SKY_PARAMETERS, ...EDGE_PARAMETERS];
export const ALL_ADJUSTMENT_PARAMETERS = [...PHOTO_PARAMETERS, ...SKY_ADJUST_PARAMETERS];

export function getParametersForControlTab(tabId){
  if (tabId === "photoAdjust") return PHOTO_PARAMETERS;
  if (tabId === "skyAdjust") return SKY_ADJUST_PARAMETERS;
  return [];
}

export function getDefaultAdjustmentState(){
  return {
    skyOffsetX: 0,
    skyOffsetY: 0,
    skyScale: 0,
    photoExposure: 0,
    photoContrast: 0,
    photoBrightness: 0,
    photoDarken: 0,
    photoWarmth: 0,
    photoSaturation: 0,
    skyExposure: 0,
    skyContrast: 0,
    skyBrightness: 0,
    skyDarken: 0,
    skyOpacity: 0,
    skyWarmth: 0,
    skySaturation: 0,
    edgeFeather: 0,
    maskExpansion: 0
  };
}

export function resolveEffectValues(state){
  const slider = id => clampSlider(state[id]);

  return {
    photoExposure: slider("photoExposure"),
    photoContrast: mapPercentSlider(slider("photoContrast")),
    photoBrightness: mapPercentSlider(slider("photoBrightness")),
    photoDarken: mapPositivePercentSlider(slider("photoDarken")),
    photoWarmth: (slider("photoWarmth") / ADJUST_SLIDER_MAX) * 100,
    photoSaturation: mapPercentSlider(slider("photoSaturation")),
    skyOffsetX: slider("skyOffsetX"),
    skyOffsetY: slider("skyOffsetY"),
    skyScale: clamp(100 + (slider("skyScale") / ADJUST_SLIDER_MAX) * 200, 50, 300),
    skyExposure: slider("skyExposure"),
    skyContrast: mapPercentSlider(slider("skyContrast")),
    skyBrightness: mapPercentSlider(slider("skyBrightness")),
    skyDarken: mapPositivePercentSlider(slider("skyDarken")),
    skyOpacity: clamp(100 + Math.min(0, slider("skyOpacity") / ADJUST_SLIDER_MAX) * 100, 0, 100),
    skyWarmth: (slider("skyWarmth") / ADJUST_SLIDER_MAX) * 100,
    skySaturation: mapPercentSlider(slider("skySaturation")),
    edgeFeather: clamp(36 + (slider("edgeFeather") / ADJUST_SLIDER_MAX) * 64, 0, 100),
    maskExpansion: clamp(2 + (slider("maskExpansion") / ADJUST_SLIDER_MAX) * 38, -40, 40)
  };
}

export function getSelectedSkyIdKey(category){
  return `selected${category.charAt(0).toUpperCase()}${category.slice(1)}Id`;
}

export function getSkyByCategory(category, skyId){
  const items = getMagicSkyItems(category);
  const normalized = normalizeSkyId(category, skyId);
  return items.find(item => item.id === normalized) || items[0];
}

export function normalizeSkyId(category, skyId){
  const items = getMagicSkyItems(category);
  if (items.some(item => item.id === skyId)) return skyId;
  return items[0]?.id || `${category}1`;
}

export function normalizeActiveControlTab(tab){
  if (tab === null || tab === "none" || tab === "") return null;
  if (MAGIC_SKY_CONTROL_TABS.some(item => item.id === tab)) return tab;
  if (tab === "sunny" || tab === "night" || tab === "sunset" || tab === "adjust") return "sky";
  return "sky";
}

export function createDefaultMagicSkyState(){
  return {
    featureId: MAGIC_SKY_FEATURE_ID,
    featureVersion: MAGIC_SKY_FEATURE_VERSION,
    activeControlTab: "sky",
    activeSkyCategory: "sunny",
    selectedSunnyId: "sunny1",
    selectedNightId: "night1",
    selectedSunsetId: "sunset1",
    selectedParameter: "skyOffsetX",
    sourceImageDataUrl: null,
    maskPhotoKey: null,
    ...getDefaultAdjustmentState(),
    updatedAt: Date.now()
  };
}

export function updateMagicSkyState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeControlTab = normalizeActiveControlTab(next.activeControlTab);
  next.activeSkyCategory = MAGIC_SKY_CATEGORIES.includes(next.activeSkyCategory)
    ? next.activeSkyCategory
    : "sunny";

  for (const category of MAGIC_SKY_CATEGORIES) {
    const key = getSelectedSkyIdKey(category);
    next[key] = normalizeSkyId(category, next[key]);
  }

  const tabParams = getParametersForControlTab(next.activeControlTab);
  if (tabParams.length && !tabParams.some(item => item.id === next.selectedParameter)) {
    next.selectedParameter = tabParams[0]?.id || "photoExposure";
  }

  for (const parameter of ALL_ADJUSTMENT_PARAMETERS) {
    next[parameter.id] = clampSlider(next[parameter.id], createDefaultValue(parameter.id));
  }

  return next;
}

export function saveMagicSkyDraft(state){
  try {
    const saved = {
      ...state,
      featureId: MAGIC_SKY_FEATURE_ID,
      featureVersion: MAGIC_SKY_FEATURE_VERSION,
      updatedAt: Date.now()
    };
    localStorage.setItem(MAGIC_SKY_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F3 魔法天空] 無法儲存草稿：", error);
  }
}

export function loadMagicSkyDraft(){
  try {
    const raw = localStorage.getItem(MAGIC_SKY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== MAGIC_SKY_FEATURE_ID) return null;
    return updateMagicSkyState(createDefaultMagicSkyState(), migrateLegacyDraft(parsed));
  } catch (error) {
    console.warn("[F3 魔法天空] 無法讀取草稿：", error);
    return null;
  }
}

function migrateLegacyDraft(parsed){
  const next = { ...parsed };
  if (next.activeControlTab === "sunny" || next.activeControlTab === "night" || next.activeControlTab === "sunset") {
    next.activeSkyCategory = next.activeControlTab;
    next.activeControlTab = "sky";
  }
  if (next.activeControlTab === "adjust") {
    next.activeControlTab = next.adjustSegment === "photo" ? "photoAdjust" : "skyAdjust";
  }
  delete next.adjustSegment;

  const legacyVersion = String(next.featureVersion || "0");
  if (legacyVersion < "0.3.3") {
    Object.assign(next, getDefaultAdjustmentState());
  }
  if (legacyVersion < "0.3.4") {
    next.photoWarmth = 0;
    next.photoSaturation = 0;
  }

  return next;
}

function mapPercentSlider(sliderValue){
  return clamp(100 + (sliderValue / ADJUST_SLIDER_MAX) * 200, 20, 300);
}

function mapPositivePercentSlider(sliderValue){
  return clamp((sliderValue / ADJUST_SLIDER_MAX) * 100, 0, 100);
}

function clampSlider(value, fallback = 0){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(ADJUST_SLIDER_MIN, Math.min(ADJUST_SLIDER_MAX, number));
}

function createDefaultValue(parameterId){
  return getDefaultAdjustmentState()[parameterId] ?? 0;
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
