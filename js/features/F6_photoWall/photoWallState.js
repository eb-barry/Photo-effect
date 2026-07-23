// F6 照片牆 - 狀態管理 v0.1.0 (Phase 1: 場景 + 多圖平面位置)

import { getPhotoWallScenes } from "./photoWallAssets.js";
import { createDefaultPerspective, transformCornersWithPosition } from "./photoWallWarp.js";

export const PHOTO_WALL_FEATURE_ID = "F6_photoWall";
export const PHOTO_WALL_FEATURE_VERSION = "0.2.1";
export const PHOTO_WALL_DRAFT_KEY = "photoEffects.F6_photoWall.draft.v1";

export const PHOTO_WALL_TABS = [
  { id: "scene", label: "場景" },
  { id: "photo", label: "相片" },
  { id: "position", label: "位置" },
  { id: "perspective", label: "視角" }
];

export const POSITION_PARAMETERS = [
  { id: "scale", label: "照片縮放", min: 8, max: 85, step: 1, suffix: "%", field: "scale", multiply: 0.01 },
  { id: "offsetX", label: "照片水平移動", min: 0, max: 100, step: 1, suffix: "%", field: "x" },
  { id: "offsetY", label: "照片垂直移動", min: 0, max: 100, step: 1, suffix: "%", field: "y" }
];

export const PERSPECTIVE_PARAMETERS = [
  { id: "edgeCurveTop", label: "上緣弧形", min: -100, max: 100, step: 1, suffix: "", field: "top" },
  { id: "edgeCurveBottom", label: "下緣弧形", min: -100, max: 100, step: 1, suffix: "", field: "bottom" }
];

export const DEFAULT_PERSPECTIVE = createDefaultPerspective();

export const DEFAULT_PLACEMENT = {
  x: 0.5,
  y: 0.5,
  scale: 0.28
};

export function createPhotoId(){
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultPhotoWallState(){
  return {
    featureId: PHOTO_WALL_FEATURE_ID,
    featureVersion: PHOTO_WALL_FEATURE_VERSION,
    activeTab: "scene",
    sceneId: null,
    selectedParameter: "scale",
    selectedPerspectiveParameter: "edgeCurveTop",
    sliderAlignMode: "relative",
    photos: [],
    updatedAt: Date.now()
  };
}

export function getSceneById(sceneId){
  const scenes = getPhotoWallScenes();
  return scenes.find(scene => scene.id === sceneId) || null;
}

export function getCanvasPhotos(state){
  return state.photos
    .filter(photo => photo.onCanvas)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
}

export function getLibraryPhotos(state){
  return state.photos;
}

export function isPhotoOnCanvas(state, photoId){
  const photo = state.photos.find(item => item.id === photoId);
  return Boolean(photo?.onCanvas);
}

export function getUsedPhotoIds(state){
  return new Set(state.photos.filter(photo => photo.onCanvas).map(photo => photo.id));
}

export function canEnableTab(tabId, state){
  if (tabId === "scene") return true;
  if (!state.sceneId) return false;
  if (tabId === "photo") return true;
  if (tabId === "position") return state.photos.some(photo => photo.onCanvas);
  if (tabId === "perspective") return state.photos.some(photo => photo.onCanvas);
  return false;
}

export function getCheckedCanvasPhotos(state){
  return getCanvasPhotos(state).filter(photo => photo.checked);
}

export function getPrimaryCheckedPhoto(state){
  const checked = getCheckedCanvasPhotos(state);
  return checked[checked.length - 1] || null;
}

export function bringPhotoToFront(state, photoId){
  const maxZ = Math.max(0, ...state.photos.filter(photo => photo.onCanvas).map(photo => photo.zIndex || 0));
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => (
      photo.id === photoId ? { ...photo, zIndex: maxZ + 1 } : photo
    ))
  });
}

export function movePhotoLayer(state, photoId, direction){
  const canvasPhotos = getCanvasPhotos(state);
  const index = canvasPhotos.findIndex(photo => photo.id === photoId);
  if (index < 0) return state;

  const swapIndex = direction === "forward" ? index + 1 : index - 1;
  if (swapIndex < 0 || swapIndex >= canvasPhotos.length) return state;

  const ordered = [...canvasPhotos];
  const temp = ordered[index].zIndex;
  ordered[index] = { ...ordered[index], zIndex: ordered[swapIndex].zIndex };
  ordered[swapIndex] = { ...ordered[swapIndex], zIndex: temp };

  const zMap = new Map(ordered.map(photo => [photo.id, photo.zIndex]));
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => (
      zMap.has(photo.id) ? { ...photo, zIndex: zMap.get(photo.id) } : photo
    ))
  });
}

