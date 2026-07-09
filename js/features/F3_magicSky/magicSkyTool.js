// F3 魔法天空 - Canvas 影像處理 v0.2.1
// AI 天空遮罩 + 天空材質替換 + 前景保護合成。

import { buildForegroundProtectMask } from "./magicSkySegment.js";
import { getSkyByCategory, getSelectedSkyIdKey } from "./magicSkyState.js";

export const MAGIC_SKY_OUTPUT_WIDTH = 1200;
export const MAGIC_SKY_OUTPUT_HEIGHT = 1600;
export const MAGIC_SKY_ASPECT = 3 / 4;

const skyImageCache = new Map();

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

export async function loadSkyImage(assetUrl){
  if (skyImageCache.has(assetUrl)) {
    return skyImageCache.get(assetUrl);
  }
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = assetUrl;
  });
  skyImageCache.set(assetUrl, image);
  return image;
}

export function getPhotoLayout(image, width = MAGIC_SKY_OUTPUT_WIDTH, height = MAGIC_SKY_OUTPUT_HEIGHT){
  const imageRatio = image.width / image.height;
  const canvasRatio = width / height;
  let drawWidth;
  let drawHeight;
  let x;
  let y;

  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
    x = (width - drawWidth) / 2;
    y = 0;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
    x = 0;
    y = (height - drawHeight) / 2;
  }

  return { x, y, width: drawWidth, height: drawHeight };
}

export async function renderMagicSky(ctx, sourceImage, state, maskEntry = null){
  const width = MAGIC_SKY_OUTPUT_WIDTH;
  const height = MAGIC_SKY_OUTPUT_HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  const layout = getPhotoLayout(sourceImage, width, height);
  if (!maskEntry?.maskCanvas) {
    drawPhotoCover(ctx, sourceImage, layout);
    return;
  }

  const category = state.activeSkyCategory || "sunny";
  const skyId = state[getSelectedSkyIdKey(category)];
  const skyMeta = getSkyByCategory(category, skyId);
  let skyImage = null;
  try {
    skyImage = await loadSkyImage(skyMeta.asset);
  } catch (error) {
    console.warn("[F3 魔法天空] 天空素材載入失敗：", error);
    drawPhotoCover(ctx, sourceImage, layout);
    return;
  }

  const layoutMask = document.createElement("canvas");
  layoutMask.width = width;
  layoutMask.height = height;
  const layoutMaskCtx = layoutMask.getContext("2d", { willReadFrequently: true });
  layoutMaskCtx.drawImage(
    maskEntry.maskCanvas,
    0,
    0,
    maskEntry.width,
    maskEntry.height,
    layout.x,
    layout.y,
    layout.width,
    layout.height
  );

  const rawProtectMask = buildForegroundProtectMask(layoutMask);
  const processedMask = buildProcessedMask(layoutMask, state.edgeFeather, state.maskExpansion);

  const skyLayer = document.createElement("canvas");
  skyLayer.width = width;
  skyLayer.height = height;
  const skyLayerCtx = skyLayer.getContext("2d", { willReadFrequently: true });
  drawSkyTexture(skyLayerCtx, skyImage, width, height, state.skyOffsetX, state.skyOffsetY);

  const maskedSky = document.createElement("canvas");
  maskedSky.width = width;
  maskedSky.height = height;
  const maskedSkyCtx = maskedSky.getContext("2d", { willReadFrequently: true });
  maskedSkyCtx.drawImage(skyLayer, 0, 0);
  maskedSkyCtx.globalCompositeOperation = "destination-in";
  maskedSkyCtx.drawImage(processedMask, 0, 0);

  const foregroundLayer = document.createElement("canvas");
  foregroundLayer.width = width;
  foregroundLayer.height = height;
  const foregroundCtx = foregroundLayer.getContext("2d", { willReadFrequently: true });
  foregroundCtx.drawImage(sourceImage, layout.x, layout.y, layout.width, layout.height);
  foregroundCtx.globalCompositeOperation = "destination-in";
  foregroundCtx.drawImage(rawProtectMask, 0, 0);

  ctx.drawImage(sourceImage, layout.x, layout.y, layout.width, layout.height);
  const opacity = clamp(state.skyOpacity, 0, 100) / 100;
  if (opacity > 0) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(maskedSky, 0, 0);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(foregroundLayer, 0, 0);
}

function drawSkyTexture(ctx, skyImage, width, height, offsetX = 0, offsetY = 0){
  const panX = (Number(offsetX) || 0) * width * 0.01;
  const panY = (Number(offsetY) || 0) * height * 0.01;
  const imageRatio = skyImage.width / skyImage.height;
  const canvasRatio = width / height;
  let drawWidth;
  let drawHeight;

  if (imageRatio > canvasRatio) {
    drawHeight = height * 1.25;
    drawWidth = drawHeight * imageRatio;
  } else {
    drawWidth = width * 1.25;
    drawHeight = drawWidth / imageRatio;
  }

  const x = (width - drawWidth) / 2 + panX;
  const y = (height - drawHeight) / 2 + panY;
  ctx.drawImage(skyImage, x, y, drawWidth, drawHeight);
}

function buildProcessedMask(maskCanvas, edgeFeather, maskExpansion){
  const output = document.createElement("canvas");
  output.width = maskCanvas.width;
  output.height = maskCanvas.height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(maskCanvas, 0, 0);

  const expansion = Math.round(Number(maskExpansion) || 0);
  if (expansion !== 0) {
    applyMaskExpansion(ctx, output.width, output.height, expansion);
  }

  const feather = clamp(Number(edgeFeather) || 0, 0, 100);
  if (feather > 0) {
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = output.width;
    blurCanvas.height = output.height;
    const blurCtx = blurCanvas.getContext("2d");
    blurCtx.filter = `blur(${Math.max(1, feather * 0.1)}px)`;
    blurCtx.drawImage(output, 0, 0);
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.drawImage(blurCanvas, 0, 0);
    crushWeakMaskAlpha(ctx, output.width, output.height, 24);
  }

  return output;
}

function crushWeakMaskAlpha(ctx, width, height, minAlpha){
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < minAlpha) data[i] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyMaskExpansion(ctx, width, height, expansion){
  const imageData = ctx.getImageData(0, 0, width, height);
  const source = imageData.data;
  const radius = Math.abs(expansion);
  const output = new Uint8ClampedArray(source);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      let value = source[idx];
      for (let oy = -radius; oy <= radius && value < 255; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = (ny * width + nx) * 4 + 3;
          if (expansion > 0) value = Math.max(value, source[nIdx]);
          else value = Math.min(value, source[nIdx]);
        }
      }
      output[idx] = value;
    }
  }

  for (let i = 0; i < source.length; i += 4) {
    source[i] = 255;
    source[i + 1] = 255;
    source[i + 2] = 255;
    source[i + 3] = output[i + 3];
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawPhotoCover(ctx, image, layout){
  ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
}

function drawEmptyState(ctx, width, height){
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#dff8f6");
  gradient.addColorStop(1, "#b8ece8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
