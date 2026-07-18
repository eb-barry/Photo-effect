// F5 畫框 - 狀態管理 v0.4.6
// Classic strip rails + artistic overlay + gallery + unified 參數調整 tab.

export const FRAME_FEATURE_ID = "F5_frame";
export const FRAME_FEATURE_VERSION = "0.4.6";
export const FRAME_DRAFT_KEY = "photoEffects.F5_frame.draft.v8";

export const FRAME_CATEGORIES = [
  { id: "classic", label: "經典畫框" },
  { id: "artistic", label: "藝術畫框" },
  { id: "gallery", label: "照片畫廊" },
  { id: "adjust", label: "參數調整" }
];

/** Categories that own material / wall thumbnails. */
export const FRAME_MATERIAL_CATEGORIES = ["classic", "artistic", "gallery"];

/** @deprecated kept for draft migration only */
export const PROFESSIONAL_TYPES = [
  { id: "gallery", label: "Gallery", enabled: true, swatch: "#eceae4" }
];

/** Default mount rect: centered ~60% × 90% of the scene. */
export const DEFAULT_MOUNT_RECT = { x: 0.20, y: 0.05, w: 0.60, h: 0.90 };


export const DEFAULT_GALLERY_SCENES = [
  {
    id: "wall-3x4-1",
    label: "直式展場 1",
    file: "wall-3x4-1.webp",
    aspect: "3x4",
    mount: { ...DEFAULT_MOUNT_RECT }
  },
  {
    id: "wall-4x3-1",
    label: "橫式展場 1",
    file: "wall-4x3-1.webp",
    aspect: "4x3",
    mount: { ...DEFAULT_MOUNT_RECT }
  }
];

let gallerySceneCatalog = DEFAULT_GALLERY_SCENES.map(normalizeSceneDefaults);

const dynamicFrameTypes = Object.fromEntries(
  ["classic", "artistic", "gallery", "professional"].map(id => [id, []])
);

/** Shared photo placement under the frame window. */
export const PHOTO_PLACEMENT_PARAMETERS = [
  { id: "photoScale", label: "照片縮放", min: 80, max: 160, step: 1, unit: "percent" },
  { id: "photoOffsetX", label: "照片左右移動", min: -40, max: 40, step: 1, unit: "percent" },
  { id: "photoOffsetY", label: "照片上下移動", min: -40, max: 40, step: 1, unit: "percent" }
];

/** Unified params for the 參數調整 tab (classic / artistic / gallery). */
export const UNIFIED_PARAMETERS = [
  { id: "outerFrameWidth", label: "外框寬", min: 4, max: 96, step: 1, unit: "px" },
  { id: "innerFrameWidth", label: "內框寬", min: 0, max: 72, step: 1, unit: "px" },
  { id: "cornerRadius", label: "圓角", min: 0, max: 48, step: 1, unit: "px" },
  { id: "outerPadding", label: "外邊距", min: 0, max: 40, step: 1, unit: "px" },
  ...PHOTO_PLACEMENT_PARAMETERS,
  { id: "opacity", label: "不透明度", min: 40, max: 100, step: 1, unit: "percent" }
];

/** @deprecated use UNIFIED_PARAMETERS */
export const FRAME_PARAMETERS = UNIFIED_PARAMETERS;

/** @deprecated artistic-specific adjusts folded into UNIFIED_PARAMETERS */
export const ARTISTIC_PARAMETERS = UNIFIED_PARAMETERS;

/** @deprecated gallery lights removed from UI; kept for draft clamp only */
export const GALLERY_LIGHT_PARAMETERS = [
  { id: "galleryLightCount", label: "光源數量", min: 1, max: 4, step: 1, unit: "count" },
  { id: "galleryLightPosX", label: "光源位置 X", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryLightPosY", label: "光源位置 Y", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryLightIntensity", label: "光源強度", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryLightDirection", label: "投射方向", min: 0, max: 360, step: 1, unit: "degree" },
  { id: "galleryLightDistance", label: "投射距離", min: 10, max: 100, step: 1, unit: "percent" }
];

export function setGallerySceneCatalog(items = []){
  gallerySceneCatalog = (items.length ? items : DEFAULT_GALLERY_SCENES).map(normalizeSceneDefaults);
}

export function getGallerySceneCatalog(){
  return gallerySceneCatalog;
}

export function getGalleryScenesForPhoto(photoWidth, photoHeight){
  const aspect = resolvePhotoAspectKey(photoWidth, photoHeight);
  const all = getGallerySceneCatalog();
  if (aspect === "square") return all;
  return all.filter(item => item.aspect === aspect);
}

export function resolvePhotoAspectKey(width, height){
  if (!width || !height) return "3x4";
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.08) return "square";
  return ratio >= 1 ? "4x3" : "3x4";
}

