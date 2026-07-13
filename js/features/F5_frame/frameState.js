// F5 框住美好 - 狀態管理 v0.1.0

export const FRAME_FEATURE_ID = "F5_frame";
export const FRAME_FEATURE_VERSION = "0.1.0";
export const FRAME_DRAFT_KEY = "photoEffects.F5_frame.draft.v1";

export const FRAME_CATEGORIES = [
  { id: "classic", label: "經典畫框", enabled: true },
  { id: "professional", label: "專業畫框", enabled: true },
  { id: "artistic", label: "藝術畫框", enabled: false },
  { id: "dimensional", label: "立體畫框", enabled: false },
  { id: "smart", label: "智慧畫框", enabled: false },
  { id: "light", label: "光影氛圍", enabled: false }
];

export const FRAME_TYPES = {
  classic: [
    { id: "whiteBorder", label: "白邊框", materialId: "white" },
    { id: "blackBorder", label: "黑邊框", materialId: "black" },
    { id: "thinBorder", label: "細邊框", materialId: "white", defaults: { frameWidth: 12 } },
    { id: "thickBorder", label: "粗邊框", materialId: "black", defaults: { frameWidth: 64 } },
    { id: "wood", label: "木紋", materialId: "wood" },
    { id: "walnut", label: "胡桃木", materialId: "walnut" },
    { id: "oak", label: "橡木", materialId: "oak" },
    { id: "pine", label: "松木", materialId: "pine" },
    { id: "gold", label: "金框", materialId: "gold" },
    { id: "silver", label: "銀框", materialId: "silver" },
    { id: "bronze", label: "銅框", materialId: "bronze" },
    { id: "aluminum", label: "鋁框", materialId: "aluminum" },
    { id: "acrylic", label: "壓克力", materialId: "acrylic" }
  ],
  professional: [
    { id: "gallery", label: "畫廊框", materialId: "gallery", defaults: { frameWidth: 42, innerPadding: 18 } },
    { id: "polaroid", label: "拍立得", materialId: "polaroid", defaults: { frameWidth: 28, innerPadding: 10, cornerRadius: 4 } },
    { id: "filmBorder", label: "底片邊框", materialId: "film", defaults: { frameWidth: 48, innerPadding: 4, cornerRadius: 0 } }
  ],
  artistic: [],
  dimensional: [],
  smart: [],
  light: []
};

export const FRAME_PARAMETERS = [
  { id: "frameWidth", label: "框寬", min: 8, max: 96, step: 1, unit: "px" },
  { id: "cornerRadius", label: "圓角", min: 0, max: 48, step: 1, unit: "px" },
  { id: "innerPadding", label: "內邊距", min: 0, max: 48, step: 1, unit: "px" },
  { id: "outerPadding", label: "外邊距", min: 0, max: 40, step: 1, unit: "px" },
  { id: "shadow", label: "陰影", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "opacity", label: "不透明度", min: 40, max: 100, step: 1, unit: "percent" }
];

export function getFrameTypesForCategory(categoryId){
  return FRAME_TYPES[categoryId] || [];
}

export function getFrameTypeById(categoryId, frameTypeId){
  const list = getFrameTypesForCategory(categoryId);
  return list.find(item => item.id === frameTypeId) || list[0] || null;
}

export function createDefaultFrameState(){
  return {
    featureId: FRAME_FEATURE_ID,
    featureVersion: FRAME_FEATURE_VERSION,
    activeCategory: "classic",
    frameTypeId: "wood",
    selectedParameter: "frameWidth",
    sourceImageDataUrl: null,

    frameWidth: 40,
    cornerRadius: 6,
    innerPadding: 8,
    outerPadding: 12,
    shadow: 32,
    opacity: 100,

    updatedAt: Date.now()
  };
}

export function resetFrameAdjustments(currentState){
  const defaults = createDefaultFrameState();
  const type = getFrameTypeById(currentState.activeCategory, currentState.frameTypeId);
  return updateFrameState(currentState, {
    frameWidth: type?.defaults?.frameWidth ?? defaults.frameWidth,
    cornerRadius: type?.defaults?.cornerRadius ?? defaults.cornerRadius,
    innerPadding: type?.defaults?.innerPadding ?? defaults.innerPadding,
    outerPadding: defaults.outerPadding,
    shadow: defaults.shadow,
    opacity: defaults.opacity,
    selectedParameter: "frameWidth"
  });
}

export function normalizeActiveCategory(categoryId){
  if (FRAME_CATEGORIES.some(item => item.id === categoryId)) return categoryId;
  return "classic";
}

export function updateFrameState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeCategory = normalizeActiveCategory(next.activeCategory);
  const types = getFrameTypesForCategory(next.activeCategory);
  if (!types.some(item => item.id === next.frameTypeId)) {
    next.frameTypeId = types[0]?.id || "wood";
  }

  next.selectedParameter = FRAME_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "frameWidth";

  for (const parameter of FRAME_PARAMETERS) {
    const fallback = createDefaultFrameState()[parameter.id];
    let value = clampNumber(next[parameter.id], parameter.min, parameter.max, fallback);
    if (parameter.id === "opacity") {
      // Store as 40–100 UI percent.
      value = clampNumber(next[parameter.id], parameter.min, parameter.max, fallback);
    }
    next[parameter.id] = value;
  }

  return next;
}

export function applyFrameTypeDefaults(currentState, frameTypeId){
  const type = getFrameTypeById(currentState.activeCategory, frameTypeId);
  if (!type) return updateFrameState(currentState, { frameTypeId });
  return updateFrameState(currentState, {
    frameTypeId: type.id,
    ...(type.defaults || {})
  });
}

export function saveFrameDraft(state){
  try {
    const saved = {
      ...state,
      featureId: FRAME_FEATURE_ID,
      featureVersion: FRAME_FEATURE_VERSION,
      updatedAt: Date.now()
    };
    localStorage.setItem(FRAME_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F5 框住美好] 無法儲存草稿：", error);
  }
}

export function loadFrameDraft(){
  try {
    const raw = localStorage.getItem(FRAME_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== FRAME_FEATURE_ID) return null;
    return updateFrameState(createDefaultFrameState(), parsed);
  } catch (error) {
    console.warn("[F5 框住美好] 無法讀取草稿：", error);
    return null;
  }
}

export function clearFrameDraft(){
  try {
    localStorage.removeItem(FRAME_DRAFT_KEY);
  } catch (error) {
    console.warn("[F5 框住美好] 無法清除草稿：", error);
  }
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