export function moveCheckedLayers(state, direction){
  let next = state;
  const checked = getCheckedCanvasPhotos(next);
  const ordered = direction === "forward" ? checked : [...checked].reverse();
  ordered.forEach(photo => {
    next = movePhotoLayer(next, photo.id, direction);
  });
  return next;
}

export function computeSequentialLayout(count, sceneAspect = "3x4"){
  if (count <= 0) return [];

  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const marginX = 0.1;
  const marginY = sceneAspect === "4x3" ? 0.16 : 0.12;
  const gapX = 0.035;
  const gapY = 0.035;
  const availableW = 1 - marginX * 2;
  const availableH = 1 - marginY * 2;
  const cellW = (availableW - gapX * Math.max(0, cols - 1)) / cols;
  const cellH = (availableH - gapY * Math.max(0, rows - 1)) / rows;
  const scale = clamp(Math.min(cellW * 0.94, cellH * 1.1), 0.12, 0.42);

  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = marginX + col * (cellW + gapX) + cellW / 2;
    const y = marginY + row * (cellH + gapY) + cellH / 2;
    return { x: clamp01(x), y: clamp01(y), scale };
  });
}

/** Place on-canvas library photos in selection order. Off-canvas photos are left unchanged. */
export function layoutPhotosOnCanvas(state){
  if (!state.photos.length) return state;

  const scene = getSceneById(state.sceneId);
  const onCanvasPhotos = state.photos.filter(photo => photo.onCanvas);
  if (!onCanvasPhotos.length) return state;

  const layouts = computeSequentialLayout(onCanvasPhotos.length, scene?.aspect || "3x4");
  let layoutIndex = 0;

  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (!photo.onCanvas) return photo;
      const position = layouts[layoutIndex];
      layoutIndex += 1;
      return {
        ...photo,
        checked: false,
        zIndex: layoutIndex,
        position: { ...position }
      };
    }),
    activeTab: state.activeTab === "scene" ? "photo" : state.activeTab
  });
}

export function addPhotosFromFiles(state, entries){
  const nextPhotos = [...state.photos];
  entries.forEach(entry => {
    nextPhotos.push({
      id: createPhotoId(),
      dataUrl: entry.dataUrl,
      workDataUrl: entry.workDataUrl || entry.dataUrl,
      thumbDataUrl: entry.thumbDataUrl || entry.workDataUrl || entry.dataUrl,
      label: entry.label || "照片",
      onCanvas: true,
      checked: false,
      zIndex: 0,
      position: { ...DEFAULT_PLACEMENT },
      perspective: { ...DEFAULT_PERSPECTIVE }
    });
  });
  const withPhotos = updatePhotoWallState(state, {
    photos: nextPhotos,
    activeTab: state.activeTab === "scene" ? "photo" : state.activeTab
  });
  return layoutPhotosOnCanvas(withPhotos);
}

export function placePhotoOnCanvas(state, photoId, position = {}){
  if (isPhotoOnCanvas(state, photoId)) return state;
  const maxZ = Math.max(0, ...state.photos.filter(photo => photo.onCanvas).map(photo => photo.zIndex || 0));
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (photo.id !== photoId) return photo;
      return {
        ...photo,
        onCanvas: true,
        checked: true,
        zIndex: maxZ + 1,
        position: {
          ...photo.position,
          x: clamp01(position.x ?? photo.position.x),
          y: clamp01(position.y ?? photo.position.y),
          scale: position.scale ?? photo.position.scale
        }
      };
    })
  });
}

export function setPhotoCanvasVisibility(state, photoId, visible){
  const onCanvas = Boolean(visible);
  const maxZ = Math.max(0, ...state.photos.filter(photo => photo.onCanvas).map(photo => photo.zIndex || 0));

  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (photo.id !== photoId) return photo;
      if (!onCanvas) {
        return { ...photo, onCanvas: false, checked: false };
      }
      return {
        ...photo,
        onCanvas: true,
        zIndex: photo.zIndex || maxZ + 1
      };
    })
  });
}

export function setPhotoChecked(state, photoId, checked){
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => (
      photo.id === photoId ? { ...photo, checked: Boolean(checked) } : photo
    ))
  });
}

