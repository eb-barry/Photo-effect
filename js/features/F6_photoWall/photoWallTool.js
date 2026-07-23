// F6 照片牆 - 繪製與幾何 (Phase 2: 透視／弧形合成)

import { getSceneById, getCanvasPhotos } from "./photoWallState.js";
import { resolveSceneImage } from "./photoWallAssets.js";
import {
  cornersToCanvas,
  drawWarpedPhoto,
  drawWarpHandles,
  drawWarpOutline,
  getWarpHandles,
  hitTestWarpHandle,
  hitTestWarpPhoto,
  resolvePhotoCorners,
  resolvePhotoEdgeCurve
} from "./photoWallWarp.js";

export const WORK_IMAGE_MAX_EDGE = 1024;
export const THUMB_IMAGE_MAX_EDGE = 256;
export const EXPORT_IMAGE_MAX_EDGE = 4096;

const imageCache = new Map();
const sceneLayerCache = new Map();

export function resolvePhotoWallOutputSize(sceneId, maxEdge = 1080){
  const scene = getSceneById(sceneId);
  const aspect = scene?.aspect || "3x4";
  if (aspect === "4x3") {
    const width = maxEdge;
    const height = Math.round(width * 3 / 4);
    return { width, height, aspect: "4x3" };
  }
  const height = maxEdge;
  const width = Math.round(height * 3 / 4);
  return { width, height, aspect: "3x4" };
}

export function invalidateSceneLayerCache(sceneId = null){
  if (!sceneId) {
    sceneLayerCache.clear();
    return;
  }
  [...sceneLayerCache.keys()].forEach(key => {
    if (key.startsWith(`${sceneId}:`)) sceneLayerCache.delete(key);
  });
}

export function invalidatePhotoImageCache(dataUrl){
  if (!dataUrl) return;
  [...imageCache.keys()].forEach(key => {
    if (key === dataUrl || key.endsWith(`|${dataUrl}`)) imageCache.delete(key);
  });
}

export async function createScaledDataUrl(sourceDataUrl, maxEdge, mimeType = "image/jpeg", quality = 0.88){
  if (!sourceDataUrl) return sourceDataUrl;
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) return sourceDataUrl;

  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(mimeType, quality);
}

export async function preparePhotoVariants(dataUrl){
  const [workDataUrl, thumbDataUrl] = await Promise.all([
    createScaledDataUrl(dataUrl, WORK_IMAGE_MAX_EDGE),
    createScaledDataUrl(dataUrl, THUMB_IMAGE_MAX_EDGE, "image/jpeg", 0.82)
  ]);
  return { dataUrl, workDataUrl, thumbDataUrl };
}

export function getPhotoSourceKey(photo, options = {}){
  const useOriginal = Boolean(options.useOriginal);
  if (useOriginal) return photo.dataUrl;
  return photo.workDataUrl || photo.dataUrl;
}

