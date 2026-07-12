// F3 魔法天空 - AI 天空分割 v0.8.0
// 320 全圖 + 上半部 3×3 分塊推論；亮白天空自動補洞；細線柔順保護。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/voyagerfromeast/skyseg/resolve/main/skyseg_fp16.onnx";
const MODEL_CACHE_NAME = "photo-effects-skyseg-model-v1";
const MASK_PIPELINE_VERSION = 11;
const INPUT_SIZE = 320;
const MASK_INTERMEDIATE_MAX_EDGE = 640;
const TILED_REGION_HEIGHT_RATIO = 0.72;
const TILED_GRID_COLS = 3;
const TILED_GRID_ROWS = 3;
const TILED_OVERLAP_RATIO = 0.35;
const TILED_MIN_IMAGE_EDGE = 520;
const SKY_CONFIDENCE_THRESHOLD = 0.58;
const SKY_CONFIDENCE_SOFTNESS = 0.14;
const SKY_CONNECT_THRESHOLD = 0.38;
const OCCLUDED_SKY_THRESHOLD = 0.4;
const OCCLUDED_MIN_PIXELS = 14;
const OCCLUDED_MIN_AVG_PROB = 0.46;
const OCCLUDED_BOTTOM_EXCLUDE_ROWS = 3;
const POCKET_PROB_FLOOR = 0.12;
const POCKET_MIN_PIXELS = 3;
const POCKET_NEAR_SKY_RADIUS = 5;
const POCKET_MIN_PHOTO_LUM = 0.48;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let ortModule = null;
let sessionPromise = null;
const maskCache = new Map();

export function getSkyMaskCacheKey(sourceImageDataUrl){
  if (!sourceImageDataUrl) return "";
  if (sourceImageDataUrl.length <= 4096) return sourceImageDataUrl;
  return `${sourceImageDataUrl.length}:${sourceImageDataUrl.slice(0, 64)}:${sourceImageDataUrl.slice(-64)}`;
}

export function getCachedSkyMask(photoKey){
  return maskCache.get(photoKey) || null;
}

export function clearSkyMaskCache(){
  maskCache.clear();
}

export function preloadSkySegmentModel(onStatus = () => {}){
  return ensureSession(onStatus);
}

export async function releaseSkySegmentSession(){
  if (!sessionPromise) return;
  try {
    const session = await sessionPromise;
    await session.release?.();
  } catch (error) {
    console.warn("[F3 魔法天空] 釋放天空分割模型失敗：", error);
  } finally {
    sessionPromise = null;
  }
}

export async function ensureSkyMask(sourceImage, photoKey, options = {}){
  const key = photoKey || "default";
  const cached = maskCache.get(key);
  if (
    cached?.width === sourceImage.width
    && cached?.height === sourceImage.height
    && cached?.pipelineVersion === MASK_PIPELINE_VERSION
  ) {
    return cached;
  }

  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  onStatus("分析天空中…");
  const session = await ensureSession(onStatus);
  const width = sourceImage.width;
  const height = sourceImage.height;
  const fullOutput = await runInference(session, sourceImage);
  const fullProb = outputToProbabilities(fullOutput);
  let probMap = upscaleProbabilityMap(fullProb, INPUT_SIZE, INPUT_SIZE, width, height);

  const tileCrops = getStructureTileCrops(width, height);
  if (tileCrops.length > 0) {
    for (let i = 0; i < tileCrops.length; i += 1) {
      onStatus(`精細分析建築區域… (${i + 1}/${tileCrops.length})`);
      const tileOutput = await runInferenceOnCrop(session, sourceImage, tileCrops[i]);
      mergeTileIntoProbMap(probMap, width, height, outputToProbabilities(tileOutput), tileCrops[i]);
    }
  }

  const { maskCanvas, thinLineMask } = buildMaskFromProbMap(probMap, width, height, sourceImage);
  applyPhotoForegroundProtection(maskCanvas, sourceImage);
  const entry = {
    width: sourceImage.width,
    height: sourceImage.height,
    maskCanvas,
    probMap,
    thinLineMask,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
  maskCache.set(key, entry);
  return entry;
}

async function ensureSession(onStatus){
  if (!sessionPromise) {
    sessionPromise = (async () => {
      onStatus("載入 AI 模型…");
      const ort = await loadOrt();
      const modelBuffer = await fetchModelBuffer(onStatus);
      onStatus("初始化 AI 模型…");
      return ort.InferenceSession.create(modelBuffer, {
        executionProviders: ["wasm"]
      });
    })().catch(error => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function loadOrt(){
  if (ortModule) return ortModule;
  ortModule = await import(`${ORT_BASE}/ort.bundle.min.mjs`);
  ortModule.env.wasm.wasmPaths = ORT_BASE + "/";
  return ortModule;
}

async function fetchModelBuffer(onStatus){
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME);
      const cached = await cache.match(MODEL_URL);
      if (cached) {
        onStatus("讀取已快取的 AI 模型…");
        return cached.arrayBuffer();
      }
    } catch (error) {
      console.warn("[F3 魔法天空] 模型快取讀取失敗：", error);
    }
  }

  onStatus("下載 AI 模型（首次約 88MB，請稍候）…");
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`模型下載失敗（${response.status}）`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1024) {
    throw new Error("模型檔案異常，請稍後再試。");
  }

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME);
      await cache.put(MODEL_URL, new Response(buffer.slice(0)));
    } catch (error) {
      console.warn("[F3 魔法天空] 模型快取寫入失敗：", error);
    }
  }

  return buffer;
}

