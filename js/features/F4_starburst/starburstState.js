// F4 星芒鏡 - 狀態管理 v0.1.2
// 光圈葉片／光源／星芒效果 三分頁 + 單一可拖曳星芒座標。

export const STARBURST_FEATURE_ID = "F4_starburst";
export const STARBURST_FEATURE_VERSION = "0.1.2";
export const STARBURST_DRAFT_KEY = "photoEffects.F4_starburst.draft.v2";

export const STARBURST_CONTROL_TABS = [
  { id: "aperture", label: "光圈葉片" },
  { id: "light", label: "光源" },
  { id: "effect", label: "星芒效果" }
];

/** 單數葉片會產生 2 倍星芒道數（真實光學繞射特性）。 */
export const BLADE_COUNTS = [5, 6, 7, 8, 9, 10, 11];

export function getSpikeCount(bladeCount){
  const n = Number(bladeCount) || 7;
  return n % 2 === 0 ? n : n * 2;
}

export function getBladeOption(bladeCount){
  const n = BLADE_COUNTS.includes(Number(bladeCount)) ? Number(bladeCount) : 7;
  return { id: String(n), count: n, spikes: getSpikeCount(n) };
}

export const LIGHT_SOURCES = [
  { id: "sunlight", label: "太陽光", color: [255, 244, 224] },
  { id: "moonlight", label: "月光", color: [214, 227, 255] },
  { id: "sodiumLamp", label: "泛黃路燈", color: [255, 176, 82] }
];

export function getLightSourceById(lightSourceId){
  return LIGHT_SOURCES.find(item => item.id === lightSourceId) || LIGHT_SOURCES[0];
}

export function normalizeLightSourceId(lightSourceId){
  return LIGHT_SOURCES.some(item => item.id === lightSourceId) ? lightSourceId : LIGHT_SOURCES[0].id;
}

export const APERTURE_PARAMETERS = [
  { id: "apertureFStop", label: "光圈大小", min: 1.4, max: 16, step: 0.1, unit: "fstop" },
  { id: "bladeCurvature", label: "葉片弧度", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "edgeSoftness", label: "邊緣銳利度", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "randomAsymmetry", label: "不對稱隨機值", min: 0, max: 100, step: 1, unit: "percent" }
];

export const EFFECT_PARAMETERS = [
  { id: "ghosting", label: "幽靈效應", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "flare", label: "眩光", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "halation", label: "光暈", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "sharpness", label: "銳利度", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "dispersion", label: "色散", min: 0, max: 100, step: 1, unit: "percent" },
  { id: "positionX", label: "水平移動", min: 2, max: 98, step: 0.5, unit: "position" },
  { id: "positionY", label: "垂直移動", min: 2, max: 98, step: 0.5, unit: "position" }
];

export const DEFAULT_STARBURST_X = 0.5;
export const DEFAULT_STARBURST_Y = 0.3;

export function createDefaultStarburstState(){
  return {
    featureId: STARBURST_FEATURE_ID,
    featureVersion: STARBURST_FEATURE_VERSION,
    activeControlTab: "aperture",
    sourceImageDataUrl: null,

    bladeCount: 7,
    selectedApertureParameter: "apertureFStop",
    apertureFStop: 8,
    bladeCurvature: 18,
    edgeSoftness: 22,
    randomAsymmetry: 12,

    lightSourceId: "sunlight",
    lightIntensity: 72,

    selectedEffectParameter: "flare",
    ghosting: 20,
    flare: 46,
    halation: 30,
    sharpness: 60,
    dispersion: 26,
    positionX: DEFAULT_STARBURST_X * 100,
    positionY: DEFAULT_STARBURST_Y * 100,

    starburstX: DEFAULT_STARBURST_X,
    starburstY: DEFAULT_STARBURST_Y,
    hasPlacedPoint: false,

    updatedAt: Date.now()
  };
}

