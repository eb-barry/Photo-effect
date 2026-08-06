// F9 追焦 - AI 主體分割 v0.1.5
// DeepLabV3-MobileViT（類別）+ U2-Netp（汽車／主體去背精修）+ 細結構復原。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/Xenova/deeplabv3-mobilevit-small/resolve/main/onnx/model_quantized.onnx";
const MODEL_CACHE_NAME = "photo-effects-panfocus-deeplab-v1";
/** General object matting (~4.5MB). Much better car silhouettes than VOC DeepLab alone. */
const MATTE_MODEL_URL = "https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx";
const MATTE_CACHE_NAME = "photo-effects-panfocus-u2netp-v1";
const MASK_PIPELINE_VERSION = 6;
const INPUT_SIZE = 512;
const MATTE_SIZE = 320;
const MATTE_MEAN = [0.485, 0.456, 0.406];
const MATTE_STD = [0.229, 0.224, 0.225];
/** Hard cap for mask buffers — never allocate megapixel float maps. */
const MASK_MAX_EDGE = 1280;

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
let matteSessionPromise = null;
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
  return Promise.all([
    ensureSession(onStatus),
    ensureMatteSession(onStatus).catch(error => {
      console.warn("[F9 追焦] 汽車去背模型預載失敗：", error);
      return null;
    })
  ]);
}

export async function releasePanFocusSegmentSession(){
  const releaseOne = async (promise, label) => {
    if (!promise) return;
    try {
      const session = await promise;
      await session.release?.();
    } catch (error) {
      console.warn(`[F9 追焦] 釋放${label}失敗：`, error);
    }
  };
  await releaseOne(sessionPromise, "主體分割模型");
  await releaseOne(matteSessionPromise, "汽車去背模型");
  sessionPromise = null;
  matteSessionPromise = null;
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
  const srcW = sourceImage.width || sourceImage.naturalWidth || 1;
  const srcH = sourceImage.height || sourceImage.naturalHeight || 1;
  const { width, height } = clampMaskSize(srcW, srcH);
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
  const carSoftMax = Math.max(maxArray(upscaled.carScore), maxArray(upscaled.busScore));
  const thinSoftMax = Math.max(maxArray(upscaled.bicycleScore), maxArray(upscaled.motorbikeScore));
  const needsThinRecovery = (
    classCounts.bicycle > 0
    || classCounts.motorbike > 0
    || classCounts.person > 0
  ) && classCounts.car === 0 && classCounts.bus === 0 && carSoftMax < 0.08;

  let matteScore = null;
  let usedMatte = false;
  if (shouldRunCarMatte(classCounts, carSoftMax, thinSoftMax, subjectCoverage)) {
    try {
      onStatus("精修汽車去背…");
      const matteSession = await ensureMatteSession(onStatus);
      matteScore = await runMatteInference(matteSession, sourceImage, width, height);
      usedMatte = countCoverage(matteScore, width, height, 0.42) >= 0.04;
      if (!usedMatte) matteScore = null;
    } catch (error) {
      console.warn("[F9 追焦] 汽車去背略過：", error);
      matteScore = null;
      usedMatte = false;
    }
  }

  const entry = {
    width,
    height,
    classMap: upscaled.classMap,
    subjectScore: upscaled.subjectScore,
    personScore: upscaled.personScore,
    bicycleScore: upscaled.bicycleScore,
    motorbikeScore: upscaled.motorbikeScore,
    carScore: upscaled.carScore,
    busScore: upscaled.busScore,
    vehicleScore: upscaled.vehicleScore,
    matteScore,
    usedMatte,
    subjectCoverage,
    resolvedDirection,
    classCounts,
    needsThinRecovery,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
  analysisCache.set(key, entry);
  return entry;
}

function clampMaskSize(srcW, srcH){
  const edge = Math.max(srcW, srcH);
  if (edge <= MASK_MAX_EDGE) return { width: srcW, height: srcH };
  const scale = MASK_MAX_EDGE / edge;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale))
  };
}

