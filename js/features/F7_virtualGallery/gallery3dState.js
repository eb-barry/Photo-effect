// F7 3D 展館 - 狀態管理 v0.1.0

export const GALLERY3D_FEATURE_ID = "F7_virtualGallery";
export const GALLERY3D_FEATURE_VERSION = "0.2.0";
export const GALLERY3D_DRAFT_KEY = "photoEffects.F7_virtualGallery.draft.v2";
export const GALLERY3D_MAX_PHOTOS = 30;

export const GALLERY3D_TABS = [
  { id: "gallery", label: "展館" },
  { id: "scene", label: "場景" },
  { id: "photos", label: "相片" }
];

export function createPhotoId(){
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `gallery-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultGallery3dState(){
  return {
    featureId: GALLERY3D_FEATURE_ID,
    featureVersion: GALLERY3D_FEATURE_VERSION,
    activeTab: "photos",
    wallSceneId: "wall-3x4-1",
    photos: [],
    gyroEnabled: false,
    updatedAt: Date.now()
  };
}

export function updateGallery3dState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  if (GALLERY3D_TABS.some(tab => tab.id === next.activeTab)) {
    // keep
  } else {
    next.activeTab = "photos";
  }

  next.photos = Array.isArray(next.photos)
    ? next.photos.slice(0, GALLERY3D_MAX_PHOTOS).map(normalizePhotoRecord)
    : [];

  next.gyroEnabled = Boolean(next.gyroEnabled);
  next.wallSceneId = typeof next.wallSceneId === "string" && next.wallSceneId
    ? next.wallSceneId
    : createDefaultGallery3dState().wallSceneId;
  return next;
}

export function normalizePhotoRecord(photo){
  return {
    id: photo?.id || createPhotoId(),
    aspect: photo?.aspect === "4x3" ? "4x3" : "3x4",
    thumbDataUrl: photo?.thumbDataUrl || null,
    textureDataUrl: photo?.textureDataUrl || photo?.workDataUrl || photo?.dataUrl || null,
    dataUrl: photo?.dataUrl || null
  };
}

export function saveGallery3dDraft(state){
  try {
    const saved = {
      featureId: GALLERY3D_FEATURE_ID,
      featureVersion: GALLERY3D_FEATURE_VERSION,
      activeTab: state.activeTab,
      wallSceneId: state.wallSceneId,
      gyroEnabled: state.gyroEnabled,
      photoMeta: state.photos.map(photo => ({
        id: photo.id,
        aspect: photo.aspect
      })),
      updatedAt: Date.now()
    };
    localStorage.setItem(GALLERY3D_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F7 3D 展館] 無法儲存草稿：", error);
  }
}

export function loadGallery3dDraft(){
  try {
    const raw = localStorage.getItem(GALLERY3D_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== GALLERY3D_FEATURE_ID) return null;
    return updateGallery3dState(createDefaultGallery3dState(), {
      activeTab: parsed.activeTab,
      wallSceneId: parsed.wallSceneId,
      gyroEnabled: parsed.gyroEnabled,
      photos: []
    });
  } catch (error) {
    console.warn("[F7 3D 展館] 無法讀取草稿：", error);
    return null;
  }
}

export function clearGallery3dDraft(){
  try {
    localStorage.removeItem(GALLERY3D_DRAFT_KEY);
  } catch (error) {
    console.warn("[F7 3D 展館] 無法清除草稿：", error);
  }
}
