// F3 魔法天空 - Canvas 影像處理 v0.8.0
// 柔邊 alpha 合成 + probMap 天空敏感度 + 深色細節前景保護。

import { getSkyByCategory, getSelectedSkyIdKey, resolveEffectValues } from "./magicSkyState.js";
import {
  applyPhotoForegroundProtection,
  applyThinLineSkyProtection,
  buildSkyMaskBitmapWithSensitivity,
  createMaskCanvasFromBitmap,
  samplePhotoImageData
} from "./magicSkySegment.js";

const MIN_MASK_FEATHER_PX = 2.2;
const FOREGROUND_GUARD_LOW = 0.38;
const FOREGROUND_GUARD_HIGH = 0.58;
const DARK_LUM_PROTECT = 0.3;
const DARK_CONTRAST_MIN = 0.1;
const SKY_EDGE_REFINE_BAND_LOW = 0.14;
const SKY_EDGE_REFINE_BAND_HIGH = 0.86;
const FG_SAMPLE_MAX_ALPHA = 0.32;

export const MAGIC_SKY_MAX_EDGE = 1600;
/** @deprecated Use resolveOutputSize() for the active photo. */
export const MAGIC_SKY_OUTPUT_WIDTH = 1200;
/** @deprecated Use resolveOutputSize() for the active photo. */
export const MAGIC_SKY_OUTPUT_HEIGHT = 1600;

const skyImageCache = new Map();
const skyImageLoading = new Map();
const SKY_IMAGE_LOAD_TIMEOUT_MS = 15000;

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
  if (skyImageLoading.has(assetUrl)) {
    return skyImageLoading.get(assetUrl);
  }

  const promise = Promise.race([
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`[F3 魔法天空] 天空素材載入失敗：${assetUrl}`));
      img.src = assetUrl;
    }),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`[F3 魔法天空] 天空素材載入逾時：${assetUrl}`)),
        SKY_IMAGE_LOAD_TIMEOUT_MS
      );
    })
  ]).then(image => {
    skyImageCache.set(assetUrl, image);
    skyImageLoading.delete(assetUrl);
    return image;
  }).catch(error => {
    skyImageLoading.delete(assetUrl);
    throw error;
  });

  skyImageLoading.set(assetUrl, promise);
  return promise;
}

