// F5 畫框 - Canvas 影像處理 v0.4.7
// Classic / artistic bake; gallery places the whole framed composite on the wall.

import {
  mapStyleToMaterial,
  renderArtisticFramedPhoto,
  renderFramedPhoto,
  renderGalleryPresentation,
  resolveArtisticOutputSize,
  resolveFramedOutputSize,
  resolveGalleryOutputSize
} from "../../core/frameRenderer.js";
import { resolveGallerySceneImage } from "./galleryAssets.js";
import { loadTextureForMaterial } from "./frameAssets.js";
import {
  getArtisticFrameById,
  getGallerySceneById,
  isArtisticMode,
  isGalleryMode,
  pickDefaultGallerySceneId,
  resolveAppliedFrameType,
  resolveArtisticCornerRadius,
  resolveArtisticFrameWidthPercent,
  resolveClassicInnerMaterialId,
  resolveClassicOuterMaterialId,
  resolveGalleryPlacement,
  resolvePhotoAspectKey,
  resolvePhotoPlacement
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

function classicChromeParams(state, { forGallery = false } = {}){
  const adjust = state.classicAdjust || state;
  const outerMaterialId = resolveClassicOuterMaterialId(state);
  const innerMaterialId = resolveClassicInnerMaterialId(state);
  let outerFrameWidth = Math.max(0, Number(adjust.outerFrameWidth ?? adjust.frameWidth ?? state.frameWidth) || 0);
  let innerFrameWidth = Math.max(0, Number(adjust.innerFrameWidth) || 0);

  if (!outerMaterialId) outerFrameWidth = 0;
  if (!innerMaterialId) innerFrameWidth = 0;

  // Inner-only: draw a single ring using inner material + its width (or outer width as fallback).
  if (!outerMaterialId && innerMaterialId && innerFrameWidth <= 0) {
    innerFrameWidth = Math.max(4, Number(adjust.outerFrameWidth ?? state.frameWidth) || 40);
  }
  if (outerMaterialId && outerFrameWidth <= 0) {
    outerFrameWidth = 40;
  }

  const outerPadding = Math.max(0, Number(adjust.outerPadding) || 0);

  return {
    outerMaterialId,
    innerMaterialId,
    outerFrameWidth,
    innerFrameWidth,
    outerPadding,
    cornerRadius: Math.max(0, Number(adjust.cornerRadius) || 0),
    opacity: (Number(adjust.opacity) || 100) / 100,
    shadow: forGallery ? 22 : 32,
    transparentBackground: forGallery
  };
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

  if (isArtisticMode(state) && state.artisticFrameId) {
    const art = getArtisticFrameById(state.artisticFrameId);
    const aspect = art?.aspect
      || resolvePhotoAspectKey(contentSize.width, contentSize.height);
    return resolveArtisticOutputSize({ aspect, maxEdge });
  }

  if (isArtisticMode(state)) {
    const aspect = resolvePhotoAspectKey(contentSize.width, contentSize.height);
    return resolveArtisticOutputSize({ aspect, maxEdge });
  }

  const chrome = classicChromeParams(state, { forGallery: false });
  const drawOuterWidth = chrome.outerMaterialId
    ? chrome.outerFrameWidth
    : chrome.innerFrameWidth;
  const drawInnerWidth = chrome.outerMaterialId ? chrome.innerFrameWidth : 0;
  const type = resolveAppliedFrameType(state);
  return resolveFramedOutputSize(contentSize.width, contentSize.height, {
    ...chrome,
    outerFrameWidth: drawOuterWidth,
    innerFrameWidth: drawInnerWidth,
    frameStyle: type?.id || state.frameTypeId
  });
}

function classicLayerCacheKey(state, contentSize){
  const adjust = state.classicAdjust || state;
  const place = resolvePhotoPlacement(adjust);
  return [
    "classic",
    resolveClassicOuterMaterialId(state),
    resolveClassicInnerMaterialId(state) || "-",
    contentSize.width,
    contentSize.height,
    Math.round(Number(adjust.outerFrameWidth ?? state.frameWidth) || 0),
    Math.round(Number(adjust.innerFrameWidth) || 0),
    Math.round(Number(adjust.cornerRadius) || 0),
    Math.round(Number(adjust.outerPadding) || 0),
    Math.round(place.photoScale),
    Math.round(place.photoOffsetX),
    Math.round(place.photoOffsetY),
    Math.round(Number(adjust.opacity) || 100)
  ].join("|");
}

function artisticLayerCacheKey(state, outputSize){
  const adjust = state.artisticAdjust || state;
  const place = resolvePhotoPlacement(adjust);
  return [
    "artistic",
    state.artisticFrameId || "-",
    outputSize.width,
    outputSize.height,
    Math.round(resolveArtisticFrameWidthPercent(adjust)),
    Math.round(resolveArtisticCornerRadius(adjust)),
    Math.round(place.photoScale),
    Math.round(place.photoOffsetX),
    Math.round(place.photoOffsetY),
    Math.round(Number(adjust.opacity) || 100)
  ].join("|");
}

function resolveArtisticLayerSize(contentSize, state, maxEdge = FRAME_MAX_EDGE){
  const art = getArtisticFrameById(state.artisticFrameId);
  const aspect = art?.aspect
    || resolvePhotoAspectKey(contentSize.width, contentSize.height);
  return resolveArtisticOutputSize({ aspect, maxEdge });
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
  const chrome = classicChromeParams(state, { forGallery: true });
  // Inner-only: treat the remaining material as the outer ring for the renderer.
  const drawOuterId = chrome.outerMaterialId || chrome.innerMaterialId || "wood";
  const drawInnerId = chrome.outerMaterialId ? chrome.innerMaterialId : null;
  const drawOuterWidth = chrome.outerMaterialId
    ? chrome.outerFrameWidth
    : chrome.innerFrameWidth;
  const drawInnerWidth = chrome.outerMaterialId ? chrome.innerFrameWidth : 0;

  const [outerTexture, innerTexture] = await Promise.all([
    loadTextureForMaterial(drawOuterId),
    drawInnerId ? loadTextureForMaterial(drawInnerId) : Promise.resolve(null)
  ]);

  const framedSize = resolveFramedOutputSize(contentSize.width, contentSize.height, {
    ...chrome,
    outerFrameWidth: drawOuterWidth,
    innerFrameWidth: drawInnerWidth,
    frameStyle: drawOuterId
  });

  const layer = document.createElement("canvas");
  layer.width = framedSize.width;
  layer.height = framedSize.height;
  const layerCtx = layer.getContext("2d");
  const contentCanvas = getOrBuildContentCanvas(sourceImage, contentSize);
  const place = resolvePhotoPlacement(state.classicAdjust || state);

  renderFramedPhoto(layerCtx, contentCanvas, {
    frameStyle: drawOuterId,
    outerMaterialId: drawOuterId,
    innerMaterialId: drawInnerId,
    outerTextureImage: outerTexture,
    innerTextureImage: innerTexture,
    ...chrome,
    outerFrameWidth: drawOuterWidth,
    innerFrameWidth: drawInnerWidth,
    contentWidth: contentSize.width,
    contentHeight: contentSize.height,
    ...place
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

async function buildArtisticFramedLayer(sourceImage, state, outputSize, { transparentBackground = false } = {}){
  const frameImage = state.artisticFrameId
    ? await loadTextureForMaterial(state.artisticFrameId)
    : null;
  const layer = document.createElement("canvas");
  layer.width = outputSize.width;
  layer.height = outputSize.height;
  const layerCtx = layer.getContext("2d");
  const artAdjust = state.artisticAdjust || state;
  const place = resolvePhotoPlacement(artAdjust);
  renderArtisticFramedPhoto(layerCtx, sourceImage, frameImage, {
    opacity: (Number(artAdjust.opacity) || 100) / 100,
    artisticFrameWidth: resolveArtisticFrameWidthPercent(artAdjust),
    artisticCornerRadius: resolveArtisticCornerRadius(artAdjust),
    ...place,
    transparentBackground,
    shadow: transparentBackground ? 18 : 28
  });
  return layer;
}

async function getOrBuildArtisticFramedLayer(sourceImage, state, contentSize, options = {}){
  const outputSize = resolveArtisticLayerSize(contentSize, state);
  const key = artisticLayerCacheKey(state, outputSize)
    + (options.transparentBackground ? "|t" : "");
  if (layerCache.key === key && layerCache.layer) {
    return layerCache.layer;
  }
  const layer = await buildArtisticFramedLayer(sourceImage, state, outputSize, options);
  layerCache.key = key;
  layerCache.layer = layer;
  return layer;
}

function getScenePreviewImage(sceneImage, targetWidth, targetHeight){
  if (!sceneImage) return null;
  const tw = Math.max(1, Math.round(targetWidth));
  const th = Math.max(1, Math.round(targetHeight));
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
  const scale = Math.max(tw / sceneImage.width, th / sceneImage.height);
  const dw = sceneImage.width * scale;
  const dh = sceneImage.height * scale;
  const dx = (tw - dw) / 2;
  const dy = (th - dh) / 2;
  ctx.drawImage(sceneImage, dx, dy, dw, dh);
  scenePreviewCache.set(cacheKey, canvas);
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
    // Bake Layer-2 with classic/artistic photo* placement frozen inside the frame.
    // Wall pan/zoom uses independent gallery* params on the whole composite.
    const useArtisticLayer = isArtisticMode(state);
    const framedLayer = useArtisticLayer
      ? await getOrBuildArtisticFramedLayer(sourceImage, state, contentSize, {
          transparentBackground: true
        })
      : await getOrBuildClassicFramedLayer(sourceImage, state, contentSize);

    const wall = resolveGalleryPlacement(state);
    renderGalleryPresentation(ctx, framedLayer, {
      sceneImage,
      aspect: scene?.aspect || aspect,
      mount: scene?.mount,
      galleryPhotoScale: wall.galleryPhotoScale,
      galleryOffsetX: wall.galleryOffsetX,
      galleryOffsetY: wall.galleryOffsetY,
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

  if (isArtisticMode(state) && state.artisticFrameId) {
    const frameImage = await loadTextureForMaterial(state.artisticFrameId);
    if (!frameImage) {
      console.warn(`[F5 畫框] 藝術畫框材質載入失敗：${state.artisticFrameId}`);
    }
    const place = resolvePhotoPlacement(state);
    const artAdjust = state.artisticAdjust || state;
    renderArtisticFramedPhoto(ctx, sourceImage, frameImage, {
      opacity: (Number(artAdjust.opacity ?? state.opacity) || 100) / 100,
      artisticFrameWidth: resolveArtisticFrameWidthPercent(artAdjust),
      artisticCornerRadius: resolveArtisticCornerRadius(artAdjust),
      photoScale: artAdjust.photoScale,
      photoOffsetX: artAdjust.photoOffsetX,
      photoOffsetY: artAdjust.photoOffsetY,
      transparentBackground: false,
      shadow: frameImage ? 28 : 0
    });
    return;
  }

  const type = resolveAppliedFrameType(state);
  const frameStyle = type?.id || state.frameTypeId;
  const chrome = classicChromeParams(state, { forGallery: false });
  const drawOuterId = chrome.outerMaterialId || chrome.innerMaterialId || mapStyleToMaterial(frameStyle);
  const drawInnerId = chrome.outerMaterialId ? chrome.innerMaterialId : null;
  const drawOuterWidth = chrome.outerMaterialId
    ? chrome.outerFrameWidth
    : chrome.innerFrameWidth;
  const drawInnerWidth = chrome.outerMaterialId ? chrome.innerFrameWidth : 0;

  const [outerTexture, innerTexture] = await Promise.all([
    loadTextureForMaterial(drawOuterId),
    drawInnerId ? loadTextureForMaterial(drawInnerId) : Promise.resolve(null)
  ]);
  const contentCanvas = getOrBuildContentCanvas(sourceImage, contentSize);
  const place = resolvePhotoPlacement(state.classicAdjust || state);

  renderFramedPhoto(ctx, contentCanvas, {
    frameStyle,
    outerMaterialId: drawOuterId,
    innerMaterialId: drawInnerId,
    materialId: drawOuterId,
    outerTextureImage: outerTexture,
    innerTextureImage: innerTexture,
    ...chrome,
    outerFrameWidth: drawOuterWidth,
    innerFrameWidth: drawInnerWidth,
    contentWidth: contentSize.width,
    contentHeight: contentSize.height,
    ...place
  });
}

function drawEmptyState(ctx, width, height){
  ctx.fillStyle = "#eef6f5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0a6e6a";
  ctx.font = "600 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("畫框", width / 2, height / 2);
}
