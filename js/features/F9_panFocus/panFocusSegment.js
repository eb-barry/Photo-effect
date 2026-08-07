// F9 追焦 - AI 主體分割 v0.1.15
// 騎士＋整車：緊緻 matte 核心（去光暈）+ 形態學後強制前／後輪與前菜籃復原。
// 靈敏度／擴張／羽化只改 matte；合成端全圖模糊＋貼回保留跟拍殘影。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const MODEL_URL = "https://huggingface.co/Xenova/deeplabv3-mobilevit-small/resolve/main/onnx/model_quantized.onnx";
const MODEL_CACHE_NAME = "photo-effects-panfocus-deeplab-v1";
/** General object matting (~4.5MB). Used for cars; also soft-unions rider/bike silhouettes. */
const MATTE_MODEL_URL = "https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/main/onnx/model.onnx";
const MATTE_CACHE_NAME = "photo-effects-panfocus-u2netp-v1";
const MASK_PIPELINE_VERSION = 15;
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
  // Models load lazily on first vehicle-mode use (shows「模型下載中請稍後」).
  return Promise.resolve(null);
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
 * @param {object} options
 * @param {"car"|"rider"} [options.vehicleMode] Manual vehicle pipeline (required for stable results).
 */
export async function ensurePanFocusMask(sourceImage, photoKey, options = {}){
  const key = photoKey || "default";
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const vehicleMode = options.vehicleMode === "rider" ? "rider" : "car";
  const analysis = await ensureAnalysis(sourceImage, key, onStatus, vehicleMode);
  return buildMaskFromAnalysis(analysis, sourceImage, { ...options, vehicleMode });
}

/**
 * Download / init AI models on first use. Shows progress via onStatus.
 */
export async function ensurePanFocusModelsReady(onStatus = () => {}){
  onStatus("模型下載中請稍後");
  await ensureSession(message => {
    if (/下載|快取|載入|初始化/.test(String(message || ""))) {
      onStatus("模型下載中請稍後");
    } else {
      onStatus(message || "模型下載中請稍後");
    }
  });
  try {
    await ensureMatteSession(message => {
      if (/下載|快取|載入|初始化/.test(String(message || ""))) {
        onStatus("模型下載中請稍後");
      } else {
        onStatus(message || "模型下載中請稍後");
      }
    });
  } catch (error) {
    console.warn("[F9 追焦] 去背模型載入失敗（將以語意分割繼續）：", error);
  }
}

