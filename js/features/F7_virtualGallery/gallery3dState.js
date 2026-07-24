// F7 3D 展館 - 狀態管理 v0.3.0

import { GALLERY3D_ROOM_COUNT } from "./gallery3dRooms.js";

export const GALLERY3D_FEATURE_ID = "F7_virtualGallery";
export const GALLERY3D_FEATURE_VERSION = "0.3.3";
export const GALLERY3D_DRAFT_KEY = "photoEffects.F7_virtualGallery.draft.v3";
export const GALLERY3D_TUTORIAL_KEY = "photoEffects.F7_virtualGallery.tutorial.v1";
export const GALLERY3D_MAX_PHOTOS = 30;
export const GALLERY3D_RECOMMENDED_PHOTOS_PER_ROOM = 10;

export const GALLERY3D_TABS = [
  { id: "gallery", label: "展館" },
  { id: "scene", label: "場景" },
  { id: "photos", label: "相片" }
];

export function createPhotoId(){
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `gallery-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultRoomSettings(){
  return Array.from({ length: GALLERY3D_ROOM_COUNT }, (_, index) => ({
    roomId: index + 1,
    wallTextureId: "wall-01",
    floorTextureId: "floor-01"
  }));
}

export function createDefaultGallery3dState(){
  return {
    featureId: GALLERY3D_FEATURE_ID,
    featureVersion: GALLERY3D_FEATURE_VERSION,
    activeTab: "photos",
    selectedRoomNumber: 1,
    sceneMaterialTarget: null,
    rooms: createDefaultRoomSettings(),
    currentRoomId: 1,
    photos: [],
    gyroEnabled: false,
    gallerySessionReady: false,
    updatedAt: Date.now()
  };
}

export function getRoomSettings(state, roomId){
  const id = Number(roomId);
  return state.rooms.find(room => room.roomId === id)
    || createDefaultRoomSettings().find(room => room.roomId === id);
}

export function updateRoomSettings(state, roomId, partial){
  const id = Number(roomId);
  const rooms = state.rooms.map(room => (
    room.roomId === id ? { ...room, ...partial, roomId: id } : room
  ));
  return updateGallery3dState(state, { rooms });
}

export function toggleSceneMaterialTarget(currentTarget, nextTarget){
  return currentTarget === nextTarget ? null : nextTarget;
}

export function distributePhotosToRooms(photos){
  const total = photos.length;
  if (!total) return [];

  const base = Math.floor(total / GALLERY3D_ROOM_COUNT);
  const extra = total % GALLERY3D_ROOM_COUNT;
  const result = [];
  let index = 0;

  for (let roomIndex = 0; roomIndex < GALLERY3D_ROOM_COUNT; roomIndex += 1) {
    const roomId = roomIndex + 1;
    const quota = base + (roomIndex < extra ? 1 : 0);
    for (let slot = 0; slot < quota; slot += 1) {
      const photo = photos[index];
      if (!photo) break;
      result.push({ ...photo, roomId });
      index += 1;
    }
  }

  return result;
}

export function getPhotoCountsByRoom(photos){
  const counts = Object.fromEntries(
    Array.from({ length: GALLERY3D_ROOM_COUNT }, (_, index) => [index + 1, 0])
  );
  photos.forEach(photo => {
    const roomId = clampRoomNumber(photo.roomId);
    counts[roomId] = (counts[roomId] || 0) + 1;
  });
  return counts;
}

export function hasSeenGalleryTutorial(){
  try {
    return localStorage.getItem(GALLERY3D_TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGalleryTutorialSeen(){
  try {
    localStorage.setItem(GALLERY3D_TUTORIAL_KEY, "1");
  } catch {
    // ignore
  }
}

export function updateGallery3dState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeTab = GALLERY3D_TABS.some(tab => tab.id === next.activeTab)
    ? next.activeTab
    : "photos";

  next.selectedRoomNumber = clampRoomNumber(next.selectedRoomNumber);
  next.currentRoomId = clampRoomNumber(next.currentRoomId);
  next.sceneMaterialTarget = next.sceneMaterialTarget === "floor" || next.sceneMaterialTarget === "wall"
    ? next.sceneMaterialTarget
    : null;

  next.rooms = normalizeRooms(next.rooms);

  if (Array.isArray(next.photos)) {
    const trimmed = next.photos.slice(0, GALLERY3D_MAX_PHOTOS).map(normalizePhotoRecord);
    next.photos = partial && "photos" in partial
      ? distributePhotosToRooms(trimmed)
      : trimmed;
  } else {
    next.photos = [];
  }

  next.gyroEnabled = Boolean(next.gyroEnabled);
  next.gallerySessionReady = Boolean(next.gallerySessionReady);
  return next;
}

export function normalizePhotoRecord(photo){
  return {
    id: photo?.id || createPhotoId(),
    roomId: clampRoomNumber(photo?.roomId || 1),
    aspect: photo?.aspect === "4x3" ? "4x3" : "3x4",
    thumbDataUrl: photo?.thumbDataUrl || null,
    textureDataUrl: photo?.textureDataUrl || photo?.workDataUrl || photo?.dataUrl || null,
    dataUrl: photo?.dataUrl || null
  };
}

function normalizeRooms(rooms){
  const defaults = createDefaultRoomSettings();
  const map = new Map((Array.isArray(rooms) ? rooms : []).map(room => [Number(room.roomId), room]));
  return defaults.map(defaultRoom => {
    const saved = map.get(defaultRoom.roomId) || {};
    return {
      roomId: defaultRoom.roomId,
      wallTextureId: typeof saved.wallTextureId === "string" ? saved.wallTextureId : defaultRoom.wallTextureId,
      floorTextureId: typeof saved.floorTextureId === "string" ? saved.floorTextureId : defaultRoom.floorTextureId
    };
  });
}

function clampRoomNumber(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(GALLERY3D_ROOM_COUNT, Math.round(number)));
}

export function saveGallery3dDraft(state){
  try {
    const saved = {
      featureId: GALLERY3D_FEATURE_ID,
      featureVersion: GALLERY3D_FEATURE_VERSION,
      activeTab: state.activeTab,
      selectedRoomNumber: state.selectedRoomNumber,
      sceneMaterialTarget: state.sceneMaterialTarget,
      rooms: state.rooms,
      currentRoomId: state.currentRoomId,
      gyroEnabled: state.gyroEnabled,
      photoMeta: state.photos.map(photo => ({
        id: photo.id,
        roomId: photo.roomId,
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
      selectedRoomNumber: parsed.selectedRoomNumber,
      sceneMaterialTarget: parsed.sceneMaterialTarget,
      rooms: parsed.rooms,
      currentRoomId: parsed.currentRoomId,
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