function buildMaskFromAnalysis(analysis, sourceImage, options = {}){
  const threshold = clamp01(Number(options.subjectThreshold ?? 55) / 100);
  const expandPx = Math.max(0, Math.round(Number(options.subjectExpand ?? 0)));
  const featherPx = Math.max(0, Math.round(Number(options.edgeFeather ?? 0)));
  const width = analysis.width;
  const height = analysis.height;

  const hasCarOrBus = analysis.classCounts.car > 0
    || analysis.classCounts.bus > 0
    || maxArray(analysis.carScore) > 0.10
    || maxArray(analysis.busScore) > 0.10;
  const hasThinVehicle = analysis.classCounts.bicycle > 0
    || analysis.classCounts.motorbike > 0
    || maxFloat(analysis.bicycleScore, analysis.motorbikeScore) > 0.08;
  const matteCoverage = analysis.matteScore
    ? countCoverage(analysis.matteScore, width, height, 0.42)
    : 0;
  const preferMatte = Boolean(
    analysis.matteScore
    && matteCoverage >= 0.05
    && matteCoverage <= 0.62
    && (
      hasCarOrBus
      || (!hasThinVehicle && (
        analysis.classCounts.person > 0
        || analysis.subjectCoverage < 0.10
        || matteCoverage > analysis.subjectCoverage * 1.35
      ))
    )
  );

  // Higher slider = more sensitive (keeps weaker subject pixels).
  const personFloor = 0.72 - threshold * 0.5;
  const vehicleFloor = 0.48 - threshold * 0.4;
  const carFloor = 0.10 + (1 - threshold) * 0.08;
  const thinFloor = 0.04 + (1 - threshold) * 0.08;
  const matteFloor = preferMatte
    ? 0.58 - threshold * 0.16
    : 0.50 - threshold * 0.22;

  const alpha = new Uint8ClampedArray(width * height);
  let kept = 0;

  if (preferMatte) {
    // U2-Netp silhouette is the primary car body; DeepLab only supplements.
    // Use a stricter matte floor so soft building/sky leaks stay out.
    for (let i = 0; i < alpha.length; i += 1) {
      const matte = analysis.matteScore[i];
      const person = analysis.personScore[i];
      const car = Math.max(analysis.carScore[i], analysis.busScore[i]);
      let score = 0;
      if (matte >= matteFloor) score = Math.max(score, Math.min(1, matte * 1.02));
      if (car >= carFloor) score = Math.max(score, Math.min(1, Math.max(car * 1.35, 0.62)));
      // Person only if it sits on a confident matte core (driver), not building fragments.
      if (person >= personFloor && matte > 0.45) score = Math.max(score, person);
      if (score <= 0) {
        alpha[i] = 0;
        continue;
      }
      alpha[i] = Math.round(clamp01(score) * 255);
      kept += 1;
    }
  } else {
    for (let i = 0; i < alpha.length; i += 1) {
      const person = analysis.personScore[i];
      const vehicle = analysis.vehicleScore[i];
      const car = Math.max(analysis.carScore[i], analysis.busScore[i]);
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const score = Math.max(
        person >= personFloor ? person : 0,
        vehicle >= vehicleFloor ? vehicle : 0,
        car >= carFloor ? Math.min(1, Math.max(car * 1.35, 0.62)) : 0,
        thin >= thinFloor ? Math.min(1, thin * 4.5) : 0,
        analysis.subjectScore[i] >= (0.65 - threshold * 0.45) ? analysis.subjectScore[i] : 0,
        (analysis.matteScore && analysis.matteScore[i] >= (matteFloor + 0.08))
          ? analysis.matteScore[i]
          : 0
      );
      if (score <= 0) {
        alpha[i] = 0;
        continue;
      }
      alpha[i] = Math.round(clamp01(score) * 255);
      kept += 1;
    }
  }

  const treatAsCar = preferMatte || hasCarOrBus;

  // Cars/buses often have holes in DeepLab masks (especially light-colored bodies).
  // On matte path, skip aggressive solidify+hole-fill — it merges roof leaks into buildings.
  if (treatAsCar && !preferMatte) {
    try {
      solidifyVehicleBody(alpha, analysis, width, height, false);
    } catch (error) {
      console.warn("[F9 追焦] 汽車實心遮罩略過：", error);
    }
  }

  // Recover bicycle / motorcycle thin parts that DeepLab often misses.
  // Do not run this path when a car/bus matte is the main subject.
  const thinSoftMax = maxFloat(analysis.bicycleScore, analysis.motorbikeScore);
  if (
    !treatAsCar
    && (
      analysis.classCounts.bicycle > 0
      || analysis.classCounts.motorbike > 0
      || (analysis.classCounts.person > 0 && thinSoftMax > 0.02)
    )
  ) {
    try {
      recoverRiderCraft(alpha, analysis, sourceImage, width, height);
    } catch (error) {
      console.warn("[F9 追焦] 細結構復原略過：", error);
    }
  }

  // Morphological close: fill spokes / small gaps / car body holes.
  let maskCanvas = alphaToMaskCanvas(alpha, width, height);
  const closeRadius = preferMatte
    ? Math.max(2, Math.round(Math.min(width, height) * 0.005))
    : (treatAsCar
      ? Math.max(6, Math.round(Math.min(width, height) * 0.018))
      : (analysis.needsThinRecovery || analysis.classCounts.bicycle || analysis.classCounts.motorbike
        ? Math.max(4, Math.round(Math.min(width, height) * 0.012))
        : 2));
  maskCanvas = closeMaskCanvas(maskCanvas, closeRadius);

  // Extra hole-fill only for DeepLab car masks. Matte+fill often seals buildings
  // above the roof into one sharp column.
  if (treatAsCar && !preferMatte) {
    maskCanvas = fillMaskCanvasHoles(maskCanvas);
  }

  if (treatAsCar) {
    try {
      maskCanvas = keepPrimaryVehicleComponent(maskCanvas);
      maskCanvas = trimUpwardBleedAboveVehicle(maskCanvas);
    } catch (error) {
      console.warn("[F9 追焦] 汽車遮罩裁切略過：", error);
    }
  }

  // Matte silhouettes are already complete — avoid fat sharp halos around the car.
  const autoExpand = preferMatte
    ? Math.max(0, Math.min(expandPx, 6))
    : (treatAsCar
      ? Math.max(expandPx, Math.round(6 + threshold * 6))
      : ((analysis.needsThinRecovery || analysis.classCounts.bicycle || analysis.classCounts.motorbike)
        ? Math.max(expandPx, Math.round(6 + threshold * 10))
        : expandPx));
  if (preferMatte) {
    // Tighten over-inclusive matte edges (buildings / poles above roof).
    maskCanvas = erodeMaskCanvas(maskCanvas, autoExpand <= 2 ? 2 : 1);
  }
  if (autoExpand > 0) maskCanvas = dilateMaskCanvas(maskCanvas, autoExpand);
  if (featherPx > 0) {
    const feather = preferMatte ? Math.max(1, Math.round(featherPx * 0.45)) : featherPx;
    maskCanvas = featherMaskCanvas(maskCanvas, feather);
  }

  // Dilate/feather can regrow into rooftop buildings — trim again after morph.
  if (treatAsCar) {
    try {
      maskCanvas = trimUpwardBleedAboveVehicle(maskCanvas);
    } catch (error) {
      console.warn("[F9 追焦] 汽車遮罩二次裁切略過：", error);
    }
  }

  const finalCoverage = estimateMaskCoverage(maskCanvas);
  const classCounts = { ...analysis.classCounts };
  if (treatAsCar && classCounts.car === 0 && classCounts.bus === 0) {
    // DeepLab often mislabels white cars as person/background — prefer 汽車 in UI.
    classCounts.car = Math.max(1, Math.round(finalCoverage * width * height * 0.01));
    if (preferMatte && classCounts.person > 0 && classCounts.person < classCounts.car * 8) {
      classCounts.person = 0;
    }
  }

  return {
    width,
    height,
    maskCanvas,
    subjectCoverage: Math.max(kept / Math.max(1, width * height), finalCoverage),
    resolvedDirection: analysis.resolvedDirection,
    classCounts,
    needsThinRecovery: analysis.needsThinRecovery,
    usedMatte: preferMatte,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
}

/** Run U2-Netp when DeepLab car labels are weak / missing, or to solidify known cars. */
function shouldRunCarMatte(classCounts, carSoftMax, thinSoftMax, subjectCoverage){
  const hasCar = classCounts.car > 0 || classCounts.bus > 0 || carSoftMax > 0.06;
  const thinDominant = (
    classCounts.bicycle > 0
    || classCounts.motorbike > 0
    || thinSoftMax > 0.10
  ) && !hasCar;
  if (thinDominant) return false;
  if (hasCar) return true;
  // White / reflective cars are often only labeled as tiny person fragments.
  if (classCounts.person > 0 && subjectCoverage < 0.14) return true;
  // Fragmented / empty DeepLab masks — still try general matting once.
  if (subjectCoverage < 0.06) return true;
  return false;
}

/**
 * Seal fragmented car/bus masks: keep soft car / matte pixels, close gaps, fill interior holes.
 * Avoids large rectangular capsules that leave a boxed sharp island.
 */
function solidifyVehicleBody(alpha, analysis, width, height, preferMatte = false){
  const seed = new Uint8Array(width * height);
  for (let i = 0; i < seed.length; i += 1) {
    const car = Math.max(analysis.carScore[i], analysis.busScore[i]);
    const matte = analysis.matteScore ? analysis.matteScore[i] : 0;
    const hard = analysis.classMap[i] === SUBJECT_CLASS_IDS.car
      || analysis.classMap[i] === SUBJECT_CLASS_IDS.bus;
    if (
      hard
      || car > 0.08
      || matte > (preferMatte ? 0.48 : 0.45)
      || (alpha[i] > 90 && (analysis.vehicleScore[i] > 0.18 || matte > 0.40))
    ) {
      seed[i] = 1;
    }
  }

  // Close on a compact canvas via dilate+erode helpers.
  let canvas = binaryToMaskCanvas(seed, width, height);
  const radius = Math.max(5, Math.round(Math.min(width, height) * 0.016));
  canvas = closeMaskCanvas(canvas, radius);
  canvas = fillMaskCanvasHoles(canvas);

  const data = canvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, width, height).data;
  for (let i = 0; i < width * height; i += 1) {
    if (data[i * 4 + 3] > 40) alpha[i] = 255;
  }
}