export function getGallerySceneById(sceneId){
  return gallerySceneCatalog.find(item => item.id === sceneId) || gallerySceneCatalog[0] || null;
}

export function setFrameTypesFromCatalog(categoryId, catalogItems = []){
  if (categoryId === "gallery" || categoryId === "professional") {
    dynamicFrameTypes.gallery = [];
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(dynamicFrameTypes, categoryId)) return;
  dynamicFrameTypes[categoryId] = (catalogItems || []).map(item => ({
    id: item.id,
    label: item.label,
    materialId: item.materialId || item.id,
    thumb: item.thumb || item.asset,
    file: item.file,
    asset: item.asset,
    aspect: item.aspect || null,
    kind: item.kind || (categoryId === "artistic" ? "overlay" : categoryId === "classic" ? "strip" : "texture"),
    role: item.role || (categoryId === "classic"
      ? (/(^|[-_])inner([-_]|$)/i.test(String(item.id || item.file || "")) ? "inner" : "outer")
      : null),
    defaults: item.defaults || undefined
  }));
}

export function getFrameTypesForCategory(categoryId){
  if (categoryId === "gallery" || categoryId === "professional") return [];
  return dynamicFrameTypes[categoryId] || [];
}

export function getClassicOuterFrames(){
  return getFrameTypesForCategory("classic").filter(item => item.role !== "inner");
}

export function getClassicInnerFrames(){
  return getFrameTypesForCategory("classic").filter(item => item.role === "inner");
}

export function findFrameType(categoryId, frameTypeId){
  return getFrameTypesForCategory(categoryId).find(item => item.id === frameTypeId) || null;
}

export function findFrameTypeAnywhere(frameTypeId){
  for (const categoryId of FRAME_MATERIAL_CATEGORIES) {
    if (categoryId === "gallery") continue;
    const hit = findFrameType(categoryId, frameTypeId);
    if (hit) return { categoryId, type: hit };
  }
  return null;
}

export function resolveAppliedFrameType(state){
  if (isGalleryMode(state)) {
    return { id: "gallery", label: "照片畫廊", materialId: "gallery" };
  }
  const categoryId = normalizeSelectedCategoryId(state.selectedCategoryId || state.activeCategory || "classic");
  if (categoryId === "gallery") {
    return { id: "gallery", label: "照片畫廊", materialId: "gallery" };
  }
  return findFrameType(categoryId, state.frameTypeId)
    || findFrameTypeAnywhere(state.frameTypeId)?.type
    || getFrameTypesForCategory("classic")[0]
    || getFirstAvailableFrameType()
    || null;
}

function resolveMaterialFromCatalogs(typeId){
  if (!typeId) return null;
  for (const categoryId of ["classic", "artistic"]) {
    const hit = findFrameType(categoryId, typeId);
    if (hit?.materialId) return hit.materialId;
    if (hit) return typeId;
  }
  return typeId;
}

/** Outer frame material. Null when deselected. */
export function resolveClassicOuterMaterialId(state){
  return resolveMaterialFromCatalogs(state.outerFrameTypeId || null);
}

/** Inner frame material; null when deselected or width is 0. */
export function resolveClassicInnerMaterialId(state){
  if (!state.innerFrameTypeId) return null;
  if ((Number(state.innerFrameWidth) || 0) <= 0) return null;
  return resolveMaterialFromCatalogs(state.innerFrameTypeId);
}

/** @deprecated */
export function resolveClassicMaterialId(state){
  return resolveClassicOuterMaterialId(state)
    || resolveClassicInnerMaterialId(state)
    || getFrameTypesForCategory("classic")[0]?.materialId
    || "wood";
}