async function runInference(session, image){
  const ort = await loadOrt();
  const inputTensor = preprocessCanvas(imageToSquareCanvas(image), ort);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  return results[outputName].data;
}

async function runInferenceOnCrop(session, image, crop){
  const ort = await loadOrt();
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const inputTensor = preprocessCanvas(canvas, ort);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  return results[outputName].data;
}

function imageToSquareCanvas(image){
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE);
  return canvas;
}

function outputToProbabilities(outputData){
  const probabilities = new Float32Array(INPUT_SIZE * INPUT_SIZE);
  for (let i = 0; i < probabilities.length; i++) {
    probabilities[i] = clamp01(outputData[i]);
  }
  return probabilities;
}

function getStructureTileCrops(width, height){
  if (Math.max(width, height) < TILED_MIN_IMAGE_EDGE) return [];
  const regionH = Math.round(height * TILED_REGION_HEIGHT_RATIO);
  const cropW = Math.round(width / (TILED_GRID_COLS - TILED_OVERLAP_RATIO * (TILED_GRID_COLS - 1)));
  const cropH = Math.round(regionH / (TILED_GRID_ROWS - TILED_OVERLAP_RATIO * (TILED_GRID_ROWS - 1)));
  if (cropW < 64 || cropH < 64) return [];

  const stepX = TILED_GRID_COLS > 1 ? Math.round((width - cropW) / (TILED_GRID_COLS - 1)) : 0;
  const stepY = TILED_GRID_ROWS > 1 ? Math.round((regionH - cropH) / (TILED_GRID_ROWS - 1)) : 0;
  const crops = [];

  for (let row = 0; row < TILED_GRID_ROWS; row += 1) {
    for (let col = 0; col < TILED_GRID_COLS; col += 1) {
      const sx = col * stepX;
      const sy = row * stepY;
      const sw = Math.min(cropW, width - sx);
      const sh = Math.min(cropH, height - sy);
      if (sw < 64 || sh < 64) continue;
      crops.push({ sx, sy, sw, sh });
    }
  }

  return crops;
}

function mergeTileIntoProbMap(probMap, fullWidth, fullHeight, tileProb, crop){
  const { sx, sy, sw, sh } = crop;
  for (let ty = 0; ty < INPUT_SIZE; ty += 1) {
    const fy = sy + ((ty + 0.5) / INPUT_SIZE) * sh;
    if (fy < 0 || fy >= fullHeight) continue;
    const y = Math.min(fullHeight - 1, Math.floor(fy));
    for (let tx = 0; tx < INPUT_SIZE; tx += 1) {
      const fx = sx + ((tx + 0.5) / INPUT_SIZE) * sw;
      if (fx < 0 || fx >= fullWidth) continue;
      const x = Math.min(fullWidth - 1, Math.floor(fx));
      const fullIndex = y * fullWidth + x;
      const tileValue = tileProb[ty * INPUT_SIZE + tx];
      if (tileValue > probMap[fullIndex]) probMap[fullIndex] = tileValue;
    }
  }
}