async function ensureAnalysis(sourceImage, key, onStatus, vehicleMode = "car"){
  const srcW = sourceImage.width || sourceImage.naturalWidth || 1;
  const srcH = sourceImage.height || sourceImage.naturalHeight || 1;
  const { width, height } = clampMaskSize(srcW, srcH);
  const cacheKey = `${key}:${vehicleMode}`;
  const cached = analysisCache.get(cacheKey);
  if (
    cached?.width === width
    && cached?.height === height
    && cached?.pipelineVersion === MASK_PIPELINE_VERSION
    && cached?.vehicleMode === vehicleMode
  ) {
    return cached;
  }

  onStatus("分析主體中…");
  const session = await ensureSession(onStatus);
  onStatus(vehicleMode === "rider" ? "辨識機車／自行車／騎士…" : "辨識汽車…");
  const logitsTensor = await runInference(session, sourceImage);
  const labeled = logitsToLabelMaps(logitsTensor);
  const upscaled = upscaleLabelMapsBilinear(labeled, width, height);
  const classCounts = countSubjectClasses(upscaled.classMap, width, height);
  const subjectCoverage = countCoverage(upscaled.subjectScore, width, height, 0.28);
  const resolvedDirection = resolveAutoDirection(upscaled.subjectScore, width, height);
  const carSoftMax = Math.max(maxArray(upscaled.carScore), maxArray(upscaled.busScore));
  const thinSoftMax = Math.max(maxArray(upscaled.bicycleScore), maxArray(upscaled.motorbikeScore));
  // Manual UI selection wins over auto heuristics.
  const sceneKind = vehicleMode === "rider" ? "rider" : "car";
  const needsThinRecovery = sceneKind === "rider";

  let matteScore = null;
  let usedMatte = false;
  if (shouldRunMatte(sceneKind, classCounts, carSoftMax, thinSoftMax, subjectCoverage)) {
    try {
      onStatus(sceneKind === "rider" ? "精修騎士／自行車去背…" : "精修汽車去背…");
      const matteSession = await ensureMatteSession(onStatus);
      matteScore = await runMatteInference(matteSession, sourceImage, width, height);
      usedMatte = countCoverage(matteScore, width, height, 0.35) >= 0.03;
      if (!usedMatte) matteScore = null;
    } catch (error) {
      console.warn("[F9 追焦] 去背模型略過：", error);
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
    sceneKind,
    vehicleMode,
    subjectCoverage,
    resolvedDirection,
    classCounts,
    needsThinRecovery,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
  analysisCache.set(cacheKey, entry);
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

  const carSoftMax = Math.max(maxArray(analysis.carScore), maxArray(analysis.busScore));
  const thinSoftMax = maxFloat(analysis.bicycleScore, analysis.motorbikeScore);
  const forcedMode = options.vehicleMode === "rider" || options.vehicleMode === "car"
    ? options.vehicleMode
    : null;
  const sceneKind = forcedMode
    || analysis.sceneKind
    || detectSceneKind({
      width,
      height,
      classCounts: analysis.classCounts,
      carSoftMax,
      thinSoftMax,
      personScore: analysis.personScore,
      subjectCoverage: analysis.subjectCoverage
    });
  const hasCarOrBus = sceneKind === "car" && (
    analysis.classCounts.car > 0
    || analysis.classCounts.bus > 0
    || carSoftMax > 0.10
  );
  const hasThinVehicle = sceneKind === "rider" || analysis.classCounts.bicycle > 0
    || analysis.classCounts.motorbike > 0
    || thinSoftMax > 0.05;
  const matteCoverage = analysis.matteScore
    ? countCoverage(analysis.matteScore, width, height, 0.42)
    : 0;
  // Car matte-primary: solid body without DeepLab holes.
  const preferMatteCar = Boolean(
    sceneKind === "car"
    && analysis.matteScore
    && matteCoverage >= 0.05
    && matteCoverage <= 0.62
  );
  // Rider matte-primary: U2-Netp silhouette is tighter than DeepLab blobs,
  // then we recover thin bike parts with evidence-gated craft fill.
  const preferMatteRider = Boolean(
    sceneKind === "rider"
    && analysis.matteScore
    && matteCoverage >= 0.035
    && matteCoverage <= 0.55
  );
  const preferMatte = preferMatteCar || preferMatteRider;
  const treatAsCar = sceneKind === "car" && (preferMatteCar || hasCarOrBus);
  const treatAsRider = sceneKind === "rider" || (!treatAsCar && hasThinVehicle);

  // Higher slider = more sensitive (keeps weaker subject pixels).
  const personFloor = treatAsRider
    ? 0.62 - threshold * 0.38
    : 0.72 - threshold * 0.5;
  const vehicleFloor = 0.48 - threshold * 0.4;
  const carFloor = 0.10 + (1 - threshold) * 0.08;
  const thinFloor = treatAsRider
    ? 0.022 + (1 - threshold) * 0.06
    : 0.04 + (1 - threshold) * 0.08;
  const matteFloor = preferMatteCar
    ? 0.58 - threshold * 0.16
    : (preferMatteRider
      ? 0.70 - threshold * 0.18
      : 0.52 - threshold * 0.14);
  const subjectFloor = treatAsRider
    ? 0.72 - threshold * 0.28
    : 0.60 - threshold * 0.45;

  const alpha = new Uint8ClampedArray(width * height);
  let kept = 0;
  const riderSupport = treatAsRider
    ? buildRiderSupportMap(analysis, width, height, threshold)
    : null;

  if (preferMatteCar) {
    // U2-Netp silhouette is the primary car body; DeepLab only supplements.
    for (let i = 0; i < alpha.length; i += 1) {
      const matte = analysis.matteScore[i];
      const person = analysis.personScore[i];
      const car = Math.max(analysis.carScore[i], analysis.busScore[i]);
      let score = 0;
      if (matte >= matteFloor) score = Math.max(score, Math.min(1, matte * 1.02));
      if (car >= carFloor) score = Math.max(score, Math.min(1, Math.max(car * 1.35, 0.62)));
      if (person >= personFloor && matte > 0.45) score = Math.max(score, person);
      if (score <= 0) {
        alpha[i] = 0;
        continue;
      }
      alpha[i] = Math.round(clamp01(score) * 255);
      kept += 1;
    }
  } else if (preferMatteRider) {
    // Tight core: matte ∩ support, and person only as min(person, matte).
    // Never keep DeepLab person without matte — that was the sharp back/head halo.
    for (let i = 0; i < alpha.length; i += 1) {
      const matte = analysis.matteScore[i];
      const person = analysis.personScore[i];
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const supported = riderSupport[i] > 0;
      let score = 0;
      if (matte >= matteFloor && supported) {
        score = Math.max(score, Math.min(1, matte));
      }
      if (person >= personFloor && matte >= matteFloor) {
        score = Math.max(score, Math.min(person, matte));
      }
      // Thin bike class may extend slightly beyond matte (tires / spokes).
      if (thin >= thinFloor && (supported || matte > 0.15 || person > 0.12)) {
        score = Math.max(score, Math.min(1, thin * 5.5));
      }
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
      const matte = analysis.matteScore ? analysis.matteScore[i] : 0;
      const score = Math.max(
        person >= personFloor ? person : 0,
        (!treatAsRider && vehicle >= vehicleFloor) ? vehicle : 0,
        (!treatAsRider && car >= carFloor) ? Math.min(1, Math.max(car * 1.35, 0.62)) : 0,
        thin >= thinFloor ? Math.min(1, thin * (treatAsRider ? 4.2 : 5.5)) : 0,
        analysis.subjectScore[i] >= subjectFloor ? analysis.subjectScore[i] : 0,
        // Rider fallback: only confident matte (no soft halo union).
        (treatAsRider && matte >= (matteFloor + 0.08)) ? Math.min(1, matte) : 0,
        (!treatAsRider && matte >= (matteFloor + 0.08)) ? matte : 0
      );
      if (score <= 0) {
        alpha[i] = 0;
        continue;
      }
      alpha[i] = Math.round(clamp01(score) * 255);
      kept += 1;
    }
  }

  // Cars/buses often have holes in DeepLab masks (especially light-colored bodies).
  if (treatAsCar && !preferMatteCar) {
    try {
      solidifyVehicleBody(alpha, analysis, width, height, false);
    } catch (error) {
      console.warn("[F9 追焦] 汽車實心遮罩略過：", error);
    }
  }

  // Rider body: trim halo FIRST, then recover dark/thin structure (no person-alone paint).
  // Wheels are forced later — after morph — so trim/erode cannot eat the front tire.
  if (treatAsRider && riderSupport) {
    try {
      trimRiderMatteHalo(alpha, analysis, riderSupport, width, height, threshold);
    } catch (error) {
      console.warn("[F9 追焦] 騎士光暈裁切略過：", error);
    }
  }

  if (
    treatAsRider
    || (
      !treatAsCar
      && (
        analysis.classCounts.bicycle > 0
        || analysis.classCounts.motorbike > 0
        || (analysis.classCounts.person > 0 && thinSoftMax > 0.02)
      )
    )
  ) {
    try {
      recoverRiderBodyStructure(alpha, analysis, sourceImage, width, height);
    } catch (error) {
      console.warn("[F9 追焦] 車體結構復原略過：", error);
    }
  }

  // Morphological close: fill spokes / small gaps / car body holes.
  let maskCanvas = alphaToMaskCanvas(alpha, width, height);
  const closeRadius = preferMatteCar
    ? Math.max(2, Math.round(Math.min(width, height) * 0.005))
    : (preferMatteRider
      ? Math.max(1, Math.round(Math.min(width, height) * 0.003))
      : (treatAsRider
        ? Math.max(2, Math.round(Math.min(width, height) * 0.004))
        : (treatAsCar
          ? Math.max(6, Math.round(Math.min(width, height) * 0.018))
          : 2)));
  maskCanvas = closeMaskCanvas(maskCanvas, closeRadius);

  if (treatAsCar && !preferMatteCar) {
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
  if (treatAsRider) {
    try {
      maskCanvas = keepPrimaryVehicleComponent(maskCanvas);
    } catch (error) {
      console.warn("[F9 追焦] 騎士遮罩裁切略過：", error);
    }
  }

  const autoExpand = preferMatteCar
    ? Math.max(0, Math.min(expandPx, 6))
    : (preferMatteRider
      ? Math.max(0, Math.min(expandPx, 8))
      : (treatAsRider
        ? Math.max(0, Math.min(expandPx, 10))
        : (treatAsCar
          ? Math.max(expandPx, Math.round(6 + threshold * 6))
          : expandPx)));
  if (preferMatteCar) {
    maskCanvas = erodeMaskCanvas(maskCanvas, autoExpand <= 2 ? 3 : 2);
  }
  if (preferMatteRider || treatAsRider) {
    // Erode upper body only — never erode the wheel band (front tire lives there).
    maskCanvas = erodeRiderUpperBody(maskCanvas, analysis, width, height, preferMatteRider ? 2 : 1);
  }
  if (autoExpand > 0) maskCanvas = dilateMaskCanvas(maskCanvas, autoExpand);

  // LAST structural pass: force rear + front wheels + front basket after all trim/erode.
  // Blur strength never touches this mask — missing rim/basket only looks worse at high blur.
  let structureMask = null;
  if (treatAsRider) {
    try {
      const forced = forceRiderWheelsOnMask(maskCanvas, analysis, sourceImage, width, height);
      maskCanvas = forced.maskCanvas;
      structureMask = forced.wheelMask;
    } catch (error) {
      console.warn("[F9 追焦] 強制輪胎復原略過：", error);
    }
    try {
      const basket = forceRiderFrontBasketOnMask(maskCanvas, analysis, sourceImage, width, height);
      maskCanvas = basket.maskCanvas;
      structureMask = mergeBinaryMasks(structureMask, basket.basketMask);
    } catch (error) {
      console.warn("[F9 追焦] 前菜籃復原略過：", error);
    }
    try {
      // Drop sharp outdoor blobs between seat/butt and bike rim/frame.
      maskCanvas = trimRiderSeatFrameGap(maskCanvas, analysis, sourceImage, width, height, structureMask);
    } catch (error) {
      console.warn("[F9 追焦] 座椅縫隙修剪略過：", error);
    }
  }

  if (featherPx > 0) {
    const feather = preferMatteCar
      ? Math.max(1, Math.round(featherPx * 0.85))
      : Math.max(1, Math.min(featherPx, preferMatteRider ? 14 : 20));
    maskCanvas = featherMaskCanvas(maskCanvas, feather);
  }

  if (treatAsRider) {
    try {
      maskCanvas = hardenRiderMaskEdges(maskCanvas, analysis, width, height, structureMask);
    } catch (error) {
      console.warn("[F9 追焦] 騎士邊緣硬化略過：", error);
    }
  }

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
    classCounts.car = Math.max(1, Math.round(finalCoverage * width * height * 0.01));
    if (preferMatteCar && classCounts.person > 0 && classCounts.person < classCounts.car * 8) {
      classCounts.person = 0;
    }
  }
  if (treatAsRider) {
    // Never mislabel a bike/rider scene as 汽車.
    classCounts.car = 0;
    classCounts.bus = 0;
    if (classCounts.bicycle === 0 && classCounts.motorbike === 0) {
      classCounts.bicycle = Math.max(1, Math.round(finalCoverage * width * height * 0.01));
    }
  }

  return {
    width,
    height,
    maskCanvas,
    subjectCoverage: Math.max(kept / Math.max(1, width * height), finalCoverage),
    resolvedDirection: analysis.resolvedDirection,
    classCounts,
    needsThinRecovery: analysis.needsThinRecovery || treatAsRider,
    usedMatte: preferMatte,
    sceneKind,
    pipelineVersion: MASK_PIPELINE_VERSION
  };
}

/**
 * Classify scene so bike/rider never enters the car matte + roof-trim path.
 * @returns {"car"|"rider"|"unknown"}
 */
function detectSceneKind({
  width,
  height,
  classCounts,
  carSoftMax,
  thinSoftMax,
  personScore,
  subjectCoverage
}){
  const thinHard = (classCounts.bicycle || 0) + (classCounts.motorbike || 0);
  const carHard = (classCounts.car || 0) + (classCounts.bus || 0);
  const personN = classCounts.person || 0;

  if (thinHard > 0 || thinSoftMax > 0.05) return "rider";
  if (carHard > 0 && carSoftMax >= 0.12 && carHard >= personN * 0.35) return "car";
  if (carSoftMax >= 0.22 && thinSoftMax < 0.04) return "car";

  if (personN > 0) {
    const riderLike = personBlobLooksLikeRider(personScore, width, height);
    if (riderLike && carSoftMax < 0.16) return "rider";
    // Tiny person fragments on an otherwise empty subject → likely car driver mislabel.
    if (!riderLike && (carSoftMax > 0.06 || subjectCoverage < 0.10)) return "car";
  }

  if (carSoftMax > 0.10) return "car";
  if (personN > 0 && subjectCoverage >= 0.08) return "rider";
  return "unknown";
}

function personBlobLooksLikeRider(personScore, width, height){
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < binary.length; i += 1) {
    if (personScore[i] > 0.22) binary[i] = 1;
  }
  const components = labelComponents(binary, width, height, Math.max(180, width * height * 0.0006));
  if (!components.length) return false;
  let best = components[0];
  for (const box of components) {
    if (box.area > best.area) best = box;
  }
  const pw = best.x1 - best.x0 + 1;
  const ph = best.y1 - best.y0 + 1;
  if (ph < height * 0.12) return false;
  // Standing / riding people are taller than wide; in-car faces are short blobs.
  if (ph / Math.max(1, pw) >= 1.05) return true;
  if (ph > height * 0.28 && ph / Math.max(1, pw) >= 0.85) return true;
  return false;
}

/** Run U2-Netp for cars and riders (matte-primary when coverage looks sane). */
function shouldRunMatte(sceneKind, classCounts, carSoftMax, thinSoftMax, subjectCoverage){
  if (sceneKind === "rider") return true;
  if (sceneKind === "car") return true;
  if (classCounts.car > 0 || classCounts.bus > 0 || carSoftMax > 0.06) return true;
  if (classCounts.person > 0 && subjectCoverage < 0.14 && thinSoftMax < 0.05) return true;
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
 * Force rear + front wheels onto the mask AFTER morph. Returns wheelMask so
 * harden/feather cleanup cannot delete restored tires again.
 */
function forceRiderWheelsOnMask(maskCanvas, analysis, sourceImage, width, height){
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = image.data[i * 4 + 3];
  const wheelMask = new Uint8Array(width * height);

  const boxes = listRiderPersonBoxes(analysis, width, height);
  if (!boxes.length) return { maskCanvas, wheelMask };

  const photo = samplePhotoStats(sourceImage, width, height);
  const direction = analysis.resolvedDirection === "left" ? "left" : "right";

  for (const box of boxes) {
    const wheels = findRiderWheelCenters(box, analysis, photo, width, height, direction);
    for (const wheel of wheels) {
      const refined = refineWheelGeometry(wheel.cx, wheel.cy, wheel.radius, analysis, photo, width, height);
      paintWheelDiskForced(
        alpha,
        wheelMask,
        analysis,
        photo,
        width,
        height,
        refined.cx,
        refined.cy,
        refined.radius,
        wheel.forced
      );
    }
  }

  return { maskCanvas: alphaToMaskCanvas(alpha, width, height), wheelMask };
}

function mergeBinaryMasks(a, b){
  if (!a) return b || null;
  if (!b) return a;
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] || b[i] ? 1 : 0;
  return out;
}

/**
 * Force the front mesh basket (and bag inside) into the sharp subject layer.
 * Mesh holes are filled so the basket reads as a solid sharp object, not ghost blur.
 */
function forceRiderFrontBasketOnMask(maskCanvas, analysis, sourceImage, width, height){
  const boxes = listRiderPersonBoxes(analysis, width, height);
  if (!boxes.length) return { maskCanvas, basketMask: new Uint8Array(width * height) };

  const photo = samplePhotoStats(sourceImage, width, height);
  const direction = analysis.resolvedDirection === "left" ? "left" : "right";
  const ahead = direction === "left" ? -1 : 1;
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const basketMask = new Uint8Array(width * height);
  const rgba = photo.rgba;

  for (const box of boxes) {
    const pw = box.x1 - box.x0 + 1;
    const ph = box.y1 - box.y0 + 1;
    const frontX = ahead > 0 ? box.x1 : box.x0;
    const x0 = Math.max(0, Math.floor(ahead > 0 ? frontX - pw * 0.08 : frontX - pw * 0.72));
    const x1 = Math.min(width - 1, Math.ceil(ahead > 0 ? frontX + pw * 0.72 : frontX + pw * 0.08));
    const y0 = Math.max(0, Math.floor(box.y0 + ph * 0.10));
    const y1 = Math.min(height - 1, Math.ceil(box.y0 + ph * 0.62));

    const seed = new Uint8Array(width * height);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = y * width + x;
        const L = photo.lum[i];
        const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
        const matte = analysis.matteScore ? analysis.matteScore[i] : 0;
        const o = i * 4;
        const r = rgba[o];
        const g = rgba[o + 1];
        const b = rgba[o + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = (maxC - minC) / Math.max(1, maxC);
        const meshDark = photo.dark[i] || L < 95;
        const meshGray = L < 150 && sat < 0.22;
        const bagInside = L >= 95 && L < 185 && sat < 0.35 && matte > 0.2;
        if (thin > 0.028 || meshDark || (meshGray && (thin > 0.012 || matte > 0.28 || localVariance(photo.lum, width, height, x, y) > 18)) || bagInside) {
          // Reject open sky / bright railing glare in the ROI.
          if (L > 210 && sat < 0.08) continue;
          seed[i] = 1;
        }
      }
    }

    // Dilate seeds inside ROI so mesh holes become solid basket silhouette.
    const solid = dilateBinaryMapInRect(seed, width, height, Math.max(2, Math.round(Math.min(pw, ph) * 0.035)), x0, y0, x1, y1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = y * width + x;
        if (!solid[i]) continue;
        // Keep basket interior (bag / mesh holes) but never pure bright sky.
        if (photo.lum[i] > 220 && !photo.dark[i]) continue;
        data[i * 4 + 3] = Math.max(data[i * 4 + 3], 245);
        basketMask[i] = 1;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return { maskCanvas, basketMask };
}

function localVariance(lum, width, height, x, y){
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return 0;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const v = lum[(y + dy) * width + (x + dx)];
      sum += v;
      sum2 += v * v;
      n += 1;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

function dilateBinaryMapInRect(seed, width, height, radius, x0, y0, x1, y1){
  if (radius <= 0) return seed;
  const out = new Uint8Array(seed.length);
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      let hit = 0;
      for (let dy = -radius; dy <= radius && !hit; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > r2) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < x0 || xx > x1 || yy < y0 || yy > y1) continue;
          if (seed[yy * width + xx]) {
            hit = 1;
            break;
          }
        }
      }
      if (hit) out[y * width + x] = 1;
    }
  }
  return out;
}

