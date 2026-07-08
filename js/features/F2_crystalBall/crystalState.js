// F2 水晶球 - 狀態管理 v0.3.0
// 系統場景背景 + 球內使用者照片。場景圖不含水晶球，由 app 即時繪製。

export const CRYSTAL_FEATURE_ID = "F2_crystalBall";
export const CRYSTAL_FEATURE_VERSION = "0.3.0";
export const CRYSTAL_DRAFT_KEY = "photoEffects.F2_crystalBall.draft.v6";

/**
 * 場景球位（標準化 0–1，相對 1200×1600 畫布）
 * cx/cy = 球心；diameter = 球徑相對畫布寬度
 */
export const CRYSTAL_SCENES = [
  {
    id: "scene1",
    label: "書房",
    asset: "./assets/features/F2_crystalBall/scenes/scene1.webp",
    ball: { cx: 0.50, cy: 0.365, diameter: 0.34 }
  },
  {
    id: "scene2",
    label: "峽谷",
    asset: "./assets/features/F2_crystalBall/scenes/scene2.webp",
    ball: { cx: 0.50, cy: 0.362, diameter: 0.35 }
  },
  {
    id: "scene3",
    label: "辦公室",
    asset: "./assets/features/F2_crystalBall/scenes/scene3.webp",
    ball: { cx: 0.50, cy: 0.368, diameter: 0.34 }
  },
  {
    id: "scene4",
    label: "巴黎",
    asset: "./assets/features/F2_crystalBall/scenes/scene4.webp",
    ball: { cx: 0.50, cy: 0.358, diameter: 0.36 }
  },
  {
    id: "scene5",
    label: "客廳",
    asset: "./assets/features/F2_crystalBall/scenes/scene5.webp",
    ball: { cx: 0.50, cy: 0.366, diameter: 0.34 }
  },
  {
    id: "scene6",
    label: "臥室",
    asset: "./assets/features/F2_crystalBall/scenes/scene6.webp",
    ball: { cx: 0.50, cy: 0.364, diameter: 0.34 }
  }
];

/** @deprecated 保留別名，供舊程式碼過渡 */
export const CRYSTAL_SEATS = CRYSTAL_SCENES;

export const CRYSTAL_PARAMETERS = [
  { id: "photoOffsetX", label: "照片左右", min: -100, max: 100, step: 1, suffix: "%" },
  { id: "photoOffsetY", label: "照片上下", min: -100, max: 100, step: 1, suffix: "%" },
  { id: "photoScale", label: "照片縮放", min: 100, max: 220, step: 1, suffix: "%" },
  { id: "contrast", label: "照片對比", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "saturation", label: "照片飽和", min: 50, max: 170, step: 1, suffix: "%" },
  { id: "warmth", label: "照片色溫", min: -100, max: 100, step: 1, suffix: "" },
  { id: "highlight", label: "反光強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "highlightPosition", label: "反光位置", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "edgeFeather", label: "邊緣柔光", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "shadow", label: "球體陰影", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "refraction", label: "球面折射", min: 0, max: 100, step: 1, suffix: "%" }
];

export function getSceneById(sceneId){
  const normalized = normalizeSceneId(sceneId);
  return CRYSTAL_SCENES.find(scene => scene.id === normalized) || CRYSTAL_SCENES[0];
}

export function normalizeSceneId(sceneId){
  if (CRYSTAL_SCENES.some(scene => scene.id === sceneId)) return sceneId;
  if (typeof sceneId === "string" && sceneId.startsWith("seat")) {
    const mapped = sceneId.replace("seat", "scene");
    if (CRYSTAL_SCENES.some(scene => scene.id === mapped)) return mapped;
  }
  return "scene1";
}

export function createDefaultCrystalState(){
  return {
    featureId: CRYSTAL_FEATURE_ID,
    featureVersion: CRYSTAL_FEATURE_VERSION,
    selectedSceneId: "scene1",
    selectedParameter: "photoScale",
    sourceImageDataUrl: null,
    photoOffsetX: 0,
    photoOffsetY: 0,
    photoScale: 118,
    contrast: 108,
    saturation: 112,
    warmth: 8,
    highlight: 82,
    highlightPosition: 18,
    edgeFeather: 58,
    shadow: 56,
    refraction: 62,
    updatedAt: Date.now()
  };
}

export function resetPhotoPlacement(currentState){
  return updateCrystalState(currentState, {
    photoOffsetX: 0,
    photoOffsetY: 0,
    photoScale: 118
  });
}

export function updateCrystalState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  if (next.selectedSceneId == null && next.selectedSeatId != null) {
    next.selectedSceneId = normalizeSceneId(next.selectedSeatId);
  }
  delete next.selectedSeatId;

  next.selectedSceneId = normalizeSceneId(next.selectedSceneId);
  next.selectedParameter = CRYSTAL_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "photoScale";

  for (const parameter of CRYSTAL_PARAMETERS) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }

  return next;
}

export function saveCrystalDraft(state){
  try {
    const saved = {
      ...state,
      featureId: CRYSTAL_FEATURE_ID,
      featureVersion: CRYSTAL_FEATURE_VERSION,
      updatedAt: Date.now()
    };
    localStorage.setItem(CRYSTAL_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F2 水晶球] 無法儲存草稿：", error);
  }
}

export function loadCrystalDraft(){
  try {
    const raw = localStorage.getItem(CRYSTAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== CRYSTAL_FEATURE_ID) return null;
    return updateCrystalState(createDefaultCrystalState(), parsed);
  } catch (error) {
    console.warn("[F2 水晶球] 無法讀取草稿：", error);
    return null;
  }
}

export function clearCrystalDraft(){
  try {
    localStorage.removeItem(CRYSTAL_DRAFT_KEY);
  } catch (error) {
    console.warn("[F2 水晶球] 無法清除草稿：", error);
  }
}

function createDefaultValue(parameterId){
  return createDefaultCrystalState()[parameterId];
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
