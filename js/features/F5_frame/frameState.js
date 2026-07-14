// F5 框住美好 - 狀態管理 v0.2.0
// Classic: dynamic texture manifests.
// Professional P1: Gallery (wall / light / shadow / shared frame params).

export const FRAME_FEATURE_ID = "F5_frame";
export const FRAME_FEATURE_VERSION = "0.2.0";
export const FRAME_DRAFT_KEY = "photoEffects.F5_frame.draft.v4";

export const FRAME_CATEGORIES = [
  { id: "classic", label: "經典畫框" },
  { id: "professional", label: "專業畫框" },
  { id: "artistic", label: "藝術畫框" },
  { id: "dimensional", label: "立體畫框" },
  { id: "smart", label: "智慧畫框" },
  { id: "light", label: "光影氛圍" }
];

/** Professional presentation templates (not texture-folder driven). */
export const PROFESSIONAL_TYPES = [
  { id: "gallery", label: "Gallery", enabled: true, swatch: "#eceae4" },
  { id: "museum", label: "Museum", enabled: false, swatch: "#d9e2ec" },
  { id: "polaroid", label: "Polaroid", enabled: false, swatch: "#f4f0e6" },
  { id: "film", label: "Film", enabled: false, swatch: "#1a1a1c" }
];

/** Second-level tabs inside Gallery (toggle open/closed). */
export const GALLERY_SUB_TABS = [
  { id: "wall", label: "牆面" },
  { id: "light", label: "燈光" },
  { id: "shadow", label: "陰影" },
  { id: "frame", label: "邊框" }
];

export const GALLERY_LIGHT_MODES = [
  { id: "top", label: "頂部聚光" },
  { id: "left", label: "左側聚光" },
  { id: "right", label: "右側聚光" },
  { id: "soft", label: "柔光漫射" },
  { id: "museum", label: "博物館聚光" }
];

/** Default wall catalog (procedural fallback until WebP assets arrive). */
export const DEFAULT_GALLERY_WALLS = [
  { id: "wall_white", label: "Modern White", file: "wall_white.webp", color: "#f4f3ef" },
  { id: "wall_concrete", label: "Concrete", file: "wall_concrete.webp", color: "#b7b3ab" },
  { id: "wall_black", label: "Black Gallery", file: "wall_black.webp", color: "#1d1e22" },
  { id: "wall_white_wood", label: "White Wood", file: "wall_white_wood.webp", color: "#ebe6da" },
  { id: "wall_stone", label: "Luxury Stone", file: "wall_stone.webp", color: "#cfc7bb" },
  { id: "wall_washi", label: "Japanese Washi", file: "wall_washi.webp", color: "#f2eadc" },
  { id: "wall_nordic", label: "Nordic", file: "wall_nordic.webp", color: "#e7eef2" },
  { id: "wall_industrial", label: "Industrial", file: "wall_industrial.webp", color: "#8f8a84" }
];

let galleryWallCatalog = DEFAULT_GALLERY_WALLS.map(wall => ({
  ...wall,
  asset: `./assets/features/F5_frame/gallery/walls/${encodeURIComponent(wall.file)}`,
  thumb: null
}));

const dynamicFrameTypes = Object.fromEntries(FRAME_CATEGORIES.map(item => [item.id, []]));

export const FRAME_PARAMETERS = [
  { id: "frameWidth", label: "框寬", min: 8, max: 96, step: 1, unit: "px" },
  { id: "cornerRadius", label: "圓角", min: 0, max: 48, step: 1, unit: "px" },
  { id: "innerPadding", label: "內邊距", min: 0, max: 48, step: 1, unit: "px" },
  { id: "outerPadding", label: "外邊距", min: 0, max: 40, step: 1, unit: "px" },
  { id: "opacity", label: "不透明度", min: 40, max: 100, step: 1, unit: "percent" }
];