/**
 * Keep the largest mask blob that sits in the lower/mid frame (the vehicle),
 * dropping detached building/sky fragments.
 */
function keepPrimaryVehicleComponent(maskCanvas){
  const width = maskCanvas.width;
  const height = maskCanvas.height;
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < binary.length; i += 1) {
    if (data[i * 4 + 3] > 40) binary[i] = 1;
  }

  const components = labelComponents(binary, width, height, Math.max(80, width * height * 0.0004));
  if (components.length <= 1) return maskCanvas;

  let best = null;
  let bestScore = -1;
  for (const box of components) {
    const cy = (box.y0 + box.y1) * 0.5;
    // Prefer components whose center is not in the top sky band.
    const verticalBias = cy < height * 0.22 ? 0.35 : 1;
    const score = box.area * verticalBias;
    if (score > bestScore) {
      bestScore = score;
      best = box;
    }
  }
  if (!best) return maskCanvas;

  const keep = new Uint8Array(width * height);
  floodKeepComponent(binary, keep, width, height, best);
  for (let i = 0; i < keep.length; i += 1) {
    if (!keep[i]) data[i * 4 + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);
  return maskCanvas;
}

function floodKeepComponent(binary, keep, width, height, box){
  // Re-label only inside bbox seed: find any seed pixel in box and flood.
  const stack = new Int32Array(width * height);
  let top = 0;
  let seed = -1;
  for (let y = box.y0; y <= box.y1 && seed < 0; y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      const idx = y * width + x;
      if (binary[idx]) {
        seed = idx;
        break;
      }
    }
  }
  if (seed < 0) return;
  keep[seed] = 1;
  stack[top++] = seed;
  while (top > 0) {
    const idx = stack[--top];
    const x = idx % width;
    const y = (idx - x) / width;
    const tryPush = n => {
      if (n < 0 || n >= binary.length || !binary[n] || keep[n]) return;
      keep[n] = 1;
      stack[top++] = n;
    };
    if (x > 0) tryPush(idx - 1);
    if (x + 1 < width) tryPush(idx + 1);
    if (y > 0) tryPush(idx - width);
    if (y + 1 < height) tryPush(idx + width);
  }
}

