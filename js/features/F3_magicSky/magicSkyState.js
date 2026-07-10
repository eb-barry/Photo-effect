// F3 魔法天空 - 狀態管理 v0.3.0
// 照片 / 天空 / 邊緣 三分段影像微調。

import { getMagicSkyItems } from "./magicSkyAssets.js";

export const MAGIC_SKY_FEATURE_ID = "F3_magicSky";
export const MAGIC_SKY_FEATURE_VERSION = "0.3.0";
export const MAGIC_SKY_DRAFT_KEY = "photoEffects.F3_magicSky.draft.v2";

export const MAGIC_SKY_CONTROL_TABS = [
  { id: "sunny", label: "晴天" },
  { id: "night", label: "夜晚" },
  { id: "sunset", label: "夕陽" },
  { id: "adjust", label: "影像微調" }
];

export const MAGIC_SKY_CATEGORIES = ["sunny", "night", "sunset"];

export const ADJUST_SEGMENTS = [
  {
    id: "photo",
    label: "照片",
    hint: "調整原始照片（人物、地面、建築）",
    sliderTone: "photo"
  },
  {
    id: "sky",
    label: "天空",
    hint: "調整替換的天空材質",
    sliderTone: "sky"
  },
  {
    id: "edge",
    label: "邊緣",
    hint: "調整天空與前景的交界融合",
    sliderTone: "edge"
  }
];

export const PHOTO_PARAMETERS = [
  { id: "photoExposure", label: "曝光", min: -100, max: 100, step: 1, suffix: "" },
  { id: "photoContrast", label: "對比", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "photoBrightness", label: "亮度", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "photoDarken", label: "增暗", min: 0, max: 100, step: 1, suffix: "%" }
];

export const SKY_PARAMETERS = [
  { id: "skyOffsetX", label: "位置｜水平移動", min: -100, max: 100, step: 1, suffix: "" },
  { id: "skyOffsetY", label: "位置｜垂直移動", min: -100, max: 100, step: 1, suffix: "" },
  { id: "skyExposure", label: "光影｜曝光", min: -100, max: 100, step: 1, suffix: "" },
  { id: "skyContrast", label: "光影｜對比", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "skyBrightness", label: "光影｜亮度", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "skyDarken", label: "光影｜增暗", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "skyOpacity", label: "外觀｜透明度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "skyWarmth", label: "外觀｜色溫", min: -100, max: 100, step: 1, suffix: "" },
  { id: "skySaturation", label: "外觀｜飽和", min: 50, max: 170, step: 1, suffix: "%" }
];

export const EDGE_PARAMETERS = [
  { id: "edgeFeather", label: "邊緣柔光", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "maskExpansion", label: "邊界擴張", min: -40, max: 40, step: 1, suffix: "" }
];

export function getParametersForAdjustSegment(segmentId){
  if (segmentId === "sky") return SKY_PARAMETERS;
  if (segmentId === "edge") return EDGE_PARAMETERS;
  return PHOTO_PARAMETERS;
}

export function getAdjustSegmentHint(segmentId){
  return ADJUST_SEGMENTS.find(item => item.id === segmentId)?.hint || "";
}

export function getSliderTitle(segmentId, parameter){
  const segmentLabel = ADJUST_SEGMENTS.find(item => item.id === segmentId)?.label || "";
  if (segmentId === "photo") {
    return `${segmentLabel} · ${parameter.label}`;
  }
  if (segmentId === "sky") {
    const parts = parameter.label.split("｜");
    if (parts.length === 2) return `${segmentLabel} · ${parts[0]} · ${parts[1]}`;
    return `${segmentLabel} · ${parameter.label}`;
  }
  return `${segmentLabel} · ${parameter.label}`;
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
  return "sunny";
}

export function normalizeAdjustSegment(segment){
  if (ADJUST_SEGMENTS.some(item => item.id === segment)) return segment;
  return "photo";
}

export function createDefaultMagicSkyState(){
  return {
    featureId: MAGIC_SKY_FEATURE_ID,
    featureVersion: MAGIC_SKY_FEATURE_VERSION,
    activeControlTab: "sunny",
    activeSkyCategory: "sunny",
    adjustSegment: "photo",
    selectedSunnyId: "sunny1",
    selectedNightId: "night1",
    selectedSunsetId: "sunset1",
    selectedParameter: "photoExposure",
    sourceImageDataUrl: null,
    skyOffsetX: 0,
    skyOffsetY: 0,
    photoExposure: 0,
    photoContrast: 100,
    photoBrightness: 100,
    photoDarken: 0,
    skyExposure: 0,
    skyContrast: 100,
    skyBrightness: 100,
    skyDarken: 0,
    skyOpacity: 100,
    skyWarmth: 0,
    skySaturation: 100,
    edgeFeather: 30,
    maskExpansion: -5,
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
  next.adjustSegment = normalizeAdjustSegment(next.adjustSegment);

  for (const category of MAGIC_SKY_CATEGORIES) {
    const key = getSelectedSkyIdKey(category);
    next[key] = normalizeSkyId(category, next[key]);
  }

  const segmentParams = getParametersForAdjustSegment(next.adjustSegment);
  if (!segmentParams.some(item => item.id === next.selectedParameter)) {
    next.selectedParameter = segmentParams[0]?.id || "photoExposure";
  }

  for (const parameter of [...PHOTO_PARAMETERS, ...SKY_PARAMETERS, ...EDGE_PARAMETERS]) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }

  next.skyOffsetX = clampNumber(next.skyOffsetX, -100, 100, 0);
  next.skyOffsetY = clampNumber(next.skyOffsetY, -100, 100, 0);

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
  if (!next.adjustSegment) next.adjustSegment = "photo";
  if (next.selectedParameter === "skyOpacity" && next.adjustSegment === "photo") {
    next.selectedParameter = "photoExposure";
  }
  return next;
}

function createDefaultValue(parameterId){
  return createDefaultMagicSkyState()[parameterId];
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
