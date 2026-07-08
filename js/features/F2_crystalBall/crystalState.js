// F2 水晶球 - 狀態管理 v0.3.7
// 系統場景背景 + 1150×1150 底座 + 球內使用者照片折射。

export const CRYSTAL_FEATURE_ID = "F2_crystalBall";
export const CRYSTAL_FEATURE_VERSION = "0.3.7";
export const CRYSTAL_DRAFT_KEY = "photoEffects.F2_crystalBall.draft.v9";

export const CRYSTAL_CONTROL_TABS = [
  { id: "scene", label: "場景背景" },
  { id: "seat", label: "水晶球底座" },
  { id: "adjust", label: "畫面微調" }
];

/** 1150×1150 底座素材中，球座凹槽中心（標準化座標 0–1） */
export const SEAT_CRADLE_ANCHOR = { x: 0.5, y: 0.248 };
export const SEAT_DISPLAY_WIDTH_RATIO = 0.46;
/** 球徑相對底座寬度；約 1.72 ≈ 畫布寬度 79% */
export const SPHERE_DIAMETER_RATIO = 1.72;
/** 球心額外上移量（相對底座高度） */
export const SPHERE_LIFT_RATIO = 0.058;

export const CRYSTAL_SCENES = [
  { id: "scene1", label: "書房", asset: "./assets/features/F2_crystalBall/scenes/scene1.webp" },
  { id: "scene2", label: "峽谷", asset: "./assets/features/F2_crystalBall/scenes/scene2.webp" },
  { id: "scene3", label: "辦公室", asset: "./assets/features/F2_crystalBall/scenes/scene3.webp" },
  { id: "scene4", label: "巴黎", asset: "./assets/features/F2_crystalBall/scenes/scene4.webp" },
  { id: "scene5", label: "客廳", asset: "./assets/features/F2_crystalBall/scenes/scene5.webp" },
  { id: "scene6", label: "臥室", asset: "./assets/features/F2_crystalBall/scenes/scene6.webp" }
];

export const CRYSTAL_SEATS = [
  { id: "seat1", label: "白大理石", asset: "./assets/features/F2_crystalBall/seats/seat1.webp" },
  { id: "seat2", label: "七彩水晶", asset: "./assets/features/F2_crystalBall/seats/seat2.webp" },
  { id: "seat3", label: "黃金寶石", asset: "./assets/features/F2_crystalBall/seats/seat3.webp" },
  { id: "seat4", label: "楠木雕刻", asset: "./assets/features/F2_crystalBall/seats/seat4.webp" },
  { id: "seat5", label: "藍綠寶石", asset: "./assets/features/F2_crystalBall/seats/seat5.webp" },
  { id: "seat6", label: "檜木雕刻", asset: "./assets/features/F2_crystalBall/seats/seat6.webp" }
];

export const CRYSTAL_PARAMETERS = [
  { id: "photoOffsetX", label: "照片左右", min: -100, max: 100, step: 1, suffix: "%" },
  { id: "photoOffsetY", label: "照片上下", min: -100, max: 100, step: 1, suffix: "%" },
  { id: "photoScale", label: "照片縮放", min: 100, max: 220, step: 1, suffix: "%" },
  { id: "contrast", label: "照片對比", min: 70, max: 150, step: 1, suffix: "%" },
  { id: "saturation", label: "照片飽和", min: 50, max: 170, step: 1, suffix: "%" },
  { id: "warmth", label: "照片色溫", min: -100, max: 100, step: 1, suffix: "" },
  { id: "backgroundBlur", label: "背景模糊", min: 0, max: 40, step: 1, suffix: "" },
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

export function normalizeActiveControlTab(tab, legacyMaterialType = null){
  if (tab === null || tab === "none" || tab === "") return null;
  if (CRYSTAL_CONTROL_TABS.some(item => item.id === tab)) return tab;
  if (legacyMaterialType === "seat") return "seat";
  if (legacyMaterialType === "scene") return "scene";
  return "scene";
}

export function createDefaultCrystalState(){
  return {
    featureId: CRYSTAL_FEATURE_ID,
    featureVersion: CRYSTAL_FEATURE_VERSION,
    activeControlTab: "scene",
    selectedSceneId: "scene1",
    selectedSeatId: "seat1",
    selectedParameter: "photoScale",
    sourceImageDataUrl: null,
    photoOffsetX: 0,
    photoOffsetY: 0,
    photoScale: 118,
    contrast: 108,
    saturation: 112,
    warmth: 8,
    backgroundBlur: 0,
    refraction: 62,
    updatedAt: Date.now()
  };
}

export function resetCrystalAdjustments(currentState){
  const defaults = createDefaultCrystalState();
  return updateCrystalState(currentState, {
    activeControlTab: defaults.activeControlTab,
    selectedSceneId: defaults.selectedSceneId,
    selectedSeatId: defaults.selectedSeatId,
    selectedParameter: defaults.selectedParameter,
    photoOffsetX: defaults.photoOffsetX,
    photoOffsetY: defaults.photoOffsetY,
    photoScale: defaults.photoScale,
    contrast: defaults.contrast,
    saturation: defaults.saturation,
    warmth: defaults.warmth,
    backgroundBlur: defaults.backgroundBlur,
    refraction: defaults.refraction
  });
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

  next.selectedSceneId = normalizeSceneId(next.selectedSceneId);
  next.activeControlTab = normalizeActiveControlTab(
    next.activeControlTab,
    next.selectedMaterialType
  );
  delete next.selectedMaterialType;
  next.selectedSeatId = CRYSTAL_SEATS.some(seat => seat.id === next.selectedSeatId) ? next.selectedSeatId : "seat1";
  next.selectedParameter = CRYSTAL_PARAMETERS.some(item => item.id === next.selectedParameter) ? next.selectedParameter : "photoScale";

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
    delete saved.selectedMaterialType;
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