/**
 * Cut vertical matte leaks into buildings/poles above the car roof.
 * Uses the row-width profile, plus a car aspect prior when a same-width
 * "tower" of mask continues into buildings (profile alone cannot collapse).
 */
function trimUpwardBleedAboveVehicle(maskCanvas){
  const width = maskCanvas.width;
  const height = maskCanvas.height;
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  const rowSpan = new Float32Array(height);
  const rowCount = new Float32Array(height);
  let maxSpan = 0;
  let peakY = 0;
  for (let y = 0; y < height; y += 1) {
    let minX = width;
    let maxX = -1;
    let count = 0;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[(row + x) * 4 + 3] > 40) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    rowCount[y] = count;
    const span = maxX >= minX ? (maxX - minX + 1) : 0;
    rowSpan[y] = span;
    // Prefer peak in the lower 85% so sky leaks do not dominate.
    if (span > maxSpan && y > height * 0.12) {
      maxSpan = span;
      peakY = y;
    }
  }

  if (maxSpan < width * 0.08) return maskCanvas;

  const spanFloor = maxSpan * 0.42;
  const countFloor = Math.max(8, maxSpan * 0.20);
  let roofY = peakY;
  let foundProfile = false;
  let thinRun = 0;
  for (let y = peakY - 1; y >= 0; y -= 1) {
    if (rowSpan[y] < spanFloor || rowCount[y] < countFloor) {
      thinRun += 1;
      if (thinRun >= 2) {
        roofY = y + 2;
        foundProfile = true;
        break;
      }
    } else {
      thinRun = 0;
      roofY = y;
    }
  }

  // Same-width mask tower above the body (buildings glued to the car).
  let towerHeight = 0;
  for (let y = peakY - 1; y >= 0; y -= 1) {
    if (rowSpan[y] >= maxSpan * 0.58) towerHeight = peakY - y;
    else break;
  }

  // Cars are wider than tall: roof sits roughly ~0.34 of body width above peak row.
  // Always clamp with this prior so same-width building halos cannot survive.
  const geometricRoof = Math.max(0, peakY - Math.round(maxSpan * 0.34));
  if (!foundProfile) {
    roofY = geometricRoof;
  } else {
    // Profile may sit on top of a halo/tower (smaller y). Clamp down to car proportion.
    roofY = Math.max(roofY, geometricRoof);
  }

  // Small margin for roof rails / antennas; clear everything above.
  const clearAbove = Math.max(0, roofY - Math.round(height * 0.008));
  if (clearAbove <= 0) return maskCanvas;

  // Only trim when a meaningful vertical leak exists (mask reaches well above roof).
  let leak = 0;
  for (let y = 0; y < clearAbove; y += 1) leak += rowCount[y];
  if (leak < width * height * 0.003) return maskCanvas;

  for (let y = 0; y < clearAbove; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      data[(row + x) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return maskCanvas;
}

function binaryToMaskCanvas(binary, width, height){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  for (let i = 0; i < binary.length; i += 1) {
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = binary[i] ? 255 : 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Fill enclosed holes by flooding the exterior from the border. */
function fillMaskCanvasHoles(maskCanvas){
  const width = maskCanvas.width;
  const height = maskCanvas.height;
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i += 1) {
    if (data[i * 4 + 3] > 40) solid[i] = 1;
  }

  const exterior = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;
  const push = idx => {
    if (solid[idx] || exterior[idx]) return;
    exterior[idx] = 1;
    stack[top++] = idx;
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + (width - 1));
  }

  while (top > 0) {
    const idx = stack[--top];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(idx - 1);
    if (x + 1 < width) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y + 1 < height) push(idx + width);
  }

  for (let i = 0; i < solid.length; i += 1) {
    if (!solid[i] && !exterior[i]) {
      const o = i * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return maskCanvas;
}

function maxArray(arr){
  let best = 0;
  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i] > best) best = arr[i];
  }
  return best;
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
    const cw = bx1 - bx0;
    const ch = by1 - top;
    if (cw > 2 && ch > 2) {
      const rr = Math.max(8, Math.round(ph * 0.1));
      roundRect(ctx, bx0, top, cw, ch, rr);
      ctx.fill();
    }
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
  if (!(w > 0) || !(h > 0)) return;
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
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
      const modelBuffer = await fetchModelBuffer(MODEL_URL, MODEL_CACHE_NAME, onStatus, "主體分割模型");
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