function listRiderPersonBoxes(analysis, width, height){
  const personBinary = new Uint8Array(width * height);
  for (let i = 0; i < personBinary.length; i += 1) {
    if (analysis.personScore[i] > 0.26) personBinary[i] = 1;
  }
  return labelComponents(
    personBinary,
    width,
    height,
    Math.max(220, width * height * 0.0008)
  ).filter(box => (box.y1 - box.y0 + 1) >= 24 && (box.x1 - box.x0 + 1) >= 12);
}

/**
 * Erode only the upper body band so wheel-band geometry is preserved.
 */
function erodeRiderUpperBody(maskCanvas, analysis, width, height, radius){
  if (radius <= 0) return maskCanvas;
  const boxes = listRiderPersonBoxes(analysis, width, height);
  if (!boxes.length) return erodeMaskCanvas(maskCanvas, Math.min(1, radius));

  const eroded = erodeMaskCanvas(maskCanvas, radius);
  const srcCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const dstCtx = eroded.getContext("2d", { willReadFrequently: true });
  const src = srcCtx.getImageData(0, 0, width, height);
  const dst = dstCtx.getImageData(0, 0, width, height);

  // Wheel band starts ~55% down the tallest person box — keep original alpha there.
  let bandY = Math.floor(height * 0.62);
  for (const box of boxes) {
    const ph = box.y1 - box.y0 + 1;
    bandY = Math.min(bandY, Math.floor(box.y0 + ph * 0.55));
  }
  for (let y = bandY; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4 + 3;
      dst.data[o] = src.data[o];
    }
  }
  dstCtx.putImageData(dst, 0, 0);
  return eroded;
}

