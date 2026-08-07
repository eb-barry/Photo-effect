// F7 3D 展館 - 專案 JSON 匯出／匯入

import {
  GALLERY3D_FEATURE_ID,
  GALLERY3D_FEATURE_VERSION,
  createDefaultGallery3dState,
  normalizePhotoRecord,
  updateGallery3dState
} from "./gallery3dState.js";

export const GALLERY3D_PROJECT_FILE_EXTENSION = ".json";

export function isGalleryProjectFile(file){
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return file.type === "application/json" || name.endsWith(GALLERY3D_PROJECT_FILE_EXTENSION);
}

export function buildGalleryProjectFilename(date = new Date()){
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `3d-gallery-${stamp}${GALLERY3D_PROJECT_FILE_EXTENSION}`;
}

export function serializeGallery3dProject(state){
  return {
    featureId: GALLERY3D_FEATURE_ID,
    featureVersion: GALLERY3D_FEATURE_VERSION,
    exportedAt: new Date().toISOString(),
    selectedRoomNumber: state.selectedRoomNumber,
    currentRoomId: state.currentRoomId,
    sceneMaterialTarget: state.sceneMaterialTarget,
    rooms: state.rooms,
    photoOrder: state.photos.map(photo => photo.id),
    photos: state.photos.map(photo => ({
      id: photo.id,
      roomId: photo.roomId,
      aspect: photo.aspect,
      width: photo.width,
      height: photo.height,
      textureDataUrl: photo.textureDataUrl,
      thumbDataUrl: photo.thumbDataUrl,
      dataUrl: photo.dataUrl || null
    }))
  };
}

export function parseGallery3dProject(raw){
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") {
    throw new Error("檔案格式不正確。");
  }
  if (data.featureId !== GALLERY3D_FEATURE_ID) {
    throw new Error("這不是 3D 展館專案檔。");
  }
  if (!Array.isArray(data.rooms)) {
    throw new Error("專案檔缺少展間設定。");
  }
  if (!Array.isArray(data.photos)) {
    throw new Error("專案檔缺少照片資料。");
  }
  return data;
}

function orderProjectPhotos(project){
  const photos = project.photos.map(normalizePhotoRecord);
  const missingTextures = photos.filter(photo => !photo.textureDataUrl);
  if (missingTextures.length) {
    throw new Error("專案檔缺少可用的照片資料。");
  }
  if (!Array.isArray(project.photoOrder) || !project.photoOrder.length) {
    return photos;
  }

  const byId = new Map(photos.map(photo => [photo.id, photo]));
  const ordered = project.photoOrder
    .map(id => byId.get(id))
    .filter(Boolean);

  photos.forEach(photo => {
    if (!ordered.some(entry => entry.id === photo.id)) {
      ordered.push(photo);
    }
  });

  return ordered;
}

export function applyGallery3dProject(currentState, project){
  const parsed = parseGallery3dProject(project);
  const photos = orderProjectPhotos(parsed);

  return updateGallery3dState(currentState, {
    selectedRoomNumber: parsed.selectedRoomNumber,
    currentRoomId: parsed.currentRoomId,
    sceneMaterialTarget: parsed.sceneMaterialTarget,
    rooms: parsed.rooms,
    photos,
    activeTab: "scene",
    gallerySessionReady: false,
    gyroEnabled: false
  }, { preservePhotoRoomIds: true });
}

export function createGallery3dStateFromProject(project){
  return applyGallery3dProject(createDefaultGallery3dState(), project);
}