function preprocessCanvas(canvas, ort){
  const { data } = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;

  for (let i = 0; i < plane; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    float32Data[i] = (r - MEAN[0]) / STD[0];
    float32Data[i + plane] = (g - MEAN[1]) / STD[1];
    float32Data[i + plane * 2] = (b - MEAN[2]) / STD[2];
  }

  return new ort.Tensor("float32", float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function buildMaskFromProbMap(probMap, width, height, sourceImage){
  const photoData = sampleLowResPhoto(sourceImage, width, height);
  let connectedSky = buildSkyMaskBitmapWithSensitivity(probMap, photoData, width, height, 0);
  const thinLineMask = buildThinLineSoftMask(photoData, width, height);
  connectedSky = subtractThinLinesFromSkyBitmap(connectedSky, thinLineMask, width, height);
  const maskCanvas = createMaskCanvasFromBitmap(connectedSky, probMap, width, height);
  return { maskCanvas, probMap, thinLineMask };
}

function buildMaskCanvas(outputData, width, height, sourceImage){
  const fullProb = outputToProbabilities(outputData);
  const probMap = upscaleProbabilityMap(fullProb, INPUT_SIZE, INPUT_SIZE, width, height);
  return buildMaskFromProbMap(probMap, width, height, sourceImage);
}

export function buildSkyMaskBitmapWithSensitivity(probabilities, photoData, width, height, sensitivity = 0){
  const thresholds = resolveSensitivityThresholds(sensitivity);
  let mask = buildTopConnectedSkyMask(probabilities, width, height);
  mask = includeOccludedSkyRegions(mask, probabilities, width, height, thresholds);
  mask = includeSkyPocketsFromPhoto(mask, probabilities, photoData, width, height, thresholds);
  mask = fillSkyEnclosedHoles(mask, photoData, width, height);
  mask = fillBrightSkyGaps(mask, probabilities, photoData, width, height);
  mask = closeBrightSkyOpenings(mask, photoData, width, height);
  return mask;
}

export function buildThinLineSoftMask(photoData, width, height){
  const count = width * height;
  const lum = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    lum[i] = samplePhotoLuminance(photoData, i * 4);
  }

  const edge = new Float32Array(count);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + width] - lum[i - width];
      edge[i] = Math.hypot(gx, gy);
    }
  }

  const soft = new Float32Array(count);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = y * width + x;
      if (edge[i] < 0.06) continue;
      if (lum[i] > 0.52) continue;

      let maxNeighbor = lum[i];
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          if (!ox && !oy) continue;
          maxNeighbor = Math.max(maxNeighbor, lum[i + oy * width + ox]);
        }
      }

      const contrast = maxNeighbor - lum[i];
      if (contrast < 0.12) continue;
      soft[i] = Math.min(1, edge[i] * 4.5 * contrast);
    }
  }

  return blurFloatMask(soft, width, height, 2);
}