/**
 * Tight support for matte stick. Keep dilate small so sky/hill near the head
 * cannot become "supported" matte.
 */
function buildRiderSupportMap(analysis, width, height, threshold = 0.66){
  const t = clamp01(threshold);
  const personSeed = 0.30 - t * 0.12;
  const thinSeed = 0.06 - t * 0.035;
  const seed = new Uint8Array(width * height);
  for (let i = 0; i < seed.length; i += 1) {
    const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
    if (analysis.personScore[i] > personSeed || thin > thinSeed) seed[i] = 1;
  }
  const radius = Math.max(2, Math.round(Math.min(width, height) * (0.003 + t * 0.005)));
  return dilateBinaryMap(seed, width, height, radius);
}

/**
 * Remove sharp background islands: matte-only fringe and DeepLab person without matte.
 * Also trims INSIDE support when person is high but matte is weak (blob halo).
 */
function trimRiderMatteHalo(alpha, analysis, support, width, height, threshold = 0.66){
  const t = clamp01(threshold);
  const keepThin = 0.085 - t * 0.03;
  const matteCore = 0.72 - t * 0.08;
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] < 8) continue;
    const person = analysis.personScore[i];
    const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
    const matte = analysis.matteScore ? analysis.matteScore[i] : 0;

    if (thin > keepThin) continue;

    // Inside support: drop DeepLab-only / weak-matte person blobs (back/head halo).
    if (support[i]) {
      if (person > 0.2 && matte < matteCore && thin < 0.04) {
        alpha[i] = 0;
      }
      continue;
    }

    // Outside support: keep only strong bike or strong matte∩person.
    if (matte >= 0.85 && person > 0.2) continue;
    alpha[i] = 0;
  }
}