export const GALLERY_LIGHT_PARAMETERS = [
  { id: "galleryLightIntensity", label: "燈光強度", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryLightRadius", label: "燈光範圍", min: 10, max: 100, step: 1, unit: "percent" },
  { id: "galleryLightWarmth", label: "色溫", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryLightAngle", label: "燈光角度", min: 0, max: 360, step: 1, unit: "degree" },
  { id: "galleryLightShadow", label: "光影強度", min: 0, max: 100, step: 1, unit: "percent" }
];

export const GALLERY_SHADOW_PARAMETERS = [
  { id: "galleryShadowDistance", label: "陰影距離", min: 0, max: 80, step: 1, unit: "px" },
  { id: "galleryShadowBlur", label: "陰影模糊", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryShadowOpacity", label: "陰影不透明", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "galleryShadowDirection", label: "陰影方向", min: 0, max: 360, step: 1, unit: "degree" }
];

export function setGalleryWallCatalog(items = []){
  if (!items.length) {
    galleryWallCatalog = DEFAULT_GALLERY_WALLS.map(wall => ({
      ...wall,
      asset: `./assets/features/F5_frame/gallery/walls/${encodeURIComponent(wall.file)}`,
      thumb: null
    }));
    return;
  }
  galleryWallCatalog = items;
}

export function getGalleryWallCatalog(){
  return galleryWallCatalog;
}

export function getGalleryWallById(wallId){
  return galleryWallCatalog.find(item => item.id === wallId) || galleryWallCatalog[0] || DEFAULT_GALLERY_WALLS[0];
}

export function setFrameTypesFromCatalog(categoryId, catalogItems = []){
  if (!Object.prototype.hasOwnProperty.call(dynamicFrameTypes, categoryId)) return;
  if (categoryId === "professional") {
    // Professional types are template-driven, not texture-folder driven.
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

export function resolveAppliedFrameType(state){
  if (state.selectedCategoryId === "professional" || state.frameTypeId === "gallery"
    || state.frameTypeId === "museum" || state.frameTypeId === "polaroid" || state.frameTypeId === "film") {
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
  if (isGalleryMode(state) && state.activeProfessionalSubTab === "shadow") {
    return GALLERY_SHADOW_PARAMETERS;
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
    selectedParameter: "frameWidth",
    sourceImageDataUrl: null,

    // Shared frame chrome
    frameWidth: 40,
    cornerRadius: 6,
    innerPadding: 8,
    outerPadding: 12,
    opacity: 100,

    // Professional / Gallery
    activeProfessionalSubTab: "wall",
    galleryWallId: "wall_white",
    galleryLightMode: "museum",
    galleryLightIntensity: 62,
    galleryLightRadius: 58,
    galleryLightWarmth: 58,
    galleryLightAngle: 210,
    galleryLightShadow: 42,
    galleryShadowDistance: 28,
    galleryShadowBlur: 48,
    galleryShadowOpacity: 46,
    galleryShadowDirection: 220,
    galleryTitle: "Untitled",
    galleryAuthor: "",
    galleryDate: "",
    galleryEdition: "",

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
    selectedParameter: "frameWidth",
    galleryWallId: defaults.galleryWallId,
    galleryLightMode: defaults.galleryLightMode,
    galleryLightIntensity: defaults.galleryLightIntensity,
    galleryLightRadius: defaults.galleryLightRadius,
    galleryLightWarmth: defaults.galleryLightWarmth,
    galleryLightAngle: defaults.galleryLightAngle,
    galleryLightShadow: defaults.galleryLightShadow,
    galleryShadowDistance: defaults.galleryShadowDistance,
    galleryShadowBlur: defaults.galleryShadowBlur,
    galleryShadowOpacity: defaults.galleryShadowOpacity,
    galleryShadowDirection: defaults.galleryShadowDirection
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
  return "wall";
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

  if (!getGalleryWallCatalog().some(item => item.id === next.galleryWallId)) {
    next.galleryWallId = getGalleryWallCatalog()[0]?.id || "wall_white";
  }
  if (!GALLERY_LIGHT_MODES.some(item => item.id === next.galleryLightMode)) {
    next.galleryLightMode = "museum";
  }

  const params = [
    ...FRAME_PARAMETERS,
    ...GALLERY_LIGHT_PARAMETERS,
    ...GALLERY_SHADOW_PARAMETERS
  ];
  const defaults = createDefaultFrameState();
  for (const parameter of params) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, defaults[parameter.id]);
  }

  const available = getParametersForContext(next);
  if (!available.some(item => item.id === next.selectedParameter)) {
    next.selectedParameter = available[0]?.id || "frameWidth";
  }

  next.galleryTitle = String(next.galleryTitle ?? "Untitled").slice(0, 80);
  next.galleryAuthor = String(next.galleryAuthor ?? "").slice(0, 80);
  next.galleryDate = String(next.galleryDate ?? "").slice(0, 40);
  next.galleryEdition = String(next.galleryEdition ?? "").slice(0, 40);

  return next;
}

export function applyFrameTypeDefaults(currentState, categoryId, frameTypeId){
  const type = findFrameType(categoryId, frameTypeId);
  const patch = {
    selectedCategoryId: categoryId,
    frameTypeId: type?.id || frameTypeId
  };
  if (categoryId === "professional") {
    patch.activeProfessionalSubTab = frameTypeId === "gallery" ? (currentState.activeProfessionalSubTab || "wall") : null;
  }
  if (!type) return updateFrameState(currentState, patch);
  return updateFrameState(currentState, {
    ...patch,
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
