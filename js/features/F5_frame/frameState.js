// F5 框住美好 - 狀態管理 v0.3.0
// Classic: dynamic texture manifests.
// Professional Gallery: scene wall (3:4 / 4:3) + framed Layer-2 placement + lights.

export const FRAME_FEATURE_ID = "F5_frame";
export const FRAME_FEATURE_VERSION = "0.3.1";
export const FRAME_DRAFT_KEY = "photoEffects.F5_frame.draft.v5";

export const FRAME_CATEGORIES = [
  { id: "classic", label: "經典畫框" },
  { id: "professional", label: "專業畫框" },
  { id: "artistic", label: "藝術畫框" },
  { id: "dimensional", label: "立體畫框" },
  { id: "smart", label: "智慧畫框" },
  { id: "light", label: "光影氛圍" }
];

export const PROFESSIONAL_TYPES = [
  { id: "gallery", label: "Gallery", enabled: true, swatch: "#eceae4" },
  { id: "museum", label: "Museum", enabled: false, swatch: "#d9e2ec" },
  { id: "polaroid", label: "Polaroid", enabled: false, swatch: "#f4f0e6" },
  { id: "film", label: "Film", enabled: false, swatch: "#1a1a1c" }
];

/** Gallery second-level: scene picker vs light controls (toggle). */
export const GALLERY_SUB_TABS = [
  { id: "scene", label: "展場" },
  { id: "light", label: "燈光" }
];

/** Default mount rect: centered ~60% × 90% of the scene. */
export const DEFAULT_MOUNT_RECT = { x: 0.20, y: 0.05, w: 0.60, h: 0.90 };

/**
 * Placeholder catalog until wall-3x4-*.webp / wall-4x3-*.webp are provided.
 * Aspect is derived from filename pattern.
 */
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

const dynamicFrameTypes = Object.fromEntries(FRAME_CATEGORIES.map(item => [item.id, []]));

export const FRAME_PARAMETERS = [
  { id: "frameWidth", label: "框寬", min: 8, max: 96, step: 1, unit: "px" },
  { id: "cornerRadius", label: "圓角", min: 0, max: 48, step: 1, unit: "px" },
  { id: "innerPadding", label: "內邊距", min: 0, max: 48, step: 1, unit: "px" },
  { id: "outerPadding", label: "外邊距", min: 0, max: 40, step: 1, unit: "px" },
  { id: "opacity", label: "不透明度", min: 40, max: 100, step: 1, unit: "percent" }
];

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

/** Only scenes matching photo orientation: portrait→3x4, landscape→4x3, square→both. */
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
  if (!Object.prototype.hasOwnProperty.call(dynamicFrameTypes, categoryId)) return;
  if (categoryId === "professional") {
    dynamicFrameTypes.professional = PROFESSIONAL_TYPES.map(item => ({
      id: item.id,
      label: item.label,
      materialId: item.id === "film" ? "film" : item.id === "polaroid" ? "polaroid" : "gallery",
      thumb: null,
      swatch: item.swatch,
      enabled: item.enabled,
      isProfessional: true
    }));
    return;
  }
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
  if (categoryId === "professional") {
    return PROFESSIONAL_TYPES.map(item => ({
      id: item.id,
      label: item.label,
      materialId: item.id === "film" ? "film" : item.id === "polaroid" ? "polaroid" : "gallery",
      thumb: null,
      swatch: item.swatch,
      enabled: item.enabled,
      isProfessional: true
    }));
  }
  return dynamicFrameTypes[categoryId] || [];
}

export function findFrameType(categoryId, frameTypeId){
  return getFrameTypesForCategory(categoryId).find(item => item.id === frameTypeId) || null;
}

export function findFrameTypeAnywhere(frameTypeId){
  for (const category of FRAME_CATEGORIES) {
    const hit = findFrameType(category.id, frameTypeId);
    if (hit) return { categoryId: category.id, type: hit };
  }
  return null;
}