/**
 * Harden soft fringe. Never promote person-only or weak-matte pixels.
 * Wheel-mask pixels are always kept.
 */
function hardenRiderMaskEdges(maskCanvas, analysis, width, height, wheelMask = null){
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < width * height; i += 1) {
    if (wheelMask && wheelMask[i]) {
      data[i * 4 + 3] = Math.max(data[i * 4 + 3], 230);
      continue;
    }
    const a = data[i * 4 + 3];
    if (a < 12) {
      data[i * 4 + 3] = 0;
      continue;
    }
    if (a >= 210) continue;
    const person = analysis.personScore[i];
    const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
    const matte = analysis.matteScore ? analysis.matteScore[i] : 0;
    const classOk = thin > 0.05 || (person > 0.25 && matte > 0.55);
    const matteOk = matte > 0.72 && (person > 0.18 || thin > 0.03);
    if (classOk || matteOk) {
      if (a < 150) data[i * 4 + 3] = Math.max(a, 190);
      continue;
    }
    data[i * 4 + 3] = a < 130 ? 0 : Math.round(a * 0.15);
  }
  ctx.putImageData(image, 0, 0);
  return maskCanvas;
}

function dilateBinaryMap(seed, width, height, radius){
  if (radius <= 0) return seed;
  const alpha = new Uint8ClampedArray(seed.length);
  for (let i = 0; i < seed.length; i += 1) alpha[i] = seed[i] ? 255 : 0;
  let canvas = alphaToMaskCanvas(alpha, width, height);
  canvas = dilateMaskCanvas(canvas, radius);
  const data = canvas.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, width, height).data;
  const out = new Uint8Array(seed.length);
  for (let i = 0; i < out.length; i += 1) {
    if (data[i * 4 + 3] > 16) out[i] = 1;
  }
  return out;
}

/**
 * Recover bike frame/basket structure near the rider without painting DeepLab person alone.
 */
function recoverRiderBodyStructure(alpha, analysis, sourceImage, width, height){
  const boxes = listRiderPersonBoxes(analysis, width, height);
  if (!boxes.length) return;
  const photo = samplePhotoStats(sourceImage, width, height);
  const direction = analysis.resolvedDirection === "left" ? "left" : "right";
  const ahead = direction === "left" ? -1 : 1;

  for (const box of boxes) {
    const pw = box.x1 - box.x0 + 1;
    const ph = box.y1 - box.y0 + 1;
    // Extend farther toward the travel direction so the front basket / fork stay in ROI.
    const bx0 = Math.max(0, Math.floor(box.x0 - pw * (ahead < 0 ? 0.75 : 0.22)));
    const bx1 = Math.min(width - 1, Math.ceil(box.x1 + pw * (ahead > 0 ? 0.75 : 0.22)));
    const top = Math.max(0, Math.floor(box.y0 + ph * 0.08));
    const by1 = Math.min(height - 1, Math.ceil(box.y1 + ph * 0.35));
    for (let y = top; y <= by1; y += 1) {
      for (let x = bx0; x <= bx1; x += 1) {
        const i = y * width + x;
        const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
        const person = analysis.personScore[i];
        const matte = analysis.matteScore ? analysis.matteScore[i] : 0;
        // Structure only — never person-alone (halo source).
        if (thin > 0.045 || photo.dark[i] || (photo.colorful[i] && (thin > 0.02 || matte > 0.5))) {
          if (matte > 0.2 || thin > 0.03 || photo.dark[i]) {
            alpha[i] = Math.max(alpha[i], thin > 0.08 || photo.dark[i] ? 245 : 210);
          }
        } else if (person > 0.35 && matte > 0.55) {
          alpha[i] = Math.max(alpha[i], 220);
        }
      }
    }
  }
}

/**
 * Locate rear/front wheel centers. Always forces a forward-side front-wheel anchor
 * for YouBike-style bikes (front tire often has weak DeepLab/matte response).
 */
