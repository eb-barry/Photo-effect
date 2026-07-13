// F5 框住美好 - 狀態管理 v0.1.3
// Frame type lists are filled dynamically from texture manifests (all *.webp).

export const FRAME_FEATURE_ID = "F5_frame";
export const FRAME_FEATURE_VERSION = "0.1.3";
export const FRAME_DRAFT_KEY = "photoEffects.F5_frame.draft.v3";

export const FRAME_CATEGORIES = [
  { id: "classic", label: "經典畫框" },
  { id: "professional", label: "專業畫框" },
  { id: "artistic", label: "藝術畫框" },
  { id: "dimensional", label: "立體畫框" },
  { id: "smart", label: "智慧畫框" },
  { id: "light", label: "光影氛圍" }
];

/** Populated at runtime by frameAssets.loadFrameAssetCatalog(). */
const dynamicFrameTypes = Object.fromEntries(FRAME_CATEGORIES.map(item => [item.id, []]));

export const FRAME_PARAMETERS = [
  { id: "frameWidth", label: "框寬", min: 8, max: 96, step: 1, unit: "px" },
  { id: "cornerRadius", label: "圓角", min: 0, max: 48, step: 1, unit: "px" },
  { id: "innerPadding", label: "內邊距", min: 0, max: 48, step: 1, unit: "px" },
  { id: "outerPadding", label: "外邊距", min: 0, max: 40, step: 1, unit: "px" },
  { id: "shadow", label: "陰影", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "opacity", label: "不透明度", min: 40, max: 100, step: 1, unit: "percent" }
];

export function setFrameTypesFromCatalog(categoryId, catalogItems = []){
  if (!Object.prototype.hasOwnProperty.call(dynamicFrameTypes, categoryId)) return;
  dynamicFrameTypes[categoryId] = (catalogItems || []).map(item => ({
    id: item.id,
    label: item.label,
    materialId: item.materialId || item.id,
    thumb: item.thumb || item.asset,
    file: item.file,
    asset: item.asset,
    defaults: item.defaults || undefined
  }));
}

export function getFrameTypesForCategory(categoryId){
  return dynamicFrameTypes[categoryId] || [];
}

export function findFrameType(categoryId, frameTypeId){
  const list = getFrameTypesForCategory(categoryId);
  return list.find(item => item.id === frameTypeId) || null;
}

export function findFrameTypeAnywhere(frameTypeId){
  for (const category of FRAME_CATEGORIES) {
    const hit = findFrameType(category.id, frameTypeId);
    if (hit) return { categoryId: category.id, type: hit };
  }
  return null;
}

/** Resolve applied frame even when the category panel is collapsed (activeCategory = null). */
export function resolveAppliedFrameType(state){
  const categoryId = state.selectedCategoryId || state.activeCategory || "classic";
  return findFrameType(categoryId, state.frameTypeId)
    || findFrameTypeAnywhere(state.frameTypeId)?.type
    || getFrameTypesForCategory("classic")[0]
    || getFirstAvailableFrameType()
    || null;
}

export function getFirstAvailableFrameType(){
  for (const category of FRAME_CATEGORIES) {
    const first = getFrameTypesForCategory(category.id)[0];
    if (first) return first;
  }
  return null;
}

export function createDefaultFrameState(){
  const firstClassic = getFrameTypesForCategory("classic")[0];
  return {
    featureId: FRAME_FEATURE_ID,
    featureVersion: FRAME_FEATURE_VERSION,
    activeCategory: "classic",
    selectedCategoryId: "classic",
    frameTypeId: firstClassic?.id || "wood",
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
  const type = resolveAppliedFrameType(currentState);
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
  if (categoryId === null || categoryId === "" || categoryId === "none") return null;
  if (FRAME_CATEGORIES.some(item => item.id === categoryId)) return categoryId;
  return "classic";
}

export function normalizeSelectedCategoryId(categoryId){
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
  next.selectedCategoryId = normalizeSelectedCategoryId(next.selectedCategoryId);

  const types = getFrameTypesForCategory(next.selectedCategoryId);
  if (types.length && !types.some(item => item.id === next.frameTypeId)) {
    const found = findFrameTypeAnywhere(next.frameTypeId);
    if (found) {
      next.selectedCategoryId = found.categoryId;
    } else {
      const first = getFirstAvailableFrameType();
      next.selectedCategoryId = first ? FRAME_CATEGORIES.find(c => getFrameTypesForCategory(c.id).some(t => t.id === first.id))?.id || "classic" : "classic";
      next.frameTypeId = first?.id || next.frameTypeId;
    }
  }

  next.selectedParameter = FRAME_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "frameWidth";

  for (const parameter of FRAME_PARAMETERS) {
    const fallback = createDefaultFrameState()[parameter.id];
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, fallback);
  }

  return next;
}

export function applyFrameTypeDefaults(currentState, categoryId, frameTypeId){
  const type = findFrameType(categoryId, frameTypeId);
  if (!type) {
    return updateFrameState(currentState, {
      selectedCategoryId: categoryId,
      frameTypeId
    });
  }
  return updateFrameState(currentState, {
    selectedCategoryId: categoryId,
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
