// F9 追焦 - AI 主體分割 v0.1.1
// DeepLabV3-MobileViT + 騎士／細結構（車輪）復原。
// 自行車輪框常被模型漏標：以軟機率、型態學閉合、輪位圓盤補回。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/Xenova/deeplabv3-mobilevit-small/resolve/main/onnx/model_quantized.onnx";
const MODEL_CACHE_NAME = "photo-effects-panfocus-deeplab-v1";
const MASK_PIPELINE_VERSION = 2;
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
const THIN_VEHICLE_IDS = new Set([
  SUBJECT_CLASS_IDS.bicycle,
  SUBJECT_CLASS_IDS.motorbike
]);

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
  return buildMaskFromAnalysis(analysis, sourceImage, options);
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
  const upscaled = upscaleLabelMapsBilinear(labeled, width, height);
  const classCounts = countSubjectClasses(upscaled.classMap, width, height);
  const subjectCoverage = countCoverage(upscaled.subjectScore, width, height, 0.28);
  const resolvedDirection = resolveAutoDirection(upscaled.subjectScore, width, height);
  const needsThinRecovery = (
    classCounts.bicycle > 0
    || classCounts.motorbike > 0
    || classCounts.person > 0
  ) && classCounts.car === 0 && classCounts.bus === 0;

  const entry = {
    width,
    height,
    classMap: upscaled.classMap,
    subjectScore: upscaled.subjectScore,
    personScore: upscaled.personScore,
    bicycleScore: upscaled.bicycleScore,
    motorbikeScore: upscaled.motorbikeScore,
    vehicleScore: upscaled.vehicleScore,
    subjectCoverage,
    resolvedDirection,
    classCounts,
    needsThinRecovery,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
  analysisCache.set(key, entry);
  return entry;
}

function buildMaskFromAnalysis(analysis, sourceImage, options = {}){
  const threshold = clamp01(Number(options.subjectThreshold ?? 55) / 100);
  const expandPx = Math.max(0, Math.round(Number(options.subjectExpand ?? 0)));
  const featherPx = Math.max(0, Math.round(Number(options.edgeFeather ?? 0)));
  const width = analysis.width;
  const height = analysis.height;

  // Higher slider = more sensitive (keeps weaker subject pixels).
  const personFloor = 0.72 - threshold * 0.5;
  const vehicleFloor = 0.55 - threshold * 0.45;
  const thinFloor = 0.04 + (1 - threshold) * 0.08;

  const alpha = new Uint8ClampedArray(width * height);
  let kept = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    const person = analysis.personScore[i];
    const vehicle = analysis.vehicleScore[i];
    const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
    const score = Math.max(
      person >= personFloor ? person : 0,
      vehicle >= vehicleFloor ? vehicle : 0,
      thin >= thinFloor ? Math.min(1, thin * 4.5) : 0,
      analysis.subjectScore[i] >= (0.7 - threshold * 0.45) ? analysis.subjectScore[i] : 0
    );
    if (score <= 0) {
      alpha[i] = 0;
      continue;
    }
    alpha[i] = Math.round(clamp01(score) * 255);
    kept += 1;
  }

  // Recover bicycle / motorcycle thin parts that DeepLab often misses.
  // Trigger when hard labels exist, or soft bike/moto probability is present near a rider.
  const thinSoftMax = maxFloat(analysis.bicycleScore, analysis.motorbikeScore);
  if (
    analysis.classCounts.bicycle > 0
    || analysis.classCounts.motorbike > 0
    || (analysis.classCounts.person > 0 && analysis.classCounts.car === 0 && thinSoftMax > 0.02)
  ) {
    recoverRiderCraft(alpha, analysis, sourceImage, width, height);
  }

  // Morphological close: fill spokes / small gaps inside wheels & frames.
  let maskCanvas = alphaToMaskCanvas(alpha, width, height);
  const closeRadius = analysis.needsThinRecovery || analysis.classCounts.bicycle || analysis.classCounts.motorbike
    ? Math.max(4, Math.round(Math.min(width, height) * 0.012))
    : 2;
  maskCanvas = closeMaskCanvas(maskCanvas, closeRadius);

  const autoExpand = (analysis.needsThinRecovery || analysis.classCounts.bicycle || analysis.classCounts.motorbike)
    ? Math.max(expandPx, Math.round(6 + threshold * 10))
    : expandPx;
  if (autoExpand > 0) maskCanvas = dilateMaskCanvas(maskCanvas, autoExpand);
  if (featherPx > 0) maskCanvas = featherMaskCanvas(maskCanvas, featherPx);

  // Recount coverage from final mask alpha.
  const finalCoverage = estimateMaskCoverage(maskCanvas);

  return {
    width,
    height,
    maskCanvas,
    subjectCoverage: Math.max(kept / Math.max(1, width * height), finalCoverage),
    resolvedDirection: analysis.resolvedDirection,
    classCounts: analysis.classCounts,
    needsThinRecovery: analysis.needsThinRecovery,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
}

/**
 * For each person blob, inject wheel disks + lower craft capsule, then keep
 * dark / colorful structure pixels so tires and fenders stay sharp.
 */