export function createMaskCanvasFromBitmap(bitmap, probabilities, width, height){
  const lowCanvas = document.createElement("canvas");
  lowCanvas.width = width;
  lowCanvas.height = height;
  const lowCtx = lowCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = lowCtx.createImageData(width, height);
  const pixels = imageData.data;

  for (let i = 0; i < probabilities.length; i++) {
    if (!bitmap[i]) {
      pixels[i * 4 + 3] = 0;
      continue;
    }
    pixels[i * 4] = 255;
    pixels[i * 4 + 1] = 255;
    pixels[i * 4 + 2] = 255;
    pixels[i * 4 + 3] = isMaskEdge(bitmap, i, width, height)
      ? confidenceToAlpha(probabilities[i])
      : 255;
  }
  lowCtx.putImageData(imageData, 0, 0);

  const mid = resolveIntermediateSize(width, height);
  const usesMidStage = mid.width < width || mid.height < height;

  const midCanvas = document.createElement("canvas");
  midCanvas.width = mid.width;
  midCanvas.height = mid.height;
  const midCtx = midCanvas.getContext("2d", { willReadFrequently: true });
  midCtx.imageSmoothingEnabled = true;
  midCtx.imageSmoothingQuality = "high";
  midCtx.drawImage(lowCanvas, 0, 0, mid.width, mid.height);
  const refinedMid = refineUpscaledMask(midCanvas, usesMidStage ? 1.1 : 1.25);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskCtx.imageSmoothingEnabled = true;
  maskCtx.imageSmoothingQuality = "high";
  maskCtx.drawImage(refinedMid, 0, 0, width, height);

  if (!usesMidStage) return refinedMid;

  const finalScale = Math.max(width / mid.width, height / mid.height);
  const finalBlur = finalScale > 2 ? 0.75 : 0.5;
  return refineUpscaledMask(maskCanvas, finalBlur);
}

export function samplePhotoImageData(sourceImage, width, height){
  return sampleLowResPhoto(sourceImage, width, height);
}

const GAP_REGION_MIN_PIXELS = 6;
const GAP_REGION_MAX_RATIO = 0.35;

export function discoverSkyGapRegions(probMap, photoData, width, height, coveredMask, options = {}){
  const thresholds = resolveSensitivityThresholds(options.sensitivity ?? 0);
  const visited = new Uint8Array(width * height);
  const regions = [];

  for (let i = 0; i < width * height; i += 1) {
    if (coveredMask[i] || visited[i]) continue;
    if (!canBePocketSeed(i, probMap, photoData, coveredMask, width, height, thresholds)) continue;

    const component = collectPocketComponent(
      i,
      probMap,
      photoData,
      visited,
      coveredMask,
      width,
      height,
      thresholds
    );
    if (!shouldIncludeSkyPocket(component, probMap, photoData, coveredMask, width, height, thresholds)) {
      continue;
    }
    if (component.indices.length < GAP_REGION_MIN_PIXELS) continue;
    if (component.indices.length > width * height * GAP_REGION_MAX_RATIO) continue;

    regions.push(buildGapRegion(component, width, regions.length + 1));
  }

  return regions;
}

function buildGapRegion(component, width, id){
  const { indices, minY, maxY } = component;
  let sumX = 0;
  let sumY = 0;
  let minX = width;
  let maxX = 0;

  for (const index of indices) {
    const x = index % width;
    const y = (index / width) | 0;
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  const count = indices.length;
  return {
    id,
    indices,
    pixelCount: count,
    centroidX: sumX / count,
    centroidY: sumY / count,
    bounds: { minX, minY, maxX, maxY: maxY }
  };
}

export function resolveSensitivityThresholds(sensitivity){
  const strength = clamp01(sensitivity);
  return {
    occludedSkyThreshold: OCCLUDED_SKY_THRESHOLD - strength * 0.22,
    occludedMinAvgProb: OCCLUDED_MIN_AVG_PROB - strength * 0.18,
    occludedMinPixels: Math.max(6, Math.round(OCCLUDED_MIN_PIXELS - strength * 8)),
    pocketProbFloor: POCKET_PROB_FLOOR - strength * 0.1,
    pocketSeedProb: 0.28 - strength * 0.14,
    pocketProbPeakMin: 0.22 - strength * 0.1,
    pocketAvgProbMin: 0.16 - strength * 0.08,
    pocketAvgProbNearMin: 0.24 - strength * 0.1,
    pocketProbPeakNearMin: 0.34 - strength * 0.12,
    pocketNearSkyRadius: POCKET_NEAR_SKY_RADIUS + Math.round(strength * 4)
  };
}

function upscaleProbabilityMap(source, srcWidth, srcHeight, dstWidth, dstHeight){
  const output = new Float32Array(dstWidth * dstHeight);
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    output.set(source);
    return output;
  }

  const xScale = srcWidth / dstWidth;
  const yScale = srcHeight / dstHeight;
  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = y * yScale;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const yWeight = srcY - y0;
    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = x * xScale;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const xWeight = srcX - x0;
      const i00 = y0 * srcWidth + x0;
      const i10 = y0 * srcWidth + x1;
      const i01 = y1 * srcWidth + x0;
      const i11 = y1 * srcWidth + x1;
      const top = source[i00] * (1 - xWeight) + source[i10] * xWeight;
      const bottom = source[i01] * (1 - xWeight) + source[i11] * xWeight;
      output[y * dstWidth + x] = top * (1 - yWeight) + bottom * yWeight;
    }
  }
  return output;
}