export async function loadPhotoImage(photo, options = {}){
  const source = getPhotoSourceKey(photo, options);
  if (!source) return null;

  const cacheKey = `${options.useOriginal ? "full" : "work"}|${source}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const image = await loadImageFromDataUrl(source);
  imageCache.set(cacheKey, image);
  return image;
}

export async function renderPhotoWall(ctx, state, options = {}){
  const { width, height } = ctx.canvas;
  const fastPreview = Boolean(options.fastPreview);
  const useOriginal = Boolean(options.useOriginal);
  const showPerspectiveHandles = Boolean(options.showPerspectiveHandles);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  await drawSceneLayer(ctx, state, width, height);

  const canvasPhotos = getCanvasPhotos(state);
  const overlays = [];

  for (const photo of canvasPhotos) {
    const image = await loadPhotoImage(photo, { useOriginal });
    if (!image) continue;
    const corners = resolvePhotoCorners(photo, image, width, height);
    const edgeCurve = resolvePhotoEdgeCurve(photo);
    const bounds = drawWarpedPhoto(ctx, image, corners, edgeCurve, width, height, { fastPreview });
    const cornersPx = cornersToCanvas(corners, width, height);
    const handles = getWarpHandles(cornersPx, edgeCurve);
    overlays.push({ photo, bounds, corners, edgeCurve, handles, canvasW: width, canvasH: height });
  }

  if (!options.omitSelection) {
    overlays.forEach(entry => {
      if (!entry.photo.checked) return;
      drawWarpOutline(ctx, entry.corners, entry.edgeCurve, width, height, {
        color: "#ff3b30",
        lineWidth: fastPreview ? 2 : 2.5,
        glow: fastPreview ? 0 : Math.max(8, Math.min(entry.bounds.w, entry.bounds.h) * 0.08)
      });
    });
  }

  if (showPerspectiveHandles) {
    overlays.forEach(entry => {
      if (!entry.photo.checked) return;
      drawWarpHandles(ctx, entry.handles);
    });
  }

  return overlays;
}

async function drawSceneLayer(ctx, state, width, height){
  const scene = getSceneById(state.sceneId);
  const cacheKey = `${state.sceneId}:${width}x${height}`;
  let layer = sceneLayerCache.get(cacheKey);

  if (!layer) {
    layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    const layerCtx = layer.getContext("2d", { alpha: false });
    const sceneImage = await resolveSceneImage(state.sceneId);
    if (sceneImage) {
      coverImage(layerCtx, sceneImage, 0, 0, width, height);
    } else {
      drawProceduralScene(layerCtx, width, height, scene?.aspect || "3x4");
    }
    sceneLayerCache.set(cacheKey, layer);
  }

  ctx.drawImage(layer, 0, 0);
}

export function hitTestCanvasPhoto(overlays, canvasX, canvasY){
  for (let i = overlays.length - 1; i >= 0; i--) {
    const { photo, corners, edgeCurve, bounds, canvasW, canvasH } = overlays[i];
    const cornersPx = cornersToCanvas(corners, canvasW, canvasH);
    if (hitTestWarpPhoto(cornersPx, edgeCurve, canvasX, canvasY)) return photo;
    if (bounds && pointInRect(canvasX, canvasY, bounds)) return photo;
  }
  return null;
}

export function hitTestPerspectiveHandle(overlays, canvasX, canvasY){
  for (let i = overlays.length - 1; i >= 0; i--) {
    const { photo, handles } = overlays[i];
    if (!photo.checked || !handles) continue;
    const handleId = hitTestWarpHandle(handles, canvasX, canvasY);
    if (handleId) return { photo, handleId };
  }
  return null;
}

export function clientToCanvasPoint(canvas, clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

export function normalizedPointFromCanvas(canvas, clientX, clientY){
  const point = clientToCanvasPoint(canvas, clientX, clientY);
  return {
    x: clamp(point.x / canvas.width, 0, 1),
    y: clamp(point.y / canvas.height, 0, 1)
  };
}

export function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("讀取照片失敗"));
    reader.readAsDataURL(file);
  });
}

function coverImage(ctx, image, x, y, width, height){
  drawCoverImage(ctx, image, x, y, width, height);
}

function drawCoverImage(ctx, image, x, y, width, height){
  const sourceAspect = image.width / Math.max(1, image.height);
  const targetAspect = width / Math.max(1, height);
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (sourceAspect > targetAspect) {
    sw = image.height * targetAspect;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetAspect;
    sy = (image.height - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawProceduralScene(ctx, width, height, aspect){
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#dfe5ea");
  sky.addColorStop(1, "#b8c0c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const slabW = width * (aspect === "4x3" ? 0.72 : 0.62);
  const slabH = height * 0.82;
  const slabX = (width - slabW) / 2;
  const slabY = (height - slabH) / 2;
  const marble = ctx.createLinearGradient(slabX, slabY, slabX + slabW, slabY + slabH);
  marble.addColorStop(0, "#f6f3ee");
  marble.addColorStop(0.5, "#ebe6de");
  marble.addColorStop(1, "#d9d2c8");
  ctx.fillStyle = marble;
  ctx.fillRect(slabX, slabY, slabW, slabH);

  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(slabX + 8, slabY + 8, slabW - 16, slabH - 16);
}

function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("照片載入失敗"));
    image.src = dataUrl;
  });
}

function pointInRect(x, y, rect){
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, Number(value) || 0));
}
