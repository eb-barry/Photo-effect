// F3 魔法天空 - 畫布中央處理中提示 UI v0.5.1

export function createProcessingOverlay(overlayEl, textEl, options = {}){
  const spinnerEl = options.spinnerEl || null;
  const stageEl = options.stageEl || null;
  let depth = 0;
  let timer = null;
  let visible = false;

  const setBusyVisual = active => {
    overlayEl?.setAttribute("aria-busy", active ? "true" : "false");
    spinnerEl?.classList.toggle("is-active", active);
  };

  const setMessage = message => {
    if (!message) return;
    if (textEl) textEl.textContent = message;
    if (stageEl) stageEl.textContent = inferStageLabel(message);
    if (depth > 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!visible) showNow(message);
    }
  };

  const showNow = message => {
    if (message) {
      if (textEl) textEl.textContent = message;
      if (stageEl) stageEl.textContent = inferStageLabel(message);
    }
    overlayEl?.classList.remove("hidden");
    setBusyVisual(true);
    visible = true;
  };

  const hideNow = () => {
    overlayEl?.classList.add("hidden");
    setBusyVisual(false);
    visible = false;
  };

  const begin = (message, delayMs = 150) => {
    depth += 1;
    if (message) {
      if (textEl) textEl.textContent = message;
      if (stageEl) stageEl.textContent = inferStageLabel(message);
    }

    if (visible || timer) return;

    if (delayMs <= 0) {
      showNow(message);
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (depth > 0) showNow(message);
    }, delayMs);
  };

  const end = () => {
    depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    hideNow();
  };

  const run = async (message, task, options = {}) => {
    begin(message, options.delay ?? 0);
    try {
      return await task();
    } finally {
      end();
    }
  };

  const reset = () => {
    depth = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    hideNow();
  };

  const isActive = () => depth > 0 || visible;

  const bindStageStatus = () => message => setMessage(message);

  return {
    begin,
    end,
    run,
    reset,
    isActive,
    setMessage,
    showNow,
    hideNow,
    bindStageStatus
  };
}

export function inferStageLabel(message){
  const text = String(message || "");
  if (/下載|快取|讀取已快取/.test(text)) return "模型準備中";
  if (/初始化/.test(text)) return "初始化模型";
  if (/編碼|分析天空|精細分析|建築區域/.test(text)) return "影像分析中";
  if (/解碼|修復遮罩|產生修復/.test(text)) return "點選修復中";
  if (/合成|調整|切換|儲存|分享|讀取照片|更新預覽|清除/.test(text)) return "處理中";
  return "請稍候";
}

export const INTENSIVE_RENDER_PARAMS = new Set([
  "photoExposure",
  "photoContrast",
  "photoBrightness",
  "photoDarken",
  "photoWarmth",
  "photoSaturation",
  "skyExposure",
  "skyContrast",
  "skyBrightness",
  "skyDarken",
  "skyOpacity",
  "skyWarmth",
  "skySaturation",
  "edgeFeather",
  "maskExpansion",
  "skyEdgeRefine",
  "skySensitivity",
  "skyOffsetX",
  "skyOffsetY",
  "skyScale"
]);