export function applyPhotoForegroundProtection(maskCanvas, sourceImage){
  const width = maskCanvas.width;
  const height = maskCanvas.height;
  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = width;
  photoCanvas.height = height;
  const photoCtx = photoCanvas.getContext("2d", { willReadFrequently: true });
  photoCtx.drawImage(sourceImage, 0, 0, width, height);
  const photo = photoCtx.getImageData(0, 0, width, height).data;

  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const maskData = maskCtx.getImageData(0, 0, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = maskData.data[i + 3];
      if (alpha === 0 || alpha >= 250) continue;

      const lum = sampleLuminance(photo, x, y, width);
      const contrast = sampleLocalContrast(photo, x, y, width, height, lum);
      const factor = computeDarkForegroundFactor(lum, alpha / 255, contrast);
      maskData.data[i + 3] = Math.round(alpha * factor);
    }
  }

  maskCtx.putImageData(maskData, 0, 0);
  return maskCanvas;
}

function sampleLuminance(photo, x, y, width){
  const i = (y * width + x) * 4;
  return (photo[i] * 0.299 + photo[i + 1] * 0.587 + photo[i + 2] * 0.114) / 255;
}

function sampleLocalContrast(photo, x, y, width, height, centerLum){
  let maxNeighbor = centerLum;
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      maxNeighbor = Math.max(maxNeighbor, sampleLuminance(photo, nx, ny, width));
    }
  }
  return maxNeighbor - centerLum;
}

function computeDarkForegroundFactor(lum, maskAlpha, contrast){
  if (maskAlpha < 0.06) return 1;

  if (lum < 0.18 && contrast > 0.12) {
    return maskAlpha > 0.25 ? 0.04 : 1;
  }
  if (lum < 0.3 && contrast > 0.1) {
    const darkness = (0.3 - lum) / 0.3;
    const penalty = darkness * Math.min(1, maskAlpha * 1.15) * 0.96;
    return Math.max(0.04, 1 - penalty);
  }
  if (lum < 0.42 && contrast > 0.18 && maskAlpha < 0.82) {
    const darkness = (0.42 - lum) / 0.42;
    return Math.max(0.15, 1 - darkness * (0.82 - maskAlpha) * 1.4);
  }
  return 1;
}

function resolveIntermediateSize(width, height, maxEdge = MASK_INTERMEDIATE_MAX_EDGE){
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  const ratio = width / height;
  if (ratio >= 1) {
    const w = Math.min(width, maxEdge);
    return { width: w, height: Math.max(1, Math.round(w / ratio)) };
  }
  const h = Math.min(height, maxEdge);
  return { width: Math.max(1, Math.round(h * ratio)), height: h };
}

function refineUpscaledMask(maskCanvas, blurPx = 1.25){
  if (!blurPx || blurPx <= 0) {
    const copy = document.createElement("canvas");
    copy.width = maskCanvas.width;
    copy.height = maskCanvas.height;
    copy.getContext("2d", { willReadFrequently: true }).drawImage(maskCanvas, 0, 0);
    return copy;
  }
  const output = document.createElement("canvas");
  output.width = maskCanvas.width;
  output.height = maskCanvas.height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.filter = "none";
  return output;
}

function sampleLowResPhoto(image, width, height){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function includeOccludedSkyRegions(included, probabilities, width, height, thresholds = resolveSensitivityThresholds(0)){
  const output = new Uint8Array(included);
  const visited = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    if (output[i] || visited[i] || probabilities[i] < thresholds.occludedSkyThreshold) continue;

    const component = collectSkyComponent(
      i,
      probabilities,
      visited,
      width,
      height,
      thresholds.occludedSkyThreshold
    );
    if (!shouldIncludeOccludedSkyComponent(component, probabilities, height, thresholds)) continue;

    for (const index of component.indices) {
      output[index] = 1;
    }
  }

  return output;
}