async function ensureMatteSession(onStatus = () => {}){
  if (!matteSessionPromise) {
    matteSessionPromise = (async () => {
      onStatus("載入汽車去背模型…");
      const ort = await loadOrt();
      const modelBuffer = await fetchModelBuffer(
        MATTE_MODEL_URL,
        MATTE_CACHE_NAME,
        onStatus,
        "汽車去背模型（約 4.5MB）"
      );
      onStatus("初始化汽車去背模型…");
      return ort.InferenceSession.create(modelBuffer, {
        executionProviders: ["wasm"]
      });
    })().catch(error => {
      matteSessionPromise = null;
      throw error;
    });
  }
  return matteSessionPromise;
}

async function loadOrt(){
  if (ortModule) return ortModule;
  ortModule = await import(`${ORT_BASE}/ort.bundle.min.mjs`);
  ortModule.env.wasm.wasmPaths = ORT_BASE + "/";
  return ortModule;
}

async function fetchModelBuffer(modelUrl, cacheName, onStatus, label = "AI 模型"){
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(modelUrl);
      if (cached) {
        onStatus(`讀取已快取的${label}…`);
        return cached.arrayBuffer();
      }
    } catch (error) {
      console.warn("[F9 追焦] 模型快取讀取失敗：", error);
    }
  }

  onStatus(`下載${label}（首次請稍候）…`);
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`模型下載失敗（${response.status}）`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1024) {
    throw new Error("模型檔案異常，請稍後再試。");
  }

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(modelUrl, new Response(buffer.slice(0)));
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
 * U2-Netp general matting: longest-edge 320 + top-left pad, ImageNet normalize.
 * Returns a Float32 mask in [0,1] at the analysis resolution.
 */