export function resolveOutputSize(image, maxEdge = MAGIC_SKY_MAX_EDGE){
  if (!image?.width || !image?.height) {
    return { width: MAGIC_SKY_OUTPUT_WIDTH, height: MAGIC_SKY_OUTPUT_HEIGHT };
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

export function getPhotoLayout(canvasWidth, canvasHeight){
  return {
    x: 0,
    y: 0,
    width: canvasWidth,
    height: canvasHeight
  };
}

export async function renderMagicSky(ctx, sourceImage, state, maskEntry = null){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  const layout = getPhotoLayout(width, height);
  if (!maskEntry?.maskCanvas) {
    const adjustedPhoto = renderAdjustedPhotoLayer(sourceImage, layout, resolveEffectValues(state));
    ctx.drawImage(adjustedPhoto, layout.x, layout.y, layout.width, layout.height);
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

  const effects = resolveEffectValues(state);
  const layoutMask = buildLayoutMask(maskEntry, sourceImage, layout, effects.skySensitivity);

  const processedMask = buildProcessedMask(
    layoutMask,
    effects.edgeFeather,
    effects.maskExpansion,
    maskEntry
  );

  const adjustedPhoto = renderAdjustedPhotoLayer(sourceImage, layout, effects);
  const skyLayer = document.createElement("canvas");
  skyLayer.width = width;
  skyLayer.height = height;
  const skyLayerCtx = skyLayer.getContext("2d", { willReadFrequently: true });
  drawSkyTexture(
    skyLayerCtx,
    skyImage,
    width,
    height,
    effects.skyOffsetX,
    effects.skyOffsetY,
    effects.skyScale
  );
  applySkyColorAdjustments(skyLayerCtx, skyLayer.width, skyLayer.height, effects);

  await compositePhotoAndSky(
    ctx,
    adjustedPhoto,
    skyLayer,
    processedMask,
    layoutMask,
    effects.skyOpacity,
    effects.skyEdgeRefine,
    maskEntry
  );
}

function renderAdjustedPhotoLayer(sourceImage, layout, effects){
  const output = document.createElement("canvas");
  output.width = layout.width;
  output.height = layout.height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceImage, 0, 0, layout.width, layout.height);
  applyLayerToneAdjustments(ctx, output.width, output.height, {
    exposure: effects.photoExposure,
    contrast: effects.photoContrast,
    brightness: effects.photoBrightness,
    darken: effects.photoDarken
  });
  const imageData = ctx.getImageData(0, 0, output.width, output.height);
  applyPixelSaturationWarmth(imageData, effects.photoSaturation, effects.photoWarmth);
  ctx.putImageData(imageData, 0, 0);
  return output;
}

function applySkyColorAdjustments(ctx, width, height, effects){
  const imageData = ctx.getImageData(0, 0, width, height);
  applyPixelToneToImageData(imageData, {
    exposure: effects.skyExposure,
    contrast: effects.skyContrast,
    brightness: effects.skyBrightness,
    darken: effects.skyDarken
  });
  applyPixelSaturationWarmth(imageData, effects.skySaturation, effects.skyWarmth);
  ctx.putImageData(imageData, 0, 0);
}

function applyLayerToneAdjustments(ctx, width, height, tone){
  const imageData = ctx.getImageData(0, 0, width, height);
  applyPixelToneToImageData(imageData, tone);
  ctx.putImageData(imageData, 0, 0);
}

function applyPixelToneToImageData(imageData, { exposure, contrast, brightness, darken }){
  const data = imageData.data;
  const exposureValue = Number(exposure ?? 0);
  const expMul = Math.pow(2, exposureValue / 35);
  const brightMul = Number(brightness ?? 100) / 100;
  const contrastMul = Number(contrast ?? 100) / 100;
  const darkenAmt = clamp(Number(darken ?? 0), 0, 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    r *= expMul * brightMul;
    g *= expMul * brightMul;
    b *= expMul * brightMul;

    r = (r - 0.5) * contrastMul + 0.5;
    g = (g - 0.5) * contrastMul + 0.5;
    b = (b - 0.5) * contrastMul + 0.5;

    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (darkenAmt > 0 && lum < 0.68) {
      const weight = 1 - lum / 0.68;
      const factor = 1 - darkenAmt * weight * 0.95;
      r *= factor;
      g *= factor;
      b *= factor;
    }

    data[i] = clampByte(r * 255);
    data[i + 1] = clampByte(g * 255);
    data[i + 2] = clampByte(b * 255);
  }
}

function applyPixelSaturationWarmth(imageData, saturation, warmth){
  const sat = Number(saturation ?? 100) / 100;
  const warm = Number(warmth ?? 0) / 100;
  if (sat === 1 && warm === 0) return;

  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    if (warm !== 0) {
      r += warm * 0.42;
      g += warm * 0.08;
      b -= warm * 0.45;
    }

    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    data[i] = clampByte(r * 255);
    data[i + 1] = clampByte(g * 255);
    data[i + 2] = clampByte(b * 255);
  }
}

function drawSkyTexture(ctx, skyImage, width, height, offsetX = 0, offsetY = 0, scale = 100){
  const panX = (Number(offsetX) || 0) * width * 0.012;
  const panY = (Number(offsetY) || 0) * height * 0.012;
  const scaleFactor = clamp(Number(scale) || 100, 50, 300) / 100;
  const imageRatio = skyImage.width / skyImage.height;
  const canvasRatio = width / height;
  let drawWidth;
  let drawHeight;

  const cover = 1.25 * scaleFactor;
  if (imageRatio > canvasRatio) {
    drawHeight = height * cover;
    drawWidth = drawHeight * imageRatio;
  } else {
    drawWidth = width * cover;
    drawHeight = drawWidth / imageRatio;
  }

  const x = (width - drawWidth) / 2 + panX;
  const y = (height - drawHeight) / 2 + panY;
  ctx.drawImage(skyImage, x, y, drawWidth, drawHeight);
}

function buildLayoutMask(maskEntry, sourceImage, layout, skySensitivity){
  const layoutMask = document.createElement("canvas");
  layoutMask.width = layout.width;
  layoutMask.height = layout.height;

  if (skySensitivity > 0 && maskEntry?.probMap) {
    const photoData = samplePhotoImageData(sourceImage, maskEntry.width, maskEntry.height);
    let bitmap = buildSkyMaskBitmapWithSensitivity(
      maskEntry.probMap,
      photoData,
      maskEntry.width,
      maskEntry.height,
      skySensitivity
    );
    if (maskEntry.thinLineMask) {
      bitmap = applyThinLineSkyProtection(
        bitmap,
        maskEntry.thinLineMask,
        maskEntry.width,
        maskEntry.height
      );
    }
    const refinedMask = createMaskCanvasFromBitmap(
      bitmap,
      maskEntry.probMap,
      maskEntry.width,
      maskEntry.height
    );
    applyPhotoForegroundProtection(refinedMask, sourceImage);
    layoutMask.getContext("2d", { willReadFrequently: true }).drawImage(
      refinedMask,
      0,
      0,
      maskEntry.width,
      maskEntry.height,
      layout.x,
      layout.y,
      layout.width,
      layout.height
    );
    return layoutMask;
  }

  layoutMask.getContext("2d", { willReadFrequently: true }).drawImage(
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
  return layoutMask;
}

function buildProcessedMask(maskCanvas, edgeFeather, maskExpansion, maskEntry = null){
  const output = document.createElement("canvas");
  output.width = maskCanvas.width;
  output.height = maskCanvas.height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(maskCanvas, 0, 0);

  const expansion = Math.round(Number(maskExpansion) || 0);
  if (expansion !== 0) {
    applyMaskExpansion(ctx, output.width, output.height, expansion);
  }

  let featherPx = MIN_MASK_FEATHER_PX + clamp(Number(edgeFeather) || 0, 0, 100) * 0.14;
  if (maskEntry?.thinLineMask) {
    featherPx = Math.max(MIN_MASK_FEATHER_PX, featherPx * 0.82);
  }
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = output.width;
  blurCanvas.height = output.height;
  const blurCtx = blurCanvas.getContext("2d");
  blurCtx.filter = `blur(${featherPx.toFixed(2)}px)`;
  blurCtx.drawImage(output, 0, 0);
  ctx.clearRect(0, 0, output.width, output.height);
  ctx.drawImage(blurCanvas, 0, 0);

  if (maskEntry?.thinLineMask) {
    applyThinLineAlphaProtection(
      ctx,
      output.width,
      output.height,
      maskEntry.thinLineMask,
      maskEntry.width,
      maskEntry.height,
      0.82
    );
  }

  return output;
}

async function compositePhotoAndSky(
  ctx,
  photoCanvas,
  skyCanvas,
  skyMaskCanvas,
  rawMaskCanvas,
  skyOpacityPercent,
  skyEdgeRefineStrength = 0,
  maskEntry = null
){
  const width = photoCanvas.width;
  const height = photoCanvas.height;
  const photoCtx = photoCanvas.getContext("2d", { willReadFrequently: true });
  const skyCtx = skyCanvas.getContext("2d", { willReadFrequently: true });
  const skyMaskCtx = skyMaskCanvas.getContext("2d", { willReadFrequently: true });
  const rawMaskCtx = rawMaskCanvas.getContext("2d", { willReadFrequently: true });

  const photo = photoCtx.getImageData(0, 0, width, height);
  const sky = skyCtx.getImageData(0, 0, width, height);
  const skyMask = skyMaskCtx.getImageData(0, 0, width, height);
  const rawMask = rawMaskCtx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);
  const opacity = clamp(Number(skyOpacityPercent ?? 100), 0, 100) / 100;
  const refineStrength = clamp(Number(skyEdgeRefineStrength) || 0, 0, 1);
  const yieldEveryRows = width * height > 480000 ? 40 : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rawAlpha = rawMask.data[i + 3] / 255;
      let skyAlpha = (skyMask.data[i + 3] / 255) * opacity;
      skyAlpha *= computeForegroundGuard(rawAlpha);
      if (refineStrength > 0) {
        skyAlpha = refineAlphaWithSkyGuide(
          skyAlpha,
          photo.data,
          sky.data,
          rawMask.data,
          i,
          width,
          height,
          refineStrength,
          rawAlpha
        );
      }
      if (rawAlpha < 0.82) {
        skyAlpha *= computeCompositeDarkProtection(photo.data, i, width);
      }
      if (maskEntry?.thinLineMask) {
        const lineGuard = sampleThinLineMask(
          maskEntry.thinLineMask,
          maskEntry.width,
          maskEntry.height,
          x,
          y,
          width,
          height
        );
        skyAlpha *= 1 - lineGuard * 0.78;
      }

      const inv = 1 - skyAlpha;
      out.data[i] = clampByte(photo.data[i] * inv + sky.data[i] * skyAlpha);
      out.data[i + 1] = clampByte(photo.data[i + 1] * inv + sky.data[i + 1] * skyAlpha);
      out.data[i + 2] = clampByte(photo.data[i + 2] * inv + sky.data[i + 2] * skyAlpha);
      out.data[i + 3] = 255;
    }

    if (yieldEveryRows > 0 && y > 0 && y % yieldEveryRows === 0) {
      await yieldToMainThread();
    }
  }

  ctx.putImageData(out, 0, 0);
}