function includeSkyPocketsFromPhoto(included, probabilities, photoData, width, height, thresholds = resolveSensitivityThresholds(0)){
  const output = new Uint8Array(included);
  const visited = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    if (output[i] || visited[i]) continue;
    if (!canBePocketSeed(i, probabilities, photoData, output, width, height, thresholds)) continue;

    const component = collectPocketComponent(
      i,
      probabilities,
      photoData,
      visited,
      output,
      width,
      height,
      thresholds
    );
    if (!shouldIncludeSkyPocket(component, probabilities, photoData, output, width, height, thresholds)) continue;

    for (const index of component.indices) {
      output[index] = 1;
    }
  }

  return output;
}

function canBePocketSeed(index, probabilities, photoData, mask, width, height, thresholds){
  if (!isSkyLikePhoto(photoData, index * 4)) return false;
  const prob = probabilities[index];
  if (prob >= thresholds.pocketSeedProb) return true;
  if (
    prob >= thresholds.pocketProbFloor
    && isNearExistingSky(mask, index, width, height, thresholds.pocketNearSkyRadius)
  ) {
    return true;
  }
  return false;
}

function collectPocketComponent(startIndex, probabilities, photoData, visited, mask, width, height, thresholds){
  const indices = [];
  let minY = height;
  let maxY = 0;
  const queue = [startIndex];
  let head = 0;
  visited[startIndex] = 1;

  while (head < queue.length) {
    const index = queue[head++];
    indices.push(index);
    const x = index % width;
    const y = (index / width) | 0;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    if (x > 0) tryPush(index - 1);
    if (x < width - 1) tryPush(index + 1);
    if (y > 0) tryPush(index - width);
    if (y < height - 1) tryPush(index + width);
  }

  return { indices, minY, maxY };

  function tryPush(neighbor){
    if (visited[neighbor] || mask[neighbor]) return;
    if (!isSkyLikePhoto(photoData, neighbor * 4)) return;
    const prob = probabilities[neighbor];
    if (
      prob < thresholds.pocketProbFloor
      && !isNearExistingSky(mask, neighbor, width, height, thresholds.pocketNearSkyRadius)
    ) {
      return;
    }
    visited[neighbor] = 1;
    queue.push(neighbor);
  }
}

function shouldIncludeSkyPocket(component, probabilities, photoData, mask, width, height, thresholds){
  const { indices, maxY } = component;
  if (indices.length < POCKET_MIN_PIXELS) return false;
  if (maxY >= height - OCCLUDED_BOTTOM_EXCLUDE_ROWS) return false;

  let probSum = 0;
  let probPeak = 0;
  let lumSum = 0;
  let nearSkyCount = 0;

  for (const index of indices) {
    const prob = probabilities[index];
    probSum += prob;
    probPeak = Math.max(probPeak, prob);
    lumSum += samplePhotoLuminance(photoData, index * 4);
    if (isNearExistingSky(mask, index, width, height, 2)) {
      nearSkyCount += 1;
    }
  }

  const averageProb = probSum / indices.length;
  const averageLum = lumSum / indices.length;
  if (averageLum < POCKET_MIN_PHOTO_LUM) return false;
  if (probPeak < thresholds.pocketProbPeakMin && averageProb < thresholds.pocketAvgProbMin) return false;

  const nearSkyRatio = nearSkyCount / indices.length;
  if (
    nearSkyRatio < 0.08
    && averageProb < thresholds.pocketAvgProbNearMin
    && probPeak < thresholds.pocketProbPeakNearMin
  ) {
    return false;
  }

  return true;
}

