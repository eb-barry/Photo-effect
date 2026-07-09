// F3 魔法天空 - 狀態管理 v0.1.0
// 三類天空素材 + 影像微調參數（v0.3.0 套用至天空層）。

import { getMagicSkyItems } from "./magicSkyAssets.js";

export const MAGIC_SKY_FEATURE_ID = "F3_magicSky";
export const MAGIC_SKY_FEATURE_VERSION = "0.2.1";
export const MAGIC_SKY_DRAFT_KEY = "photoEffects.F3_magicSky.draft.v1";

export const MAGIC_SKY_CONTROL_TABS = [
  { id: "sunny", label: "晴天" },
  { id: "night", label: "夜晚" },
  { id: "sunset", label: "夕陽" },
  { id: "adjust", label: "影像微調" }
];

export const MAGIC_SKY_CATEGORIES = ["sunny", "night", "sunset"];

export const MAGIC_SKY_PARAMETERS = [
  { id: "skyOpacity", label: "天空透明度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "skyWarmth", label: "天空色溫", min: -100, max: 100, step: 1, suffix: "" },
  { id: "skySaturation", label: "天空飽和", min: 50, max: 170, step: 1, suffix: "%" },
  { id: "skyBrightness", label: "天空亮度", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "edgeFeather", label: "邊緣柔光", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "maskExpansion", label: "天空邊界擴張", min: -40, max: 40, step: 1, suffix: "" }
];

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

export function createDefaultMagicSkyState(){
  return {
    featureId: MAGIC_SKY_FEATURE_ID,
    featureVersion: MAGIC_SKY_FEATURE_VERSION,
    activeControlTab: "sunny",
    activeSkyCategory: "sunny",
    selectedSunnyId: "sunny1",
    selectedNightId: "night1",
    selectedSunsetId: "sunset1",
    selectedParameter: "skyOpacity",
    sourceImageDataUrl: null,
    skyOffsetX: 0,
    skyOffsetY: 0,
    skyOpacity: 100,
    skyWarmth: 0,
    skySaturation: 100,
    skyBrightness: 100,
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

  for (const category of MAGIC_SKY_CATEGORIES) {
    const key = getSelectedSkyIdKey(category);
    next[key] = normalizeSkyId(category, next[key]);
  }

  next.selectedParameter = MAGIC_SKY_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "skyOpacity";

  for (const parameter of MAGIC_SKY_PARAMETERS) {
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
    return updateMagicSkyState(createDefaultMagicSkyState(), parsed);
  } catch (error) {
    console.warn("[F3 魔法天空] 無法讀取草稿：", error);
    return null;
  }
}

export function clearMagicSkyDraft(){
  try {
    localStorage.removeItem(MAGIC_SKY_DRAFT_KEY);
  } catch (error) {
    console.warn("[F3 魔法天空] 無法清除草稿：", error);
  }
}

function createDefaultValue(parameterId){
  return createDefaultMagicSkyState()[parameterId];
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
