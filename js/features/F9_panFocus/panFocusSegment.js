// F9 追焦 - AI 主體分割 v0.1.0
// DeepLabV3-MobileViT（Pascal VOC）：保留 car / motorbike / bicycle / bus / person。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/Xenova/deeplabv3-mobilevit-small/resolve/main/onnx/model_quantized.onnx";
const MODEL_CACHE_NAME = "photo-effects-panfocus-deeplab-v1";
const MASK_PIPELINE_VERSION = 1;
const INPUT_SIZE = 512;

/** Pascal VOC labels kept sharp for panning focus. */
export const SUBJECT_CLASS_IDS = Object.freeze({
  bicycle: 2,
  bus: 6,
  car: 7,
  motorbike: 14,
  person: 15
});

const SUBJECT_ID_SET = new Set(Object.values(SUBJECT_CLASS_IDS));

let ortModule = null;
let sessionPromise = null;
/** @type {Map<string, any>} */
const analysisCache = new Map();

export function getPanFocusMaskCacheKey(sourceImageDataUrl){
  if (!sourceImageDataUrl) return "";
  if (sourceImageDataUrl.length <= 4096) return sourceImageDataUrl;
  return `${sourceImageDataUrl.length}:${sourceImageDataUrl.slice(0, 64)}:${sourceImageDataUrl.slice(-64)}`;
}

export function clearPanFocusMaskCache(){
  analysisCache.clear();
}

export function preloadPanFocusSegmentModel(onStatus = () => {}){
  return ensureSession(onStatus);
}

export async function releasePanFocusSegmentSession(){
  if (!sessionPromise) return;
  try {
    const session = await sessionPromise;
    await session.release?.();
  } catch (error) {
    console.warn("[F9 追焦] 釋放主體分割模型失敗：", error);
  } finally {
    sessionPromise = null;
  }
}

/**
 * Run (or reuse) segmentation analysis, then build a feathered subject mask.
 */
export async function ensurePanFocusMask(sourceImage, photoKey, options = {}){
  const key = photoKey || "default";
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const analysis = await ensureAnalysis(sourceImage, key, onStatus);
  return buildMaskFromAnalysis(analysis, options);
}

async function ensureAnalysis(sourceImage, key, onStatus){
  const width = sourceImage.width || sourceImage.naturalWidth;
  const height = sourceImage.height || sourceImage.naturalHeight;
  const cached = analysisCache.get(key);
  if (
    cached?.width === width
    && cached?.height === height
    && cached?.pipelineVersion === MASK_PIPELINE_VERSION
  ) {
    return cached;
  }

  onStatus("分析主體中…");
  const session = await ensureSession(onStatus);
  onStatus("辨識汽車／機車／騎士…");
  const logitsTensor = await runInference(session, sourceImage);
  const labeled = logitsToLabelMaps(logitsTensor);
  const upscaled = upscaleLabelMaps(labeled, width, height);
  const classCounts = countSubjectClasses(upscaled.classMap, width, height);
  const subjectCoverage = countCoverage(upscaled.subjectScore, width, height, 0.35);
  const resolvedDirection = resolveAutoDirection(upscaled.subjectScore, width, height);

  const entry = {
    width,
    height,
    classMap: upscaled.classMap,
    subjectScore: upscaled.subjectScore,
    subjectCoverage,
    resolvedDirection,
    classCounts,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
  analysisCache.set(key, entry);
  return entry;
}

function buildMaskFromAnalysis(analysis, options = {}){
  const threshold = clamp01(Number(options.subjectThreshold ?? 45) / 100);
  const expandPx = Math.max(0, Math.round(Number(options.subjectExpand ?? 0)));
  const featherPx = Math.max(0, Math.round(Number(options.edgeFeather ?? 0)));
  const width = analysis.width;
  const height = analysis.height;

  // Higher slider = more sensitive (keeps weaker subject pixels).
  const keepFloor = 0.78 - threshold * 0.55;
  const alpha = new Uint8ClampedArray(width * height);
  let kept = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    const score = analysis.subjectScore[i];
    if (score < keepFloor) {
      alpha[i] = 0;
      continue;
    }
    const t = (score - keepFloor) / Math.max(0.001, 1 - keepFloor);
    alpha[i] = Math.round(clamp01(t) * 255);
    kept += 1;
  }

  let maskCanvas = alphaToMaskCanvas(alpha, width, height);
  if (expandPx > 0) maskCanvas = dilateMaskCanvas(maskCanvas, expandPx);
  if (featherPx > 0) maskCanvas = featherMaskCanvas(maskCanvas, featherPx);

  return {
    width,
    height,
    maskCanvas,
    subjectCoverage: kept / Math.max(1, width * height),
    resolvedDirection: analysis.resolvedDirection,
    classCounts: analysis.classCounts,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
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
      console.warn("[F9 追焦] 模型快取讀取失敗：", error);
    }
  }

  onStatus("下載 AI 模型（首次約 7MB，請稍候）…");
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
      console.warn("[F9 追焦] 模型快取寫入失敗：", error);
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
  return results[outputName];
}