function fillSkyEnclosedHoles(mask, photoData, width, height){
  const output = new Uint8Array(mask);

  for (let pass = 0; pass < 2; pass++) {
    const added = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        if (output[index]) continue;
        if (!isSkyLikePhoto(photoData, index * 4)) continue;

        let skyNeighbors = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            if (output[(y + oy) * width + (x + ox)]) skyNeighbors += 1;
          }
        }

        if (skyNeighbors >= 3) added[index] = 1;
      }
    }

    for (let i = 0; i < output.length; i++) {
      if (added[i]) output[i] = 1;
    }
  }

  return output;
}

function fillBrightSkyGaps(mask, probabilities, photoData, width, height){
  const output = new Uint8Array(mask);

  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (output[index] || !isBrightSkyLikePhoto(photoData, index * 4)) continue;
        if (!isNearExistingSky(output, index, width, height, 5)) continue;
        if (probabilities[index] < 0.06 && !isNearExistingSky(output, index, width, height, 10)) continue;
        output[index] = 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return output;
}

function closeBrightSkyOpenings(mask, photoData, width, height){
  const output = new Uint8Array(mask);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (output[index] || !isBrightSkyLikePhoto(photoData, index * 4)) continue;

      let skyNeighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (!ox && !oy) continue;
          if (output[(y + oy) * width + (x + ox)]) skyNeighbors += 1;
        }
      }

      if (skyNeighbors >= 5) output[index] = 1;
    }
  }

  return output;
}

export function applyThinLineSkyProtection(bitmap, thinLineMask, width, height){
  if (!thinLineMask) return bitmap;
  return subtractThinLinesFromSkyBitmap(bitmap, thinLineMask, width, height);
}

function subtractThinLinesFromSkyBitmap(mask, thinLineMask, width, height){
  const output = new Uint8Array(mask);
  for (let i = 0; i < mask.length; i += 1) {
    if (!output[i]) continue;
    if (thinLineMask[i] >= 0.42) output[i] = 0;
  }
  return output;
}

function blurFloatMask(source, width, height, radius){
  if (radius <= 0) return source;
  let current = source;
  let next = new Float32Array(source.length);

  for (let pass = 0; pass < radius; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        let sum = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            sum += current[ny * width + nx];
            count += 1;
          }
        }
        next[i] = sum / count;
      }
    }
    const swap = current;
    current = next;
    next = swap;
  }

  return current;
}

function isBrightSkyLikePhoto(photoData, byteIndex){
  const lum = samplePhotoLuminance(photoData, byteIndex);
  if (lum < 0.52) return false;
  const r = photoData[byteIndex];
  const g = photoData[byteIndex + 1];
  const b = photoData[byteIndex + 2];
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
  return saturation <= 0.42;
}
  const output = new Uint8Array(mask);

  for (let pass = 0; pass < 2; pass++) {
    const added = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        if (output[index]) continue;
        if (!isSkyLikePhoto(photoData, index * 4)) continue;

        let skyNeighbors = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            if (output[(y + oy) * width + (x + ox)]) skyNeighbors += 1;
          }
        }

        if (skyNeighbors >= 3) added[index] = 1;
      }
    }

    for (let i = 0; i < output.length; i++) {
      if (added[i]) output[i] = 1;
    }
  }

  return output;
}

function isSkyLikePhoto(photoData, byteIndex){
  const r = photoData[byteIndex];
  const g = photoData[byteIndex + 1];
  const b = photoData[byteIndex + 2];
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  if (lum < POCKET_MIN_PHOTO_LUM) return false;

  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

  if (lum >= 0.58 && saturation <= 0.4) return true;
  if (b >= r * 0.9 && b >= g * 0.85 && lum >= 0.42) return true;
  return lum >= 0.66 && saturation <= 0.28;
}

function isNearExistingSky(mask, index, width, height, radius){
  const x = index % width;
  const y = (index / width) | 0;

  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (mask[ny * width + nx]) return true;
    }
  }

  return false;
}

function samplePhotoLuminance(photoData, byteIndex){
  return (
    photoData[byteIndex] * 0.299
    + photoData[byteIndex + 1] * 0.587
    + photoData[byteIndex + 2] * 0.114
  ) / 255;
}

