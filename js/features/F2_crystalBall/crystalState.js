// F2 水晶球 - 狀態管理 v0.2.2
// 水晶球展示照片版本：1150×1150 底座錨點定位、球面折射、色散與玻璃光層。

export const CRYSTAL_FEATURE_ID = "F2_crystalBall";
export const CRYSTAL_FEATURE_VERSION = "0.2.2";
export const CRYSTAL_DRAFT_KEY = "photoEffects.F2_crystalBall.draft.v5";

/** 1150×1150 底座素材中，球座凹槽中心（標準化座標 0–1） */
export const SEAT_CRADLE_ANCHOR = { x: 0.5, y: 0.248 };
export const SEAT_DISPLAY_WIDTH_RATIO = 0.46;
/** 球徑相對底座寬度；約 1.72 ≈ 畫布寬度 79% */
export const SPHERE_DIAMETER_RATIO = 1.72;
/** 球心額外上移量（相對底座高度） */
export const SPHERE_LIFT_RATIO = 0.058;

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
  { id: "backgroundBlur", label: "背景模糊", min: 6, max: 28, step: 1, suffix: "" },
  { id: "highlight", label: "反光強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "highlightPosition", label: "反光位置", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "edgeFeather", label: "邊緣柔光", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "shadow", label: "球體陰影", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "refraction", label: "球面折射", min: 0, max: 100, step: 1, suffix: "%" }
];

export function createDefaultCrystalState(){
  return {
    featureId: CRYSTAL_FEATURE_ID,
    featureVersion: CRYSTAL_FEATURE_VERSION,
    selectedSeatId: "seat1",
    selectedParameter: "photoScale",
    sourceImageDataUrl: null,
    photoOffsetX: 0,
    photoOffsetY: 0,
    photoScale: 118,
    contrast: 108,
    saturation: 112,
    warmth: 8,
    backgroundBlur: 18,
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