export function togglePhotoChecked(state, photoId){
  const photo = state.photos.find(item => item.id === photoId);
  if (!photo) return state;
  return setPhotoChecked(state, photoId, !photo.checked);
}

export function clearCanvasForSceneChange(state, nextSceneId){
  return updatePhotoWallState(state, {
    sceneId: nextSceneId,
    photos: state.photos.map(photo => ({
      ...photo,
      onCanvas: false,
      checked: false
    })),
    activeTab: "scene"
  });
}

export function applyRelativeAdjustment(state, parameterId, delta){
  const config = POSITION_PARAMETERS.find(item => item.id === parameterId);
  if (!config) return state;

  const targets = getCheckedCanvasPhotos(state);
  if (!targets.length) return state;

  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (!photo.checked || !photo.onCanvas) return photo;
      const before = { ...photo.position };
      const position = { ...photo.position };
      if (config.field === "scale") {
        const next = clamp(position.scale + delta * (config.multiply || 1), 0.08, 0.85);
        position.scale = next;
      } else if (config.field === "x") {
        position.x = clamp01(position.x + delta * 0.01);
      } else if (config.field === "y") {
        position.y = clamp01(position.y + delta * 0.01);
      }
      return transformPhotoWithPosition(photo, before, position);
    })
  });
}

export function applyAbsoluteAdjustment(state, parameterId, value){
  const config = POSITION_PARAMETERS.find(item => item.id === parameterId);
  if (!config) return state;

  const targets = getCheckedCanvasPhotos(state);
  if (!targets.length) return state;

  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (!photo.checked || !photo.onCanvas) return photo;
      const position = { ...photo.position };
      if (config.field === "scale") {
        position.scale = clamp(value * (config.multiply || 1), 0.08, 0.85);
      } else if (config.field === "x") {
        position.x = clamp01(value * 0.01);
      } else if (config.field === "y") {
        position.y = clamp01(value * 0.01);
      }
      return { ...photo, position };
    })
  });
}

export function applyPerspectiveAdjustment(state, parameterId, delta){
  const config = PERSPECTIVE_PARAMETERS.find(item => item.id === parameterId);
  if (!config) return state;

  const targets = getCheckedCanvasPhotos(state);
  if (!targets.length) return state;

  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (!photo.checked || !photo.onCanvas) return photo;
      const edgeCurve = { ...resolveEdgeCurve(photo.perspective) };
      const current = edgeCurve[config.field] || 0;
      edgeCurve[config.field] = clamp(current + delta, -100, 100);
      return {
        ...photo,
        perspective: {
          ...normalizePerspective(photo.perspective),
          customized: true,
          edgeCurve
        }
      };
    })
  });
}

export function getPerspectiveDisplayValue(state, parameterId){
  const config = PERSPECTIVE_PARAMETERS.find(item => item.id === parameterId);
  const primary = getPrimaryCheckedPhoto(state);
  if (!config || !primary) return 0;
  const edgeCurve = resolveEdgeCurve(primary.perspective);
  return Math.round(edgeCurve[config.field] || 0);
}

export function resetPhotoPerspective(state, photoId){
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => (
      photo.id === photoId
        ? { ...photo, perspective: createDefaultPerspective() }
        : photo
    ))
  });
}

export function resetCheckedPerspective(state){
  const checkedIds = new Set(getCheckedCanvasPhotos(state).map(photo => photo.id));
  if (!checkedIds.size) return state;
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => (
      checkedIds.has(photo.id)
        ? { ...photo, perspective: createDefaultPerspective() }
        : photo
    ))
  });
}

export function updatePhotoPerspectiveCorner(state, photoId, handleId, point){
  return updatePhotoWallState(state, {
    photos: state.photos.map(photo => {
      if (photo.id !== photoId) return photo;
      const perspective = normalizePerspective(photo.perspective);
      const corners = { ...(perspective.corners || {}) };
      if (handleId === "top" || handleId === "bottom") {
        const edgeCurve = { ...perspective.edgeCurve };
        const field = handleId === "top" ? "top" : "bottom";
        edgeCurve[field] = clamp(point.edgeCurve ?? edgeCurve[field], -100, 100);
        return {
          ...photo,
          perspective: {
            ...perspective,
            customized: true,
            edgeCurve
          }
        };
      }
      corners[handleId] = { x: point.x, y: point.y };
      return {
        ...photo,
        perspective: {
          ...perspective,
          customized: true,
          corners
        }
      };
    })
  });
}