export function getFirstAvailableFrameType(){
  const firstOuter = getClassicOuterFrames()[0];
  if (firstOuter) return firstOuter;
  for (const categoryId of FRAME_MATERIAL_CATEGORIES) {
    if (categoryId === "gallery") continue;
    const first = getFrameTypesForCategory(categoryId)[0];
    if (first) return first;
  }
  return null;
}

export function isGalleryMode(state){
  return state.selectedCategoryId === "gallery"
    || state.frameTypeId === "gallery"
    || state.selectedCategoryId === "professional";
}

export function isArtisticMode(state){
  return state.framePresentation === "artistic"
    || state.selectedCategoryId === "artistic";
}

/** @deprecated */
export function isProfessionalMode(state){
  return isGalleryMode(state);
}

export function getArtisticFramesForPhoto(photoWidth, photoHeight){
  const aspect = resolvePhotoAspectKey(photoWidth, photoHeight);
  const all = getFrameTypesForCategory("artistic");
  if (aspect === "square") return all;
  const matched = all.filter(item => item.aspect === aspect);
  // If no aspect-tagged files yet, show all so drop-in files without tags still appear.
  return matched.length ? matched : all;
}

export function getArtisticFrameById(frameId){
  return getFrameTypesForCategory("artistic").find(item => item.id === frameId) || null;
}

export function pickDefaultArtisticFrameId(photoWidth, photoHeight, preferredId){
  const matched = getArtisticFramesForPhoto(photoWidth, photoHeight);
  if (preferredId && matched.some(item => item.id === preferredId)) return preferredId;
  return matched[0]?.id || getFrameTypesForCategory("artistic")[0]?.id || null;
}

/** Keep artistic selection only when it matches the photo aspect (or square). */
export function reconcileArtisticFrameForPhoto(currentState, photoWidth, photoHeight){
  if (!currentState?.artisticFrameId) return currentState;
  const nextId = pickDefaultArtisticFrameId(photoWidth, photoHeight, currentState.artisticFrameId);
  if (nextId === currentState.artisticFrameId) return currentState;
  return updateFrameState(currentState, {
    artisticFrameId: nextId,
    framePresentation: nextId
      ? "artistic"
      : (currentState.outerFrameTypeId ? "classic" : currentState.framePresentation || "classic"),
    frameTypeId: nextId
      || currentState.outerFrameTypeId
      || currentState.classicFrameTypeId
      || currentState.frameTypeId
  });
}

export function selectArtisticFrame(currentState, frameId){
  const type = getArtisticFrameById(frameId);
  const id = type?.id || frameId || null;
  // Toggle off if same frame tapped again.
  const nextId = currentState.artisticFrameId === id ? null : id;
  return updateFrameState(currentState, {
    selectedCategoryId: "artistic",
    activeCategory: "artistic",
    artisticFrameId: nextId,
    framePresentation: nextId ? "artistic" : (currentState.outerFrameTypeId ? "classic" : "artistic"),
    frameTypeId: nextId || currentState.outerFrameTypeId || currentState.frameTypeId
  });
}

export function resolvePhotoPlacement(state = {}){
  const photoScale = Number(state.photoScale ?? state.artisticPhotoScale);
  const photoOffsetX = Number(state.photoOffsetX ?? state.artisticOffsetX);
  const photoOffsetY = Number(state.photoOffsetY ?? state.artisticOffsetY);
  return {
    photoScale: Number.isFinite(photoScale) ? photoScale : 100,
    photoOffsetX: Number.isFinite(photoOffsetX) ? photoOffsetX : 0,
    photoOffsetY: Number.isFinite(photoOffsetY) ? photoOffsetY : 0
  };
}

export function getParametersForContext(_state){
  return UNIFIED_PARAMETERS;
}

export function isAdjustMode(state){
  return normalizeActiveCategory(state?.activeCategory) === "adjust";
}

/** Map unified 外框寬 (px) → artistic overlay width factor (percent). */
export function resolveArtisticFrameWidthPercent(state = {}){
  const outer = Number(state.outerFrameWidth ?? state.frameWidth);
  if (Number.isFinite(outer)) {
    return clampNumber((outer / 40) * 100, 50, 160, 100);
  }
  return clampNumber(state.artisticFrameWidth, 50, 160, 100);
}

