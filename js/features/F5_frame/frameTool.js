// F5 框住美好 - Canvas 影像處理 v0.3.2
// Preview path is optimized: Layer-2 cache, lower max edge, fast gesture mode.

import {
  mapStyleToMaterial,
  renderFramedPhoto,
  renderGalleryPresentation,
  resolveFramedOutputSize,
  resolveGalleryOutputSize
} from "../../core/frameRenderer.js";
import { resolveGallerySceneImage } from "./galleryAssets.js";
import { loadTextureForMaterial } from "./frameAssets.js";
import {
  getGallerySceneById,
  isGalleryMode,
  pickDefaultGallerySceneId,
  resolveAppliedFrameType,
  resolveClassicMaterialId,
  resolvePhotoAspectKey
} from "./frameState.js";

/** Preview/editor max edge — keep well below native wall textures (1536–2048). */
export const FRAME_PREVIEW_MAX_EDGE = 1080;
export const FRAME_EXPORT_MAX_EDGE = 1600;
export const FRAME_MAX_EDGE = FRAME_PREVIEW_MAX_EDGE;
export const FRAME_OUTPUT_WIDTH = 1200;
export const FRAME_OUTPUT_HEIGHT = 1600;

/** @type {{ key: string|null, layer: HTMLCanvasElement|null, contentKey: string|null, contentCanvas: HTMLCanvasElement|null }} */
const layerCache = {
  key: null,
  layer: null,
  contentKey: null,
  contentCanvas: null
};

/** Downscaled scene bitmaps keyed by sceneId + target size. */
const scenePreviewCache = new Map();

export function invalidateFrameLayerCache(){
  layerCache.key = null;
  layerCache.layer = null;
  layerCache.contentKey = null;
  layerCache.contentCanvas = null;
  scenePreviewCache.clear();
}