export function resetStarburstAdjustments(currentState){
  const defaults = createDefaultStarburstState();
  return updateStarburstState(currentState, {
    activeControlTab: defaults.activeControlTab,
    bladeCount: defaults.bladeCount,
    selectedApertureParameter: defaults.selectedApertureParameter,
    apertureFStop: defaults.apertureFStop,
    bladeCurvature: defaults.bladeCurvature,
    edgeSoftness: defaults.edgeSoftness,
    randomAsymmetry: defaults.randomAsymmetry,
    lightSourceId: defaults.lightSourceId,
    lightIntensity: defaults.lightIntensity,
    selectedEffectParameter: defaults.selectedEffectParameter,
    ghosting: defaults.ghosting,
    flare: defaults.flare,
    halation: defaults.halation,
    sharpness: defaults.sharpness,
    dispersion: defaults.dispersion,
    positionX: defaults.positionX,
    positionY: defaults.positionY
  });
}

export function resetStarburstPosition(currentState){
  return updateStarburstState(currentState, {
    starburstX: DEFAULT_STARBURST_X,
    starburstY: DEFAULT_STARBURST_Y,
    hasPlacedPoint: true
  });
}

export function normalizeActiveControlTab(tab){
  if (tab === null || tab === "none" || tab === "") return null;
  if (STARBURST_CONTROL_TABS.some(item => item.id === tab)) return tab;
  return "aperture";
}

export function updateStarburstState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  next.activeControlTab = normalizeActiveControlTab(next.activeControlTab);
  next.bladeCount = BLADE_COUNTS.includes(Number(next.bladeCount)) ? Number(next.bladeCount) : 7;
  next.lightSourceId = normalizeLightSourceId(next.lightSourceId);

  next.selectedApertureParameter = APERTURE_PARAMETERS.some(item => item.id === next.selectedApertureParameter)
    ? next.selectedApertureParameter
    : "apertureFStop";
  next.selectedEffectParameter = EFFECT_PARAMETERS.some(item => item.id === next.selectedEffectParameter)
    ? next.selectedEffectParameter
    : "flare";

  for (const parameter of APERTURE_PARAMETERS) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }
  for (const parameter of EFFECT_PARAMETERS) {
    next[parameter.id] = clampNumber(next[parameter.id], parameter.min, parameter.max, createDefaultValue(parameter.id));
  }

  next.lightIntensity = clampNumber(next.lightIntensity, 0, 100, createDefaultValue("lightIntensity"));

  // Keep starburstX/Y and positionX/Y in sync.
  // Direct pointer drag writes starburstX/Y → reflect into positionX/Y.
  // Slider writes positionX/Y → reflect into starburstX/Y.
  if (partial && ("starburstX" in partial || "starburstY" in partial)) {
    next.starburstX = clampNumber(next.starburstX, 0.02, 0.98, DEFAULT_STARBURST_X);
    next.starburstY = clampNumber(next.starburstY, 0.02, 0.98, DEFAULT_STARBURST_Y);
    next.positionX = Math.round(next.starburstX * 100 * 2) / 2;
    next.positionY = Math.round(next.starburstY * 100 * 2) / 2;
  } else {
    next.positionX = clampNumber(next.positionX, 2, 98, DEFAULT_STARBURST_X * 100);
    next.positionY = clampNumber(next.positionY, 2, 98, DEFAULT_STARBURST_Y * 100);
    next.starburstX = next.positionX / 100;
    next.starburstY = next.positionY / 100;
  }
  next.hasPlacedPoint = Boolean(next.hasPlacedPoint);

  return next;
}

export function saveStarburstDraft(state){
  try {
    const saved = {
      ...state,
      featureId: STARBURST_FEATURE_ID,
      featureVersion: STARBURST_FEATURE_VERSION,
      updatedAt: Date.now()
    };
    localStorage.setItem(STARBURST_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F4 星芒鏡] 無法儲存草稿：", error);
  }
}

export function loadStarburstDraft(){
  try {
    const raw = localStorage.getItem(STARBURST_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== STARBURST_FEATURE_ID) return null;
    return updateStarburstState(createDefaultStarburstState(), parsed);
  } catch (error) {
    console.warn("[F4 星芒鏡] 無法讀取草稿：", error);
    return null;
  }
}

export function clearStarburstDraft(){
  try {
    localStorage.removeItem(STARBURST_DRAFT_KEY);
  } catch (error) {
    console.warn("[F4 星芒鏡] 無法清除草稿：", error);
  }
}

function createDefaultValue(parameterId){
  return createDefaultStarburstState()[parameterId];
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