/** Unified 圓角 drives artistic silhouette radius. */
export function resolveArtisticCornerRadius(state = {}){
  const radius = Number(state.cornerRadius);
  if (Number.isFinite(radius)) return Math.max(0, radius);
  return Math.max(0, Number(state.artisticCornerRadius) || 0);
}

/**
 * Select classic outer or inner strip material (single-select per row).
 * role: "outer" | "inner"
 * Tap same item again to clear (inner) or keep outer required.
 */
export function selectClassicFrameRole(currentState, frameTypeId, role = "outer"){
  const type = findFrameType("classic", frameTypeId) || findFrameTypeAnywhere(frameTypeId)?.type;
  const id = type?.id || frameTypeId || null;
  if (!id) return currentState;

  if (role === "inner") {
    const nextInner = currentState.innerFrameTypeId === id ? null : id;
    const patch = {
      selectedCategoryId: "classic",
      activeCategory: "classic",
      innerFrameTypeId: nextInner,
      framePresentation: "classic"
    };
    if (nextInner && (Number(currentState.innerFrameWidth) || 0) <= 0) {
      patch.innerFrameWidth = 16;
    }
    if (!nextInner) {
      patch.innerFrameWidth = 0;
    }
    if (!currentState.outerFrameTypeId) {
      const firstOuter = getClassicOuterFrames()[0]?.id;
      if (firstOuter) {
        patch.outerFrameTypeId = firstOuter;
        patch.classicFrameTypeId = firstOuter;
        patch.frameTypeId = firstOuter;
      }
    } else {
      patch.classicFrameTypeId = currentState.outerFrameTypeId;
      patch.frameTypeId = currentState.outerFrameTypeId;
    }
    return updateFrameState(currentState, patch);
  }

  // Outer: always set (required). Tap same keeps selected.
  const patch = {
    selectedCategoryId: "classic",
    activeCategory: "classic",
    outerFrameTypeId: id,
    classicFrameTypeId: id,
    frameTypeId: id,
    framePresentation: "classic",
    outerFrameWidth: Math.max(4, Number(currentState.outerFrameWidth) || 40)
  };
  return updateFrameState(currentState, patch);
}

/** @deprecated use selectClassicFrameRole / selectArtisticFrame */
export function toggleClassicMaterialSelection(currentState, frameTypeId, categoryId = "classic"){
  if (categoryId === "artistic") {
    return selectArtisticFrame(currentState, frameTypeId);
  }
  const type = findFrameType("classic", frameTypeId) || findFrameTypeAnywhere(frameTypeId)?.type;
  const role = type?.role === "inner" ? "inner" : "outer";
  return selectClassicFrameRole(currentState, frameTypeId, role);
}

export function createDefaultFrameState(){
  const firstOuter = getClassicOuterFrames()[0] || getFrameTypesForCategory("classic")[0];
  const outerId = firstOuter?.id || "classic-1";
  return {
    featureId: FRAME_FEATURE_ID,
    featureVersion: FRAME_FEATURE_VERSION,
    activeCategory: "classic",
    selectedCategoryId: "classic",
    frameTypeId: outerId,
    classicFrameTypeId: outerId,
    outerFrameTypeId: outerId,
    innerFrameTypeId: null,
    artisticFrameId: null,
    framePresentation: "classic",
    selectedParameter: "outerFrameWidth",
    sourceImageDataUrl: null,

    outerFrameWidth: 40,
    innerFrameWidth: 0,
    cornerRadius: 6,
    outerPadding: 0,
    opacity: 100,
    artisticFrameWidth: 100,
    artisticCornerRadius: 0,
    photoScale: 100,
    photoOffsetX: 0,
    photoOffsetY: 0,
    // Legacy aliases (migrated → photo*)
    artisticPhotoScale: 100,
    artisticOffsetX: 0,
    artisticOffsetY: 0,

    // Legacy aliases kept during migration reads
    frameWidth: 40,
    innerPadding: 0,

    activeProfessionalSubTab: "scene",
    gallerySceneId: "wall-3x4-1",
    galleryPhotoScale: 100,
    galleryOffsetX: 0,
    galleryOffsetY: 0,

    galleryLightCount: 1,
    galleryLightPosX: 50,
    galleryLightPosY: 12,
    galleryLightIntensity: 58,
    galleryLightDirection: 270,
    galleryLightDistance: 55,

    galleryTitle: "Untitled",
    galleryAuthor: "",

    updatedAt: Date.now()
  };
}