function recoverRiderCraft(alpha, analysis, sourceImage, width, height){
  const personBinary = new Uint8Array(width * height);
  for (let i = 0; i < personBinary.length; i += 1) {
    if (analysis.personScore[i] > 0.28 || alpha[i] > 120) personBinary[i] = 1;
  }

  const components = labelComponents(personBinary, width, height, Math.max(250, width * height * 0.0008));
  if (!components.length) return;

  const photo = samplePhotoStats(sourceImage, width, height);
  const craft = document.createElement("canvas");
  craft.width = width;
  craft.height = height;
  const ctx = craft.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";

  for (const box of components) {
    const pw = box.x1 - box.x0 + 1;
    const ph = box.y1 - box.y0 + 1;
    if (ph < 24 || pw < 12) continue;

    const bx0 = Math.max(0, Math.floor(box.x0 - pw * 0.48));
    const bx1 = Math.min(width - 1, Math.ceil(box.x1 + pw * 0.48));
    const by1 = Math.min(height - 1, Math.ceil(box.y1 + ph * 0.58));
    const top = Math.max(0, Math.floor(box.y0 + ph * 0.34));
    // Wheels sit at / slightly below the person's feet; use a larger disk so tire
    // contact patches are not eaten by background pan blur.
    const radius = Math.max(12, Math.round(ph * 0.28));
    const cy = Math.min(height - 1, Math.round(box.y1 + radius * 0.18));
    const cxA = Math.round(bx0 + (bx1 - bx0) * 0.18);
    const cxB = Math.round(bx0 + (bx1 - bx0) * 0.82);

    // Wheel disks (keep original spokes/tires by solid disk in subject mask).
    ctx.beginPath();
    ctx.arc(cxA, cy, radius, 0, Math.PI * 2);
    ctx.arc(cxB, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Lower capsule for frame / fender / drivetrain.
    const rr = Math.max(8, Math.round(ph * 0.1));
    roundRect(ctx, bx0, top, bx1 - bx0, by1 - top, rr);
    ctx.fill();
  }

  const craftAlpha = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < width * height; i += 1) {
    const craftA = craftAlpha[i * 4 + 3];
    if (craftA < 20) continue;

    // Always keep wheel/capsule core when dark (tires) or colorful (frames),
    // and always keep strong person/vehicle probabilities inside craft.
    const darkBoost = photo.dark[i];
    const colorBoost = photo.colorful[i];
    const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
    const person = analysis.personScore[i];
    const inDiskCore = craftA > 200;

    if (inDiskCore || darkBoost || colorBoost || thin > 0.03 || person > 0.2) {
      const target = inDiskCore ? 255 : Math.max(alpha[i], darkBoost || colorBoost ? 235 : 190);
      if (target > alpha[i]) alpha[i] = target;
    }
  }
}

function samplePhotoStats(sourceImage, width, height){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceImage, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const dark = new Uint8Array(width * height);
  const colorful = new Uint8Array(width * height);
  const lum = new Float32Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = y;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = (maxC - minC) / Math.max(1, maxC);
    if (sat > 0.16 && y > 28 && y < 225) colorful[i] = 1;
  }

  // Local darkness vs blurred luminance (tires / frames).
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          sum += lum[(y + dy) * width + (x + dx)];
        }
      }
      const local = sum / 9;
      if (local - lum[i] > 10 || lum[i] < 48) dark[i] = 1;
    }
  }

  return { dark, colorful };
}