function findRiderWheelCenters(box, analysis, photo, width, height, direction = "right"){
  const pw = box.x1 - box.x0 + 1;
  const ph = box.y1 - box.y0 + 1;
  const radius = Math.max(14, Math.round(ph * 0.28));
  const yBand0 = Math.max(0, Math.floor(box.y0 + ph * 0.48));
  const yBand1 = Math.min(height - 1, Math.ceil(box.y1 + ph * 0.62));
  const ahead = direction === "left" ? -1 : 1;
  const xBand0 = Math.max(0, Math.floor(box.x0 - pw * (ahead < 0 ? 1.15 : 0.35)));
  const xBand1 = Math.min(width - 1, Math.ceil(box.x1 + pw * (ahead > 0 ? 1.15 : 0.35)));

  const peaks = [];
  const step = Math.max(3, Math.round(radius * 0.4));
  for (let y = yBand0; y <= yBand1; y += step) {
    for (let x = xBand0; x <= xBand1; x += step) {
      let mass = 0;
      let darkMass = 0;
      let samples = 0;
      const probe = Math.max(6, Math.round(radius * 0.6));
      const p2 = probe * probe;
      for (let yy = Math.max(0, y - probe); yy <= Math.min(height - 1, y + probe); yy += 2) {
        for (let xx = Math.max(0, x - probe); xx <= Math.min(width - 1, x + probe); xx += 2) {
          const dx = xx - x;
          const dy = yy - y;
          if (dx * dx + dy * dy > p2) continue;
          samples += 1;
          const i = yy * width + xx;
          const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
          mass += thin;
          if (photo.dark[i] || photo.lum[i] < 70) darkMass += 1;
        }
      }
      if (samples < 8) continue;
      const score = mass / samples + (darkMass / samples) * 0.12;
      if (score < 0.018) continue;
      peaks.push({ cx: x, cy: y, score, radius, forced: false });
    }
  }

  peaks.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const peak of peaks) {
    if (picked.length >= 2) break;
    const farEnough = picked.every(p => {
      const dx = p.cx - peak.cx;
      const dy = p.cy - peak.cy;
      return dx * dx + dy * dy > (radius * 1.05) * (radius * 1.05);
    });
    if (farEnough) picked.push(peak);
  }

  const cy = Math.min(height - 1, Math.round(box.y1 + radius * 0.02));
  const rearCx = ahead > 0
    ? Math.round(box.x0 + pw * 0.22)
    : Math.round(box.x1 - pw * 0.22);
  const frontCx = ahead > 0
    ? Math.round(box.x1 + pw * 0.42)
    : Math.round(box.x0 - pw * 0.42);
  const anchors = [
    { cx: rearCx, cy, radius, score: 0, forced: false, role: "rear" },
    { cx: frontCx, cy, radius: Math.round(radius * 1.08), score: 0, forced: true, role: "front" },
    {
      cx: ahead > 0 ? Math.round(box.x1 + pw * 0.72) : Math.round(box.x0 - pw * 0.72),
      cy,
      radius: Math.round(radius * 1.1),
      score: 0,
      forced: true,
      role: "front-far"
    }
  ];

  for (const anchor of anchors) {
    if (anchor.cx < 0 || anchor.cx >= width) continue;
    const farEnough = picked.every(p => {
      const dx = p.cx - anchor.cx;
      const dy = p.cy - anchor.cy;
      return dx * dx + dy * dy > (radius * 0.85) * (radius * 0.85);
    });
    if (!farEnough) continue;
    const hasEv = wheelDiskHasEvidence(anchor.cx, anchor.cy, anchor.radius, analysis, photo, width, height);
    if (hasEv || anchor.forced) {
      // Prefer replacing a weak peak with a forced front anchor when needed.
      if (picked.length >= 2 && anchor.forced) {
        // Drop the peak farthest from the front direction and insert front.
        let worst = 0;
        let worstScore = Infinity;
        for (let i = 0; i < picked.length; i += 1) {
          const toward = ahead > 0 ? picked[i].cx : -picked[i].cx;
          if (toward < worstScore) {
            worstScore = toward;
            worst = i;
          }
        }
        // Only replace if we don't already have something near the front.
        const hasFrontish = picked.some(p => (ahead > 0 ? p.cx >= box.x1 : p.cx <= box.x0));
        if (!hasFrontish) picked[worst] = anchor;
      } else if (picked.length < 2) {
        picked.push(anchor);
      }
    }
  }

  // Guarantee at least one forward wheel for bikes.
  const hasFront = picked.some(p => (ahead > 0 ? p.cx >= box.x1 - pw * 0.05 : p.cx <= box.x0 + pw * 0.05));
  if (!hasFront && frontCx >= 0 && frontCx < width) {
    picked.push({
      cx: frontCx,
      cy,
      radius: Math.round(radius * 1.1),
      score: 0,
      forced: true,
      role: "front-guarantee"
    });
  }

  return picked.slice(0, 3);
}

/**
 * Nudge wheel center/radius onto the strongest rim-edge ring so the painted
 * annulus lands on the real tire instead of nearby pavement.
 */
function refineWheelGeometry(cx, cy, radius, analysis, photo, width, height){
  let best = { cx, cy, radius: Math.max(10, Math.round(radius)), score: -1 };
  for (let dry = -8; dry <= 8; dry += 2) {
    for (let drx = -8; drx <= 8; drx += 2) {
      for (let dr = -5; dr <= 8; dr += 2) {
        const tcx = cx + drx;
        const tcy = cy + dry;
        const tr = Math.max(10, Math.round(radius + dr));
        if (tcx < 0 || tcy < 0 || tcx >= width || tcy >= height) continue;
        const score = scoreRimEnergy(tcx, tcy, tr, analysis, photo, width, height);
        if (score > best.score) best = { cx: tcx, cy: tcy, radius: tr, score };
      }
    }
  }
  return best;
}

function scoreRimEnergy(cx, cy, radius, analysis, photo, width, height){
  const rays = 48;
  let score = 0;
  let hits = 0;
  for (let s = 0; s < rays; s += 1) {
    const ang = -Math.PI + (Math.PI * 2 * s) / rays;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    let best = 0;
    for (let t = radius * 0.72; t <= radius * 1.06; t += 0.75) {
      const x = Math.round(cx + ux * t);
      const y = Math.round(cy + uy * t);
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      const i = y * width + x;
      const edge = radialEdgeStrength(photo, width, height, x, y, ux, uy);
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const L = photo.lum[i];
      const darkBoost = photo.dark[i] || L < 100 ? 1.3 : (L < 150 ? 0.7 : 0);
      const sVal = edge * (0.7 + darkBoost) + thin * 18;
      if (sVal > best) best = sVal;
    }
    if (best > 8) {
      hits += 1;
      score += best;
    }
  }
  if (hits < 8) return hits * 0.1;
  return score / rays + hits * 0.15;
}

function radialEdgeStrength(photo, width, height, x, y, ux, uy){
  const i = y * width + x;
  const xo = Math.round(x + ux * 2);
  const yo = Math.round(y + uy * 2);
  const xi = Math.round(x - ux * 2);
  const yi = Math.round(y - uy * 2);
  if (xo < 0 || yo < 0 || xo >= width || yo >= height) return 0;
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 0;
  const L = photo.lum[i];
  const Lo = photo.lum[yo * width + xo];
  const Li = photo.lum[yi * width + xi];
  return Math.max(Math.abs(L - Lo), Math.abs(L - Li), Math.abs(Lo - Li) * 0.5);
}

/**
 * Paint a tire/rim arc aligned to image edges — never a bright pavement disk.
 * Accepts dark rubber AND metallic silver rim via radial-edge evidence.
 * Forced mode ray-walks the lower-left arc so blur strength cannot "erase" it.
 */
