// F5 框住美好 - Canvas 影像處理 v0.1.0

import { renderFramedPhoto, resolveFramedOutputSize, mapStyleToMaterial } from "../../core/frameRenderer.js";
import { resolveAppliedFrameType } from "./frameState.js";
import { loadTextureForMaterial } from "./frameAssets.js";

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

/** 依原圖比例決定內容區尺寸（不含畫框外圍）。 */
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
  const type = resolveAppliedFrameType(state);
  return resolveFramedOutputSize(contentSize.width, contentSize.height, {
    frameWidth: state.frameWidth,
    innerPadding: state.innerPadding,
    outerPadding: state.outerPadding,
    shadow: state.shadow,
    frameStyle: type?.id || state.frameTypeId
  });
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

  const type = resolveAppliedFrameType(state);
  const frameStyle = type?.id || state.frameTypeId;
  const materialId = type?.materialId || mapStyleToMaterial(frameStyle);
  const textureImage = await loadTextureForMaterial(materialId);

  const contentSize = resolveContentSize(sourceImage);
  // Draw source into an intermediate content canvas at target content size.
  const contentCanvas = document.createElement("canvas");
  contentCanvas.width = contentSize.width;
  contentCanvas.height = contentSize.height;
  const contentCtx = contentCanvas.getContext("2d");
  contentCtx.drawImage(sourceImage, 0, 0, contentSize.width, contentSize.height);

  renderFramedPhoto(ctx, contentCanvas, {
    frameStyle,
    materialId,
    frameWidth: state.frameWidth,
    cornerRadius: state.cornerRadius,
    innerPadding: state.innerPadding,
    outerPadding: state.outerPadding,
    shadow: state.shadow,
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
