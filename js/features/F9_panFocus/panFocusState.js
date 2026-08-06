// F9 追焦 - 狀態管理 v0.1.6
// 方向列 + 調整項目下拉／滑桿。

export const PAN_FOCUS_FEATURE_ID = "F9_panFocus";
export const PAN_FOCUS_FEATURE_VERSION = "0.1.6";
export const PAN_FOCUS_DRAFT_KEY = "photoEffects.F9_panFocus.draft.v1";

/** 第一排：追焦方向（相機搖鏡方向） */
export const PAN_DIRECTIONS = [
  { id: "auto", label: "自動" },
  { id: "left", label: "向左" },
  { id: "right", label: "向右" }
];

/** 調整項目 */
export const ADJUST_PARAMETERS = [
  { id: "blurStrength", label: "拖影強度", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "edgeFeather", label: "邊緣柔化", min: 0, max: 100, step: 1, suffix: "%" },
  { id: "subjectExpand", label: "主體擴張", min: 0, max: 40, step: 1, suffix: "px" },
  { id: "subjectThreshold", label: "主體靈敏度", min: 0, max: 100, step: 1, suffix: "%" }
];

export function normalizePanDirection(direction){
  if (direction === "left" || direction === "right" || direction === "auto") return direction;
  return "auto";
}

export function createDefaultPanFocusState(){
  return {
    featureId: PAN_FOCUS_FEATURE_ID,
    featureVersion: PAN_FOCUS_FEATURE_VERSION,
    sourceImageDataUrl: null,
    maskPhotoKey: null,

    panDirection: "auto",
    selectedParameter: "blurStrength",

    blurStrength: 58,
    edgeFeather: 22,
    subjectExpand: 4,
    subjectThreshold: 72,

    updatedAt: Date.now()
  };
}

export function resetPanFocusAdjustments(currentState){
  const defaults = createDefaultPanFocusState();
  return updatePanFocusState(currentState, {
    panDirection: defaults.panDirection,
    selectedParameter: defaults.selectedParameter,
    blurStrength: defaults.blurStrength,
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

  next.panDirection = normalizePanDirection(next.panDirection);
  next.selectedParameter = ADJUST_PARAMETERS.some(item => item.id === next.selectedParameter)
    ? next.selectedParameter
    : "blurStrength";

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
    const raw = localStorage.getItem(PAN_FOCUS_DRAFT_KEY);
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