function paintWheelDiskForced(alpha, wheelMask, analysis, photo, width, height, cx, cy, radius, forced = false){
  const r = Math.max(10, Math.round(radius));
  // Rim strip: outer tire edge + metallic rim; spokes stay hollow.
  const outer = r + 1.35;
  const inner = Math.max(4, r * (forced ? 0.74 : 0.70));
  const outer2 = outer * outer;
  const inner2 = inner * inner;
  const x0 = Math.max(0, Math.floor(cx - r - 4));
  const x1 = Math.min(width - 1, Math.ceil(cx + r + 4));
  const y0 = Math.max(0, Math.floor(cy - r - 4));
  const y1 = Math.min(height - 1, Math.ceil(cy + r + 4));

  const sectors = 48;
  const sectorDark = new Float32Array(sectors);

  // Pass 1: score dark rubber + metallic rim-edge evidence per angular bin.
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > outer2 || d2 < inner2) continue;
      const dist = Math.sqrt(d2) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const i = y * width + x;
      const L = photo.lum[i];
      const lowerLeft = dx < 0 && dy > 0;
      const edge = radialEdgeStrength(photo, width, height, x, y, ux, uy);
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const darkRubber = photo.dark[i] || L < (lowerLeft ? 128 : 108);
      const metallicRim = edge >= (lowerLeft ? 9 : 12) && L >= 70 && L <= 205 && !isOutdoorGreen(photo, i);
      // Bright flat pavement (no edge) must never count.
      if (!darkRubber && !metallicRim && thin < 0.03) continue;
      if (L > 215 && edge < 14) continue;

      const ang = Math.atan2(dy, dx);
      const s = Math.min(sectors - 1, Math.floor(((ang + Math.PI) / (Math.PI * 2)) * sectors));
      let w = 0.8;
      if (darkRubber) w += 1.5;
      if (metallicRim) w += 1.2;
      if (thin > 0.035) w += 1.0;
      if (lowerLeft) w += 0.45;
      sectorDark[s] += w;
    }
  }

  const sectorOk = new Uint8Array(sectors);
  const minHits = forced ? 0.9 : 1.6;
  for (let s = 0; s < sectors; s += 1) {
    if (sectorDark[s] >= minHits) sectorOk[s] = 1;
  }
  const grown = new Uint8Array(sectors);
  for (let s = 0; s < sectors; s += 1) {
    if (sectorOk[s]) {
      grown[s] = 1;
      continue;
    }
    const prev = sectorOk[(s + sectors - 1) % sectors];
    const next = sectorOk[(s + 1) % sectors];
    if ((prev || next) && sectorDark[s] >= (forced ? 0.35 : 0.8)) grown[s] = 1;
  }

  // Pass 2: paint evidence-backed rim pixels (dark rubber + metallic edge).
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > outer2 || d2 < inner2) continue;
      const ang = Math.atan2(dy, dx);
      const s = Math.min(sectors - 1, Math.floor(((ang + Math.PI) / (Math.PI * 2)) * sectors));
      if (!grown[s]) continue;

      const dist = Math.sqrt(d2) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const i = y * width + x;
      const L = photo.lum[i];
      const lowerLeft = dx < 0 && dy > 0;
      const edge = radialEdgeStrength(photo, width, height, x, y, ux, uy);
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const darkRubber = photo.dark[i] || L < (lowerLeft ? 130 : 110);
      const metallicRim = edge >= (lowerLeft ? 8 : 11) && L >= 65 && L <= 210 && !isOutdoorGreen(photo, i);
      if (L > 218 && edge < 12 && !photo.dark[i]) continue;
      if (!darkRubber && !metallicRim && thin < 0.03) continue;

      alpha[i] = Math.max(alpha[i], 250);
      wheelMask[i] = 1;
    }
  }

  // Pass 3: ray-walk completes the rim (esp. lower-left) independent of blur strength.
  const rays = forced ? 120 : 72;
  let rimHits = 0;
  for (let s = 0; s < sectors; s += 1) if (grown[s]) rimHits += 1;
  const completeLower = forced || rimHits >= Math.floor(sectors * 0.22);

  for (let s = 0; s < rays; s += 1) {
    const ang = -Math.PI + (Math.PI * 2 * s) / rays;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const lowerLeft = ux < -0.05 && uy > 0.05;
    if (!completeLower && lowerLeft) continue;

    const sector = Math.min(sectors - 1, Math.floor(((ang + Math.PI) / (Math.PI * 2)) * sectors));
    const neighborOk = grown[sector]
      || grown[(sector + 1) % sectors]
      || grown[(sector + sectors - 1) % sectors];
    // Forced lower-left: always try edge walk when any rim evidence exists on the wheel.
    if (!neighborOk && !(forced && lowerLeft && rimHits >= 4)) continue;

    let bestT = -1;
    let bestScore = 0;
    for (let t = r * 0.70; t <= r * 1.10; t += 0.45) {
      const x = Math.round(cx + ux * t);
      const y = Math.round(cy + uy * t);
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      const i = y * width + x;
      const L = photo.lum[i];
      if (isOutdoorGreen(photo, i) && L > 90) continue;
      const edge = radialEdgeStrength(photo, width, height, x, y, ux, uy);
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const darkRubber = photo.dark[i] || L < (lowerLeft ? 135 : 112);
      let score = edge;
      if (darkRubber) score += 14;
      if (thin > 0.025) score += 8;
      // Metallic silver rim against asphalt.
      if (edge >= 8 && L >= 80 && L <= 200) score += 10;
      if (lowerLeft) score += 3;
      if (score > bestScore) {
        bestScore = score;
        bestT = t;
      }
    }

    const need = lowerLeft ? (forced ? 10 : 13) : (forced ? 12 : 15);
    if (bestT < 0 || bestScore < need) continue;

    // Paint a short radial brush so the thin rim stays continuous.
    for (let dt = -1.2; dt <= 1.2; dt += 0.4) {
      const t = bestT + dt;
      const x = Math.round(cx + ux * t);
      const y = Math.round(cy + uy * t);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = y * width + x;
      const L = photo.lum[i];
      if (L > 225 && !photo.dark[i]) continue;
      if (isOutdoorGreen(photo, i) && L > 110 && !photo.dark[i]) continue;
      alpha[i] = Math.max(alpha[i], 255);
      wheelMask[i] = 1;
      // 1px tangential thicken for continuity.
      const tx = Math.round(x - uy);
      const ty = Math.round(y + ux);
      if (tx >= 0 && ty >= 0 && tx < width && ty < height) {
        const j = ty * width + tx;
        if (photo.lum[j] <= 220 || photo.dark[j]) {
          alpha[j] = Math.max(alpha[j], 245);
          wheelMask[j] = 1;
        }
      }
    }
  }
}

