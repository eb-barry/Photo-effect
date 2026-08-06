// F9 追焦 - 狀態管理 v0.1.7
// 第一排：汽車／機車・自行車／調整項目；第二排（按調整後才顯示）：參數下拉 + 滑桿。

export const PAN_FOCUS_FEATURE_ID = "F9_panFocus";
export const PAN_FOCUS_FEATURE_VERSION = "0.1.7";
export const PAN_FOCUS_DRAFT_KEY = "photoEffects.F9_panFocus.draft.v2";

/** 第一排主選：車種或進入調整 */
export const PRIMARY_MODES = [
  { id: "car", label: "汽車", kind: "vehicle" },
  { id: "rider", label: "機車、自行車", kind: "vehicle" },
  { id: "adjust", label: "調整項目", kind: "adjust" }
];

/** 調整項目（第二排下拉） */
export const ADJUST_PARAMETERS = [
  { id: "blurRightStrength", label: "向右拖影強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "blurLeftStrength", label: "向左拖影強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "edgeFeather", label: "邊緣柔化", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "subjectExpand", label: "主體擴張", min: 0, max: 40, step: 1, suffix: "px" },
  { id: "subjectThreshold", label: "主體靈敏度", min: 0, max: 100, step: 1, suffix: "%" }
];

export function normalizeVehicleMode(mode){
  if (mode === "car" || mode === "rider") return mode;
  // Legacy drafts
  if (mode === "auto") return "car";
  return "car";
}

export function normalizePrimaryMode(mode){
  if (mode === "car" || mode === "rider" || mode === "adjust") return mode;
  return "car";
}

export function createDefaultPanFocusState(){
  return {
    featureId: PAN_FOCUS_FEATURE_ID,
    featureVersion: PAN_FOCUS_FEATURE_VERSION,
    sourceImageDataUrl: null,
    maskPhotoKey: null,

    /** @type {"car"|"rider"} */
    vehicleMode: "car",
    /** @type {"car"|"rider"|"adjust"} — which first-row button is active */
    primaryMode: "car",

    selectedParameter: "blurRightStrength",

    blurRightStrength: 58,
    blurLeftStrength: 0,
    edgeFeather: 22,
    subjectExpand: 4,
    subjectThreshold: 72,

    updatedAt: Date.now()
  };
}

export function resetPanFocusAdjustments(currentState){
  const defaults = createDefaultPanFocusState();
  return updatePanFocusState(currentState, {
    vehicleMode: currentState?.vehicleMode || defaults.vehicleMode,
    primaryMode: currentState?.primaryMode || defaults.primaryMode,
    selectedParameter: defaults.selectedParameter,
    blurRightStrength: defaults.blurRightStrength,
    blurLeftStrength: defaults.blurLeftStrength,
    edgeFeather: defaults.edgeFeather,
    subjectExpand: defaults.subjectExpand,
    subjectThreshold: defaults.subjectThreshold
  });
}

export function updatePanFocusState(currentState, partial){
  const next = {
    ...currentState,
    ...partial,
    updatedAt: Date.now()
  };

  // Migrate legacy fields from older drafts.
  if (partial?.blurStrength != null && partial.blurRightStrength == null && partial.blurLeftStrength == null) {
    const legacy = Number(partial.blurStrength);
    if (Number.isFinite(legacy)) {
      if ((currentState?.panDirection || partial?.panDirection) === "left") {
        next.blurLeftStrength = legacy;
        next.blurRightStrength = next.blurRightStrength ?? 0;
      } else {
        next.blurRightStrength = legacy;
        next.blurLeftStrength = next.blurLeftStrength ?? 0;
      }
    }
  }

  next.vehicleMode = normalizeVehicleMode(next.vehicleMode);
  next.primaryMode = normalizePrimaryMode(next.primaryMode);
  if (next.primaryMode === "car" || next.primaryMode === "rider") {
    next.vehicleMode = next.primaryMode;
  }

  next.selectedParameter = ADJUST_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "blurRightStrength";

  for (const parameter of ADJUST_PARAMETERS) {
    next[parameter.id] = clampNumber(
      next[parameter.id],
      parameter.min,
      parameter.max,
      createDefaultValue(parameter.id)
    );
  }

  return next;
}

/** Resolve pan direction + strength from the two directional sliders. */
export function resolvePanBlur(state){
  const right = clampNumber(state?.blurRightStrength, 0, 100, 0);
  const left = clampNumber(state?.blurLeftStrength, 0, 100, 0);
  if (right <= 0 && left <= 0) {
    return { direction: "right", blurStrength: 0 };
  }
  if (right >= left) {
    return { direction: "right", blurStrength: right };
  }
  return { direction: "left", blurStrength: left };
}

export function savePanFocusDraft(state){
  try {
    const saved = {
      ...state,
      sourceImageDataUrl: null,
      featureId: PAN_FOCUS_FEATURE_ID,
      featureVersion: PAN_FOCUS_FEATURE_VERSION,
      updatedAt: Date.now()
    };
    localStorage.setItem(PAN_FOCUS_DRAFT_KEY, JSON.stringify(saved));
  } catch (error) {
    console.warn("[F9 追焦] 無法儲存草稿：", error);
  }
}

export function loadPanFocusDraft(){
  try {
    const raw = localStorage.getItem(PAN_FOCUS_DRAFT_KEY)
      || localStorage.getItem("photoEffects.F9_panFocus.draft.v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.featureId !== PAN_FOCUS_FEATURE_ID) return null;
    return updatePanFocusState(createDefaultPanFocusState(), parsed);
  } catch (error) {
    console.warn("[F9 追焦] 無法讀取草稿：", error);
    return null;
  }
}

export function clearPanFocusDraft(){
  try {
    localStorage.removeItem(PAN_FOCUS_DRAFT_KEY);
    localStorage.removeItem("photoEffects.F9_panFocus.draft.v1");
  } catch (error) {
    console.warn("[F9 追焦] 無法清除草稿：", error);
  }
}

function createDefaultValue(parameterId){
  return createDefaultPanFocusState()[parameterId];
}

function clampNumber(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