export function resetFrameAdjustments(currentState){
  const defaults = createDefaultFrameState();
  return updateFrameState(currentState, {
    outerFrameWidth: defaults.outerFrameWidth,
    innerFrameWidth: defaults.innerFrameWidth,
    cornerRadius: defaults.cornerRadius,
    outerPadding: defaults.outerPadding,
    opacity: defaults.opacity,
    artisticFrameWidth: defaults.artisticFrameWidth,
    artisticCornerRadius: defaults.artisticCornerRadius,
    photoScale: defaults.photoScale,
    photoOffsetX: defaults.photoOffsetX,
    photoOffsetY: defaults.photoOffsetY,
    selectedParameter: defaults.selectedParameter,
    galleryPhotoScale: defaults.galleryPhotoScale,
    galleryOffsetX: defaults.galleryOffsetX,
    galleryOffsetY: defaults.galleryOffsetY,
    galleryLightCount: defaults.galleryLightCount,
    galleryLightPosX: defaults.galleryLightPosX,
    galleryLightPosY: defaults.galleryLightPosY,
    galleryLightIntensity: defaults.galleryLightIntensity,
    galleryLightDirection: defaults.galleryLightDirection,
    galleryLightDistance: defaults.galleryLightDistance
  });
}

export function resetGalleryPlacement(currentState){
  return updateFrameState(currentState, {
    galleryPhotoScale: 100,
    galleryOffsetX: 0,
    galleryOffsetY: 0
  });
}

export function normalizeActiveCategory(categoryId){
  if (categoryId === null || categoryId === "" || categoryId === "none") return null;
  if (categoryId === "professional") return "gallery";
  if (["dimensional", "smart", "light"].includes(categoryId)) return null;
  if (FRAME_CATEGORIES.some(item => item.id === categoryId)) return categoryId;
  return "classic";
}

export function normalizeSelectedCategoryId(categoryId){
  if (categoryId === "professional") return "gallery";
  if (categoryId === "adjust") return "classic";
  if (FRAME_MATERIAL_CATEGORIES.includes(categoryId)) return categoryId;
  return "classic";
}

export function normalizeProfessionalSubTab(tabId){
  // Subtabs removed; keep null for drafts.
  void tabId;
  return null;
}