export function resolveAppliedFrameType(state){
  if (isProfessionalMode(state)) {
    return findFrameType("professional", state.frameTypeId)
      || findFrameType("professional", "gallery");
  }
  const categoryId = state.selectedCategoryId || state.activeCategory || "classic";
  return findFrameType(categoryId, state.frameTypeId)
    || findFrameTypeAnywhere(state.frameTypeId)?.type
    || getFrameTypesForCategory("classic")[0]
    || getFirstAvailableFrameType()
    || null;
}

/** Classic material still applied when presenting in Gallery (Layer 2 always carries classic frame). */
export function resolveClassicMaterialId(state){
  if (state.classicFrameTypeId) {
    const classic = findFrameType("classic", state.classicFrameTypeId);
    if (classic?.materialId) return classic.materialId;
    return state.classicFrameTypeId;
  }
  if (state.selectedCategoryId === "classic") {
    const type = findFrameType("classic", state.frameTypeId);
    return type?.materialId || state.frameTypeId || "wood";
  }
  const first = getFrameTypesForCategory("classic")[0];
  return first?.materialId || "wood";
}

export function getFirstAvailableFrameType(){
  for (const category of FRAME_CATEGORIES) {
    const first = getFrameTypesForCategory(category.id)[0];
    if (first) return first;
  }
  return null;
}

export function isProfessionalMode(state){
  return state.selectedCategoryId === "professional"
    || ["gallery", "museum", "polaroid", "film"].includes(state.frameTypeId);
}

export function isGalleryMode(state){
  return isProfessionalMode(state) && state.frameTypeId === "gallery";
}

export function getParametersForContext(state){
  if (isGalleryMode(state) && state.activeProfessionalSubTab === "light") {
    return GALLERY_LIGHT_PARAMETERS;
  }
  return FRAME_PARAMETERS;
}

export function createDefaultFrameState(){
  const firstClassic = getFrameTypesForCategory("classic")[0];
  return {
    featureId: FRAME_FEATURE_ID,
    featureVersion: FRAME_FEATURE_VERSION,
    activeCategory: "classic",
    selectedCategoryId: "classic",
    frameTypeId: firstClassic?.id || "wood",
    classicFrameTypeId: firstClassic?.id || "wood",
    selectedParameter: "frameWidth",
    sourceImageDataUrl: null,

    frameWidth: 40,
    cornerRadius: 6,
    innerPadding: 8,
    outerPadding: 12,
    opacity: 100,

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
    frameWidth: defaults.frameWidth,
    cornerRadius: defaults.cornerRadius,
    innerPadding: defaults.innerPadding,
    outerPadding: defaults.outerPadding,
    opacity: defaults.opacity,
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
  if (FRAME_CATEGORIES.some(item => item.id === categoryId)) return categoryId;
  return "classic";
}

export function normalizeSelectedCategoryId(categoryId){
  if (FRAME_CATEGORIES.some(item => item.id === categoryId)) return categoryId;
  return "classic";
}

export function normalizeProfessionalSubTab(tabId){
  if (tabId === null || tabId === "" || tabId === "none") return null;
  if (GALLERY_SUB_TABS.some(item => item.id === tabId)) return tabId;
  return "scene";
}

export function updateFrameState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeCategory = normalizeActiveCategory(next.activeCategory);
  next.selectedCategoryId = normalizeSelectedCategoryId(next.selectedCategoryId);
  next.activeProfessionalSubTab = normalizeProfessionalSubTab(next.activeProfessionalSubTab);

  if (next.selectedCategoryId === "professional") {
    if (!PROFESSIONAL_TYPES.some(item => item.id === next.frameTypeId)) {
      next.frameTypeId = "gallery";
    }
  } else if (next.selectedCategoryId === "classic") {
    next.classicFrameTypeId = next.frameTypeId;
    const types = getFrameTypesForCategory("classic");
    if (types.length && !types.some(item => item.id === next.frameTypeId)) {
      next.frameTypeId = types[0]?.id || "wood";
      next.classicFrameTypeId = next.frameTypeId;
    }
  } else {
    const types = getFrameTypesForCategory(next.selectedCategoryId);
    if (types.length && !types.some(item => item.id === next.frameTypeId)) {
      const found = findFrameTypeAnywhere(next.frameTypeId);
      if (found && found.categoryId !== "professional") {
        next.selectedCategoryId = found.categoryId;
      } else {
        next.frameTypeId = types[0]?.id || getFrameTypesForCategory("classic")[0]?.id || "wood";
      }
    }
  }

  if (!next.classicFrameTypeId) {
    next.classicFrameTypeId = getFrameTypesForCategory("classic")[0]?.id || "wood";
  }

  const scenes = getGallerySceneCatalog();
  if (scenes.length && !scenes.some(item => item.id === next.gallerySceneId)) {
    next.gallerySceneId = scenes[0].id;
  }

  const params = [...FRAME_PARAMETERS, ...GALLERY_LIGHT_PARAMETERS];
  const defaults = createDefaultFrameState();
  for (const parameter of params) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, defaults[parameter.id]);
  }

  next.galleryPhotoScale = clampNumber(next.galleryPhotoScale, 40, 180, 100);
  next.galleryOffsetX = clampNumber(next.galleryOffsetX, -100, 100, 0);
  next.galleryOffsetY = clampNumber(next.galleryOffsetY, -100, 100, 0);

  const available = getParametersForContext(next);
  if (!available.some(item => item.id === next.selectedParameter)) {
    next.selectedParameter = available[0]?.id || "frameWidth";
  }

  next.galleryTitle = String(next.galleryTitle ?? "Untitled").slice(0, 80);
  next.galleryAuthor = String(next.galleryAuthor ?? "").slice(0, 80);

  return next;
}