function labelComponents(binary, width, height, minArea){
  const seen = new Uint8Array(binary.length);
  const boxes = [];
  const stack = new Int32Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    if (!binary[i] || seen[i]) continue;
    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (top > 0) {
      const idx = stack[--top];
      const x = idx % width;
      const y = (idx - x) / width;
      area += 1;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (x > 0) {
        const n = idx - 1;
        if (binary[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
      }
      if (x + 1 < width) {
        const n = idx + 1;
        if (binary[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
      }
      if (y > 0) {
        const n = idx - width;
        if (binary[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
      }
      if (y + 1 < height) {
        const n = idx + width;
        if (binary[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
      }
    }
    if (area >= minArea) boxes.push({ x0, y0, x1, y1, area });
  }
  return boxes;
}

function roundRect(ctx, x, y, w, h, r){
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
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
  const personScore = new Float32Array(plane);
  const bicycleScore = new Float32Array(plane);
  const motorbikeScore = new Float32Array(plane);
  const vehicleScore = new Float32Array(plane);

  for (let i = 0; i < plane; i += 1) {
    let bestClass = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < numLabels; c += 1) {
      const score = data[c * plane + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    classMap[i] = bestClass;

    let maxLogit = bestScore;
    let denom = 0;
    let subjectMass = 0;
    let personMass = 0;
    let bicycleMass = 0;
    let motorbikeMass = 0;
    let vehicleMass = 0;
    for (let c = 0; c < numLabels; c += 1) {
      const e = Math.exp(data[c * plane + i] - maxLogit);
      denom += e;
      if (SUBJECT_ID_SET.has(c)) subjectMass += e;
      if (c === SUBJECT_CLASS_IDS.person) personMass += e;
      if (c === SUBJECT_CLASS_IDS.bicycle) bicycleMass += e;
      if (c === SUBJECT_CLASS_IDS.motorbike) motorbikeMass += e;
      if (
        c === SUBJECT_CLASS_IDS.bicycle
        || c === SUBJECT_CLASS_IDS.motorbike
        || c === SUBJECT_CLASS_IDS.car
        || c === SUBJECT_CLASS_IDS.bus
      ) vehicleMass += e;
    }
    const inv = 1 / Math.max(1e-6, denom);
    const subProb = subjectMass * inv;
    personScore[i] = personMass * inv;
    bicycleScore[i] = bicycleMass * inv;
    motorbikeScore[i] = motorbikeMass * inv;
    vehicleScore[i] = vehicleMass * inv;
    subjectScore[i] = SUBJECT_ID_SET.has(bestClass) ? Math.max(subProb, 0.55) : subProb;
    if (THIN_VEHICLE_IDS.has(bestClass)) {
      subjectScore[i] = Math.max(subjectScore[i], 0.72);
    }
  }

  return {
    classMap,
    subjectScore,
    personScore,
    bicycleScore,
    motorbikeScore,
    vehicleScore,
    width,
    height
  };
}

function upscaleLabelMapsBilinear(labeled, destW, destH){
  const srcW = labeled.width;
  const srcH = labeled.height;
  const outClass = new Uint8Array(destW * destH);
  const outSubject = new Float32Array(destW * destH);
  const outPerson = new Float32Array(destW * destH);
  const outBike = new Float32Array(destW * destH);
  const outMoto = new Float32Array(destW * destH);
  const outVehicle = new Float32Array(destW * destH);

  for (let y = 0; y < destH; y += 1) {
    const fy = ((y + 0.5) * srcH / destH) - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const ty = clamp01(fy - y0);
    for (let x = 0; x < destW; x += 1) {
      const fx = ((x + 0.5) * srcW / destW) - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const tx = clamp01(fx - x0);
      const destIndex = y * destW + x;

      const i00 = y0 * srcW + x0;
      const i01 = y0 * srcW + x1;
      const i10 = y1 * srcW + x0;
      const i11 = y1 * srcW + x1;

      outSubject[destIndex] = bilerp(labeled.subjectScore, i00, i01, i10, i11, tx, ty);
      outPerson[destIndex] = bilerp(labeled.personScore, i00, i01, i10, i11, tx, ty);
      outBike[destIndex] = bilerp(labeled.bicycleScore, i00, i01, i10, i11, tx, ty);
      outMoto[destIndex] = bilerp(labeled.motorbikeScore, i00, i01, i10, i11, tx, ty);
      outVehicle[destIndex] = bilerp(labeled.vehicleScore, i00, i01, i10, i11, tx, ty);

      // Nearest for hard class map.
      const nx = Math.min(srcW - 1, Math.max(0, Math.round(fx)));
      const ny = Math.min(srcH - 1, Math.max(0, Math.round(fy)));
      outClass[destIndex] = labeled.classMap[ny * srcW + nx];
    }
  }

  return {
    classMap: outClass,
    subjectScore: outSubject,
    personScore: outPerson,
    bicycleScore: outBike,
    motorbikeScore: outMoto,
    vehicleScore: outVehicle
  };
}

function bilerp(arr, i00, i01, i10, i11, tx, ty){
  const a = arr[i00] * (1 - tx) + arr[i01] * tx;
  const b = arr[i10] * (1 - tx) + arr[i11] * tx;
  return a * (1 - ty) + b * ty;
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
      if (value < 0.28) continue;
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

function closeMaskCanvas(maskCanvas, radius){
  if (radius <= 0) return maskCanvas;
  const dilated = dilateMaskCanvas(maskCanvas, radius);
  return erodeMaskCanvas(dilated, Math.max(1, Math.round(radius * 0.65)));
}

function erodeMaskCanvas(maskCanvas, radius){
  if (radius <= 0) return maskCanvas;
  const out = document.createElement("canvas");
  out.width = maskCanvas.width;
  out.height = maskCanvas.height;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = "destination-in";
  const steps = Math.max(4, Math.min(18, radius * 2));
  for (let i = 0; i < steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    ctx.drawImage(maskCanvas, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return out;
}

function dilateMaskCanvas(maskCanvas, radius){
  if (radius <= 0) return maskCanvas;
  const out = document.createElement("canvas");
  out.width = maskCanvas.width;
  out.height = maskCanvas.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  const steps = Math.max(4, Math.min(24, radius * 2));
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
  ctx.filter = `blur(${Math.max(0.5, radius * 0.4)}px)`;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.filter = "none";
  return out;
}

function estimateMaskCoverage(maskCanvas){
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  let kept = 0;
  for (let i = 0; i < width * height; i += 1) {
    if (data[i * 4 + 3] > 40) kept += 1;
  }
  return kept / Math.max(1, width * height);
}

function maxFloat(a, b){
  let best = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const v = a[i] > b[i] ? a[i] : b[i];
    if (v > best) best = v;
  }
  return best;
}

function clamp01(value){
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