export function updateFrameState(currentState, partial){
  const merged = migrateLegacyFields({
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  });

  const next = merged;

  next.activeCategory = normalizeActiveCategory(next.activeCategory);
  next.selectedCategoryId = normalizeSelectedCategoryId(next.selectedCategoryId);
  next.activeProfessionalSubTab = null;

  if (next.selectedCategoryId === "gallery") {
    next.frameTypeId = "gallery";
  } else if (next.selectedCategoryId === "classic") {
    const outerTypes = getClassicOuterFrames();
    const innerTypes = getClassicInnerFrames();
    const outerIds = new Set(outerTypes.map(item => item.id));
    const innerIds = new Set(innerTypes.map(item => item.id));

    if (next.outerFrameTypeId && outerIds.size && !outerIds.has(next.outerFrameTypeId)) {
      next.outerFrameTypeId = outerTypes[0]?.id || null;
    }
    if (next.innerFrameTypeId && innerIds.size && !innerIds.has(next.innerFrameTypeId)) {
      // Legacy draft may have pointed outer id at inner slot — clear invalid.
      next.innerFrameTypeId = null;
    }
    if (!next.outerFrameTypeId) {
      next.outerFrameTypeId = outerTypes[0]?.id || next.classicFrameTypeId || "classic-1";
    }
    next.classicFrameTypeId = next.outerFrameTypeId || next.innerFrameTypeId;
    next.frameTypeId = next.classicFrameTypeId;
    next.framePresentation = "classic";
  } else if (next.selectedCategoryId === "artistic") {
    const types = getFrameTypesForCategory("artistic");
    if (next.artisticFrameId && types.length && !types.some(item => item.id === next.artisticFrameId)) {
      next.artisticFrameId = types[0]?.id || null;
    }
    next.framePresentation = "artistic";
    if (next.artisticFrameId) {
      next.frameTypeId = next.artisticFrameId;
    }
  }

  if (!next.classicFrameTypeId) {
    next.classicFrameTypeId = next.outerFrameTypeId
      || next.innerFrameTypeId
      || getFrameTypesForCategory("classic")[0]?.id
      || "wood";
  }

  const scenes = getGallerySceneCatalog();
  if (scenes.length && !scenes.some(item => item.id === next.gallerySceneId)) {
    next.gallerySceneId = scenes[0].id;
  }

  const params = [...FRAME_PARAMETERS, ...ARTISTIC_PARAMETERS, ...GALLERY_LIGHT_PARAMETERS];
  const defaults = createDefaultFrameState();
  for (const parameter of params) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, defaults[parameter.id]);
  }

  next.frameWidth = next.outerFrameWidth;
  next.innerPadding = 0;
  next.artisticPhotoScale = next.photoScale;
  next.artisticOffsetX = next.photoOffsetX;
  next.artisticOffsetY = next.photoOffsetY;
  // Keep artistic* mirrors in sync with unified 參數調整.
  next.artisticFrameWidth = resolveArtisticFrameWidthPercent(next);
  next.artisticCornerRadius = resolveArtisticCornerRadius(next);

  // Gallery wall placement also uses unified photo* params.
  next.galleryPhotoScale = clampNumber(next.photoScale, 40, 180, 100);
  next.galleryOffsetX = clampNumber(next.photoOffsetX, -100, 100, 0);
  next.galleryOffsetY = clampNumber(next.photoOffsetY, -100, 100, 0);

  const available = getParametersForContext(next);
  if (!available.some(item => item.id === next.selectedParameter)) {
    next.selectedParameter = available[0]?.id || "outerFrameWidth";
  }

  next.galleryTitle = String(next.galleryTitle ?? "Untitled").slice(0, 80);
  next.galleryAuthor = String(next.galleryAuthor ?? "").slice(0, 80);

  return next;
}

export function applyFrameTypeDefaults(currentState, categoryId, frameTypeId){
  if (categoryId === "classic") {
    const type = findFrameType("classic", frameTypeId);
    const role = type?.role === "inner" ? "inner" : "outer";
    return selectClassicFrameRole(currentState, frameTypeId, role);
  }
  if (categoryId === "artistic") {
    return selectArtisticFrame(currentState, frameTypeId);
  }
  if (categoryId === "gallery" || categoryId === "professional") {
    return updateFrameState(currentState, {
      selectedCategoryId: "gallery",
      activeCategory: "gallery",
      frameTypeId: "gallery"
    });
  }
  return updateFrameState(currentState, {
    selectedCategoryId: categoryId,
    frameTypeId
  });
}

export function pickDefaultGallerySceneId(photoWidth, photoHeight, preferredId){
  const matched = getGalleryScenesForPhoto(photoWidth, photoHeight);
  if (preferredId && matched.some(item => item.id === preferredId)) return preferredId;
  return matched[0]?.id || getGallerySceneCatalog()[0]?.id || "wall-3x4-1";
}

export function saveFrameDraft(state){
  try {
    const {
      sourceImageDataUrl: _omitImage,
      ...params
    } = state || {};
    localStorage.setItem(FRAME_DRAFT_KEY, JSON.stringify({
      ...params,
      sourceImageDataUrl: null,
      featureId: FRAME_FEATURE_ID,
      featureVersion: FRAME_FEATURE_VERSION,
      updatedAt: Date.now()
    }));
  } catch (error) {
    console.warn("[F5 畫框] 無法儲存草稿：", error);
  }
}

export function loadFrameDraft(){
  try {
    const raw = localStorage.getItem(FRAME_DRAFT_KEY)
      || localStorage.getItem("photoEffects.F5_frame.draft.v7")
      || localStorage.getItem("photoEffects.F5_frame.draft.v6")
      || localStorage.getItem("photoEffects.F5_frame.draft.v5");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== FRAME_FEATURE_ID) return null;
    return updateFrameState(createDefaultFrameState(), migrateLegacyFields(parsed));
  } catch (error) {
    console.warn("[F5 畫框] 無法讀取草稿：", error);
    return null;
  }
}