export function applyFrameTypeDefaults(currentState, categoryId, frameTypeId){
  const type = findFrameType(categoryId, frameTypeId);
  const patch = {
    selectedCategoryId: categoryId,
    frameTypeId: type?.id || frameTypeId
  };
  if (categoryId === "classic") {
    patch.classicFrameTypeId = type?.id || frameTypeId;
  }
  if (categoryId === "professional") {
    patch.activeProfessionalSubTab = frameTypeId === "gallery"
      ? (currentState.activeProfessionalSubTab || "scene")
      : null;
  }
  if (!type) return updateFrameState(currentState, patch);
  return updateFrameState(currentState, {
    ...patch,
    ...(type.defaults || {})
  });
}

export function pickDefaultGallerySceneId(photoWidth, photoHeight, preferredId){
  const matched = getGalleryScenesForPhoto(photoWidth, photoHeight);
  if (preferredId && matched.some(item => item.id === preferredId)) return preferredId;
  return matched[0]?.id || getGallerySceneCatalog()[0]?.id || "wall-3x4-1";
}

export function saveFrameDraft(state){
  try {
    localStorage.setItem(FRAME_DRAFT_KEY, JSON.stringify({
      ...state,
      featureId: FRAME_FEATURE_ID,
      featureVersion: FRAME_FEATURE_VERSION,
      updatedAt: Date.now()
    }));
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
  // Prefer explicit wall-3x4 / wall-4x3 tokens (avoid "wall-3x4-3" matching "4-3").
  if (/(^|[^0-9])3x4([^0-9]|$)/.test(name) || /(^|[^0-9])3-4([^0-9]|$)/.test(name)) return "3x4";
  if (/(^|[^0-9])4x3([^0-9]|$)/.test(name) || /(^|[^0-9])4-3([^0-9]|$)/.test(name)) return "4x3";
  if (name.includes("3x4")) return "3x4";
  if (name.includes("4x3")) return "4x3";
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