function collectSkyComponent(startIndex, probabilities, visited, width, height, threshold){
  const indices = [];
  let minY = height;
  let maxY = 0;
  const queue = [startIndex];
  let head = 0;
  visited[startIndex] = 1;

  while (head < queue.length) {
    const index = queue[head++];
    indices.push(index);
    const x = index % width;
    const y = (index / width) | 0;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    if (x > 0) tryPush(index - 1);
    if (x < width - 1) tryPush(index + 1);
    if (y > 0) tryPush(index - width);
    if (y < height - 1) tryPush(index + width);
  }

  return { indices, minY, maxY };

  function tryPush(neighbor){
    if (visited[neighbor] || probabilities[neighbor] < threshold) return;
    visited[neighbor] = 1;
    queue.push(neighbor);
  }
}

function shouldIncludeOccludedSkyComponent(component, probabilities, height, thresholds){
  const { indices, maxY } = component;
  if (indices.length < thresholds.occludedMinPixels) return false;
  if (maxY >= height - OCCLUDED_BOTTOM_EXCLUDE_ROWS) return false;

  let sum = 0;
  let peak = 0;
  for (const index of indices) {
    const value = probabilities[index];
    sum += value;
    peak = Math.max(peak, value);
  }

  const average = sum / indices.length;
  if (average < thresholds.occludedMinAvgProb) return false;
  if (peak < SKY_CONFIDENCE_THRESHOLD) return false;

  return true;
}

function buildTopConnectedSkyMask(probabilities, width, height){
  const visited = new Uint8Array(width * height);
  const connected = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x++) {
    const index = x;
    if (probabilities[index] < SKY_CONNECT_THRESHOLD) continue;
    visited[index] = 1;
    queue.push(index);
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head++];
    connected[index] = 1;
    const x = index % width;
    const y = (index / width) | 0;
    const neighbors = [];

    if (x > 0) neighbors.push(index - 1);
    if (x < width - 1) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - width);
    if (y < height - 1) neighbors.push(index + width);

    for (const neighbor of neighbors) {
      if (visited[neighbor] || probabilities[neighbor] < SKY_CONNECT_THRESHOLD) continue;
      visited[neighbor] = 1;
      queue.push(neighbor);
    }
  }

  return connected;
}

function isMaskEdge(bitmap, index, width, height){
  if (!bitmap[index]) return false;
  const x = index % width;
  const y = (index / width) | 0;
  if (x > 0 && !bitmap[index - 1]) return true;
  if (x < width - 1 && !bitmap[index + 1]) return true;
  if (y > 0 && !bitmap[index - width]) return true;
  if (y < height - 1 && !bitmap[index + width]) return true;
  return false;
}

function confidenceToAlpha(probability){
  const low = SKY_CONFIDENCE_THRESHOLD - SKY_CONFIDENCE_SOFTNESS;
  const high = SKY_CONFIDENCE_THRESHOLD + SKY_CONFIDENCE_SOFTNESS;
  let value = 0;
  if (probability <= low) value = 0;
  else if (probability >= high) value = 1;
  else value = (probability - low) / (high - low);
  return Math.round(value * 255);
}

/** @deprecated Use alpha composite in magicSkyTool instead. */
export function buildForegroundProtectMask(maskCanvas){
  const output = document.createElement("canvas");
  output.width = maskCanvas.width;
  output.height = maskCanvas.height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(maskCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, output.width, output.height);
  const data = imageData.data;

  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] < 140 ? 255 : 0;
  }

  ctx.putImageData(imageData, 0, 0);
  return output;
}

export function sampleSkyMaskAt(maskEntry, layout, canvasX, canvasY){
  if (!maskEntry?.maskCanvas || !layout) return 0;
  const localX = ((canvasX - layout.x) / layout.width) * maskEntry.width;
  const localY = ((canvasY - layout.y) / layout.height) * maskEntry.height;
  if (localX < 0 || localY < 0 || localX >= maskEntry.width || localY >= maskEntry.height) return 0;

  const ctx = maskEntry.maskCanvas.getContext("2d", { willReadFrequently: true });
  const pixel = ctx.getImageData(Math.floor(localX), Math.floor(localY), 1, 1).data;
  return pixel[3] / 255;
}

function clamp01(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
