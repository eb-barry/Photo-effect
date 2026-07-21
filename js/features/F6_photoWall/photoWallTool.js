// F6 照片牆 - 繪製與幾何 (Phase 1: 平面合成)

import { getSceneById, getCanvasPhotos } from "./photoWallState.js";
import { resolveSceneImage } from "./photoWallAssets.js";

const imageCache = new Map();

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

export async function loadPhotoImage(dataUrl){
  if (!dataUrl) return null;
  if (imageCache.has(dataUrl)) return imageCache.get(dataUrl);
  const image = await loadImageFromDataUrl(dataUrl);
  imageCache.set(dataUrl, image);
  return image;
}

export function invalidatePhotoImageCache(dataUrl){
  if (dataUrl) imageCache.delete(dataUrl);
}

export async function renderPhotoWall(ctx, state, options = {}){
  const { width, height } = ctx.canvas;
  const scene = getSceneById(state.sceneId);
  const sceneImage = await resolveSceneImage(state.sceneId);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (sceneImage) {
    coverImage(ctx, sceneImage, 0, 0, width, height);
  } else {
    drawProceduralScene(ctx, width, height, scene?.aspect || "3x4");
  }

  const canvasPhotos = getCanvasPhotos(state);
  const overlays = [];

  for (const photo of canvasPhotos) {
    const image = await loadPhotoImage(photo.dataUrl);
    if (!image) continue;
    const bounds = drawPhotoOnWall(ctx, image, photo, width, height);
    overlays.push({ photo, bounds });
  }

  if (!options.omitSelection) {
    overlays.forEach(({ photo, bounds }) => {
      if (photo.checked) drawSelectionGlow(ctx, bounds);
    });
  }

  return overlays;
}

export function hitTestCanvasPhoto(overlays, canvasX, canvasY){
  for (let i = overlays.length - 1; i >= 0; i--) {
    const { photo, bounds } = overlays[i];
    if (pointInRect(canvasX, canvasY, bounds)) return photo;
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

function drawPhotoOnWall(ctx, image, photo, canvasW, canvasH){
  const scale = photo.position.scale;
  const drawW = canvasW * scale;
  const drawH = drawW * (image.height / Math.max(1, image.width));
  const centerX = photo.position.x * canvasW;
  const centerY = photo.position.y * canvasH;
  const drawX = centerX - drawW / 2;
  const drawY = centerY - drawH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = Math.max(6, drawW * 0.03);
  ctx.shadowOffsetY = Math.max(3, drawH * 0.02);

  drawCoverImage(ctx, image, drawX, drawY, drawW, drawH);

  ctx.restore();

  return { x: drawX, y: drawY, w: drawW, h: drawH };
}

function drawSelectionGlow(ctx, bounds){
  const pad = Math.max(3, Math.min(bounds.w, bounds.h) * 0.02);
  ctx.save();
  ctx.strokeStyle = "#ff3b30";
  ctx.lineWidth = Math.max(2.5, Math.min(bounds.w, bounds.h) * 0.012);
  ctx.shadowColor = "rgba(255, 59, 48, 0.85)";
  ctx.shadowBlur = Math.max(8, Math.min(bounds.w, bounds.h) * 0.08);
  ctx.strokeRect(
    bounds.x - pad,
    bounds.y - pad,
    bounds.w + pad * 2,
    bounds.h + pad * 2
  );
  ctx.restore();
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

function coverImage(ctx, image, x, y, width, height){
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