export function clearFrameDraft(){
  try {
    localStorage.removeItem(FRAME_DRAFT_KEY);
    localStorage.removeItem("photoEffects.F5_frame.draft.v7");
    localStorage.removeItem("photoEffects.F5_frame.draft.v6");
    localStorage.removeItem("photoEffects.F5_frame.draft.v5");
  } catch (error) {
    console.warn("[F5 畫框] 無法清除草稿：", error);
  }
}

function migrateLegacyFields(state){
  const next = { ...state };

  if (next.selectedCategoryId === "professional") next.selectedCategoryId = "gallery";
  if (next.activeCategory === "professional") next.activeCategory = "gallery";
  if (["museum", "polaroid", "film"].includes(next.frameTypeId)) next.frameTypeId = "gallery";
  if (["dimensional", "smart", "light"].includes(next.selectedCategoryId)) {
    next.selectedCategoryId = "classic";
  }
  if (["dimensional", "smart", "light"].includes(next.activeCategory)) {
    next.activeCategory = "classic";
  }

  if (next.outerFrameWidth == null && next.frameWidth != null) {
    next.outerFrameWidth = next.frameWidth;
  }
  if (next.innerFrameWidth == null) {
    next.innerFrameWidth = 0;
  }
  if (next.outerFrameTypeId == null && next.innerFrameTypeId == null) {
    next.outerFrameTypeId = next.classicFrameTypeId || next.frameTypeId || null;
  }
  if (next.innerFrameTypeId === undefined) {
    next.innerFrameTypeId = null;
  }
  if (next.selectedParameter === "frameWidth") {
    next.selectedParameter = "outerFrameWidth";
  }
  if (next.selectedParameter === "innerPadding") {
    next.selectedParameter = "innerFrameWidth";
  }
  if (next.artisticFrameId === undefined) next.artisticFrameId = null;
  if (!next.framePresentation) {
    next.framePresentation = next.artisticFrameId ? "artistic" : "classic";
  }
  if (next.photoScale == null) {
    next.photoScale = next.artisticPhotoScale ?? next.galleryPhotoScale ?? 100;
  }
  if (next.photoOffsetX == null) {
    next.photoOffsetX = next.artisticOffsetX ?? next.galleryOffsetX ?? 0;
  }
  if (next.photoOffsetY == null) {
    next.photoOffsetY = next.artisticOffsetY ?? next.galleryOffsetY ?? 0;
  }
  if (next.cornerRadius == null && next.artisticCornerRadius != null) {
    next.cornerRadius = next.artisticCornerRadius;
  }
  // Keep legacy artistic* keys mirrored for older drafts / readers.
  next.artisticPhotoScale = next.photoScale;
  next.artisticOffsetX = next.photoOffsetX;
  next.artisticOffsetY = next.photoOffsetY;
  if (next.artisticFrameWidth == null) next.artisticFrameWidth = 100;
  if (next.artisticCornerRadius == null) next.artisticCornerRadius = 0;
  next.innerPadding = 0;
  next.activeProfessionalSubTab = null;

  return next;
}

function normalizeSceneDefaults(item){
  const file = item.file || `${item.id}.webp`;
  const aspect = item.aspect || inferAspectFromFile(file);
  const asset = item.asset || `./assets/features/F5_frame/gallery/walls/${encodeURIComponent(file)}`;
  return {
    id: item.id || file.replace(/\.webp$/i, ""),
    label: item.label || titleFromId(item.id || file),
    file,
    aspect,
    mount: { ...DEFAULT_MOUNT_RECT, ...(item.mount || {}) },
    asset,
    thumb: item.thumb || asset
  };
}

function inferAspectFromFile(file){
  const name = String(file).toLowerCase();
  if (/wall[-_]?3x4/.test(name) || /(?:^|[^0-9])3x4(?:[^0-9]|$)/.test(name)) return "3x4";
  if (/wall[-_]?4x3/.test(name) || /(?:^|[^0-9])4x3(?:[^0-9]|$)/.test(name)) return "4x3";
  return "3x4";
}

function titleFromId(id){
  return String(id).replace(/[-_]+/g, " ").replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