function isOutdoorGreen(photo, i){
  if (!photo.rgba) return false;
  const o = i * 4;
  const r = photo.rgba[o];
  const g = photo.rgba[o + 1];
  const b = photo.rgba[o + 2];
  return g > r + 8 && g > b + 6;
}

/**
 * Remove sharp outdoor background trapped between the rider seat/butt and the
 * bike frame / wheel outer rim (common YouBike clear-gap leak).
 */
function trimRiderSeatFrameGap(maskCanvas, analysis, sourceImage, width, height, structureMask = null){
  const boxes = listRiderPersonBoxes(analysis, width, height);
  if (!boxes.length) return maskCanvas;

  const photo = samplePhotoStats(sourceImage, width, height);
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const rgba = photo.rgba;

  for (const box of boxes) {
    const pw = box.x1 - box.x0 + 1;
    const ph = box.y1 - box.y0 + 1;
    const x0 = Math.max(0, Math.floor(box.x0 - pw * 0.12));
    const x1 = Math.min(width - 1, Math.ceil(box.x1 + pw * 0.95));
    const y0 = Math.max(0, Math.floor(box.y0 + ph * 0.40));
    const y1 = Math.min(height - 1, Math.ceil(box.y1 + ph * 0.38));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = y * width + x;
        if (structureMask && structureMask[i]) continue;
        const a = data[i * 4 + 3];
        if (a < 10) continue;

        const L = photo.lum[i];
        const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
        const person = analysis.personScore[i];
        const matte = analysis.matteScore ? analysis.matteScore[i] : 0;

        // Keep real bike structure and strong rider body.
        if (photo.dark[i] || L < 56 || thin > 0.055) continue;
        if (person > 0.42 && L < 155) continue;
        // Keep YouBike yellow fender / white frame pixels themselves.
        if (isYouBikeAccent(rgba, i) && (thin > 0.02 || matte > 0.35 || photo.colorful[i])) continue;

        const o = i * 4;
        const r = rgba[o];
        const g = rgba[o + 1];
        const b = rgba[o + 2];
        const grass = g > r + 6 && g > b + 4 && L >= 52 && L <= 205;
        const railingGreen = g > r + 4 && g > b + 2 && L >= 70 && L <= 190 && Math.abs(r - b) < 40;
        const pavement = Math.abs(r - g) < 24 && Math.abs(g - b) < 24 && L >= 80 && L <= 205;
        const waterGray = Math.abs(r - g) < 18 && Math.abs(g - b) < 22 && L >= 95 && L <= 175 && satOf(r, g, b) < 0.14;
        if (!grass && !railingGreen && !pavement && !waterGray) continue;

        // Weak subject claim: outdoor mid-tones should not stay sharp in the gap.
        if (person > 0.32 && matte > 0.62 && thin > 0.02) continue;

        let personAbove = false;
        for (let dy = 3; dy <= 44 && !personAbove; dy += 2) {
          const yy = y - dy;
          if (yy < 0) break;
          for (let dx = -5; dx <= 5; dx += 2) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const j = yy * width + xx;
            if (analysis.personScore[j] > 0.28) {
              personAbove = true;
              break;
            }
            if (data[j * 4 + 3] > 90 && photo.lum[j] < 130 && !photo.colorful[j]) {
              personAbove = true;
              break;
            }
          }
        }
        if (!personAbove) continue;

        let bikeNear = false;
        const probe = Math.max(12, Math.round(Math.min(pw, ph) * 0.14));
        const p2 = probe * probe;
        for (let yy = Math.max(0, y - probe); yy <= Math.min(height - 1, y + probe) && !bikeNear; yy += 2) {
          for (let xx = Math.max(0, x - probe); xx <= Math.min(width - 1, x + probe); xx += 2) {
            const ddx = xx - x;
            const ddy = yy - y;
            if (ddx * ddx + ddy * ddy > p2) continue;
            const j = yy * width + xx;
            const jt = Math.max(analysis.bicycleScore[j], analysis.motorbikeScore[j]);
            if (
              photo.dark[j]
              || photo.lum[j] < 58
              || jt > 0.05
              || (structureMask && structureMask[j])
              || isYouBikeAccent(rgba, j)
            ) {
              bikeNear = true;
              break;
            }
          }
        }
        if (!bikeNear) continue;

        data[i * 4 + 3] = 0;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return maskCanvas;
}

function satOf(r, g, b){
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return (maxC - minC) / Math.max(1, maxC);
}

function isYouBikeAccent(rgba, i){
  const o = i * 4;
  const r = rgba[o];
  const g = rgba[o + 1];
  const b = rgba[o + 2];
  const yellow = r > 150 && g > 120 && b < 110 && r + g > b * 2.4;
  const whiteFrame = r > 170 && g > 170 && b > 170 && satOf(r, g, b) < 0.12;
  return yellow || whiteFrame;
}

function paintWheelDisk(alpha, analysis, photo, width, height, cx, cy, radius){
  const dummy = new Uint8Array(width * height);
  paintWheelDiskForced(alpha, dummy, analysis, photo, width, height, cx, cy, radius, false);
}

function wheelDiskHasEvidence(cx, cy, radius, analysis, photo, width, height){
  const r = Math.max(4, Math.round(radius));
  const outer2 = r * r;
  const inner = Math.max(2, r * 0.72);
  const inner2 = inner * inner;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(width - 1, cx + r);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(height - 1, cy + r);
  let hits = 0;
  let samples = 0;
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > outer2 || d2 < inner2) continue;
      samples += 1;
      const i = y * width + x;
      const thin = Math.max(analysis.bicycleScore[i], analysis.motorbikeScore[i]);
      const lowerLeft = dx < 0 && dy > 0;
      const darkCut = lowerLeft ? 118 : 98;
      if (photo.lum[i] > darkCut && !photo.dark[i]) continue;
      if (photo.dark[i] || photo.lum[i] < darkCut || thin > 0.025) {
        hits += 1;
      }
    }
  }
  if (samples < 6) return false;
  return hits / samples >= 0.08;
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
    if (sat > 0.12 && y > 24 && y < 230) colorful[i] = 1;
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

  return { dark, colorful, lum, rgba: data };
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
