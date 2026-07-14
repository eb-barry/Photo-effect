// F5 框住美好 - Canvas 影像處理 v0.3.0

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

export const FRAME_MAX_EDGE = 1600;
export const FRAME_OUTPUT_WIDTH = 1200;
export const FRAME_OUTPUT_HEIGHT = 1600;

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

export function resolveFrameCanvasSize(contentSize, state){
  if (isGalleryMode(state)) {
    const scene = getGallerySceneById(state.gallerySceneId);
    const aspect = scene?.aspect || resolvePhotoAspectKey(contentSize.width, contentSize.height);
    return resolveGalleryOutputSize(contentSize.width, contentSize.height, {
      aspect,
      maxEdge: FRAME_MAX_EDGE
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

  const contentCanvas = document.createElement("canvas");
  contentCanvas.width = contentSize.width;
  contentCanvas.height = contentSize.height;
  contentCanvas.getContext("2d").drawImage(sourceImage, 0, 0, contentSize.width, contentSize.height);

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

export async function renderFrameStudio(ctx, sourceImage, state){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  const contentSize = resolveContentSize(sourceImage);

  if (isGalleryMode(state)) {
    const aspect = resolvePhotoAspectKey(contentSize.width, contentSize.height);
    const sceneId = pickDefaultGallerySceneId(contentSize.width, contentSize.height, state.gallerySceneId);
    const scene = getGallerySceneById(sceneId);
    const sceneImage = await resolveGallerySceneImage(sceneId);
    const framedLayer = await buildClassicFramedLayer(sourceImage, state, contentSize);

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
      galleryLightDistance: state.galleryLightDistance
    });
    return;
  }

  const type = resolveAppliedFrameType(state);
  const frameStyle = type?.id || state.frameTypeId;
  const materialId = type?.materialId || mapStyleToMaterial(frameStyle);
  const textureImage = await loadTextureForMaterial(materialId);

  const contentCanvas = document.createElement("canvas");
  contentCanvas.width = contentSize.width;
  contentCanvas.height = contentSize.height;
  contentCanvas.getContext("2d").drawImage(sourceImage, 0, 0, contentSize.width, contentSize.height);

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