export function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject) => {
    if (!dataUrl) {
      reject(new Error("Missing image data URL"));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

export function resolveContentSize(image, maxEdge = FRAME_MAX_EDGE){
  if (!image?.width || !image?.height) {
    return { width: FRAME_OUTPUT_WIDTH, height: FRAME_OUTPUT_HEIGHT };
  }
  const ratio = image.width / image.height;
  if (ratio >= 1) {
    const width = Math.min(image.width, maxEdge);
    const height = Math.max(1, Math.round(width / ratio));
    return { width, height };
  }
  const height = Math.min(image.height, maxEdge);
  const width = Math.max(1, Math.round(height * ratio));
  return { width, height };
}

export function resolveFrameCanvasSize(contentSize, state, maxEdge = FRAME_MAX_EDGE){
  if (isGalleryMode(state)) {
    const scene = getGallerySceneById(state.gallerySceneId);
    const aspect = scene?.aspect || resolvePhotoAspectKey(contentSize.width, contentSize.height);
    return resolveGalleryOutputSize(contentSize.width, contentSize.height, {
      aspect,
      maxEdge
    });
  }

  const type = resolveAppliedFrameType(state);
  return resolveFramedOutputSize(contentSize.width, contentSize.height, {
    frameWidth: state.frameWidth,
    innerPadding: state.innerPadding,
    outerPadding: state.outerPadding,
    shadow: 32,
    frameStyle: type?.id || state.frameTypeId
  });
}

function classicLayerCacheKey(state, contentSize){
  return [
    resolveClassicMaterialId(state),
    contentSize.width,
    contentSize.height,
    Math.round(Number(state.frameWidth) || 0),
    Math.round(Number(state.cornerRadius) || 0),
    Math.round(Number(state.innerPadding) || 0),
    Math.round(Number(state.outerPadding) || 0),
    Math.round(Number(state.opacity) || 100)
  ].join("|");
}

function getOrBuildContentCanvas(sourceImage, contentSize){
  const contentKey = `${contentSize.width}x${contentSize.height}|${sourceImage.width}x${sourceImage.height}`;
  if (layerCache.contentKey === contentKey && layerCache.contentCanvas) {
    return layerCache.contentCanvas;
  }
  const contentCanvas = document.createElement("canvas");
  contentCanvas.width = contentSize.width;
  contentCanvas.height = contentSize.height;
  contentCanvas.getContext("2d").drawImage(sourceImage, 0, 0, contentSize.width, contentSize.height);
  layerCache.contentKey = contentKey;
  layerCache.contentCanvas = contentCanvas;
  return contentCanvas;
}

async function buildClassicFramedLayer(sourceImage, state, contentSize){
  const materialId = resolveClassicMaterialId(state);
  const textureImage = await loadTextureForMaterial(materialId);
  const framedSize = resolveFramedOutputSize(contentSize.width, contentSize.height, {
    frameWidth: state.frameWidth,
    innerPadding: state.innerPadding,
    outerPadding: Math.max(4, state.outerPadding || 8),
    shadow: 28,
    frameStyle: materialId
  });

  const layer = document.createElement("canvas");
  layer.width = framedSize.width;
  layer.height = framedSize.height;
  const layerCtx = layer.getContext("2d");
  const contentCanvas = getOrBuildContentCanvas(sourceImage, contentSize);

  renderFramedPhoto(layerCtx, contentCanvas, {
    frameStyle: materialId,
    materialId,
    frameWidth: state.frameWidth,
    cornerRadius: state.cornerRadius,
    innerPadding: state.innerPadding,
    outerPadding: Math.max(4, state.outerPadding || 8),
    shadow: 28,
    opacity: (Number(state.opacity) || 100) / 100,
    textureImage,
    contentWidth: contentSize.width,
    contentHeight: contentSize.height
  });

  return layer;
}

async function getOrBuildClassicFramedLayer(sourceImage, state, contentSize){
  const key = classicLayerCacheKey(state, contentSize);
  if (layerCache.key === key && layerCache.layer) {
    return layerCache.layer;
  }
  const layer = await buildClassicFramedLayer(sourceImage, state, contentSize);
  layerCache.key = key;
  layerCache.layer = layer;
  return layer;
}

/**
 * Downscale a full-res wall image once so gallery redraws sample a smaller bitmap.
 */
function getScenePreviewImage(sceneImage, targetWidth, targetHeight){
  if (!sceneImage) return null;
  const tw = Math.max(1, Math.round(targetWidth));
  const th = Math.max(1, Math.round(targetHeight));
  // Only downscale when source is meaningfully larger than the canvas.
  if (sceneImage.width <= tw * 1.15 && sceneImage.height <= th * 1.15) {
    return sceneImage;
  }

  const cacheKey = `${sceneImage.src || sceneImage.width}|${tw}x${th}`;
  if (scenePreviewCache.has(cacheKey)) {
    return scenePreviewCache.get(cacheKey);
  }

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  // cover-fit into preview size
  const scale = Math.max(tw / sceneImage.width, th / sceneImage.height);
  const dw = sceneImage.width * scale;
  const dh = sceneImage.height * scale;
  const dx = (tw - dw) / 2;
  const dy = (th - dh) / 2;
  ctx.drawImage(sceneImage, dx, dy, dw, dh);
  scenePreviewCache.set(cacheKey, canvas);
  // Bound memory: keep a handful of scene previews.
  while (scenePreviewCache.size > 8) {
    const oldest = scenePreviewCache.keys().next().value;
    scenePreviewCache.delete(oldest);
  }
  return canvas;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} sourceImage
 * @param {object} state
 * @param {{ fastPreview?: boolean, maxEdge?: number }} [options]
 */
export async function renderFrameStudio(ctx, sourceImage, state, options = {}){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const fastPreview = Boolean(options.fastPreview);
  const maxEdge = Number(options.maxEdge) || FRAME_MAX_EDGE;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  const contentSize = resolveContentSize(sourceImage, maxEdge);

  if (isGalleryMode(state)) {
    const aspect = resolvePhotoAspectKey(contentSize.width, contentSize.height);
    const sceneId = pickDefaultGallerySceneId(contentSize.width, contentSize.height, state.gallerySceneId);
    const scene = getGallerySceneById(sceneId);
    const sceneImageFull = await resolveGallerySceneImage(sceneId);
    const sceneImage = getScenePreviewImage(sceneImageFull, width, height);
    const framedLayer = await getOrBuildClassicFramedLayer(sourceImage, state, contentSize);

    renderGalleryPresentation(ctx, framedLayer, {
      sceneImage,
      aspect: scene?.aspect || aspect,
      mount: scene?.mount,
      galleryPhotoScale: state.galleryPhotoScale,
      galleryOffsetX: state.galleryOffsetX,
      galleryOffsetY: state.galleryOffsetY,
      galleryLightCount: state.galleryLightCount,
      galleryLightPosX: state.galleryLightPosX,
      galleryLightPosY: state.galleryLightPosY,
      galleryLightIntensity: state.galleryLightIntensity,
      galleryLightDirection: state.galleryLightDirection,
      galleryLightDistance: state.galleryLightDistance,
      fastPreview
    });
    return;
  }

  const type = resolveAppliedFrameType(state);
  const frameStyle = type?.id || state.frameTypeId;
  const materialId = type?.materialId || mapStyleToMaterial(frameStyle);
  const textureImage = await loadTextureForMaterial(materialId);
  const contentCanvas = getOrBuildContentCanvas(sourceImage, contentSize);

  renderFramedPhoto(ctx, contentCanvas, {
    frameStyle,
    materialId,
    frameWidth: state.frameWidth,
    cornerRadius: state.cornerRadius,
    innerPadding: state.innerPadding,
    outerPadding: state.outerPadding,
    shadow: 32,
    opacity: (Number(state.opacity) || 100) / 100,
    textureImage,
    contentWidth: contentSize.width,
    contentHeight: contentSize.height
  });
}

function drawEmptyState(ctx, width, height){
  ctx.fillStyle = "#eef6f5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0a6e6a";
  ctx.font = "600 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("框住美好", width / 2, height / 2);
}
