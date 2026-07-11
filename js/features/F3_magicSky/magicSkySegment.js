// F3 魔法天空 - AI 天空分割 v0.3.11
// 320 推論 → 640 中繼 → 頂部連通 + 遮蔽區 + 狹小天空口袋。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/voyagerfromeast/skyseg/resolve/main/skyseg_fp16.onnx";
const MODEL_CACHE_NAME = "photo-effects-skyseg-model-v1";
const MASK_PIPELINE_VERSION = 7;
const INPUT_SIZE = 320;
const MASK_INTERMEDIATE_MAX_EDGE = 640;
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
  const output = await runInference(session, sourceImage);
  const maskCanvas = buildMaskCanvas(output, sourceImage.width, sourceImage.height, sourceImage);
  applyPhotoForegroundProtection(maskCanvas, sourceImage);
  const entry = {
    width: sourceImage.width,
    height: sourceImage.height,
    maskCanvas,
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
  const inputTensor = preprocessImage(image, ort);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  return results[outputName].data;
}

function preprocessImage(image, ort){
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
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

function buildMaskCanvas(outputData, width, height, sourceImage){
  const probabilities = new Float32Array(INPUT_SIZE * INPUT_SIZE);
  for (let i = 0; i < probabilities.length; i++) {
    probabilities[i] = clamp01(outputData[i]);
  }

  const lowPhoto = sampleLowResPhoto(sourceImage, INPUT_SIZE, INPUT_SIZE);
  const connectedSky = buildSkyMaskBitmap(probabilities, lowPhoto, INPUT_SIZE, INPUT_SIZE);
  const lowCanvas = document.createElement("canvas");
  lowCanvas.width = INPUT_SIZE;
  lowCanvas.height = INPUT_SIZE;
  const lowCtx = lowCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = lowCtx.createImageData(INPUT_SIZE, INPUT_SIZE);
  const pixels = imageData.data;

  for (let i = 0; i < probabilities.length; i++) {
    if (!connectedSky[i]) {
      pixels[i * 4 + 3] = 0;
      continue;
    }
    const alpha = confidenceToAlpha(probabilities[i]);
    pixels[i * 4] = 255;
    pixels[i * 4 + 1] = 255;
    pixels[i * 4 + 2] = 255;
    pixels[i * 4 + 3] = alpha;
  }
  lowCtx.putImageData(imageData, 0, 0);

  const targetW = width;
  const targetH = height;
  const mid = resolveIntermediateSize(targetW, targetH);
  const usesMidStage = mid.width < targetW || mid.height < targetH;

  const midCanvas = document.createElement("canvas");
  midCanvas.width = mid.width;
  midCanvas.height = mid.height;
  const midCtx = midCanvas.getContext("2d", { willReadFrequently: true });
  midCtx.imageSmoothingEnabled = true;
  midCtx.imageSmoothingQuality = "high";
  midCtx.drawImage(lowCanvas, 0, 0, mid.width, mid.height);
  const refinedMid = refineUpscaledMask(midCanvas, usesMidStage ? 1.1 : 1.25);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = targetW;
  maskCanvas.height = targetH;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskCtx.imageSmoothingEnabled = true;
  maskCtx.imageSmoothingQuality = "high";
  maskCtx.drawImage(refinedMid, 0, 0, targetW, targetH);

  if (!usesMidStage) return refinedMid;

  const finalScale = Math.max(targetW / mid.width, targetH / mid.height);
  const finalBlur = finalScale > 2 ? 0.75 : 0.5;
  return refineUpscaledMask(maskCanvas, finalBlur);
}

function applyPhotoForegroundProtection(maskCanvas, sourceImage){
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
      if (alpha === 0) continue;

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

function buildSkyMaskBitmap(probabilities, photoData, width, height){
  let mask = buildTopConnectedSkyMask(probabilities, width, height);
  mask = includeOccludedSkyRegions(mask, probabilities, width, height);
  mask = includeSkyPocketsFromPhoto(mask, probabilities, photoData, width, height);
  mask = fillSkyEnclosedHoles(mask, photoData, width, height);
  return mask;
}

function includeOccludedSkyRegions(included, probabilities, width, height){
  const output = new Uint8Array(included);
  const visited = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    if (output[i] || visited[i] || probabilities[i] < OCCLUDED_SKY_THRESHOLD) continue;

    const component = collectSkyComponent(i, probabilities, visited, width, height, OCCLUDED_SKY_THRESHOLD);
    if (!shouldIncludeOccludedSkyComponent(component, probabilities, height)) continue;

    for (const index of component.indices) {
      output[index] = 1;
    }
  }

  return output;
}

function includeSkyPocketsFromPhoto(included, probabilities, photoData, width, height){
  const output = new Uint8Array(included);
  const visited = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    if (output[i] || visited[i]) continue;
    if (!canBePocketSeed(i, probabilities, photoData, output, width, height)) continue;

    const component = collectPocketComponent(i, probabilities, photoData, visited, output, width, height);
    if (!shouldIncludeSkyPocket(component, probabilities, photoData, output, width, height)) continue;

    for (const index of component.indices) {
      output[index] = 1;
    }
  }

  return output;
}

function canBePocketSeed(index, probabilities, photoData, mask, width, height){
  if (!isSkyLikePhoto(photoData, index * 4)) return false;
  const prob = probabilities[index];
  if (prob >= 0.28) return true;
  if (prob >= POCKET_PROB_FLOOR && isNearExistingSky(mask, index, width, height, POCKET_NEAR_SKY_RADIUS)) {
    return true;
  }
  return false;
}

function collectPocketComponent(startIndex, probabilities, photoData, visited, mask, width, height){
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
    if (prob < POCKET_PROB_FLOOR && !isNearExistingSky(mask, neighbor, width, height, POCKET_NEAR_SKY_RADIUS)) {
      return;
    }
    visited[neighbor] = 1;
    queue.push(neighbor);
  }
}

function shouldIncludeSkyPocket(component, probabilities, photoData, mask, width, height){
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
  if (probPeak < 0.22 && averageProb < 0.16) return false;

  const nearSkyRatio = nearSkyCount / indices.length;
  if (nearSkyRatio < 0.08 && averageProb < 0.24 && probPeak < 0.34) return false;

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

function shouldIncludeOccludedSkyComponent(component, probabilities, height){
  const { indices, maxY } = component;
  if (indices.length < OCCLUDED_MIN_PIXELS) return false;
  if (maxY >= height - OCCLUDED_BOTTOM_EXCLUDE_ROWS) return false;

  let sum = 0;
  let peak = 0;
  for (const index of indices) {
    const value = probabilities[index];
    sum += value;
    peak = Math.max(peak, value);
  }

  const average = sum / indices.length;
  if (average < OCCLUDED_MIN_AVG_PROB) return false;
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