function sampleThinLineMask(thinLineMask, maskWidth, maskHeight, x, y, canvasWidth, canvasHeight){
  if (!thinLineMask || !maskWidth || !maskHeight) return 0;
  const mx = Math.min(maskWidth - 1, Math.floor(x * maskWidth / Math.max(1, canvasWidth)));
  const my = Math.min(maskHeight - 1, Math.floor(y * maskHeight / Math.max(1, canvasHeight)));
  return thinLineMask[my * maskWidth + mx] || 0;
}

function applyThinLineAlphaProtection(ctx, width, height, thinLineMask, maskWidth, maskHeight, strength){
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const clampedStrength = clamp(Number(strength) || 0, 0, 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const guard = sampleThinLineMask(thinLineMask, maskWidth, maskHeight, x, y, width, height) * clampedStrength;
      if (guard <= 0) continue;
      const alphaIndex = (y * width + x) * 4 + 3;
      pixels[alphaIndex] = Math.round(pixels[alphaIndex] * (1 - guard));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function yieldToMainThread(){
  return new Promise(resolve => setTimeout(resolve, 0));
}

function computeForegroundGuard(rawAlpha){
  if (rawAlpha <= FOREGROUND_GUARD_LOW) return 0;
  if (rawAlpha >= FOREGROUND_GUARD_HIGH) return 1;
  return (rawAlpha - FOREGROUND_GUARD_LOW) / (FOREGROUND_GUARD_HIGH - FOREGROUND_GUARD_LOW);
}

function computeCompositeDarkProtection(photoData, index, width){
  const r = photoData[index];
  const g = photoData[index + 1];
  const b = photoData[index + 2];
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  if (lum >= DARK_LUM_PROTECT) return 1;

  const x = (index / 4) % width;
  const y = Math.floor(index / 4 / width);
  let maxNeighbor = lum;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0) continue;
      const j = (ny * width + nx) * 4;
      if (j >= photoData.length) continue;
      const nLum = (photoData[j] * 0.299 + photoData[j + 1] * 0.587 + photoData[j + 2] * 0.114) / 255;
      maxNeighbor = Math.max(maxNeighbor, nLum);
    }
  }

  const contrast = maxNeighbor - lum;
  if (contrast < DARK_CONTRAST_MIN) return 1;
  if (lum < 0.18) return 0.05;
  const darkness = (DARK_LUM_PROTECT - lum) / DARK_LUM_PROTECT;
  return Math.max(0.08, 1 - darkness * 0.95);
}