/**
 * Stretch-resize to 512² (aligned with full-frame mask upscale),
 * rescale /255, BGR channel order, NCHW — matches MobileViTFeatureExtractor.
 */
function preprocessImage(image, ort){
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i += 1) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    float32Data[i] = b;
    float32Data[i + plane] = g;
    float32Data[i + plane * 2] = r;
  }

  return new ort.Tensor("float32", float32Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

function logitsToLabelMaps(logitsTensor){
  const data = logitsTensor.data;
  const dims = logitsTensor.dims;
  const numLabels = dims[1];
  const height = dims[2];
  const width = dims[3];
  const plane = height * width;
  const classMap = new Uint8Array(plane);
  const subjectScore = new Float32Array(plane);

  for (let i = 0; i < plane; i += 1) {
    let bestClass = 0;
    let bestScore = -Infinity;
    let bestSubject = -Infinity;
    for (let c = 0; c < numLabels; c += 1) {
      const score = data[c * plane + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
      if (SUBJECT_ID_SET.has(c) && score > bestSubject) bestSubject = score;
    }
    classMap[i] = bestClass;

    if (!SUBJECT_ID_SET.has(bestClass) && bestSubject < -1e8) {
      subjectScore[i] = 0;
      continue;
    }

    // Softmax probability mass of all subject classes.
    let maxLogit = bestScore;
    if (bestSubject > maxLogit) maxLogit = bestSubject;
    let denom = 0;
    let subjectMass = 0;
    for (let c = 0; c < numLabels; c += 1) {
      const e = Math.exp(data[c * plane + i] - maxLogit);
      denom += e;
      if (SUBJECT_ID_SET.has(c)) subjectMass += e;
    }
    const prob = subjectMass / Math.max(1e-6, denom);
    subjectScore[i] = SUBJECT_ID_SET.has(bestClass) ? Math.max(prob, 0.55) : prob;
  }

  return { classMap, subjectScore, width, height };
}

function upscaleLabelMaps(labeled, destW, destH){
  const { classMap, subjectScore, width: srcW, height: srcH } = labeled;
  const outClass = new Uint8Array(destW * destH);
  const outScore = new Float32Array(destW * destH);

  for (let y = 0; y < destH; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * srcH / destH));
    for (let x = 0; x < destW; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * srcW / destW));
      const srcIndex = sy * srcW + sx;
      const destIndex = y * destW + x;
      outClass[destIndex] = classMap[srcIndex];
      outScore[destIndex] = subjectScore[srcIndex];
    }
  }

  return { classMap: outClass, subjectScore: outScore };
}

function countSubjectClasses(classMap, width, height){
  const counts = { bicycle: 0, bus: 0, car: 0, motorbike: 0, person: 0 };
  for (let i = 0; i < width * height; i += 1) {
    const id = classMap[i];
    if (id === SUBJECT_CLASS_IDS.bicycle) counts.bicycle += 1;
    else if (id === SUBJECT_CLASS_IDS.bus) counts.bus += 1;
    else if (id === SUBJECT_CLASS_IDS.car) counts.car += 1;
    else if (id === SUBJECT_CLASS_IDS.motorbike) counts.motorbike += 1;
    else if (id === SUBJECT_CLASS_IDS.person) counts.person += 1;
  }
  return counts;
}

function countCoverage(score, width, height, floor){
  let kept = 0;
  for (let i = 0; i < width * height; i += 1) {
    if (score[i] >= floor) kept += 1;
  }
  return kept / Math.max(1, width * height);
}

function resolveAutoDirection(score, width, height){
  let leftMass = 0;
  let rightMass = 0;
  const mid = width * 0.5;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = score[y * width + x];
      if (value < 0.35) continue;
      if (x < mid) leftMass += value;
      else rightMass += value;
    }
  }
  if (rightMass >= leftMass) return "left";
  return "right";
}

function alphaToMaskCanvas(alpha, width, height){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  for (let i = 0; i < alpha.length; i += 1) {
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = alpha[i];
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function dilateMaskCanvas(maskCanvas, radius){
  if (radius <= 0) return maskCanvas;
  const out = document.createElement("canvas");
  out.width = maskCanvas.width;
  out.height = maskCanvas.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  const steps = Math.max(4, Math.min(20, radius * 2));
  for (let i = 0; i < steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    ctx.drawImage(maskCanvas, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.globalCompositeOperation = "source-over";
  return out;
}

function featherMaskCanvas(maskCanvas, radius){
  if (radius <= 0) return maskCanvas;
  const out = document.createElement("canvas");
  out.width = maskCanvas.width;
  out.height = maskCanvas.height;
  const ctx = out.getContext("2d");
  ctx.filter = `blur(${Math.max(0.5, radius * 0.45)}px)`;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.filter = "none";
  return out;
}

function clamp01(value){
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