function transformPhotoWithPosition(photo, before, position){
  let perspective = photo.perspective;
  if (perspective?.customized && perspective.corners) {
    perspective = { ...perspective, corners: transformCornersWithPosition(perspective.corners, before, position) };
  }
  return { ...photo, position, perspective };
}

function resolveEdgeCurve(perspective){
  const curve = perspective?.edgeCurve || {};
  return {
    top: clamp(Number(curve.top) || 0, -100, 100),
    bottom: clamp(Number(curve.bottom) || 0, -100, 100)
  };
}

function normalizePerspective(perspective){
  const base = createDefaultPerspective();
  const source = perspective || {};
  const next = {
    customized: Boolean(source.customized),
    corners: source.corners || null,
    edgeCurve: resolveEdgeCurve(source)
  };
  if (next.corners) {
    const corners = {};
    ["tl", "tr", "br", "bl"].forEach(key => {
      const point = next.corners[key];
      if (point) {
        corners[key] = {
          x: clamp(Number(point.x) || 0, -0.25, 1.25),
          y: clamp(Number(point.y) || 0, -0.25, 1.25)
        };
      }
    });
    next.corners = Object.keys(corners).length === 4 ? corners : null;
  } else {
    next.corners = null;
  }
  if (!next.customized) next.corners = null;
  return next;
}

export function getParameterDisplayValue(state, parameterId){
  const config = POSITION_PARAMETERS.find(item => item.id === parameterId);
  const primary = getPrimaryCheckedPhoto(state);
  if (!config || !primary) {
    if (config?.field === "scale") return 28;
    return 50;
  }
  if (config.field === "scale") return Math.round(primary.position.scale * 100);
  if (config.field === "x") return Math.round(primary.position.x * 100);
  if (config.field === "y") return Math.round(primary.position.y * 100);
  return 0;
}

export function updatePhotoWallState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeTab = PHOTO_WALL_TABS.some(tab => tab.id === next.activeTab) ? next.activeTab : "scene";
  next.selectedParameter = POSITION_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "scale";
  next.selectedPerspectiveParameter = PERSPECTIVE_PARAMETERS.some(item => item.id === next.selectedPerspectiveParameter)
    ? next.selectedPerspectiveParameter
    : "edgeCurveTop";
  next.sliderAlignMode = next.sliderAlignMode === "absolute" ? "absolute" : "relative";

  if (next.sceneId) {
    const scene = getSceneById(next.sceneId);
    if (!scene) next.sceneId = null;
  }

  next.photos = (next.photos || []).map(normalizePhotoRecord);

  if (!canEnableTab(next.activeTab, next)) {
    if (canEnableTab("photo", next)) next.activeTab = "photo";
    else if (canEnableTab("scene", next)) next.activeTab = "scene";
    else next.activeTab = "scene";
  }

  return next;
}

function normalizePhotoRecord(photo){
  const position = {
    ...DEFAULT_PLACEMENT,
    ...(photo.position || {})
  };
  position.x = clamp01(position.x);
  position.y = clamp01(position.y);
  position.scale = clamp(position.scale, 0.08, 0.85);

  return {
    id: photo.id || createPhotoId(),
    dataUrl: photo.dataUrl || null,
    workDataUrl: photo.workDataUrl || photo.dataUrl || null,
    thumbDataUrl: photo.thumbDataUrl || photo.workDataUrl || photo.dataUrl || null,
    label: String(photo.label || "照片").slice(0, 40),
    onCanvas: Boolean(photo.onCanvas),
    checked: Boolean(photo.checked),
    zIndex: Number.isFinite(Number(photo.zIndex)) ? Number(photo.zIndex) : 0,
    position,
    perspective: normalizePerspective(photo.perspective)
  };
}

export function savePhotoWallDraft(state){
  try {
    localStorage.setItem(PHOTO_WALL_DRAFT_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[F6 照片牆] 草稿儲存失敗：", error);
  }
}

export function loadPhotoWallDraft(){
  try {
    const raw = localStorage.getItem(PHOTO_WALL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return updatePhotoWallState(createDefaultPhotoWallState(), parsed);
  } catch {
    return null;
  }
}

export function clearPhotoWallDraft(){
  try {
    localStorage.removeItem(PHOTO_WALL_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function clamp01(value){
  return clamp(value, 0, 1);
}
