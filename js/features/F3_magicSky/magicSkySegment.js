// F3 魔法天空 - AI 天空分割 v0.3.6
// 320 推論 → 640 中繼放大 → 全尺寸遮罩。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/voyagerfromeast/skyseg/resolve/main/skyseg_fp16.onnx";
const MODEL_CACHE_NAME = "photo-effects-skyseg-model-v1";
const MASK_PIPELINE_VERSION = 4;
const INPUT_SIZE = 320;
const MASK_INTERMEDIATE_MAX_EDGE = 640;
const SKY_CONFIDENCE_THRESHOLD = 0.58;
const SKY_CONFIDENCE_SOFTNESS = 0.14;
const SKY_CONNECT_THRESHOLD = 0.38;
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
  const maskCanvas = buildMaskCanvas(output, sourceImage.width, sourceImage.height);
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

function buildMaskCanvas(outputData, width, height){
  const probabilities = new Float32Array(INPUT_SIZE * INPUT_SIZE);
  for (let i = 0; i < probabilities.length; i++) {
    probabilities[i] = clamp01(outputData[i]);
  }

  const connectedSky = buildTopConnectedSkyMask(probabilities, INPUT_SIZE, INPUT_SIZE);
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

  while (queue.length) {
    const index = queue.shift();
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