async function runMatteInference(session, image, destW, destH){
  const ort = await loadOrt();
  const srcW = image.width || image.naturalWidth || 1;
  const srcH = image.height || image.naturalHeight || 1;
  const scale = MATTE_SIZE / Math.max(srcW, srcH);
  const contentW = Math.max(1, Math.round(srcW * scale));
  const contentH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = MATTE_SIZE;
  canvas.height = MATTE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MATTE_SIZE, MATTE_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, contentW, contentH);
  const { data } = ctx.getImageData(0, 0, MATTE_SIZE, MATTE_SIZE);

  const float32Data = new Float32Array(3 * MATTE_SIZE * MATTE_SIZE);
  const plane = MATTE_SIZE * MATTE_SIZE;
  for (let i = 0; i < plane; i += 1) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    float32Data[i] = (r - MATTE_MEAN[0]) / MATTE_STD[0];
    float32Data[i + plane] = (g - MATTE_MEAN[1]) / MATTE_STD[1];
    float32Data[i + plane * 2] = (b - MATTE_MEAN[2]) / MATTE_STD[2];
  }

  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor("float32", float32Data, [1, 3, MATTE_SIZE, MATTE_SIZE]);
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const out = results[outputName];
  const outData = out.data;
  const outH = out.dims.length === 4 ? out.dims[2] : out.dims[1];
  const outW = out.dims.length === 4 ? out.dims[3] : out.dims[2];

  // Crop padding region, min-max normalize like rembg, then bilinear upscale.
  const crop = new Float32Array(contentW * contentH);
  let minV = Infinity;
  let maxV = -Infinity;
  for (let y = 0; y < contentH; y += 1) {
    for (let x = 0; x < contentW; x += 1) {
      const v = outData[y * outW + x];
      crop[y * contentW + x] = v;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  const span = Math.max(1e-6, maxV - minV);
  for (let i = 0; i < crop.length; i += 1) crop[i] = (crop[i] - minV) / span;

  return upscaleFloatMapBilinear(crop, contentW, contentH, destW, destH);
}

function upscaleFloatMapBilinear(src, srcW, srcH, destW, destH){
  const out = new Float32Array(destW * destH);
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
      const i00 = y0 * srcW + x0;
      const i01 = y0 * srcW + x1;
      const i10 = y1 * srcW + x0;
      const i11 = y1 * srcW + x1;
      out[y * destW + x] = bilerp(src, i00, i01, i10, i11, tx, ty);
    }
  }
  return out;
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
  const carScore = new Float32Array(plane);
  const busScore = new Float32Array(plane);
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
    let carMass = 0;
    let busMass = 0;
    let vehicleMass = 0;
    for (let c = 0; c < numLabels; c += 1) {
      const e = Math.exp(data[c * plane + i] - maxLogit);
      denom += e;
      if (SUBJECT_ID_SET.has(c)) subjectMass += e;
      if (c === SUBJECT_CLASS_IDS.person) personMass += e;
      if (c === SUBJECT_CLASS_IDS.bicycle) bicycleMass += e;
      if (c === SUBJECT_CLASS_IDS.motorbike) motorbikeMass += e;
      if (c === SUBJECT_CLASS_IDS.car) carMass += e;
      if (c === SUBJECT_CLASS_IDS.bus) busMass += e;
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
    carScore[i] = carMass * inv;
    busScore[i] = busMass * inv;
    vehicleScore[i] = vehicleMass * inv;
    subjectScore[i] = SUBJECT_ID_SET.has(bestClass) ? Math.max(subProb, 0.55) : subProb;
    if (THIN_VEHICLE_IDS.has(bestClass)) {
      subjectScore[i] = Math.max(subjectScore[i], 0.72);
    }
    if (bestClass === SUBJECT_CLASS_IDS.car || bestClass === SUBJECT_CLASS_IDS.bus) {
      subjectScore[i] = Math.max(subjectScore[i], 0.78);
    }
  }

  return {
    classMap,
    subjectScore,
    personScore,
    bicycleScore,
    motorbikeScore,
    carScore,
    busScore,
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
  const outCar = new Float32Array(destW * destH);
  const outBus = new Float32Array(destW * destH);
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
      outCar[destIndex] = bilerp(labeled.carScore, i00, i01, i10, i11, tx, ty);
      outBus[destIndex] = bilerp(labeled.busScore, i00, i01, i10, i11, tx, ty);
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
    carScore: outCar,
    busScore: outBus,
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