function refineAlphaWithSkyGuide(
  skyAlpha,
  photoData,
  skyData,
  rawMaskData,
  index,
  width,
  height,
  strength,
  rawAlpha
){
  if (skyAlpha <= 0.001) return skyAlpha;
  if (rawAlpha <= SKY_EDGE_REFINE_BAND_LOW || rawAlpha >= SKY_EDGE_REFINE_BAND_HIGH) return skyAlpha;

  const bandWeight = computeEdgeBandWeight(rawAlpha);
  if (bandWeight <= 0.001) return skyAlpha;

  const r = photoData[index];
  const g = photoData[index + 1];
  const b = photoData[index + 2];
  const sr = skyData[index];
  const sg = skyData[index + 1];
  const sb = skyData[index + 2];

  const distSky = weightedColorDistanceSq(r, g, b, sr, sg, sb);
  const foreground = sampleLocalForegroundColor(photoData, rawMaskData, index, width, height);
  if (!foreground) return skyAlpha;

  const distFg = weightedColorDistanceSq(r, g, b, foreground.r, foreground.g, foreground.b);
  const foregroundLikeness = distSky / (distSky + distFg + 1);
  const targetSkyAlpha = skyAlpha * (1 - foregroundLikeness * 0.92);
  const blend = strength * bandWeight * 0.9;

  return clamp(skyAlpha * (1 - blend) + targetSkyAlpha * blend, 0, 1);
}

function computeEdgeBandWeight(rawAlpha){
  const span = SKY_EDGE_REFINE_BAND_HIGH - SKY_EDGE_REFINE_BAND_LOW;
  const t = (rawAlpha - SKY_EDGE_REFINE_BAND_LOW) / span;
  return Math.sin(Math.PI * t);
}

function sampleLocalForegroundColor(photoData, rawMaskData, index, width, height){
  const x = (index / 4) % width;
  const y = Math.floor(index / 4 / width);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let weight = 0;

  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = (ny * width + nx) * 4;
      const neighborAlpha = rawMaskData[j + 3] / 255;
      if (neighborAlpha > FG_SAMPLE_MAX_ALPHA) continue;
      const w = 1 / (Math.abs(ox) + Math.abs(oy) + 1);
      sumR += photoData[j] * w;
      sumG += photoData[j + 1] * w;
      sumB += photoData[j + 2] * w;
      weight += w;
    }
  }

  if (weight < 0.5) return null;
  return {
    r: sumR / weight,
    g: sumG / weight,
    b: sumB / weight
  };
}

function weightedColorDistanceSq(r1, g1, b1, r2, g2, b2){
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
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

function clampByte(value){
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
